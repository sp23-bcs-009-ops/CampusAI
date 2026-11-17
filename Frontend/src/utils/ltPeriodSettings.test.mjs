import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LT_PERIOD_SETTINGS,
  applyLTPeriodSettingsToTimetablesBySemester,
  applyLTPeriodSettingsToSlots,
  applyLTPeriodSettingsToTimetable,
  buildUnifiedLTPeriodSlots,
  normalizeLTPeriodSettings,
} from './ltPeriodSettings.js';

const slots = {
  1: { label: 'Lecture 1', start: '08:30', end: '09:45' },
  2: { label: 'Lecture 2', start: '09:45', end: '11:00' },
  3: { label: 'Lecture 3', start: '11:00', end: '12:30' },
  4: { label: 'Lecture 4', start: '12:30', end: '13:45' },
  5: { label: 'Lecture 5', start: '14:00', end: '15:15' },
};

test('default settings preserve the uploaded timetable and reset to its defaults', () => {
  assert.deepEqual(normalizeLTPeriodSettings({}), DEFAULT_LT_PERIOD_SETTINGS);
  assert.equal(applyLTPeriodSettingsToSlots(slots, DEFAULT_LT_PERIOD_SETTINGS), slots);
});

test('custom periods apply selected duration and one default break after Lecture 3', () => {
  const adjusted = applyLTPeriodSettingsToSlots(slots, {
    durationMinutes: 30,
    breakEnabled: true,
    breakDurationMinutes: 10,
    breaksAfter: [3],
  });

  assert.deepEqual(
    [1, 2, 3, 4, 5].map(number => [adjusted[number].start, adjusted[number].end]),
    [
      ['08:30', '09:00'],
      ['09:00', '09:30'],
      ['09:30', '10:00'],
      ['10:10', '10:40'],
      ['10:40', '11:10'],
    ],
  );
  assert.equal(slots[1].end, '09:45');
});

test('multiple break positions and no-break schedule are applied consistently', () => {
  const withBreaks = applyLTPeriodSettingsToSlots(slots, {
    durationMinutes: 60,
    breakEnabled: true,
    breakDurationMinutes: 15,
    breaksAfter: [1, 3],
  });
  assert.equal(withBreaks[2].start, '09:45');
  assert.equal(withBreaks[4].start, '12:00');

  const noBreak = applyLTPeriodSettingsToSlots(slots, {
    durationMinutes: 60,
    breakEnabled: false,
    breakDurationMinutes: 15,
    breaksAfter: [3],
  });
  assert.equal(noBreak[4].start, '11:30');
});

test('timetable rows use their matching department and semester schedule', () => {
  const timetable = {
    LT1: [
      { lectureNum: 1, start: '08:30', end: '09:45', _dept: 'cs', sem: 3 },
      { lectureNum: 4, start: '12:30', end: '13:45', _dept: 'cs', sem: 3 },
      { lectureNum: 4, start: '12:30', end: '13:45', _dept: 'se', sem: 3 },
    ],
  };
  const csSlots = applyLTPeriodSettingsToSlots(slots, {
    durationMinutes: 30,
    breakEnabled: true,
    breakDurationMinutes: 10,
    breaksAfter: [3],
  });
  const result = applyLTPeriodSettingsToTimetable(timetable, { cs_sem3: csSlots }, {
    durationMinutes: 30,
    breakEnabled: true,
    breakDurationMinutes: 10,
    breaksAfter: [3],
  });

  assert.equal(result.LT1[0].start, '08:30');
  assert.equal(result.LT1[1].start, '10:10');
  assert.equal(result.LT1[2].start, '12:30');
  assert.equal(timetable.LT1[1].start, '12:30');
});

test('semester timetables and shared lecture slots reflect active settings', () => {
  const settings = {
    durationMinutes: 30,
    breakEnabled: true,
    breakDurationMinutes: 10,
    breaksAfter: [3],
  };
  const byDepartment = { cs_sem3: applyLTPeriodSettingsToSlots(slots, settings) };
  const adjusted = applyLTPeriodSettingsToTimetablesBySemester({
    3: { LT1: [{ lectureNum: 4, start: '12:30', end: '13:45', _dept: 'cs', sem: 3 }] },
  }, byDepartment, settings);
  assert.equal(adjusted[3].LT1[0].start, '10:10');

  const unified = buildUnifiedLTPeriodSlots(byDepartment, slots);
  assert.equal(unified[4].start, '10:10');
  assert.equal(unified[4].label, 'Lecture 4');
  assert.equal(buildUnifiedLTPeriodSlots({
    cs_sem3: byDepartment.cs_sem3,
    se_sem3: { ...byDepartment.cs_sem3, 1: { ...byDepartment.cs_sem3[1], start: '09:00' } },
  })[1], undefined);
});
