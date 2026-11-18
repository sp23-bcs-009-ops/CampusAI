import { DEPT_MAP, DEPT_MAX_SEM, STUDENT_DEPARTMENTS } from '../constants/config.js';

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

export function canUseDeveloperMode(user) {
  if (!user) return false;
  return DEVELOPER_EMAILS.has(String(user.email || '').trim().toLowerCase());
}

export function isDeveloperModeEnabled(user) {
  return canUseDeveloperMode(user) && user?.developerModeEnabled === true;
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

export function createDeveloperClockInput(user, now = new Date()) {
  return {
    mode: user?.developerClock?.mode || 'weekday',
    weekday: String(user?.developerClock?.weekday ?? now.getDay()),
    date: user?.developerClock?.date || formatLocalDate(now),
    time: user?.developerClock?.time || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  };
}

export function isDeveloperClockInputValid(clock) {
  return !!parseClockTime(clock.time)
    && (clock.mode !== 'date' || !!parseLocalDate(clock.date));
}

export function updateDeveloperClock(user, clock) {
  return { ...user, developerClock: clock };
}

export function resetDeveloperClock(user, now = new Date()) {
  return {
    clock: createDeveloperClockInput(null, now),
    user: { ...user, developerClock: null },
  };
}

export function setDeveloperMode(user, enabled) {
  return { ...user, developerModeEnabled: enabled };
}

export function setDeveloperRole(user, type) {
  return { ...user, developerRole: type };
}

export function getDeveloperViewUser(user) {
  if (!isDeveloperModeEnabled(user)) return user;
  const role = user.developerRole || 'student';
  if (role === 'teacher') {
    const teacherName = String(user.developerTeacherName || '').trim();
    return {
      ...user,
      type: 'teacher',
      name: teacherName || 'Dev Teacher',
      fullName: teacherName || 'Dev Teacher',
      dept: undefined,
      department: undefined,
      semester: undefined,
      subjects: [],
      staffRoleEnabled: false,
    };
  }
  if (role === 'student') {
    const dept = user.developerStudentDept || 'cs';
    const department = STUDENT_DEPARTMENTS.find(item => item.code === dept)?.label
      || DEPT_MAP[dept]
      || dept.toUpperCase();
    return {
      ...user,
      type: 'student',
      name: 'Dev Student',
      fullName: 'Dev Student',
      dept,
      department,
      semester: user.developerStudentSemester || 1,
      subjects: undefined,
      staffRoleEnabled: false,
    };
  }
  return {
    ...user,
    type: 'staff',
    name: 'Dev Staff',
    fullName: 'Dev Staff',
    dept: undefined,
    department: undefined,
    semester: undefined,
    staffRoleEnabled: false,
    subjects: [],
  };
}

export function setDeveloperStudentAcademicInfo(user, dept, semester) {
  const boundedSemester = Math.min(Number(semester) || 1, DEPT_MAX_SEM[dept] || 8);

  return {
    ...user,
    developerStudentDept: dept,
    developerStudentSemester: boundedSemester,
  };
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
