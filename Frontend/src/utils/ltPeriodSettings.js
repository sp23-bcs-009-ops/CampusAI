export const DEFAULT_LT_PERIOD_SETTINGS = {
  durationMinutes: null,
  breakEnabled: false,
  breakDurationMinutes: 10,
  breaksAfter: [3],
};

const isValidPeriodDuration = value => Number.isInteger(value) && value > 0 && value <= 300;
const VALID_BREAK_DURATIONS = new Set([5, 10, 15, 20, 30]);
const MAX_LECTURE_NUMBER = 6;

export function normalizeLTPeriodSettings(value) {
  const durationMinutes = Number(value?.durationMinutes);
  const breakDurationMinutes = Number(value?.breakDurationMinutes);
  const breaksAfter = Array.isArray(value?.breaksAfter)
    ? [...new Set(value.breaksAfter.map(Number)
      .filter(number => Number.isInteger(number) && number >= 1 && number < MAX_LECTURE_NUMBER))]
      .sort((a, b) => a - b)
    : DEFAULT_LT_PERIOD_SETTINGS.breaksAfter;

  return {
    durationMinutes: isValidPeriodDuration(durationMinutes) ? durationMinutes : null,
    breakEnabled: value?.breakEnabled === true,
    breakDurationMinutes: VALID_BREAK_DURATIONS.has(breakDurationMinutes)
      ? breakDurationMinutes
      : DEFAULT_LT_PERIOD_SETTINGS.breakDurationMinutes,
    breaksAfter,
  };
}

function timeToMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value) {
  const normalized = ((value % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function applyLTPeriodSettingsToSlots(slots, rawSettings) {
  const settings = normalizeLTPeriodSettings(rawSettings);
  if (!settings.durationMinutes || !slots || typeof slots !== 'object') return slots || {};

  const orderedNumbers = Object.keys(slots)
    .map(Number)
    .filter(number => Number.isInteger(number) && number > 0)
    .sort((a, b) => a - b);
  if (!orderedNumbers.length) return slots;

  const firstSlot = slots[String(orderedNumbers[0])] || slots[orderedNumbers[0]];
  let cursor = timeToMinutes(firstSlot?.start);
  if (cursor === null) return slots;

  const breakPositions = new Set(settings.breakEnabled ? settings.breaksAfter : []);
  const adjusted = {};
  for (const number of orderedNumbers) {
    const key = String(number);
    const slot = slots[key] || slots[number];
    const start = cursor;
    const end = start + settings.durationMinutes;
    adjusted[key] = {
      ...slot,
      start: minutesToTime(start),
      end: minutesToTime(end),
    };
    cursor = end + (breakPositions.has(number) ? settings.breakDurationMinutes : 0);
  }

  return { ...slots, ...adjusted };
}

export function applyLTPeriodSettingsToTimetable(timetable, slotsByDepartmentSemester, rawSettings) {
  const settings = normalizeLTPeriodSettings(rawSettings);
  if (!settings.durationMinutes || !timetable || typeof timetable !== 'object') return timetable || {};

  return Object.fromEntries(Object.entries(timetable).map(([room, slots]) => [
    room,
    (Array.isArray(slots) ? slots : []).map(slot => {
      const department = String(slot?._dept || slot?.dept || '').toLowerCase();
      const semester = Number(slot?.sem ?? slot?.semester);
      const scheduleKey = `${department}_sem${semester}`;
      const schedule = slotsByDepartmentSemester?.[scheduleKey];
      const lectureNumber = Number(slot?.lectureNum ?? slot?.n);
      const adjustedSlot = schedule?.[String(lectureNumber)] || schedule?.[lectureNumber];
      return adjustedSlot
        ? { ...slot, start: adjustedSlot.start, end: adjustedSlot.end }
        : slot;
    }),
  ]));
}

export function applyLTPeriodSettingsToTimetablesBySemester(timetables, slotsByDepartmentSemester, settings) {
  return Object.fromEntries(Object.entries(timetables || {}).map(([semester, roomMap]) => [
    semester,
    applyLTPeriodSettingsToTimetable(roomMap, slotsByDepartmentSemester, settings),
  ]));
}

export function buildUnifiedLTPeriodSlots(slotsByDepartmentSemester, fallbackSlots = {}) {
  const candidates = new Map();
  for (const slots of Object.values(slotsByDepartmentSemester || {})) {
    for (const [number, slot] of Object.entries(slots || {})) {
      const signature = `${slot?.start || ''}-${slot?.end || ''}`;
      const bySignature = candidates.get(number) || new Map();
      bySignature.set(signature, slot);
      candidates.set(number, bySignature);
    }
  }

  const unified = {};
  for (const [number, bySignature] of candidates) {
    if (bySignature.size !== 1) continue;
    const [slot] = bySignature.values();
    unified[number] = {
      ...slot,
      label: fallbackSlots[number]?.label || `Lecture ${number}`,
    };
  }
  return unified;
}
