import { getClassMuteKey } from './classMutes.js';

export const CAMPUS_TIME_ZONE = 'Asia/Karachi';
export const CLASS_NOTIFICATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIFICATION_ID_PREFIX = 'campusai_myclass_';

function getDateParts(date, timeZone = CAMPUS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function dateKeyFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weekdayForDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function timeZoneOffsetAt(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  const representedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
}

export function karachiWallTimeToDate(dateKey, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))
      || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utcWallTime = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(utcWallTime).toISOString().slice(0, 10) !== dateKey) return null;

  let timestamp = utcWallTime;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    timestamp = utcWallTime - timeZoneOffsetAt(timestamp, CAMPUS_TIME_ZONE);
  }

  const result = new Date(timestamp);
  const localParts = getDateParts(result);
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMPUS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(result);
  return dateKeyFromParts(localParts) === dateKey && localTime === time ? result : null;
}

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function matchesUser(slot, room, mode, { dept, semester, mutedClassKeys }) {
  const slotDept = normalize(slot?._dept || slot?.dept || slot?.department);
  const slotSemester = Number(slot?.semester ?? slot?.sem);
  if (slotDept !== normalize(dept) || slotSemester !== Number(semester)) return false;
  if (slot?.isMine !== true || slot?.isMuted === true) return false;
  return !mutedClassKeys.has(getClassMuteKey(slot, room, mode));
}

function getClassIdentity(slot, room, mode, dateKey, uid) {
  return JSON.stringify([
    uid,
    mode,
    dateKey,
    normalize(slot?._dept || slot?.dept || slot?.department),
    Number(slot?.semester ?? slot?.sem),
    Number(slot?.lectureNum ?? slot?.n),
    normalize(slot?.start),
    normalize(slot?.end),
    normalize(slot?.subject),
    normalize(slot?.courseCode),
    normalize(slot?.classCode),
    normalize(slot?.prof || slot?.teacher),
    normalize(room || slot?.room),
  ]);
}

function createReminder(slot, room, mode, dateKey, timing, scheduledAtMs, uid) {
  const classIdentity = getClassIdentity(slot, room, mode, dateKey, uid);
  const notificationKey = JSON.stringify([classIdentity, timing]);
  const identifier = `${NOTIFICATION_ID_PREFIX}${encodeURIComponent(notificationKey)}`;
  const subject = String(slot.subject || slot.courseCode || 'Class').trim();
  const roomLabel = room || slot.room;
  const timingLabel = timing === 'before' ? 'in 10 minutes' : 'now';

  return {
    identifier,
    scheduledAtMs,
    title: timing === 'before' ? 'Class starting soon' : 'Class starting now',
    body: `${subject}${roomLabel ? ` · ${roomLabel}` : ''} starts ${timingLabel}.`,
    data: {
      campusAiNotification: 'my-class',
      notificationKey,
      scheduledAtMs,
      mode,
    },
  };
}

export function buildMyClassReminders({
  uid,
  dept,
  semester,
  mode,
  timetable = {},
  mutedClassKeys = [],
  now = new Date(),
}) {
  if (!uid || !dept || !semester || (mode !== 'regular' && mode !== 'exam')) return [];

  const nowMs = now.getTime();
  const windowEndMs = nowMs + CLASS_NOTIFICATION_WINDOW_MS;
  const mutedKeys = new Set(mutedClassKeys);
  const startDate = dateKeyFromParts(getDateParts(now));
  const endDate = dateKeyFromParts(getDateParts(new Date(windowEndMs)));
  const reminders = new Map();

  for (let dateKey = startDate; dateKey <= endDate; dateKey = addCalendarDays(dateKey, 1)) {
    for (const [room, slots] of Object.entries(timetable || {})) {
      for (const slot of Array.isArray(slots) ? slots : []) {
        if (!matchesUser(slot, room, mode, { dept, semester, mutedClassKeys: mutedKeys })) continue;

        if (mode === 'regular') {
          const slotDay = normalize(slot.day).slice(0, 3);
          if (slotDay !== normalize(weekdayForDate(dateKey)).slice(0, 3)) continue;
        } else if (String(slot.day || '').slice(0, 10) !== dateKey) {
          continue;
        }

        const start = karachiWallTimeToDate(dateKey, slot.start);
        if (!start) continue;

        for (const [timing, scheduledAtMs] of [
          ['before', start.getTime() - 10 * 60 * 1000],
          ['start', start.getTime()],
        ]) {
          if (scheduledAtMs <= nowMs || scheduledAtMs > windowEndMs) continue;
          const reminder = createReminder(slot, room, mode, dateKey, timing, scheduledAtMs, uid);
          reminders.set(reminder.identifier, reminder);
        }
      }
    }
  }

  return [...reminders.values()].sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
}
