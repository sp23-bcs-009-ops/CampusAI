/** Device-local chat history. No network and no Firebase writes. */

const MAX_CHATS = 20;
const MAX_MESSAGES = 100;
const MAX_TEXT = 4000;
const SECRET = /gsk_[A-Za-z0-9]|Bearer\s+[A-Za-z0-9\-._~+/]+=*|BEGIN PRIVATE KEY|FIREBASE_SERVICE_ACCOUNT/i;

export function chatStorageKey(user) {
  if (!user || user.type === 'guest') return 'campusai_chats:guest';
  const email = String(user.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 200) {
    return 'campusai_chats:no-email';
  }
  return `campusai_chats:${email}`;
}

export function newSessionId(prefix) {
  const safe = String(prefix || 'chat').replace(/[^a-z0-9@._-]+/gi, '').slice(0, 40) || 'chat';
  return `${safe}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value) {
  const text = String(value || '').replace(/\u0000/g, '').slice(0, MAX_TEXT);
  if (!text) return '';
  return SECRET.test(text) ? '[removed secret]' : text;
}

function sanitizeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = message.role === 'user' || message.role === 'bot' || message.role === 'error'
    ? message.role
    : null;
  if (!role) return null;
  const text = cleanText(message.text);
  let structuredObj = null;
  if (message.structuredObj && typeof message.structuredObj === 'object' && !Array.isArray(message.structuredObj)) {
    try {
      const encoded = JSON.stringify(message.structuredObj);
      if (encoded && encoded.length <= 20000 && !SECRET.test(encoded)) {
        structuredObj = JSON.parse(encoded);
      }
    } catch {
      structuredObj = null;
    }
  }
  if (!text && !structuredObj) return null;
  const clean = { role };
  if (text) clean.text = text;
  if (structuredObj) clean.structuredObj = structuredObj;
  return clean;
}

const HISTORY_GROUP_LABELS = ['Today', 'Yesterday', 'Previous 7 Days', 'Older'];
const DAY_MS = 24 * 60 * 60 * 1000;

function localDayStart(ms) {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Group saved chats for the sidebar. Missing timestamps stay in Older. */
export function groupChatsByAge(chats, now = Date.now()) {
  const buckets = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  };
  const today = localDayStart(now);
  for (const chat of Array.isArray(chats) ? chats : []) {
    if (!chat || typeof chat !== 'object') continue;
    const updated = Number(chat.updated);
    if (!Number.isFinite(updated) || updated <= 0) {
      buckets.Older.push(chat);
      continue;
    }
    const ageDays = Math.round((today - localDayStart(updated)) / DAY_MS);
    if (ageDays <= 0) buckets.Today.push(chat);
    else if (ageDays === 1) buckets.Yesterday.push(chat);
    else if (ageDays <= 7) buckets['Previous 7 Days'].push(chat);
    else buckets.Older.push(chat);
  }
  const newestFirst = (a, b) => (Number(b.updated) || 0) - (Number(a.updated) || 0);
  return HISTORY_GROUP_LABELS
    .map(label => ({ label, chats: buckets[label].slice().sort(newestFirst) }))
    .filter(group => group.chats.length > 0);
}

export function normalizeStoredChats(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const chats = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').trim();
    if (!id || id.length > 120) continue;
    const messages = Array.isArray(item.messages)
      ? item.messages.map(sanitizeMessage).filter(Boolean).slice(0, MAX_MESSAGES)
      : [];
    if (messages.length === 0) continue;
    const titleSource = messages.find(message => message.role === 'user')?.text || item.title || 'Chat';
    chats.push({
      id,
      title: cleanText(titleSource).slice(0, 80) || 'Chat',
      messages,
      updated: Number(item.updated) || 0,
    });
  }
  return chats
    .sort((a, b) => b.updated - a.updated)
    .slice(0, MAX_CHATS);
}

function prepareChat(chat) {
  if (!chat || typeof chat !== 'object') return null;
  const id = String(chat.id || '').trim();
  if (!id || id.length > 120) return null;
  const messages = Array.isArray(chat.messages)
    ? chat.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES)
    : [];
  if (messages.length === 0) return null;
  const title = cleanText(messages.find(message => message.role === 'user')?.text || 'Chat').slice(0, 80) || 'Chat';
  return { id, title, messages, updated: Date.now() };
}

export async function loadChatsFrom(storage, user) {
  try {
    const raw = await storage.getItem(chatStorageKey(user));
    return normalizeStoredChats(raw);
  } catch {
    return [];
  }
}

export async function saveChatTo(storage, user, chat) {
  try {
    const prepared = prepareChat(chat);
    const existing = await loadChatsFrom(storage, user);
    if (!prepared) return existing;
    const next = [prepared, ...existing.filter(item => item.id !== prepared.id)].slice(0, MAX_CHATS);
    await storage.setItem(chatStorageKey(user), JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}
