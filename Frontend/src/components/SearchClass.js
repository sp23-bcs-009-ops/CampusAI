import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, Modal,
} from 'react-native';
import { C } from '../constants/colors';
import { DEPT_MAP, DEPT_MAX_SEM, DEPT_FLOOR_ROOMS } from '../constants/config';
import DateTimePicker from './DateTimePickerAdapter';
import { roomDepartment } from '../utils/helpers';
import { getAvailableRoomsForTime } from '../utils/availableRooms';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Weekly Timetable orders days Mon → Sun; search results follow the same order.
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Class identity for a slot (Dept + Sem), e.g. "cs|5" → "CS · Sem 5"
function classLabelOf(slot) {
  const dept = String(slot.dept || slot._dept || slot.department || 'Department not specified').toUpperCase();
  const sem = slot.semester ?? slot.sem;
  return `${dept} · ${sem ? `Sem ${sem}` : 'Sem ?'}`;
}
function lecNumOf(slot) {
  const n = Number(slot.lectureNum ?? slot.n);
  return Number.isFinite(n) ? n : null;
}

/**
 * Search Class — filter the active timetable, results appear only after the
 * Search button is pressed. Filter layout reuses the staff search patterns
 * from the Weekly Timetable modal:
 *   Time        → "Now" / "Specify time" (Day + Lec# chips appear after)
 *   Department  → All / DEPT_MAP chips          (independent)
 *   Semester    → All / Sem chips               (independent)
 *   Teacher     → search bar with live suggestions
 *   Room        → building first, then that building's rooms
 *   Subject     → search bar with live suggestions
 * Results render in the Weekly Timetable modal's row style, 10 at a time
 * with a "More" button to load the next batch.
 * Empty filters mean "no restriction", so the original five question shapes
 * (when / who / which class / where / what subject) are all covered.
 */
export default function SearchClass({ dark, timetable, lectureSlots, now, mode = 'regular' }) {
  const [show, setShow] = useState(false);
  const [searchMode, setSearchMode] = useState('classes');

  // Filters
  const [timeMode, setTimeMode] = useState('');          // '' | 'now' | 'specify'
  const [days, setDays] = useState([]);                  // used only when 'specify'
  const [lecs, setLecs] = useState([]);                  // used only when 'specify'
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [dept, setDept] = useState('');                  // academic dept filter
  const [sem, setSem] = useState('');                    // semester filter
  const [building, setBuilding] = useState('');          // room building (cs/math/ee)
  const [room, setRoom] = useState('');
  const [subjectSearch, setSubjectSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [freeTime, setFreeTime] = useState('');
  const [freeDate, setFreeDate] = useState(() => now || new Date());
  const [freeDay, setFreeDay] = useState('');

  // null = user has not pressed Search yet (no results rendered)
  const [results, setResults] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);  // incremental "More" paging

  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const cardBg = dark ? '#12123A' : '#FFFFFF';

  // Flatten every slot of the active timetable and tag it with its room.
  const allSlots = useMemo(() => (
    Object.entries(timetable || {}).flatMap(([roomId, list]) =>
      (Array.isArray(list) ? list : [])
        .filter(slot => slot?.day)
        .map(slot => ({ ...slot, room: roomId })))
  ), [timetable]);

  // Teacher suggestions (live search pool)
  const teacherOptions = useMemo(() => {
    const names = new Set();
    for (const slot of allSlots) {
      const prof = String(slot.prof || slot.teacher || '').trim();
      if (prof) names.add(prof);
    }
    const all = [...names].sort((a, b) => a.localeCompare(b));
    const q = teacherSearch.trim().toLocaleLowerCase();
    return q ? all.filter(name => name.toLocaleLowerCase().includes(q)) : [];
  }, [allSlots, teacherSearch]);

  // Subjects present in the data (search pool)
  const allSubjects = useMemo(() => {
    const set = new Set();
    for (const slot of allSlots) {
      const subj = String(slot.subject || '').trim();
      if (subj) set.add(subj);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allSlots]);

  // Live suggestions while typing a subject (same behaviour as teacher search)
  const subjectOptions = useMemo(() => {
    const q = subjectSearch.trim().toLocaleLowerCase();
    return q ? allSubjects.filter(name => name.toLocaleLowerCase().includes(q)) : [];
  }, [allSubjects, subjectSearch]);

  // Departments that actually exist in the active timetable
  const deptOptions = useMemo(() => {
    const set = new Set();
    for (const slot of allSlots) {
      const d = String(slot.dept || slot._dept || slot.department || '').toLowerCase();
      if (d) set.add(d);
    }
    return [...set].sort();
  }, [allSlots]);

  const toggle = (list, setList, value) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
    setResults(null);
  };
  const pickOne = (current, setter, value) => {
    setter(current === value ? '' : value);
    setResults(null);
  };

  // Resolve the "Now" time filter → { day, lec } or null (no restriction).
  function nowFilter() {
    const d = now || new Date();
    const day = DAYS[d.getDay()];
    const minutes = d.getHours() * 60 + d.getMinutes();
    const lec = Object.entries(lectureSlots || {}).find(([, sl]) => {
      const [h1, m1] = String(sl?.start || '').split(':').map(Number);
      const [h2, m2] = String(sl?.end || '').split(':').map(Number);
      if ([h1, m1, h2, m2].some(Number.isNaN)) return false;
      return minutes >= h1 * 60 + m1 && minutes < h2 * 60 + m2;
    })?.[0];
    return { day, lec: lec != null ? Number(lec) : null };
  }

  // Run the search — only called from the Search button.
  function runSearch() {
    if (searchMode === 'free') {
      const day = freeDay;
      const parts = freeTime.split('|');
      const start = mode === 'exam' ? parts[0] : parts[1];
      const end = mode === 'exam' ? parts[1] : parts[2];
      if (!day || !start || !end) {
        setResults([]);
        return;
      }
      const available = getAvailableRoomsForTime({ timetable, day, start, end });
      setResults(available.map(({ room }) => ({ room, day, start, end })));
      setVisibleCount(available.length);
      return;
    }
    let timeDay = null;
    let timeLec = null;
    let customDays = [];
    let customLecs = [];
    if (timeMode === 'now') {
      const n = nowFilter();
      if (mode === 'exam') {
        const current = now || new Date();
        timeDay = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
      } else {
        timeDay = n.day;
      }
      timeLec = n.lec;
    } else if (timeMode === 'specify') {
      customDays = days;
      customLecs = lecs;
    }

    const q = selectedTeacher;
    const filtered = allSlots.filter(slot => {
      // Time filter
      if (timeMode === 'now') {
        if (slot.day !== timeDay) return false;
        if (timeLec != null && lecNumOf(slot) !== timeLec) return false;
      } else if (timeMode === 'specify') {
        if (customDays.length && !customDays.includes(slot.day)) return false;
        if (customLecs.length && !customLecs.includes(lecNumOf(slot))) return false;
      }
      // Entity filters
      if (q && String(slot.prof || slot.teacher || '').trim() !== q) return false;
      if (dept && String(slot.dept || slot._dept || slot.department || '').toLowerCase() !== dept) return false;
      if (sem && Number(slot.semester ?? slot.sem) !== Number(sem)) return false;
      if (room && slot.room !== room) return false;
      if (selectedSubject && String(slot.subject || '').trim() !== selectedSubject) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const dayDiff = mode === 'exam'
        ? String(a.day).localeCompare(String(b.day))
        : WEEKDAY_ORDER.indexOf(a.day) - WEEKDAY_ORDER.indexOf(b.day);
      if (dayDiff) return dayDiff;
      const lecDiff = (lecNumOf(a) ?? 99) - (lecNumOf(b) ?? 99);
      if (lecDiff) return lecDiff;
      const roomDiff = String(a.room).localeCompare(String(b.room));
      if (roomDiff) return roomDiff;
      return String(a.subject).localeCompare(String(b.subject));
    });
    setResults(filtered);
    setVisibleCount(10);
  }

  function reset() {
    setSearchMode('classes');
    setTimeMode(''); setDays([]); setLecs([]);
    setTeacherSearch(''); setSelectedTeacher('');
    setDept(''); setSem('');
    setBuilding(''); setRoom('');
    setFreeTime('');
    setFreeDay('');
    setSubjectSearch(''); setSelectedSubject('');
    setResults(null);
    setVisibleCount(10);
  }

  const hasFilter = searchMode === 'free' ? freeDay || freeTime : timeMode || days.length || lecs.length || selectedTeacher || dept || sem || room || selectedSubject;

  const roomsByBuilding = useMemo(() => {
    const groups = {};
    for (const roomId of Object.keys(timetable || {})) {
      const b = roomDepartment(roomId);
      (groups[b] ||= []).push(roomId);
    }
    for (const list of Object.values(groups)) list.sort((a, b) => a.localeCompare(b));
    return groups;
  }, [timetable]);

  // Lecture numbers available for Day/Lec# selection
  const lecOptions = useMemo(() => (
    Object.keys(lectureSlots || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  ), [lectureSlots]);
  const examDates = useMemo(() => (
    [...new Set(allSlots.map(slot => String(slot.day || '')).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort()
  ), [allSlots]);
  const examSemesters = useMemo(() => (
    [...new Set(allSlots
      .filter(slot => !dept || String(slot.dept || slot._dept || slot.department || '').toLowerCase() === dept)
      .map(slot => Number(slot.semester ?? slot.sem))
      .filter(value => Number.isInteger(value) && value > 0))].sort((a, b) => a - b)
  ), [allSlots, dept]);
  const freePeriods = useMemo(() => mode === 'exam'
    ? [...new Set(allSlots.map(slot => `${slot.start || ''}|${slot.end || ''}`).filter(value => value !== '|'))].sort()
    : [...new Set(allSlots.map(slot => `${lecNumOf(slot) || ''}|${slot.start || ''}|${slot.end || ''}`).filter(value => value.split('|').length === 3 && value.split('|').slice(1).every(Boolean)))].sort(), [allSlots, mode]);


  const chipStyle = (active) => [
    styles.chip,
    {
      backgroundColor: active ? (dark ? '#1A1A3E' : '#EDE9FF') : (dark ? '#0A0A1E' : '#F8FAFF'),
      borderColor: active ? C.purple : bdr,
    },
  ];
  const chipText = (active) => ({ color: active ? (dark ? '#C4B5FD' : C.purple) : ts, fontSize: 11, fontWeight: '700' });

  const FilterSection = ({ title, children }) => (
    <View style={[
      styles.suggestionField,
      !!teacherSearch && !selectedTeacher && styles.suggestionFieldActive,
    ]}>
      <Text style={[styles.filterLabel, { color: ts }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
        {children}
      </ScrollView>
    </View>
  );

  const semesterOptions = mode === 'exam'
    ? examSemesters.map(value => [String(value), `Sem ${value}`])
    : Array.from({ length: dept ? (DEPT_MAX_SEM[dept] || 8) : 8 }, (_, i) => [String(i + 1), `Sem ${i + 1}`]);

  return (
    <>
      {/* Trigger — same look as the "View Weekly Timetable" button */}
      <TouchableOpacity
        onPress={() => setShow(true)}
        style={[styles.ttBtn, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: dark ? '#3D2B8E' : '#C4B5FD' }]}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <Text style={[styles.ttBtnText, { color: ts }]}>Search Class</Text>
        <Text style={{ color: ts, marginLeft: 'auto' }}>›</Text>
      </TouchableOpacity>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShow(false)} />
        <ScrollView style={[styles.popup, { backgroundColor: cardBg, borderTopColor: bdr }]} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.handle, { backgroundColor: ts }]} />
          <Text style={[styles.title, { color: tp }]}>Search Class</Text>
          <Text style={[styles.subtitle, { color: ts }]}>
            {mode === 'exam' ? 'Searching the exam timetable · ' : 'Searching the active timetable · '}
            set your filters, then press Search.
          </Text>

          {/* ── Filters ─────────────────────────────────────────────────── */}
          <View style={[styles.filterCard, { borderColor: bdr }]}>

            {/* Time: Now / Specify time */}
            <Text style={[styles.filterLabel, { color: ts }]}>TIME</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {[[ 'classes', 'Search Timetable' ], [ 'free', 'Find Free Slot' ]].map(([value, label]) => (
                <TouchableOpacity key={value} style={chipStyle(searchMode === value)} onPress={() => { setSearchMode(value); setResults(null); }}>
                  <Text style={chipText(searchMode === value)}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {searchMode === 'free' ? <View style={{ marginBottom: 8 }}>
              {mode !== 'exam' && <View style={{ marginBottom: 8 }}>
                <Text style={[styles.filterLabel, { color: ts }]}>SPECIFIC DATE (OPTIONAL)</Text>
                <DateTimePicker value={freeDate} mode="date" onChange={(_, date) => {
                  if (!date) return;
                  setFreeDate(date);
                  setFreeDay(DAYS[date.getDay()]);
                  setResults(null);
                }} />
              </View>}
              <FilterSection title={mode === 'exam' ? 'DATE' : 'DAY / WEEKDAY'}>
                {(mode === 'exam' ? examDates : DAYS).map(day => (
                  <TouchableOpacity key={day} style={chipStyle(freeDay === day)} onPress={() => { setFreeDay(day); setResults(null); }}>
                    <Text style={chipText(freeDay === day)}>{day}</Text>
                  </TouchableOpacity>
                ))}
              </FilterSection>
              <FilterSection title="TIME PERIOD">
                {freePeriods.map(period => {
                  const parts = period.split('|');
                  const label = mode === 'exam' ? `${parts[0]}–${parts[1]}` : `Lec ${parts[0]} · ${parts[1]}–${parts[2]}`;
                  return <TouchableOpacity key={period} style={chipStyle(freeTime === period)} onPress={() => { setFreeTime(period); setResults(null); }}><Text style={chipText(freeTime === period)}>{label}</Text></TouchableOpacity>;
                })}
              </FilterSection>
            </View> : <>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {mode !== 'exam' && <TouchableOpacity
                style={chipStyle(timeMode === 'now')}
                onPress={() => pickOne(timeMode, setTimeMode, 'now')}>
                <Text style={chipText(timeMode === 'now')}>🕐 Now</Text>
              </TouchableOpacity>}
              <TouchableOpacity
                style={chipStyle(timeMode === 'specify')}
                onPress={() => pickOne(timeMode, setTimeMode, 'specify')}>
                <Text style={chipText(timeMode === 'specify')}>{mode === 'exam' ? 'Select dates / times' : '🕒 Specify time'}</Text>
              </TouchableOpacity>
            </View>
            {timeMode === 'now' && (
              <Text style={{ color: ts, fontSize: 11, marginBottom: 10 }}>
                Filters to today's current lecture slot.
              </Text>
            )}
            {timeMode === 'specify' && (
              <View style={{ marginBottom: 4 }}>
                <FilterSection title={mode === 'exam' ? 'DATE' : 'DAY'}>
                  {(mode === 'exam' ? examDates : DAYS).map(d => {
                    const active = days.includes(d);
                    return (
                      <TouchableOpacity key={d} style={chipStyle(active)} onPress={() => toggle(days, setDays, d)}>
                        <Text style={chipText(active)}>{mode === 'exam' ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </FilterSection>
                <FilterSection title={mode === 'exam' ? 'EXAM TIME' : 'LECTURE #'}>
                  {lecOptions.map(n => {
                    const active = lecs.includes(n);
                    const timeLabel = lectureSlots?.[String(n)];
                    return (
                      <TouchableOpacity key={n} style={chipStyle(active)} onPress={() => toggle(lecs, setLecs, n)}>
                        <Text style={chipText(active)}>{mode === 'exam' && timeLabel ? `${timeLabel.start}–${timeLabel.end}` : `Lec ${n}`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {!lecOptions.length && <Text style={{ color: ts, fontSize: 11 }}>No lecture numbers in this timetable.</Text>}
                </FilterSection>
              </View>
            )}


            {/* Department — only departments present in the active timetable */}
            <FilterSection title="DEPARTMENT">
              {[['', 'All'], ...deptOptions.map(d => [d, DEPT_MAP[d] || d.toUpperCase()])].map(([key, label]) => {
                const active = dept === key;
                return (
                  <TouchableOpacity key={key || 'all'} style={chipStyle(active)}
                    onPress={() => { pickOne(dept, setDept, key); setSem(''); }}>
                    <Text style={chipText(active)}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </FilterSection>

            {/* Semester — independent */}
            <FilterSection title="SEMESTER">
              {[['', 'All'], ...semesterOptions].map(([key, label]) => {
                const active = sem === key;
                return (
                  <TouchableOpacity key={key || 'all'} style={chipStyle(active)}
                    onPress={() => pickOne(sem, setSem, key)}>
                    <Text style={chipText(active)}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </FilterSection>

            {/* Teacher — search bar with live suggestions (overlay dropdown) */}
            <View style={[
              styles.suggestionField,
              !!teacherSearch && !selectedTeacher && styles.suggestionFieldActive,
            ]}>
              <Text style={[styles.filterLabel, { color: ts }]}>TEACHER</Text>
              <View style={styles.dropdownWrap}>
                <TextInput
                  value={teacherSearch}
                  onChangeText={value => { setTeacherSearch(value); if (selectedTeacher && value !== selectedTeacher) setSelectedTeacher(''); setResults(null); }}
                  placeholder="Search teacher name"
                  placeholderTextColor={ts}
                  style={[styles.searchInput, { color: tp, borderColor: bdr, backgroundColor: dark ? '#0A0A1E' : '#F8FAFF' }]}
                />
                {!!teacherSearch && !selectedTeacher && (
                  <View style={[styles.suggestBox, { borderColor: bdr, backgroundColor: dark ? '#16163F' : '#FFFFFF' }]}>
                    {/* RN: maxHeight only clips inside a ScrollView — plain Views overflow. */}
                    <ScrollView style={{ maxHeight: 140 }} keyboardShouldPersistTaps="handled">
                      {teacherOptions.slice(0, 20).map(name => (
                        <TouchableOpacity key={name}
                          onPress={() => { setSelectedTeacher(name); setTeacherSearch(name); setResults(null); }}
                          style={{ paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: bdr }}>
                          <Text style={{ color: tp, fontSize: 11 }}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                      {!teacherOptions.length && (
                        <Text style={{ color: ts, fontSize: 10, paddingVertical: 6 }}>No matching teacher names</Text>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
              {!!selectedTeacher && (
                <TouchableOpacity onPress={() => { setSelectedTeacher(''); setTeacherSearch(''); setResults(null); }}>
                  <Text style={{ color: dark ? '#C4B5FD' : C.purple, fontSize: 10, marginTop: 5 }}>Clear teacher filter · {selectedTeacher}</Text>
                </TouchableOpacity>
              )}
            </View>


            {/* Room — pick a building first, then its rooms */}
            <Text style={[styles.filterLabel, { color: ts }]}>ROOM</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {Object.keys(DEPT_FLOOR_ROOMS).map(b => {
                const active = building === b;
                return (
                  <TouchableOpacity key={b} style={chipStyle(active)}
                    onPress={() => { pickOne(building, setBuilding, b); setRoom(''); }}>
                    <Text style={chipText(active)}>{b.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!!building && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8, marginBottom: 12 }}>
                {(roomsByBuilding[building] || []).map(name => {
                  const active = room === name;
                  return (
                    <TouchableOpacity key={name} style={chipStyle(active)} onPress={() => pickOne(room, setRoom, name)}>
                      <Text style={chipText(active)}>{name}</Text>
                    </TouchableOpacity>
                  );
                })}
                {!(roomsByBuilding[building] || []).length && (
                  <Text style={{ color: ts, fontSize: 11 }}>No {building.toUpperCase()} rooms in this timetable.</Text>
                )}
              </ScrollView>
            )}

            {/* Subject — search bar with live suggestions (overlay dropdown) */}
            <View style={[
              styles.suggestionField,
              !!subjectSearch && !selectedSubject && styles.suggestionFieldActive,
            ]}>
              <Text style={[styles.filterLabel, { color: ts }]}>SUBJECT</Text>
              <View style={styles.dropdownWrap}>
                <TextInput
                  value={subjectSearch}
                  onChangeText={value => { setSubjectSearch(value); if (selectedSubject && value !== selectedSubject) setSelectedSubject(''); setResults(null); }}
                  placeholder="Search subject name"
                  placeholderTextColor={ts}
                  style={[styles.searchInput, { color: tp, borderColor: bdr, backgroundColor: dark ? '#0A0A1E' : '#F8FAFF' }]}
                />
                {!!subjectSearch && !selectedSubject && (
                  <View style={[styles.suggestBox, { borderColor: bdr, backgroundColor: dark ? '#16163F' : '#FFFFFF' }]}>
                    {/* RN: maxHeight only clips inside a ScrollView — plain Views overflow. */}
                    <ScrollView style={{ maxHeight: 140 }} keyboardShouldPersistTaps="handled">
                      {subjectOptions.slice(0, 20).map(name => (
                        <TouchableOpacity key={name}
                          onPress={() => { setSelectedSubject(name); setSubjectSearch(name); setResults(null); }}
                          style={{ paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: bdr }}>
                          <Text style={{ color: tp, fontSize: 11 }}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                      {!subjectOptions.length && (
                        <Text style={{ color: ts, fontSize: 10, paddingVertical: 6 }}>No matching subjects</Text>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
              {!!selectedSubject && (
                <TouchableOpacity onPress={() => { setSelectedSubject(''); setSubjectSearch(''); setResults(null); }}>
                  <Text style={{ color: dark ? '#C4B5FD' : C.purple, fontSize: 10, marginTop: 5 }}>Clear subject filter · {selectedSubject}</Text>
                </TouchableOpacity>
              )}
            </View>

            </>}
            {/* Actions */}
            <TouchableOpacity onPress={runSearch} style={[styles.searchBtn, { backgroundColor: C.purple }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>🔍 Search</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={reset} disabled={!hasFilter}
              style={[styles.resetBtn, { borderColor: hasFilter ? C.purple : bdr, opacity: hasFilter ? 1 : 0.5 }]}>
              <Text style={{ color: hasFilter ? (dark ? '#C4B5FD' : C.purple) : ts, fontSize: 12, fontWeight: '700' }}>Reset filters</Text>
            </TouchableOpacity>
          </View>


          {/* ── Results (only after Search) ─────────────────────────────── */}
          {results === null ? (
            <View style={styles.placeholderBox}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🔎</Text>
              <Text style={{ color: ts, fontSize: 13, textAlign: 'center' }}>
                Choose filters and press Search to load matching classes.
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.resultsLabel, { color: ts }]}>
                {results.length} {searchMode === 'free' ? (results.length === 1 ? 'room' : 'rooms') : (results.length === 1 ? 'class' : 'classes')} found
                {searchMode === 'free' ? ' (selected time)' : hasFilter ? ' (filtered)' : ' (all classes)'}
              </Text>

              {searchMode === 'free' && results.map(({ room, day, start, end }) => (
                <View key={room} style={[styles.ttRow, { backgroundColor: cardBg, borderColor: bdr, borderLeftColor: '#16A34A' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tp, fontSize: 12, fontWeight: '800' }}>{room}</Text>
                    <Text style={{ color: ts, fontSize: 10, marginTop: 3 }}>{day} · {start}–{end} · Free</Text>
                  </View>
                </View>
              ))}

              {searchMode === 'classes' && results.length === 0 && (
                <Text style={{ color: ts, fontSize: 14, marginTop: 8 }}>No classes match these filters. Try removing one.</Text>
              )}
              {searchMode === 'free' && results.length === 0 && (
                <Text style={{ color: ts, fontSize: 14, marginTop: 8 }}>No rooms are free for that time, or choose a day and time period first.</Text>
              )}

              {searchMode === 'classes' && <>
              {results.length === 0 && (
                <Text style={{ color: ts, fontSize: 14, marginTop: 8 }}>
                  No classes match these filters. Try removing one.
                </Text>
              )}

              {/* Group regular slots by weekday and exams by date. */}
              {(() => {
                const visible = results.slice(0, visibleCount);
                const grouped = [];
                let current = null;
                for (const slot of visible) {
                  if (!current || current.day !== slot.day) {
                    current = { day: slot.day, slots: [] };
                    grouped.push(current);
                  }
                  current.slots.push(slot);
                }
                return grouped.map(({ day, slots }) => (
                  <View key={day}>
                    <Text style={[styles.dayHeader, { color: tp }]}>
                      {mode === 'exam' ? new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : day}
                    </Text>
                    {slots.map((slot, i) => {
                      const lec = lecNumOf(slot);
                      const accent = C.purple;
                      const badgeColor = C.purple;
                      return (
                        <View key={`${slot.room}-${day}-${lec}-${i}`} style={[styles.ttRow, { backgroundColor: cardBg, borderColor: bdr, borderLeftColor: accent }]}>
                          <View style={[styles.ttLecBadge, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: accent }]}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: badgeColor }}>{mode === 'exam' ? slot.courseCode || 'Exam' : lec != null ? `L${lec}` : '—'}</Text>
                            <Text style={{ fontSize: 7, color: badgeColor, opacity: 0.8 }}>{slot.start || ''}{slot.start && slot.end ? '–' : ''}{slot.end || ''}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: tp }}>{slot.subject}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: ts, marginTop: 2 }}>
                              {classLabelOf(slot)}
                            </Text>
                            {mode === 'exam' && (
                              <Text style={{ fontSize: 9, color: ts, marginTop: 2 }}>
                                Strength: {slot.strength ?? '—'} · Invigilators: {slot.invigilators || '—'}
                              </Text>
                            )}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                              <Text style={{ fontSize: 10, color: ts }}>{slot.prof || slot.teacher}</Text>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: C.purple }}>{slot.room}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ));
              })()}

              {results.length > visibleCount && (
                <TouchableOpacity
                  onPress={() => setVisibleCount(count => count + 10)}
                  style={[styles.moreBtn, { borderColor: bdr, backgroundColor: dark ? '#1A1A3E' : '#EDE9FF' }]}>
                  <Text style={{ color: dark ? '#C4B5FD' : C.purple, fontSize: 12, fontWeight: '800' }}>
                    ▼ More ({results.length - visibleCount} remaining)
                  </Text>
                </TouchableOpacity>
              )}
              </>}
            </>
          )}

          <TouchableOpacity onPress={() => setShow(false)} style={[styles.closeBtn, { backgroundColor: C.purple }]}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Close</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}


const styles = StyleSheet.create({
  /* Trigger button — mirrors HomeScreen's ttBtn */
  ttBtn: { marginHorizontal: 14, marginBottom: 12, padding: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ttBtnText: { fontSize: 12, fontWeight: '700' },

  /* Bottom sheet — mirrors RoomPopup */
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,15,74,0.5)' },
  popup: { position: 'absolute', bottom: 0, left: 0, right: 0, top: 60, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18, opacity: 0.4 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 5, marginBottom: 16 },

  /* Filters */
  filterCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 16 },
  filterLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 7 },
  chip: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  searchInput: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, fontSize: 11 },
  suggestionField: { marginBottom: 12, position: 'relative' },
  suggestionFieldActive: { zIndex: 40, elevation: 40 },
  /* Overlay dropdown — floats above the sections below instead of pushing them */
  dropdownWrap: { position: 'relative', zIndex: 20, elevation: 20 },
  suggestBox: {
    position: 'absolute', top: 40, left: 0, right: 0, zIndex: 30,
    borderWidth: 1, borderRadius: 9, paddingHorizontal: 10,
    maxHeight: 150,
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)', elevation: 8,
  },
  searchBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  resetBtn: { borderWidth: 1.5, borderRadius: 14, paddingVertical: 9, alignItems: 'center', marginTop: 8 },

  /* Results — same row layout as the Weekly Timetable modal */
  placeholderBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  resultsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  dayHeader: { fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 8 },
  ttRow: { flexDirection: 'row', gap: 10, marginBottom: 7, borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, padding: 8 },
  ttLecBadge: { width: 36, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', padding: 4 },
  moreBtn: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 6, marginBottom: 4 },

  closeBtn: { marginTop: 16, padding: 13, borderRadius: 14, alignItems: 'center' },
});
