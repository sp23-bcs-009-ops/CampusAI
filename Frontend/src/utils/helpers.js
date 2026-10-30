import { DEPT_MAP, FALLBACK_LECTURE_SLOTS, DAYS } from '../constants/config';

// ─── Auth helpers ─────────────────────────────────────────────────────────
export function getCurrentIntake() {
  const m = new Date().getMonth();
  return (m >= 1 && m <= 6) ? 'sp' : 'fa';
}

export function getSemester(email) {
  const match = email.match(/^(sp|fa)(\d{2})-b?([a-z]+)-/i);
  if (!match) return 7;
  const intake = match[1].toLowerCase();
  const year   = 2000 + parseInt(match[2]);
  const curIntake = getCurrentIntake();
  const curTotal  = new Date().getFullYear() * 2 + (curIntake === 'sp' ? 0 : 1);
  const userTotal = year * 2 + (intake === 'sp' ? 0 : 1);
  return Math.min(Math.max(curTotal - userTotal + 1, 1), 8);
}

export function getDept(email) {
  const match = email.match(/^(?:sp|fa)\d{2}-b?([a-z]+)-/i);
  if (!match) return 'cs';
  return match[1].toLowerCase();
}

export function getDepartmentLabel(email) {
  const key = getDept(email);
  return DEPT_MAP[key] || key.toUpperCase();
}

export function calcAge(dob) {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

// ─── Time helpers ─────────────────────────────────────────────────────────
export function toMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function dateToDayName(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function fmtDatetime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Room status ──────────────────────────────────────────────────────────
const ROMAN_ROOM_NUMBERS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const ROOM_NAME_ALIASES = {
  'ee com lab': 'communication lab',
  'communication lab': 'communication lab',
  'ee dld lab': 'dld mp lab',
  'dld mp lab': 'dld mp lab',
  'eca lab': 'electronics eca lab',
  'electronics eca lab': 'electronics eca lab',
  'em lab': 'electric machine lab',
  'electric machine lab': 'electric machine lab',
  'ie lab': 'industrial electronics lab',
  'industrial electric lab': 'industrial electronics lab',
  'industrial electronics lab': 'industrial electronics lab',
};

function canonicalRoomName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  const simpleName = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (ROOM_NAME_ALIASES[simpleName]) return ROOM_NAME_ALIASES[simpleName];
  const roomMatch = name.match(/^(?:CR|Class\s*Room)\s*([0-9]+|[IVX]+)$/i);
  if (roomMatch) {
    const suffix = roomMatch[1].toUpperCase();
    const number = /^\d+$/.test(suffix) ? Number(suffix) : ROMAN_ROOM_NUMBERS[suffix];
    if (number) return `class room ${number}`;
  }
  const hallMatch = name.match(/^(?:LH|Lecture\s*Hall)\s*0*([0-9]+)$/i);
  if (hallMatch) return `lecture hall ${Number(hallMatch[1])}`;
  return name.toLowerCase();
}

/** Find timetable slots even when the PDF abbreviates a mapped room name. */
export function getRoomTimetableSlots(roomId, timetable) {
  if (!timetable || typeof timetable !== 'object') return [];
  const directSlots = timetable[roomId];
  const key = canonicalRoomName(roomId);
  const matches = Object.entries(timetable)
    .filter(([name]) => canonicalRoomName(name) === key)
    .flatMap(([, roomSlots]) => Array.isArray(roomSlots) ? roomSlots : []);
  if (!matches.length) return Array.isArray(directSlots) ? directSlots : [];
  const seen = new Set();
  return matches.filter(slot => {
    const signature = [slot.day, slot.lectureNum ?? slot.n, slot.start, slot.end,
      slot.subject, slot.prof || slot.teacher, slot.dept || slot._dept, slot.semester ?? slot.sem].join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function getFullRoomStatus(id, now, timetable, arrangedClasses, cancelledSlots, lectureSlots) {
  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  const day      = DAYS[now.getDay()];
  const cur      = now.getHours() * 60 + now.getMinutes();
  const todayStr = now.toISOString().split('T')[0];

  // Regular timetable
  const base = (() => {
    const active = getRoomTimetableSlots(id, timetable).find(s => {
      if (s.day !== day || cur < toMin(s.start) || cur >= toMin(s.end)) return false;
      // BUG FIX: check cancellation by lectureNum match rather than start-time string comparison
      // This is more reliable since start times can vary slightly
      const cancelled = (cancelledSlots || []).some(cs => {
        if (cs.date !== todayStr || cs.subject !== s.subject) return false;
        const slotStart = slots[cs.lectureNum]?.start;
        return slotStart && toMin(slotStart) === toMin(s.start);
      });
      return !cancelled;
    });
    if (!active) return { status: 'free', slot: null };
    return { status: active.isMine ? 'mine' : 'occupied', slot: active };
  })();

  if (base.status !== 'free') return base;

  // Arranged classes
  const arr = (arrangedClasses || []).find(a => {
    if (canonicalRoomName(a.room) !== canonicalRoomName(id)) return false;
    const dayMatch = a.date ? a.date === todayStr : a.day === day;
    if (!dayMatch) return false;
    const sl = slots[a.lectureNum];
    if (!sl) return false;
    return cur >= toMin(sl.start) && cur < toMin(sl.end);
  });

  if (arr) {
    const sl = slots[arr.lectureNum];
    return {
      status: 'arranged',
      slot: { subject: arr.subject, prof: arr.postedBy, start: sl.start, end: sl.end, isArranged: true },
      arranged: arr,
    };
  }

  return base;
}

// ─── Notification sort ────────────────────────────────────────────────────
export function sortNotifs(arr, lectureSlots) {
  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  return [...arr].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    const da = a.deadline || (a.date && a.lectureNum ? `${a.date}T${slots[a.lectureNum]?.start}` : null);
    const db = b.deadline || (b.date && b.lectureNum ? `${b.date}T${slots[b.lectureNum]?.start}` : null);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return new Date(da) - new Date(db);
  });
}

// ─── Event status ─────────────────────────────────────────────────────────
export function getEventStatus(ev) {
  if (!ev || !ev.date) return 'upcoming';
  const now   = new Date();
  const start = new Date(ev.date + 'T' + (ev.time || '00:00'));
  const end   = ev.endTime ? new Date(ev.date + 'T' + ev.endTime) : null;
  if (end && now > end)                            return 'ended';
  if (now >= start)                                return 'ongoing';
  if (ev.deadline && now > new Date(ev.deadline))  return 'closed';
  return 'upcoming';
}

// ─── Timetable document parser ────────────────────────────────────────────
/**
 * Takes raw Firestore timetable doc and returns typed runtime state.
 * This is the contract between the server (backend) and the frontend.
 *
 * BUG FIX: Added safe JSON.parse for all stringified fields coming from Firestore.
 * Previously roomMap / displayRows / subjectsList / lectureSlots could arrive as
 * raw strings and cause silent failures downstream.
 */
export function parseTimetableDoc(data) {
  if (!data) return null;

  function safeParse(val, fallback) {
    if (!val) return fallback;
    if (typeof val === 'object') return val; // already parsed
    try { return JSON.parse(val); } catch { return fallback; }
  }

  return {
    lectureSlots: safeParse(data.lectureSlots, FALLBACK_LECTURE_SLOTS),
    timetables:   safeParse(data.roomMap, {}),
    displayRows:  safeParse(data.displayRows, []),
    subjectsList: safeParse(data.subjectsList, []),
    version:      data.version       || '',
    effectiveDate:data.effectiveDate || '',
    uploadedBy:   data.uploadedBy    || '',
    pdfUrl:       data.pdfUrl        || null,
    status:       data.status        || 'unknown',
  };
}
