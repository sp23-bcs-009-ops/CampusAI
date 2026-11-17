import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseDeveloperMode,
  createDeveloperClockInput,
  getDeveloperViewUser,
  getDeveloperNow,
  isDeveloperClockInputValid,
  isDeveloperModeEnabled,
  resetDeveloperClock,
  setDeveloperMode,
  setDeveloperRole,
  setDeveloperStudentAcademicInfo,
  updateDeveloperClock,
} from './developerMode.js';

const allowlistedUser = { email: 'SP23-BCS-009@cuiatk.edu.pk' };

test('developer access preserves allowlisted users and development test accounts', () => {
  assert.equal(canUseDeveloperMode(allowlistedUser, false), true);
  assert.equal(canUseDeveloperMode({ testMode: true }, true), true);
  assert.equal(canUseDeveloperMode({ testMode: true }, false), false);
  assert.equal(isDeveloperModeEnabled({ ...allowlistedUser, developerModeEnabled: true }), true);
  assert.equal(isDeveloperModeEnabled({ testMode: true }, true), true);
});

test('developer clock settings initialize, validate, update, and reset', () => {
  const now = new Date(2026, 10, 14, 14, 38);
  const initial = createDeveloperClockInput(null, now);
  assert.deepEqual(initial, {
    mode: 'weekday',
    weekday: String(now.getDay()),
    date: '2026-11-14',
    time: '14:38',
  });
  assert.equal(isDeveloperClockInputValid(initial), true);
  assert.equal(isDeveloperClockInputValid({ ...initial, time: '25:70' }), false);

  const updatedUser = updateDeveloperClock(allowlistedUser, { ...initial, time: '09:15' });
  assert.equal(updatedUser.developerClock.time, '09:15');
  assert.equal(setDeveloperMode(allowlistedUser, true).developerModeEnabled, true);

  const reset = resetDeveloperClock(updatedUser, now);
  assert.equal(reset.user.developerClock, null);
  assert.deepEqual(reset.clock, initial);
});

test('developer clock simulates configured date and weekday', () => {
  const actualNow = new Date(2026, 10, 14, 14, 38);
  const dateUser = {
    ...allowlistedUser,
    developerModeEnabled: true,
    developerClock: { mode: 'date', date: '2026-11-17', time: '08:30' },
  };
  const simulatedDate = getDeveloperNow(actualNow, dateUser);
  assert.equal(simulatedDate.getFullYear(), 2026);
  assert.equal(simulatedDate.getMonth(), 10);
  assert.equal(simulatedDate.getDate(), 17);
  assert.equal(simulatedDate.getHours(), 8);
  assert.equal(simulatedDate.getMinutes(), 30);

  const weekdayUser = {
    ...allowlistedUser,
    developerModeEnabled: true,
    developerClock: { mode: 'weekday', weekday: '1', time: '09:00' },
  };
  assert.equal(getDeveloperNow(actualNow, weekdayUser).getDay(), 1);
});

test('developer role and academic changes preserve existing user data', () => {
  const user = { ...allowlistedUser, name: 'Test User', subjects: ['Existing'] };
  const roleUser = setDeveloperRole(user, 'teacher');
  assert.equal(roleUser.type, user.type);
  assert.equal(roleUser.developerRole, 'teacher');
  assert.equal(roleUser.name, user.name);
  assert.equal(getDeveloperViewUser(roleUser), roleUser);

  const selectedTeacher = getDeveloperViewUser({
    ...roleUser,
    developerModeEnabled: true,
    developerTeacherName: 'Professor Example',
    staffRoleEnabled: true,
  });
  assert.equal(selectedTeacher.type, 'teacher');
  assert.equal(selectedTeacher.fullName, 'Professor Example');
  assert.equal(selectedTeacher.uid, user.uid);
  assert.equal(selectedTeacher.staffRoleEnabled, false);

  const academicUser = setDeveloperStudentAcademicInfo(user, 'ai', 8);
  assert.equal(academicUser.developerStudentDept, 'ai');
  assert.equal(academicUser.developerStudentSemester, 4);
  assert.equal(academicUser.dept, user.dept);
  assert.equal(academicUser.semester, user.semester);
  assert.equal(academicUser.name, user.name);
});

test('developer role uses only the selected role profile', () => {
  const original = {
    ...allowlistedUser,
    type: 'teacher',
    name: 'Real Teacher',
    fullName: 'Real Teacher',
    dept: 'se',
    semester: 6,
    staffRoleEnabled: true,
    developerModeEnabled: true,
  };
  const student = getDeveloperViewUser({
    ...original,
    developerRole: 'student',
    developerStudentDept: 'cs',
    developerStudentSemester: 2,
  });
  assert.equal(student.type, 'student');
  assert.equal(student.name, 'Dev Student');
  assert.equal(student.fullName, 'Dev Student');
  assert.equal(student.dept, 'cs');
  assert.equal(student.semester, 2);
  assert.equal(student.subjects, undefined);
  assert.equal(student.staffRoleEnabled, false);

  const teacher = getDeveloperViewUser({ ...original, developerRole: 'teacher' });
  assert.equal(teacher.type, 'teacher');
  assert.equal(teacher.fullName, 'Dev Teacher');
  assert.equal(teacher.dept, undefined);
  assert.equal(teacher.semester, undefined);

  const staff = getDeveloperViewUser({ ...original, developerRole: 'staff' });
  assert.equal(staff.type, 'staff');
  assert.equal(staff.fullName, 'Dev Staff');
  assert.equal(staff.dept, undefined);
  assert.equal(staff.semester, undefined);
  assert.equal(staff.staffRoleEnabled, false);
});
