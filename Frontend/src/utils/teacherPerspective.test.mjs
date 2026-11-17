import test from 'node:test';
import assert from 'node:assert/strict';
import { getTeacherAssignments, getTeacherNames } from './teacherPerspective.js';

const timetable = {
  LT1: [
    { prof: 'Dr. Example', _dept: 'CS', sem: 3, subject: 'Algorithms' },
    { prof: 'Dr. Example', dept: 'cs', semester: 3, subject: 'Algorithms' },
    { teacher: 'Dr. Example', dept: 'SE', semester: 4, courseCode: 'Software Design' },
    { prof: 'Another Teacher', dept: 'CS', sem: 3, subject: 'Databases' },
  ],
};

test('teacher search names are deduplicated and sorted from timetable data', () => {
  assert.deepEqual(getTeacherNames(timetable), ['Another Teacher', 'Dr. Example']);
});

test('teacher assignments include only matching teacher dept-semester subjects', () => {
  assert.deepEqual(getTeacherAssignments(timetable, ' dr. example '), [
    { dept: 'cs', semester: 3, subjects: ['Algorithms'] },
    { dept: 'se', semester: 4, subjects: ['Software Design'] },
  ]);
  assert.deepEqual(getTeacherAssignments(timetable, ''), []);
});
