import { normalizeSubjectKey } from './clashingSubjectAliases.js';

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function isStudentClassSelected(slot, { dept, semester, subjectKeys }) {
  const slotDept = normalize(slot?._dept || slot?.dept || slot?.department);
  const slotSemester = Number(slot?.semester ?? slot?.sem);
  const selectedSubject = normalizeSubjectKey(slot?.subject || slot?.courseCode);

  return slotDept === normalize(dept)
    && slotSemester === Number(semester)
    && subjectKeys.has(selectedSubject);
}

export function isArrangedClassMine(arrangedClass, user, studentContext) {
  if (arrangedClass?.type !== 'arrange') return false;
  if (user?.type === 'teacher') {
    const teacherName = String(user.fullName || user.name || '').trim().toLocaleLowerCase();
    return !!teacherName && teacherName === String(arrangedClass.postedBy || '').trim().toLocaleLowerCase();
  }
  if (user?.type !== 'student') return false;
  return isStudentClassSelected({
    dept: arrangedClass.dept,
    semester: arrangedClass.semester,
    subject: arrangedClass.subject,
  }, studentContext);
}
