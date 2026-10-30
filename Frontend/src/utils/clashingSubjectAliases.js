const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to']);
const TEACHER_TITLES = new Set(['professor', 'prof', 'doctor', 'dr', 'mr', 'mrs', 'ms', 'miss']);

export function normalizeSubjectKey(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function compact(value) {
  return normalizeSubjectKey(value).replace(/[^a-z0-9]/g, '');
}

function subjectMatchKeys(value) {
  const text = String(value || '').trim();
  const compactValue = compact(text);
  if (!compactValue) return new Set();
  const words = normalizeSubjectKey(text).match(/[a-z0-9]+/g) || [];
  const meaningful = words.filter(word => !STOP_WORDS.has(word));
  const keys = new Set([compactValue]);
  if (words.length >= 2) keys.add(words.map(word => word[0]).join(''));
  if (meaningful.length >= 2) keys.add(meaningful.map(word => word[0]).join(''));
  const capitals = (text.match(/[A-Z]/g) || []).join('').toLocaleLowerCase();
  if (capitals.length >= 2) keys.add(capitals);
  return new Set([...keys].filter(key => key.length >= 2));
}

function subjectsAreAliases(left, right) {
  const leftCompact = compact(left);
  const rightCompact = compact(right);
  if (!leftCompact || !rightCompact || leftCompact === rightCompact) return false;
  if (Math.min(leftCompact.length, rightCompact.length) >= 4
      && (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact))) return true;
  const rightKeys = subjectMatchKeys(right);
  return [...subjectMatchKeys(left)].some(key => rightKeys.has(key));
}

function normalizedTeacher(value) {
  const words = normalizeSubjectKey(value).match(/[a-z0-9]+/g) || [];
  while (words.length && TEACHER_TITLES.has(words[0])) words.shift();
  return words.join(' ');
}

function normalizeRoom(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function canonicalLabel(slots) {
  return slots.map(slot => String(slot.subject || '').trim()).sort((left, right) => {
    const lengthDifference = compact(right).length - compact(left).length;
    return lengthDifference || left.localeCompare(right);
  })[0] || '';
}

/**
 * Only recognize aliases when they collide in the same room and time and have
 * the same teacher. The returned map is empty for ambiguous alias targets.
 */
export function buildClashingSubjectAliasMap(roomMap) {
  const collisions = new Map();
  Object.entries(roomMap || {}).forEach(([room, slots]) => {
    (Array.isArray(slots) ? slots : []).forEach(slot => {
      if (!slot?.room && !room) return;
      const key = JSON.stringify([
        String(slot.day || '').toLocaleLowerCase(),
        String(slot.start || ''),
        String(slot.end || ''),
        normalizeRoom(slot.room || room),
      ]);
      if (!collisions.has(key)) collisions.set(key, []);
      collisions.get(key).push(slot);
    });
  });

  const possibleTargets = new Map();
  for (const slots of collisions.values()) {
    if (slots.length < 2) continue;
    const parent = slots.map((_, index) => index);
    const find = index => {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]];
        index = parent[index];
      }
      return index;
    };
    for (let leftIndex = 0; leftIndex < slots.length; leftIndex += 1) {
      const left = slots[leftIndex];
      const teacher = normalizedTeacher(left.prof || left.teacher);
      if (!teacher) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < slots.length; rightIndex += 1) {
        const right = slots[rightIndex];
        if (teacher !== normalizedTeacher(right.prof || right.teacher)) continue;
        if (!subjectsAreAliases(left.subject, right.subject)) continue;
        const leftRoot = find(leftIndex);
        const rightRoot = find(rightIndex);
        if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
      }
    }
    const components = new Map();
    slots.forEach((slot, index) => {
      const root = find(index);
      if (!components.has(root)) components.set(root, []);
      components.get(root).push(slot);
    });
    for (const component of components.values()) {
      if (component.length < 2) continue;
      const canonical = canonicalLabel(component);
      for (const slot of component) {
        const key = normalizeSubjectKey(slot.subject);
        if (!key) continue;
        if (!possibleTargets.has(key)) possibleTargets.set(key, new Set());
        possibleTargets.get(key).add(canonical);
      }
    }
  }

  return new Map([...possibleTargets]
    .filter(([, targets]) => targets.size === 1)
    .map(([subject, targets]) => [subject, [...targets][0]]));
}

export function resolveSubjectAlias(subject, aliasMap) {
  const raw = String(subject || '').trim();
  return aliasMap?.get(normalizeSubjectKey(raw)) || raw;
}
