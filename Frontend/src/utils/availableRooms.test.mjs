import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableRoomsForSlot, getFloorMapRooms } from './availableRooms.js';
import { getFullRoomStatus } from './helpers.js';

const lectureSlots = {
  1: { start: '08:30', end: '09:45' },
  2: { start: '09:45', end: '11:00' },
};

function getRooms(overrides = {}) {
  return getAvailableRoomsForSlot({
    timetables: {},
    dept: 'cs',
    semester: 3,
    date: '2026-11-18',
    lectureNum: 1,
    lectureSlots,
    teacherName: 'Dr. Example',
    ...overrides,
  });
}

test('available rooms include mapped classrooms and labs, not only lecture theatres', () => {
  const rooms = getFloorMapRooms();
  assert.ok(rooms.includes('LT1'));
  assert.ok(rooms.includes('Lab1'));
  assert.ok(rooms.includes('Lecture Hall 01'));
  assert.ok(rooms.includes('Computer & Network Lab'));
  assert.ok(rooms.includes('Computer Lab1'));
  assert.ok(rooms.includes('Seminar Hall'));
  assert.ok(!rooms.includes('Faculty Office G1'));
});

test('a room occupied in another semester is not available', () => {
  const rooms = getRooms({
    timetables: {
      1: { LT1: [{ day: 'Wed', start: '08:30', end: '09:45' }] },
    },
  });
  assert.ok(!rooms.some(option => option.room === 'LT1'));
  assert.ok(rooms.some(option => option.room === 'LT2'));
});

test('a teacher conflict blocks the selected time across departments', () => {
  const rooms = getRooms({
    timetables: {
      7: { LT8: [{ day: 'Wed', start: '09:00', end: '10:00', prof: 'dr. example' }] },
    },
  });
  assert.deepEqual(rooms, []);
});

test('a class in the selected department and semester blocks the selected time', () => {
  const rooms = getRooms({
    timetables: {
      3: { LT8: [{ day: 'Wed', start: '09:00', end: '10:00', _dept: 'CS' }] },
    },
  });
  assert.deepEqual(rooms, []);
});

test('non-class room reservations are not blocked by teacher or class schedules', () => {
  const rooms = getRooms({
    checkTeachingConflicts: false,
    timetables: {
      3: {
        LT1: [{ day: 'Wed', start: '08:30', end: '09:45', _dept: 'cs' }],
        LT8: [{ day: 'Wed', start: '08:30', end: '09:45', prof: 'Dr. Example' }],
      },
    },
  });
  assert.ok(rooms.some(option => option.room === 'LT2'));
  assert.ok(!rooms.some(option => option.room === 'LT1'));
});

test('existing room reservations are checked for overlapping time slots', () => {
  const rooms = getRooms({
    roomReservations: [
      { type: 'room_reservation', room: 'LT1', date: '2026-11-18', lectureNum: 2 },
    ],
  });
  assert.ok(rooms.some(option => option.room === 'LT1'));
  const overlappingRooms = getRooms({
    lectureSlots: {
      ...lectureSlots,
      2: { start: '09:30', end: '10:30' },
    },
    roomReservations: [
      { type: 'room_reservation', room: 'LT1', date: '2026-11-18', lectureNum: 2 },
    ],
  });
  assert.ok(!overlappingRooms.some(option => option.room === 'LT1'));
});

test('arranged class appears as My Class to its owner and Arranged to others', () => {
  const now = new Date(2026, 10, 18, 9, 0);
  const lectureSlot = { start: '08:30', end: '09:45' };
  const arrangedClass = {
    type: 'arrange',
    room: 'LT1',
    date: '2026-11-18',
    lectureNum: 1,
    dept: 'cs',
    semester: 3,
    subject: 'Computer Science',
    postedBy: 'Dr. Example',
  };
  const makeStatus = isMine => getFullRoomStatus(
    'LT1',
    now,
    {},
    [{ ...arrangedClass, isMine }],
    [],
    { 1: lectureSlot },
  );
  assert.equal(makeStatus(true).status, 'mine');
  assert.equal(makeStatus(true).slot.isMine, true);
  assert.equal(makeStatus(false).status, 'arranged');
});
