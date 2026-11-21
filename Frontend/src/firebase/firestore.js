import { FS_BASE, FIREBASE_CONFIG } from './config';

const AUTH_BASE = `https://identitytoolkit.googleapis.com/v1/accounts`;
const API_KEY   = FIREBASE_CONFIG.apiKey;

// ── Auth token management ──────────────────────────────────────────────────
// All Firestore WRITES send `Authorization: Bearer <idToken>` so the project
// can use locked-down security rules (see firebase/firestore.rules).
// Tokens are set automatically on sign-in/up and refreshed via refreshToken.
let ID_TOKEN = null;
let REFRESH_TOKEN = null;
let ID_TOKEN_EXPIRES_AT = 0; // ms since epoch

// Firebase ID tokens last one hour. Read the expiry from the token itself;
// if it can't be read, assume 55 minutes from now.
function tokenExpiry(idToken) {
  try {
    const part = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const { exp } = JSON.parse(atob(padded));
    if (exp) return exp * 1000;
  } catch {}
  return Date.now() + 55 * 60 * 1000;
}

export function setAuthToken(idToken, refreshToken = null) {
  ID_TOKEN = idToken || null;
  ID_TOKEN_EXPIRES_AT = idToken ? tokenExpiry(idToken) : 0;
  if (refreshToken) REFRESH_TOKEN = refreshToken;
}

/** The current ID token, renewed first if it expires within 5 minutes. */
export async function getFreshIdToken() {
  if (ID_TOKEN && REFRESH_TOKEN && Date.now() > ID_TOKEN_EXPIRES_AT - 5 * 60 * 1000) {
    await refreshAuthToken(REFRESH_TOKEN);
  }
  return ID_TOKEN;
}

export function getAuthTokens() {
  return { idToken: ID_TOKEN, refreshToken: REFRESH_TOKEN };
}

export function clearAuthToken() {
  ID_TOKEN = null;
  REFRESH_TOKEN = null;
  ID_TOKEN_EXPIRES_AT = 0;
}

/** Exchange a refresh token for a fresh ID token (called on app restart). */
export async function refreshAuthToken(refreshToken) {
  if (!refreshToken) return null;
  try {
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    const d = await r.json();
    if (d.error) return null;
    setAuthToken(d.id_token, d.refresh_token);
    return d.id_token;
  } catch { return null; }
}

function authHeaders(extra = {}) {
  return ID_TOKEN ? { ...extra, Authorization: `Bearer ${ID_TOKEN}` } : extra;
}

// Firebase Auth
export async function authSignUp(email, password) {
  const r = await fetch(`${AUTH_BASE}:signUp?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  setAuthToken(d.idToken, d.refreshToken);
  return d;
}

export async function authSignIn(email, password) {
  const r = await fetch(`${AUTH_BASE}:signInWithPassword?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  setAuthToken(d.idToken, d.refreshToken);
  return d;
}

export async function authSendVerification(idToken) {
  const r = await fetch(`${AUTH_BASE}:sendOobCode?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function authSendPasswordReset(email) {
  const r = await fetch(`${AUTH_BASE}:sendOobCode?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d;
}

export async function authGetUser(idToken) {
  const r = await fetch(`${AUTH_BASE}:lookup?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.users?.[0] || null;
}

// Firestore helpers
function serialise(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined)   out[k] = { nullValue: null };
    else if (typeof v === 'boolean')     out[k] = { booleanValue: v };
    else if (typeof v === 'number')      out[k] = { doubleValue: v };
    else if (typeof v === 'string')      out[k] = { stringValue: v };
    else if (Array.isArray(v))           out[k] = { arrayValue: { values: v.map(i => ({ stringValue: JSON.stringify(i) })) } };
    else if (typeof v === 'object')      out[k] = { stringValue: JSON.stringify(v) };
  }
  return out;
}

async function firestoreErrorMessage(response) {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    return parsed?.error?.message || parsed?.message || body || `HTTP ${response.status}`;
  } catch {
    return body || `HTTP ${response.status}`;
  }
}

function deserialise(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v.stringValue !== undefined) {
      try { out[k] = JSON.parse(v.stringValue); } catch { out[k] = v.stringValue; }
    } else if (v.booleanValue !== undefined) out[k] = v.booleanValue;
    else if (v.doubleValue  !== undefined)   out[k] = v.doubleValue;
    else if (v.integerValue !== undefined)   out[k] = Number(v.integerValue);
    else if (v.nullValue    !== undefined)   out[k] = null;
    else if (v.arrayValue)                   out[k] = (v.arrayValue.values || []).map(i => { try { return JSON.parse(i.stringValue); } catch { return i.stringValue; } });
    else out[k] = v;
  }
  return out;
}

export async function fsGet(path, { throwOnError = false, allowNotFound = false } = {}) {
  try {
    const r = await fetch(`${FS_BASE}/${path}`, { headers: authHeaders() });
    if (!r.ok) {
      if (throwOnError && !(allowNotFound && r.status === 404)) {
        throw new Error(await firestoreErrorMessage(r));
      }
      return null;
    }
    const d = await r.json();
    return deserialise(d.fields || {});
  } catch (error) {
    if (throwOnError) throw error;
    return null;
  }
}

export async function fsSet(path, data) {
  const body = { fields: serialise(data) };
  const r = await fetch(`${FS_BASE}/${path}`, {
    method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await firestoreErrorMessage(r));
}

export async function fsAdd(collection, data) {
  const body = { fields: serialise(data) };
  const r = await fetch(`${FS_BASE}/${collection}`, {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  return d.name?.split('/').pop() ?? null;
}

export async function fsUpdate(path, data) {
  const fields = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const body = { fields: serialise(data) };
  const r = await fetch(`${FS_BASE}/${path}?${fields}`, {
    method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function fsDelete(path) {
  const r = await fetch(`${FS_BASE}/${path}`, { method: 'DELETE', headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
}

export async function fsList(collection, { throwOnError = false } = {}) {
  try {
    const documents = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ pageSize: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      const r = await fetch(`${FS_BASE}/${collection}?${query.toString()}`, { headers: authHeaders() });
      if (!r.ok) {
        if (throwOnError) throw new Error(await firestoreErrorMessage(r));
        return [];
      }
      const d = await r.json();
      documents.push(...(d.documents || []));
      pageToken = d.nextPageToken || '';
    } while (pageToken);
    return documents.map(doc => ({
      _docId: doc.name.split('/').pop(),
      ...deserialise(doc.fields || {}),
    }));
  } catch (error) {
    if (throwOnError) throw error;
    return [];
  }
}

export async function saveUserProfile(email, profile) {
  await fsSet(`users/${email.replace(/\./g, '_')}`, profile);
}

export async function getUserProfile(email) {
  return await fsGet(`users/${email.replace(/\./g, '_')}`);
}

export async function getNotificationSettings(uid) {
  return fsGet(`notificationSettings/${uid}`);
}

export async function saveNotificationSettings(uid, settings) {
  return fsSet(`notificationSettings/${uid}`, settings);
}
