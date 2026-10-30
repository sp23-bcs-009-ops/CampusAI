import { fsUpdate } from '../firebase/firestore';

export function parseTimetableField(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sameSlot(slot, target) {
  return Number(slot?.lectureNum ?? slot?.n) === Number(target?.lectureNum ?? target?.n)
    && String(slot?.day || '') === String(target?.day || '')
    && String(slot?.subject || '') === String(target?.subject || '')
    && String(slot?.prof || slot?.teacher || '') === String(target?.prof || target?.teacher || '');
}

function normalizeDay(value) {
  const key = String(value || '').replace(/[^a-z]/gi, '').toLowerCase();
  return ({ monday: 'Mon', mon: 'Mon', tuesday: 'Tue', tue: 'Tue', wednesday: 'Wed', wed: 'Wed', thursday: 'Thu', thu: 'Thu', friday: 'Fri', fri: 'Fri' })[key] || String(value || '');
}

function makeDisplayRows(roomMap) {
  const byDay = {};
  Object.entries(roomMap).forEach(([room, slots]) => (slots || []).forEach(slot => {
    const day = slot.day;
    if (!day) return;
    (byDay[day] ||= []).push({
      n: Number(slot.lectureNum ?? slot.n),
      start: slot.start || '', end: slot.end || '',
      subject: slot.subject || '', prof: slot.prof || slot.teacher || '', room,
      dept: slot.dept || '', sem: Number(slot.semester ?? slot.sem),
      isLab: Boolean(slot.isLab), mine: false,
    });
  }));
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return Object.entries(byDay)
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([day, slots]) => ({
      day,
      slots: slots.sort((a, b) => a.n - b.n || String(a.start).localeCompare(String(b.start))),
    }));
}

function makeSubjects(roomMap, department, semester) {
  const seen = new Set();
  const result = [];
  Object.values(roomMap).flat().forEach(slot => {
    const subject = String(slot.subject || '').trim();
    const prof = String(slot.prof || slot.teacher || '').trim();
    const isLab = Boolean(slot.isLab);
    const key = `${subject}|${prof}|${isLab}`;
    if (!subject || seen.has(key)) return;
    seen.add(key);
    result.push({ subject, prof, dept: department, sem: Number(semester), isLab });
  });
  return result;
}

/** Update just one active timetable document and its derived schema fields. */
export async function saveTimetableEntries({
  collection, document, oldSlot = null, oldRoom = '', pendingCell = null,
  entries, editor = 'staff',
}) {
  if (!document?._docId) throw new Error('The source timetable document is missing.');
  const baseDocId = String(document._docId).replace(/^exam_/, '');
  const department = String(document.dept || baseDocId.split('_sem')[0] || '').toLowerCase();
  const semester = Number(document.semester || baseDocId.match(/_sem(\d+)/)?.[1]);
  const roomMap = parseTimetableField(document.roomMap, {});
  const lectureSlots = parseTimetableField(document.lectureSlots, {});
  const pending = parseTimetableField(document.pendingEditCells, []);

  if (oldSlot && oldRoom && Array.isArray(roomMap[oldRoom])) {
    roomMap[oldRoom] = roomMap[oldRoom].filter(slot => !sameSlot(slot, oldSlot));
    if (!roomMap[oldRoom].length) delete roomMap[oldRoom];
  }

  for (const entry of entries) {
    const room = String(entry.room || '').trim();
    const subject = String(entry.subject || '').trim();
    const prof = String(entry.teacher || entry.prof || '').trim();
    if (!room || !subject || !prof) throw new Error('Subject, teacher, and room are required.');
    const lectureNum = Number(pendingCell?.lecture_num ?? oldSlot?.lectureNum ?? oldSlot?.n);
    const slotTime = lectureSlots[String(lectureNum)] || lectureSlots[lectureNum] || {};
    const slot = {
      day: normalizeDay(pendingCell?.day || oldSlot?.day),
      lectureNum,
      start: oldSlot?.start || slotTime.start || '',
      end: oldSlot?.end || slotTime.end || '',
      subject,
      prof,
      dept: department,
      sem: semester,
      isLab: /lab/i.test(subject) || /lab/i.test(room),
      isRepeater: Boolean(oldSlot?.isRepeater),
      labGroup: String(entry.group || '').trim(),
      isMine: false,
    };
    (roomMap[room] ||= []).push(slot);
  }

  const nextPending = pendingCell
    ? pending.filter(cell => !(cell.cell_id === pendingCell.cell_id
      && cell.day === pendingCell.day
      && Number(cell.lecture_num) === Number(pendingCell.lecture_num)))
    : pending;

  await fsUpdate(`${collection}/${document._docId}`, {
    roomMap: JSON.stringify(roomMap),
    displayRows: JSON.stringify(makeDisplayRows(roomMap)),
    subjectsList: JSON.stringify(makeSubjects(roomMap, department, semester)),
    pendingEditCells: JSON.stringify(nextPending),
    updatedAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
    lastEditedBy: editor,
  });
}
