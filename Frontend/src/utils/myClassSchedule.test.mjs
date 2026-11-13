import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMyClassReminders,
  karachiWallTimeToDate,
} from './myClassSchedule.js';
import { getClassMuteKey } from './classMutes.js';

const now = new Date('2026-11-13T10:00:00.000Z');
const regularSlot = {
  day: 'Fri',
  lectureNum: 2,
  start: '16:00',
  end: '17:00',
  subject: 'Computer Science',
  prof: 'Test Teacher',
  dept: 'cs',
  sem: 3,
  isMine: true,
  isMuted: false,
};

test('converts campus wall time to the same instant regardless of device timezone', () => {
  const result = karachiWallTimeToDate('2026-11-13', '16:00');
  assert.equal(result.toISOString(), '2026-11-13T11:00:00.000Z');
});

test('regular reminders schedule the ten-minute and start notices in the seven-day window', () => {
  const reminders = buildMyClassReminders({
    uid: 'user-1',
    dept: 'cs',
    semester: 3,
    mode: 'regular',
    timetable: { LT1: [regularSlot] },
    now,
  });

  assert.equal(reminders.length, 2);
  assert.deepEqual(reminders.map(item => item.scheduledAtMs), [
    Date.parse('2026-11-13T10:50:00.000Z'),
    Date.parse('2026-11-13T11:00:00.000Z'),
  ]);
  assert.equal(new Set(reminders.map(item => item.identifier)).size, 2);
});

test('exam reminders match exact ISO dates and use the Exam identity', () => {
  const examSlot = {
    ...regularSlot,
    day: '2026-11-14',
    courseCode: 'CSC291',
    classCode: 'BCS-III',
  };
  const reminders = buildMyClassReminders({
    uid: 'user-1',
    dept: 'cs',
    semester: 3,
    mode: 'exam',
    timetable: { CR2: [examSlot] },
    now,
  });

  assert.equal(reminders.length, 2);
  assert.ok(reminders.every(item => item.data.mode === 'exam'));
  assert.ok(reminders.every(item => item.scheduledAtMs > now.getTime()));
});

test('excludes other users, departments, semesters, and muted classes', () => {
  const mutedClassKeys = [getClassMuteKey(regularSlot, 'LT1', 'regular')];
  const reminders = buildMyClassReminders({
    uid: 'user-1',
    dept: 'cs',
    semester: 3,
    mode: 'regular',
    timetable: {
      LT1: [regularSlot],
      LT2: [{ ...regularSlot, isMine: false }],
      LT3: [{ ...regularSlot, dept: 'se' }],
      LT4: [{ ...regularSlot, sem: 4 }],
    },
    mutedClassKeys,
    now,
  });

  assert.equal(reminders.length, 0);
});

test('does not schedule past reminders or duplicate identical timetable rows', () => {
  const startingSoon = { ...regularSlot, day: '2026-11-13', start: '15:55', end: '16:55' };
  const testNow = new Date('2026-11-13T10:50:00.000Z');
  const reminders = buildMyClassReminders({
    uid: 'user-1',
    dept: 'cs',
    semester: 3,
    mode: 'exam',
    timetable: { LT1: [startingSoon, { ...startingSoon }] },
    now: testNow,
  });

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].data.notificationKey.includes('"start"'), true);
  assert.ok(reminders.every(item => item.scheduledAtMs > testNow.getTime()));
});
