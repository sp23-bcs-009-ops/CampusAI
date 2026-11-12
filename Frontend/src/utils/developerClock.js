const DEVELOPER_EMAILS = new Set([
  'sp23-bcs-009@cuiatk.edu.pk',
  'sp23-bcs-012@cuiatk.edu.pk',
]);

export const DEVELOPER_WEEKDAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export function formatLocalDate(date) {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function canUseDeveloperMode(user, isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__) {
  if (!user) return false;
  if (isDevelopment && user.testMode === true) return true;
  return DEVELOPER_EMAILS.has(String(user.email || '').trim().toLowerCase());
}

export function isAlwaysOnTestAccount(user, isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__) {
  return isDevelopment && user?.testMode === true;
}

export function isDeveloperModeEnabled(user) {
  if (!canUseDeveloperMode(user)) return false;
  return isAlwaysOnTestAccount(user) || user?.developerModeEnabled === true;
}

export function parseLocalDate(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ''));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function parseClockTime(timeText) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(timeText || ''));
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function getDeveloperNow(actualNow, user) {
  if (!isDeveloperModeEnabled(user)) return actualNow;
  const clock = user.developerClock || {};
  const time = parseClockTime(clock.time);
  if (!time) return actualNow;

  let date;
  if (clock.mode === 'date') {
    date = parseLocalDate(clock.date);
  } else if (clock.mode === 'weekday') {
    const weekday = Number(clock.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return actualNow;
    date = new Date(actualNow.getFullYear(), actualNow.getMonth(), actualNow.getDate());
    const daysAhead = (weekday - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysAhead);
  }
  if (!date) return actualNow;
  date.setHours(time.hours, time.minutes, 0, 0);
  return date;
}
