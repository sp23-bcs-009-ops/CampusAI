import { fsGet, fsList, fsSet } from './firestore';

export const normalizeTeacherName = value => String(value || '').trim().toLocaleLowerCase();

function safeTeacherDocId(name) {
  return String(name || '').trim().replace(/[^\w()&.-]+/g, '_').replace(/^_+|_+$/g, '') || `teacher_${Date.now()}`;
}

/** Create or update a canonical teacher record without discarding legacy timetable schedules. */
export async function upsertTeacherRecord({ name, department, position } = {}) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Teacher name is required.');

  const docs = await fsList('teachers');
  const existing = docs.find(doc => normalizeTeacherName(doc.name) === normalizeTeacherName(cleanName));
  let docId = existing?._docId || safeTeacherDocId(cleanName);
  let prior = existing || await fsGet(`teachers/${encodeURIComponent(docId)}`);
  if (prior?.name && normalizeTeacherName(prior.name) !== normalizeTeacherName(cleanName)) {
    const base = safeTeacherDocId(cleanName);
    docId = `${base}_${Date.now()}`;
    prior = null;
  }

  const priorFields = { ...(prior || {}) };
  delete priorFields._docId;
  delete priorFields.email;
  delete priorFields.phone;
  delete priorFields.accountEmails;
  const record = {
    ...priorFields,
    name: prior?.name || cleanName,
    schedule: Array.isArray(prior?.schedule) ? prior.schedule : [],
    classCount: Number(prior?.classCount || 0),
    ...(department !== undefined ? { department: String(department || '').trim() } : {}),
    ...(position !== undefined ? { position: String(position || '').trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
  await fsSet(`teachers/${encodeURIComponent(docId)}`, record);
  return { ...record, _docId: docId };
}
