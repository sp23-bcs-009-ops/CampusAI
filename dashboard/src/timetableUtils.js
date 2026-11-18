export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const slotStart = (slot) => {
  const match = String(slot).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  let hour = Number(match[1]);
  if (hour <= 7) hour += 12;
  return hour * 60 + Number(match[2]);
};
