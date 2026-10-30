/**
 * Firestore REST client for the dashboard.
 *
 * Reads from the same Firebase project as the mobile app:
 *   timetable_classes/*  — migrated via scripts/migrate_to_firestore.mjs
 *   teachers/*           — migrated via scripts/migrate_to_firestore.mjs
 *   events/*             — posted from the mobile app
 *   meta/timetable       — migration metadata
 *
 * If Firestore is unreachable (offline / not yet migrated), callers fall
 * back to the bundled local snapshot so the dashboard always renders.
 */

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyB04Cgl5eIUQb_x85qrI7l6OLDEA45y-WI',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'universityassistentai',
};

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

// ── Firestore value (de)serialisation ───────────────────────────────────────
function deserialiseValue(v) {
  if (v.stringValue !== undefined) {
    // The app stores objects as JSON strings — try to parse them back.
    const s = v.stringValue;
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return JSON.parse(s); } catch { return s; }
    }
    return s;
  }
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(deserialiseValue);
  if (v.mapValue !== undefined) return deserialiseFields(v.mapValue.fields || {});
  return null;
}

function deserialiseFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = deserialiseValue(v);
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function fsList(collection, pageSize = 300) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${FS_BASE}/${collection}?pageSize=${pageSize}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Firestore ${collection}: ${r.status}`);
    const d = await r.json();
    for (const doc of d.documents || []) {
      docs.push({ _docId: doc.name.split('/').pop(), ...deserialiseFields(doc.fields || {}) });
    }
    pageToken = d.nextPageToken || '';
  } while (pageToken);
  return docs;
}

export async function fsGet(path) {
  const r = await fetch(`${FS_BASE}/${path}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Firestore ${path}: ${r.status}`);
  const d = await r.json();
  return { _docId: d.name?.split('/').pop(), ...deserialiseFields(d.fields || {}) };
}

export const PROJECT_ID = FIREBASE_CONFIG.projectId;
