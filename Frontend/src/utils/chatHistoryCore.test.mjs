import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chatStorageKey,
  groupChatsByAge,
  loadChatsFrom,
  normalizeStoredChats,
  saveChatTo,
} from './chatHistoryCore.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
  };
}

test('guest and signed-in users do not share a history key', () => {
  const guest = chatStorageKey({ type: 'guest', email: 'student@cuiatk.edu.pk' });
  const student = chatStorageKey({ type: 'student', email: 'Student@cuiatk.edu.pk' });
  const staff = chatStorageKey({ type: 'staff', email: 'student@cuiatk.edu.pk' });
  const other = chatStorageKey({ type: 'teacher', email: 'teacher@cuiatk.edu.pk' });
  assert.equal(guest, 'campusai_chats:guest');
  assert.equal(student, 'campusai_chats:student@cuiatk.edu.pk');
  assert.equal(staff, student);
  assert.notEqual(student, other);
  assert.equal(chatStorageKey({ type: 'student' }), 'campusai_chats:no-email');
});

test('empty and corrupted history become an empty list', () => {
  assert.deepEqual(normalizeStoredChats(null), []);
  assert.deepEqual(normalizeStoredChats(''), []);
  assert.deepEqual(normalizeStoredChats('{'), []);
  assert.deepEqual(normalizeStoredChats('{"id":1}'), []);
  assert.deepEqual(normalizeStoredChats('[]'), []);
});

test('saving, reopening, switching, and continuing keep message order', async () => {
  const storage = memoryStorage();
  const user = { type: 'student', email: 'student@cuiatk.edu.pk' };
  await saveChatTo(storage, user, {
    id: 'chat-a',
    messages: [
      { role: 'user', text: 'Monday classes' },
      { role: 'bot', text: 'Math' },
    ],
  });
  await saveChatTo(storage, user, {
    id: 'chat-b',
    messages: [{ role: 'user', text: 'Tuesday classes' }],
  });
  let chats = await loadChatsFrom(storage, user);
  assert.deepEqual(chats.map(chat => chat.id), ['chat-b', 'chat-a']);
  assert.deepEqual(chats[1].messages.map(message => message.text), ['Monday classes', 'Math']);

  const reopened = chats.find(chat => chat.id === 'chat-a');
  const continued = [
    ...reopened.messages,
    { role: 'user', text: 'What about Tuesday?' },
    { role: 'bot', structuredObj: { type: 'schedule', class: 'BS(CS)-I' } },
  ];
  await saveChatTo(storage, user, { id: reopened.id, messages: continued });
  chats = await loadChatsFrom(storage, user);
  const again = chats.find(chat => chat.id === 'chat-a');
  assert.equal(chats[0].id, 'chat-a');
  assert.deepEqual(again.messages.map(message => message.text || message.structuredObj.class), [
    'Monday classes', 'Math', 'What about Tuesday?', 'BS(CS)-I',
  ]);
  assert.equal(chats.find(chat => chat.id === 'chat-b').messages.length, 1);
});

test('one user cannot read another user history from the same store', async () => {
  const storage = memoryStorage();
  await saveChatTo(storage, { type: 'student', email: 'a@cuiatk.edu.pk' }, {
    id: 'a1',
    messages: [{ role: 'user', text: 'private A' }],
  });
  await saveChatTo(storage, { type: 'guest' }, {
    id: 'g1',
    messages: [{ role: 'user', text: 'guest question' }],
  });
  const other = await loadChatsFrom(storage, { type: 'staff', email: 'b@cuiatk.edu.pk' });
  const guest = await loadChatsFrom(storage, { type: 'guest', email: 'a@cuiatk.edu.pk' });
  assert.deepEqual(other, []);
  assert.equal(guest.length, 1);
  assert.equal(guest[0].messages[0].text, 'guest question');
  assert.equal(guest[0].messages.some(message => message.text === 'private A'), false);
});

test('sidebar groups keep newest first and do not date undated chats as today', () => {
  const now = new Date(2026, 9, 29, 15, 0, 0).getTime();
  const groups = groupChatsByAge([
    { id: 'old', title: 'old', updated: new Date(2026, 9, 1, 12).getTime() },
    { id: 'today-early', title: 'early', updated: new Date(2026, 9, 29, 8).getTime() },
    { id: 'week', title: 'week', updated: new Date(2026, 9, 24, 12).getTime() },
    { id: 'today-late', title: 'late', updated: new Date(2026, 9, 29, 14).getTime() },
    { id: 'yesterday', title: 'yesterday', updated: new Date(2026, 9, 28, 23).getTime() },
    { id: 'undated', title: 'undated', updated: 0 },
    { id: 'missing', title: 'missing' },
  ], now);
  const byLabel = Object.fromEntries(groups.map(group => [group.label, group.chats.map(chat => chat.id)]));
  assert.deepEqual(byLabel.Today, ['today-late', 'today-early']);
  assert.deepEqual(byLabel.Yesterday, ['yesterday']);
  assert.deepEqual(byLabel['Previous 7 Days'], ['week']);
  assert.deepEqual(byLabel.Older, ['old', 'undated', 'missing']);
  assert.equal(groups.some(group => group.label === 'Today' && group.chats.some(chat => chat.id === 'undated')), false);
});

test('secrets are not stored and storage errors do not throw', async () => {
  const storage = memoryStorage();
  const user = { email: 'student@cuiatk.edu.pk' };
  const saved = await saveChatTo(storage, user, {
    id: 'secret',
    messages: [{ role: 'user', text: 'my key is gsk_example1234567890' }],
  });
  assert.equal(saved[0].messages[0].text, '[removed secret]');

  const broken = {
    async getItem() { throw new Error('disk'); },
    async setItem() { throw new Error('disk'); },
  };
  assert.deepEqual(await loadChatsFrom(broken, user), []);
  assert.deepEqual(await saveChatTo(broken, user, {
    id: 'x',
    messages: [{ role: 'user', text: 'hello' }],
  }), []);
});
