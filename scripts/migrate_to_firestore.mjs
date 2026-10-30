/**
 * migrate_to_firestore.mjs
 * ────────────────────────
 * Migrates backend/timetable_data.json → Firestore.
 *
 * Creates:
 *   timetable_classes/{classId}   one doc per class  { class, data(JSON), updatedAt }
 *   teachers/{teacherId}          one doc per teacher { name, schedule(JSON), updatedAt }
 *   meta/timetable                { classCount, teacherCount, roomCount, updatedAt }
 *
 * Run:
 *   node scripts/migrate_to_firestore.mjs
 *
 * Optional auth (recommended once you lock down Firestore rules):
 *   FIREBASE_EMAIL=admin@x.com FIREBASE_PASSWORD=... node scripts/migrate_to_firestore.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// ── Config (same project as the app) ───────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB04Cgl5eIUQb_x85qrI7l6OLDEA45y-WI',
  projectId: 'universityassistentai',
};
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// ── Load timetable JSON ─────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIMETABLE = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'backend', 'timetable_data.json'), 'utf-8')
);

// ── Optional: sign in to get an ID token ────────────────────────────────────
async function getIdToken() {
  const email = process.env.FIREBASE_EMAIL;
  const password = process.env.FIREBASE_PASSWORD;
  if (!email || !password) return null;
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const d = await r.json();
  if (d.error) throw new Error(`Auth failed: ${d.error.message}`);
  console.log(`✔ Signed in as ${email}`);
  return d.idToken;
}

// ── Firestore REST helpers ──────────────────────────────────────────────────
function serialise(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else fields[k] = { stringValue: JSON.stringify(v) };
  }
  return fields;
}

async function fsSet(docPath, data, idToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const r = await fetch(`${FS_BASE}/${docPath}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: serialise(data) }),
  });
  if (!r.ok) throw new Error(`${docPath}: ${r.status} ${await r.text()}`);
}

// Firestore doc IDs can't contain '/', so sanitize class/teacher names.
const docId = (name) => name.replace(/[^\w()&.-]+/g, '_');

// ── Derive teacher schedules from the timetable ─────────────────────────────
function deriveTeachers(timetable) {
  const teachers = {}; // name -> [{day, time, class, subject, room}]
  for (const [cls, days] of Object.entries(timetable)) {
    for (const [day, slots] of Object.entries(days)) {
      for (const [time, entries] of Object.entries(slots)) {
        for (const e of entries) {
          const t = (e.teacher || '').trim();
          if (!t || t === 'N/A' || t.toLowerCase() === 'staff') continue;
          (teachers[t] ??= []).push({
            day, time, class: cls,
            subject: e.subject || 'N/A',
            room: e.room || 'N/A',
          });
        }
      }
    }
  }
  return teachers;
}

function collectRooms(timetable) {
  const rooms = new Set();
  for (const days of Object.values(timetable))
    for (const slots of Object.values(days))
      for (const entries of Object.values(slots))
        for (const e of entries) if (e.room?.trim()) rooms.add(e.room.trim());
  return rooms;
}

// ── Main ────────────────────────────────────────────────────────────────────
const now = new Date().toISOString();
const idToken = await getIdToken();

console.log(`Migrating ${Object.keys(TIMETABLE).length} classes → Firestore (${FIREBASE_CONFIG.projectId})…`);

// 1. timetable_classes
let done = 0;
for (const [cls, days] of Object.entries(TIMETABLE)) {
  await fsSet(`timetable_classes/${docId(cls)}`, {
    class: cls,
    data: days,           // stored as a JSON string (same pattern as the app)
    updatedAt: now,
  }, idToken);
  process.stdout.write(`\r  timetable_classes: ${++done}/${Object.keys(TIMETABLE).length}`);
}
console.log();

// 2. teachers
const teachers = deriveTeachers(TIMETABLE);
done = 0;
for (const [name, schedule] of Object.entries(teachers)) {
  await fsSet(`teachers/${docId(name)}`, {
    name,
    schedule,             // stored as a JSON string
    classCount: schedule.length,
    updatedAt: now,
  }, idToken);
  process.stdout.write(`\r  teachers: ${++done}/${Object.keys(teachers).length}`);
}
console.log();

// 3. meta
const rooms = collectRooms(TIMETABLE);
await fsSet('meta/timetable', {
  classCount: Object.keys(TIMETABLE).length,
  teacherCount: Object.keys(teachers).length,
  roomCount: rooms.size,
  source: 'backend/timetable_data.json',
  updatedAt: now,
}, idToken);

console.log(`\n✅ Done: ${Object.keys(TIMETABLE).length} classes, ${Object.keys(teachers).length} teachers, ${rooms.size} rooms`);
console.log('   Collections: timetable_classes, teachers, meta/timetable');
