import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { DEPT_MAX_SEM, NOTIF_TYPES, can } from '../constants/config';
import { dateToDayName } from '../utils/helpers';
import NotifCard from '../components/class/NotifCard';
import PostModal from '../components/class/PostModal';
import useNotifs from '../hooks/useNotifs';

const FILTERS = [
  { key: 'all',        label: 'All' },
  { key: 'arrange',    label: 'Arrange' },
  { key: 'room_reservation', label: 'Reserved' },
  { key: 'cancel',     label: 'Cancel' },
  { key: 'assignment', label: 'Tasks' },
  { key: 'quiz',       label: 'Quiz' },
  { key: 'other',      label: 'Other' },
];

export default function ClassScreen({ user, dark, lectureSlots, subjectsMap, timetables, isGuest, schedule }) {
  const {
    notifs, loadNotifs, postNotif, editNotif, deleteNotif, togglePin,
    teacherOptions, loadTeacherOptions, loadTeacherNotifs, loadAllReservations, roomReservations, setNotifs,
    arrangedClasses, cancelledSlots,
  } = useNotifs(lectureSlots);

  const [typeFilter,    setTypeFilter]    = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [staffView, setStaffView] = useState(null);
  const [staffSemester, setStaffSemester] = useState(null);
  const [staffTeacher, setStaffTeacher] = useState(null);
  const [showPost,      setShowPost]      = useState(false);
  const [editItem,      setEditItem]      = useState(null);

  const dept     = user?.dept || 'cs';
  const semester = user?.semester || 7;

  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');

  const isStaff = user?.type === 'staff';
  // During Exam mode the reflected timetable is the exam schedule, so adding
  // notifications (including Cancel Class) is locked until Regular returns.
  const examModeActive = (schedule?.mode || 'regular') === 'exam';

  function notifyExamLocked() {
    Alert.alert(
      'Unavailable during Exam mode',
      'Adding notifications and Cancel Class cannot be posted while Exam mode is active.',
    );
  }

  function startNewPost() {
    if (examModeActive) {
      notifyExamLocked();
      return;
    }
    setEditItem(null);
    setShowPost(true);
  }

  useEffect(() => {
    if (isGuest) return;
    loadAllReservations(dept);
    if (!isStaff) loadNotifs(dept, semester);
  }, [dept, semester, isGuest, isStaff]);

  useEffect(() => {
    if (!isStaff) return;
    setStaffView(null);
    setStaffSemester(null);
    setStaffTeacher(null);
    setNotifs([]);
    loadTeacherOptions(dept);
    loadAllReservations(dept);
  }, [dept, isStaff]);

  const filtered = isGuest ? [] : notifs
    .filter(n => typeFilter    === 'all' || n.type    === typeFilter)
    .filter(n => subjectFilter === 'all' || toSubjectName(n.subject) === subjectFilter);

  const subjectOptions = ['all', ...new Set(notifs.map(n => toSubjectName(n.subject)).filter(s => s && s !== 'General'))];

  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bg  = dark ? '#0A0A1E' : '#F5F4FF';

  async function handleSubmit(notif) {
    if (!editItem && examModeActive) {
      notifyExamLocked();
      return;
    }
    const targetDept = notif?.dept || dept;
    const targetSem = notif?.semester || semester;
    if (editItem) {
      await editNotif(notif, targetDept, targetSem);
    } else {
      await postNotif(notif, targetDept, targetSem);
    }
    setEditItem(null);
  }

  async function handleDelete(id, type, item) {
    await deleteNotif(id, type, item?.dept || dept, item?.semester || staffSemester || semester);
  }

  const canPost = !isGuest && (can.postClassNotif(user) || can.postRoomReservation(user));

  function getAvailableRooms({ dept: targetDept, semester: targetSemester, date, lectureNum }) {
    if (!targetDept || !targetSemester || !date || !lectureNum) return [];
    const selectedSlot = lectureSlots?.[lectureNum];
    if (!selectedSlot) return [];
    const selectedDay = dateToDayName(date);
    const roomMap = timetables?.[Number(targetSemester)] || {};
    const roomNames = new Set(['LT1', 'LT2', 'LT3', 'LT4', 'LT5', 'LT6', 'LT8', 'LT9']);
    Object.keys(roomMap).forEach(room => roomNames.add(room));

    const normaliseDay = value => String(value || '').slice(0, 3).toLowerCase();
    const toMinutes = value => {
      const [hours, minutes] = String(value || '').split(':').map(Number);
      return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
    };
    const overlapsTimetable = slots => (slots || []).some(slot => {
      if (normaliseDay(slot.day) !== normaliseDay(selectedDay)) return false;
      const time = String(slot.time || '');
      const start = toMinutes(slot.start || time.split('-')[0]);
      const end = toMinutes(slot.end || time.split('-')[1]);
      const selectedStart = toMinutes(selectedSlot.start);
      const selectedEnd = toMinutes(selectedSlot.end);
      return start !== null && end !== null && start < selectedEnd && end > selectedStart;
    });

    return Array.from(roomNames)
      .filter(room => !overlapsTimetable(roomMap[room]))
      .filter(room => !roomReservations.some(notif =>
        (notif.type === 'arrange' || notif.type === 'room_reservation') &&
        notif.id !== editItem?.id && notif.room === room && notif.date === date && Number(notif.lectureNum) === Number(lectureNum)
      ))
      .sort((a, b) => a.localeCompare(b))
      .map(room => ({ room }));
  }

  function selectStaffView(view) {
    setStaffView(view);
    setStaffSemester(null);
    setStaffTeacher(null);
    setTypeFilter('all');
    setSubjectFilter('all');
    setNotifs([]);
    if (view === 'teacher') loadTeacherOptions(dept);
  }

  function selectStaffSemester(value) {
    setStaffSemester(value);
    loadNotifs(dept, value);
  }

  function selectStaffTeacher(value) {
    setStaffTeacher(value);
    loadTeacherNotifs(dept, value);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}> 
      {/* Header */}
      <View style={[styles.header, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>
              BS {dept.toUpperCase()} · {isStaff && !staffSemester && !staffTeacher ? 'Choose view' : `Sem ${staffSemester || semester}`}
            </Text>
            <Text style={styles.headerTitle}>Class Board</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{isStaff && !staffSemester && !staffTeacher ? '-' : notifs.length}</Text>
            </View>
            {canPost && (
              <TouchableOpacity
                onPress={startNewPost}
                style={styles.addBtn}>
                <Text style={{ color: '#fff', fontSize: 20, lineHeight: 22 }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isStaff && (
          <View style={styles.staffPicker}>
            <Text style={styles.staffPickerLabel}>View notifications by</Text>
            <View style={styles.staffModeRow}>
              {[
                { key: 'class', label: 'Class / Semester' },
                { key: 'teacher', label: 'Teacher' },
              ].map(option => (
                <TouchableOpacity key={option.key} onPress={() => selectStaffView(option.key)}
                  style={[styles.staffModeChip, staffView === option.key && styles.staffModeChipActive]}>
                  <Text style={[styles.staffModeText, staffView === option.key && styles.staffModeTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {staffView === 'class' && (
              <FlatList
                data={Array.from({ length: DEPT_MAX_SEM[dept] || 8 }, (_, index) => index + 1)}
                horizontal showsHorizontalScrollIndicator={false}
                keyExtractor={value => String(value)}
                renderItem={({ item: value }) => (
                  <TouchableOpacity onPress={() => selectStaffSemester(value)}
                    style={[styles.staffOptionChip, staffSemester === value && styles.staffOptionChipActive]}>
                    <Text style={[styles.staffOptionText, staffSemester === value && styles.staffOptionTextActive]}>Sem {value}</Text>
                  </TouchableOpacity>
                )}
              />
            )}

            {staffView === 'teacher' && (
              <FlatList
                data={teacherOptions}
                horizontal showsHorizontalScrollIndicator={false}
                keyExtractor={value => value}
                ListEmptyComponent={<Text style={styles.staffHint}>No teachers found</Text>}
                renderItem={({ item: value }) => (
                  <TouchableOpacity onPress={() => selectStaffTeacher(value)}
                    style={[styles.staffOptionChip, staffTeacher === value && styles.staffOptionChipActive]}>
                    <Text style={[styles.staffOptionText, staffTeacher === value && styles.staffOptionTextActive]}>{value}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* Type filter */}
        <FlatList
          data={isStaff && !staffSemester && !staffTeacher ? [] : FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={f => f.key}
          style={{ marginBottom: 8 }}
          renderItem={({ item: f }) => {
            const active = typeFilter === f.key;
            const nt = f.key !== 'all' ? NOTIF_TYPES[f.key] : null;
            return (
              <TouchableOpacity onPress={() => setTypeFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && { color: nt ? nt.l.tx : C.purple }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Subject filter */}
        <FlatList
          data={isStaff && !staffSemester && !staffTeacher ? [] : subjectOptions}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={s => s}
          style={{ marginBottom: 12 }}
          renderItem={({ item: s }) => {
            const active = subjectFilter === s;
            return (
              <TouchableOpacity onPress={() => setSubjectFilter(s)}
                style={[styles.subjectChip, active && styles.subjectChipActive]}>
                <Text style={[styles.subjectChipText, active && { color: C.purple }]}>
                  {s === 'all' ? 'All Subjects' : s}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Feed */}
      <FlatList
        data={filtered}
        keyExtractor={n => String(n.id)}
        contentContainerStyle={styles.feed}
        ListHeaderComponent={
          <>
            {examModeActive && (
              <View style={[styles.examNotice, { backgroundColor: dark ? '#2A1113' : '#FEE2E2', borderColor: dark ? '#F87171' : '#FCA5A5' }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: dark ? '#FCA5A5' : '#B91C1C' }}>
                  Exam mode is active — adding notifications and Cancel Class are unavailable right now.
                </Text>
              </View>
            )}
            {canPost ? (
              <TouchableOpacity
                onPress={startNewPost}
                style={[styles.postPrompt, { backgroundColor: dark ? '#12123A' : '#FFFFFF', borderColor: dark ? '#2A1C6B' : '#E2E0F5' }]}>
                <View style={styles.postPromptIcon}>
                  <Text style={{ color: '#fff', fontSize: 16 }}>+</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: ts }}>Post a notification...</Text>
              </TouchableOpacity>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
            <Text style={{ fontSize: 13, color: ts }}>
              {isStaff && !staffSemester && !staffTeacher ? 'Choose a class, semester, or teacher' : 'No notifications here'}
            </Text>
          </View>
        }
        renderItem={({ item: n }) => (
          <NotifCard
            notif={n} dark={dark} user={user}
            lectureSlots={lectureSlots}
            onPin={togglePin}
            onEdit={item => { setEditItem(item); setShowPost(true); }}
            onDelete={handleDelete}
          />
        )}
      />

      {/* Post Modal */}
      <PostModal
        visible={showPost}
        dark={dark}
        editNotif={editItem}
        lectureSlots={lectureSlots}
        subjectsMap={subjectsMap}
        user={user}
        getAvailableRooms={getAvailableRooms}
        onClose={() => { setShowPost(false); setEditItem(null); }}
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { padding: 16, paddingBottom: 0 },
  headerTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countBadge:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  addBtn:      { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  filterChip:  { marginRight: 5, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  filterChipActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  filterChipText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
  subjectChip: { marginRight: 5, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)' },
  subjectChipActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
  subjectChipText:   { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  feed:        { padding: 14, paddingBottom: 32 },
  postPrompt:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 12 },
  examNotice:  { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  postPromptIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  empty:       { alignItems: 'center', paddingVertical: 40 },
  staffPicker: { paddingBottom: 10 },
  staffPickerLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', marginBottom: 7 },
  staffModeRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  staffModeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)' },
  staffModeChipActive: { backgroundColor: '#fff' },
  staffModeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  staffModeTextActive: { color: C.purple },
  staffOptionChip: { marginRight: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  staffOptionChipActive: { backgroundColor: '#fff' },
  staffOptionText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  staffOptionTextActive: { color: C.purple },
  staffHint: { color: 'rgba(255,255,255,0.7)', fontSize: 11, paddingVertical: 5 },
});
