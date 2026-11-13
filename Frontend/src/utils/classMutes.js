function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function getClassMuteKey(slot, room, mode = 'regular') {
  return JSON.stringify([
    mode,
    normalize(slot?._dept || slot?.dept || slot?.department),
    normalize(slot?.semester ?? slot?.sem),
    normalize(slot?.day || slot?.date),
    normalize(slot?.lectureNum ?? slot?.n),
    normalize(slot?.start),
    normalize(slot?.end),
    normalize(slot?.subject || slot?.courseCode),
    normalize(slot?.prof || slot?.teacher),
    normalize(room || slot?.room),
  ]);
}
