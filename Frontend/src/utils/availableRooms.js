import { DEPT_FLOORS } from '../constants/config.js';
import { dateToDayName, getRoomTimetableSlots, normalizeText as normalize } from './helpers.js';

function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getInterval(slot) {
  const time = String(slot?.time || '');
  const start = toMinutes(slot?.start || time.split('-')[0]);
  const end = toMinutes(slot?.end || time.split('-')[1]);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

function overlapsSelectedSlot(slot, selectedDay, selectedInterval) {
  const day = String(slot?.day || '').trim();
  const sameDay = day.slice(0, 10) === selectedDay
    || normalize(day.slice(0, 3)) === normalize(selectedDay);
  if (!sameDay) return false;

  const interval = getInterval(slot);
  return !interval || (interval.start < selectedInterval.end && interval.end > selectedInterval.start);
}

export function getFloorMapRooms() {
  const roomIds = new Set();
  for (const floors of Object.values(DEPT_FLOORS)) {
    for (const floor of Object.values(floors)) {
      const rooms = [
        ...(floor.arcRooms || []),
        ...(floor.leftWing || []),
        ...(floor.rightWing || []),
        ...(floor.rooms || []),
      ];
      for (const room of rooms) {
        const description = `${room.id || ''} ${room.label || ''}`;
        if (room.type === 'lt' || room.type === 'lab' || /\blab\b/i.test(description)) {
          if (room.id) roomIds.add(String(room.id));
        }
      }
    }
  }
  return Array.from(roomIds).sort((a, b) => a.localeCompare(b));
}

export function getAvailableRoomsForTime({ timetable, day, start, end }) {
  const selectedInterval = getInterval({ start, end });
  if (!day || !selectedInterval) return [];
  return Object.keys(timetable || {})
    .filter(room => !(Array.isArray(timetable[room]) ? timetable[room] : []).some(slot =>
      overlapsSelectedSlot(slot, day, selectedInterval)
    ))
    .sort((a, b) => a.localeCompare(b))
    .map(room => ({ room }));
}

export function getAvailableRoomsForSlot({
  timetables,
  dept,
  semester,
  date,
  lectureNum,
  lectureSlots,
  teacherName,
  checkTeachingConflicts = true,
  roomReservations = [],
}) {
  if (!dept || !semester || !date || !lectureNum) return [];

  const selectedInterval = getInterval(lectureSlots?.[lectureNum]);
  if (!selectedInterval) return [];
  const dateValue = String(date).slice(0, 10);
  const selectedDay = dateToDayName(dateValue);
  const allSlots = Object.entries(timetables || {}).flatMap(([semesterKey, roomMap]) =>
    Object.entries(roomMap || {}).flatMap(([room, slots]) =>
      (Array.isArray(slots) ? slots : []).map(slot => ({
        room,
        semester: Number(semesterKey),
        slot,
      }))
    )
  );
  const teacherKey = normalize(teacherName);
  const hasTeacherConflict = checkTeachingConflicts && teacherKey && allSlots.some(({ slot }) =>
    normalize(slot?.prof || slot?.teacher) === teacherKey
      && overlapsSelectedSlot(slot, selectedDay, selectedInterval)
  );
  const hasClassConflict = checkTeachingConflicts && allSlots.some(({ semester: slotSemester, slot }) =>
    normalize(slot?._dept || slot?.dept || slot?.department) === normalize(dept)
      && Number(slot?.semester ?? slot?.sem ?? slotSemester) === Number(semester)
      && overlapsSelectedSlot(slot, selectedDay, selectedInterval)
  );
  if (hasTeacherConflict || hasClassConflict) return [];

  return getFloorMapRooms()
    .filter(room => !Object.values(timetables || {}).some(roomMap =>
      getRoomTimetableSlots(room, roomMap).some(slot =>
        overlapsSelectedSlot(slot, selectedDay, selectedInterval)
      )
    ))
    .filter(room => !roomReservations.some(reservation => {
      if (reservation?.room !== room || String(reservation?.date || '').slice(0, 10) !== dateValue) return false;
      const reservationInterval = getInterval(lectureSlots?.[reservation.lectureNum]);
      return reservationInterval
        ? reservationInterval.start < selectedInterval.end && reservationInterval.end > selectedInterval.start
        : Number(reservation.lectureNum) === Number(lectureNum);
    }))
    .map(room => ({ room }));
}
