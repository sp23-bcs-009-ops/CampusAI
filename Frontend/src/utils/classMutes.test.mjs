import test from 'node:test';
import assert from 'node:assert/strict';
import { getClassMuteKey } from './classMutes.js';
import { can, hasStaffRole } from '../constants/config.js';

const classSlot = {
  day: 'Mon',
  lectureNum: 2,
  start: '09:00',
  end: '10:00',
  subject: 'Computer Science',
  prof: 'Test Teacher',
  dept: 'cs',
  sem: 3,
};

test('a mute key identifies one exact recurring timetable class', () => {
  const key = getClassMuteKey(classSlot, 'LT1');

  assert.equal(getClassMuteKey({ ...classSlot }, 'LT1'), key);
  assert.notEqual(getClassMuteKey({ ...classSlot, day: 'Tue' }, 'LT1'), key);
  assert.notEqual(getClassMuteKey(classSlot, 'LT2'), key);
  assert.notEqual(getClassMuteKey(classSlot, 'LT1', 'exam'), key);
});

test('staff access can be added to teachers without granting it to students', () => {
  assert.equal(hasStaffRole({ type: 'teacher' }), false);
  assert.equal(hasStaffRole({ type: 'teacher', staffRoleEnabled: true }), true);
  assert.equal(hasStaffRole({ type: 'student', staffRoleEnabled: true }), false);
  assert.equal(hasStaffRole({ type: 'staff' }), true);
  assert.equal(can.postRoomReservation({ type: 'teacher', staffRoleEnabled: true }), true);
  assert.equal(can.postRoomReservation({ type: 'student', staffRoleEnabled: true }), false);
});
