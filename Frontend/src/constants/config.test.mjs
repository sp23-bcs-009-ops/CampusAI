import test from 'node:test';
import assert from 'node:assert/strict';
import { can, hasStaffRole } from './config.js';

test('only Staff accounts can upload timetables', () => {
  assert.equal(can.uploadTimetable({ type: 'staff' }), true);
  assert.equal(can.uploadTimetable({ type: 'teacher' }), false);
  assert.equal(can.uploadTimetable({ type: 'teacher', staffRoleEnabled: true }), false);
  assert.equal(can.uploadTimetable({ type: 'student' }), false);
});

test('staff access can be added to teachers without granting it to students', () => {
  assert.equal(hasStaffRole({ type: 'teacher' }), false);
  assert.equal(hasStaffRole({ type: 'teacher', staffRoleEnabled: true }), true);
  assert.equal(hasStaffRole({ type: 'student', staffRoleEnabled: true }), false);
  assert.equal(hasStaffRole({ type: 'staff' }), true);
  assert.equal(can.postRoomReservation({ type: 'teacher', staffRoleEnabled: true }), true);
  assert.equal(can.postRoomReservation({ type: 'student', staffRoleEnabled: true }), false);
});
