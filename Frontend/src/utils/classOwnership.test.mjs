import test from 'node:test';
import assert from 'node:assert/strict';
import { isArrangedClassMine, isStudentClassSelected } from './classOwnership.js';
import { normalizeSubjectKey } from './clashingSubjectAliases.js';

const user = {
  dept: 'cs',
  semester: 3,
  subjectKeys: new Set([normalizeSubjectKey('Computer Science')]),
};

test('student class ownership requires matching department, semester, and selected subject', () => {
  assert.equal(isStudentClassSelected({
    dept: 'CS',
    sem: 3,
    subject: 'Computer Science',
  }, user), true);

  assert.equal(isStudentClassSelected({
    dept: 'SE',
    sem: 3,
    subject: 'Computer Science',
  }, user), false);

  assert.equal(isStudentClassSelected({
    dept: 'CS',
    sem: 4,
    subject: 'Computer Science',
  }, user), false);

  assert.equal(isStudentClassSelected({
    dept: 'CS',
    sem: 3,
    subject: 'Data Structures',
  }, user), false);
});

test('student class ownership accepts timetable department and semester field variants', () => {
  assert.equal(isStudentClassSelected({
    _dept: 'cs',
    semester: 3,
    courseCode: 'Computer Science',
  }, user), true);
});

test('arranged classes are My Class only for the assigned teacher or matching students', () => {
  const arrangedClass = {
    type: 'arrange',
    dept: 'cs',
    semester: 3,
    subject: 'Computer Science',
    postedBy: 'Dr. Example',
  };
  assert.equal(isArrangedClassMine(arrangedClass, {
    type: 'teacher',
    fullName: ' dr. example ',
  }), true);
  assert.equal(isArrangedClassMine(arrangedClass, {
    type: 'teacher',
    fullName: 'Another Teacher',
  }), false);
  assert.equal(isArrangedClassMine(arrangedClass, { type: 'student' }, user), true);
  assert.equal(isArrangedClassMine({ ...arrangedClass, type: 'room_reservation' }, { type: 'teacher', fullName: 'Dr. Example' }), false);
});
