function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function getTeacherNames(timetable) {
  const names = new Map();
  for (const slots of Object.values(timetable || {})) {
    for (const slot of Array.isArray(slots) ? slots : []) {
      const name = String(slot?.prof || slot?.teacher || '').trim();
      if (name && !names.has(normalize(name))) names.set(normalize(name), name);
    }
  }
  return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
}

export function getTeacherAssignments(timetable, teacherName) {
  const teacherKey = normalize(teacherName);
  if (!teacherKey) return [];

  const assignments = new Map();
  for (const slots of Object.values(timetable || {})) {
    for (const slot of Array.isArray(slots) ? slots : []) {
      if (normalize(slot?.prof || slot?.teacher) !== teacherKey) continue;

      const dept = normalize(slot?._dept || slot?.dept || slot?.department);
      const semester = Number(slot?.semester ?? slot?.sem);
      if (!dept || !Number.isInteger(semester) || semester < 1) continue;

      const key = `${dept}:${semester}`;
      const assignment = assignments.get(key) || { dept, semester, subjects: [] };
      const subject = String(slot?.subject || slot?.courseCode || '').trim();
      if (subject && !assignment.subjects.some(value => normalize(value) === normalize(subject))) {
        assignment.subjects.push(subject);
      }
      assignments.set(key, assignment);
    }
  }

  return Array.from(assignments.values())
    .map(assignment => ({
      ...assignment,
      subjects: assignment.subjects.sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.dept.localeCompare(b.dept) || a.semester - b.semester);
}
