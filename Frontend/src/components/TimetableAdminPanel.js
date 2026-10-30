import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '../constants/colors';
import { TIMETABLE_COLLECTION } from '../hooks/useTimetable';
import { parseTimetableField, saveTimetableEntries } from '../utils/timetableAdmin';
import TimetableEntryEditor from './TimetableEntryEditor';

export default function TimetableAdminPanel({ dark, documents = [], manifest, user, mode = 'regular', onSaved }) {
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editDept, setEditDept] = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editLecture, setEditLecture] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const bg = dark ? '#12123A' : '#FFFFFF';
  const fieldBg = dark ? '#0A0A1E' : '#F8F7FF';
  const text = dark ? '#EDE9FF' : '#1A0F4A';
  const muted = dark ? '#9B7EF8' : '#6C47D4';
  const border = dark ? '#2A1C6B' : '#E2E0F5';
  // Exam documents share the regular `…_sem{n}` id shape with an `exam_` prefix.
  const docBaseId = doc => String(doc?._docId || '').replace(/^exam_/, '');

  const pendingRows = useMemo(() => documents.flatMap(document => {
    const pending = parseTimetableField(document.pendingEditCells, []);
    return (Array.isArray(pending) ? pending : []).map(cell => ({ document, cell }));
  }), [documents]);
  const latestDocument = [...documents].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  const groups = [...new Set(documents.map(doc => `${String(doc.dept || '').toUpperCase()} · Sem ${doc.semester || '?'}`))].sort();
  const dateLabel = latestDocument?.updatedAt || manifest?.updatedAt || '';
  const departmentOptions = [...new Set(documents.map(doc => String(doc.dept || docBaseId(doc).split('_sem')[0] || '').toLowerCase()).filter(Boolean))].sort();
  const editDocuments = documents.filter(doc => String(doc.dept || docBaseId(doc).split('_sem')[0] || '').toLowerCase() === editDept && Number(doc.semester || docBaseId(doc).match(/_sem(\d+)/)?.[1]) === Number(editSemester));
  const roomMapFor = doc => parseTimetableField(doc?.roomMap, {});
  const scopedSlots = editDocuments.flatMap(document => Object.entries(roomMapFor(document)).flatMap(([room, slots]) => (Array.isArray(slots) ? slots : []).map(slot => ({ document, room, slot }))));
  const dayOptions = [...new Set(scopedSlots.map(item => item.slot.day).filter(Boolean))].sort((a, b) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(a) - ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(b));
  const lectureOptions = [...new Set(scopedSlots.filter(item => !editDay || item.slot.day === editDay).map(item => Number(item.slot.lectureNum ?? item.slot.n)).filter(Number.isFinite))].sort((a,b) => a-b);
  const roomOptions = [...new Set(scopedSlots.filter(item => (!editDay || item.slot.day === editDay) && (!editLecture || Number(item.slot.lectureNum ?? item.slot.n) === Number(editLecture))).map(item => item.room))].sort();
  const matchingClasses = editRoom && editDay && editLecture ? scopedSlots.filter(item => item.room === editRoom && item.slot.day === editDay && Number(item.slot.lectureNum ?? item.slot.n) === Number(editLecture)) : [];

  async function save(entries) {
    if (!selected) return;
    await saveTimetableEntries({
      collection: TIMETABLE_COLLECTION,
      document: selected.document,
      pendingCell: selected.cell,
      entries,
      editor: user?.email || user?.fullName || 'staff',
    });
    setSelected(null);
    onSaved?.();
  }

  async function saveClass(entries) {
    if (!selectedClass) return;
    await saveTimetableEntries({
      collection: TIMETABLE_COLLECTION,
      document: selectedClass.document,
      oldSlot: selectedClass.slot,
      oldRoom: selectedClass.room,
      entries,
      editor: user?.email || user?.fullName || 'staff',
    });
    setSelectedClass(null);
    onSaved?.();
  }

  const resetEditFilters = () => { setEditDept(''); setEditSemester(''); setEditDay(''); setEditLecture(''); setEditRoom(''); };
  const choice = (label, value, current, onPick) => <TouchableOpacity key={`${label}-${value}`} onPress={onPick} style={[styles.choice, { backgroundColor: current === value ? '#EDE9FF' : fieldBg, borderColor: current === value ? C.purple : border }]}><Text style={{ color: current === value ? C.purple : text, fontSize: 10, fontWeight: '700' }}>{label}</Text></TouchableOpacity>;

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: border }]}>
      <TouchableOpacity onPress={() => setExpanded(value => !value)} style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: text, fontSize: 13, fontWeight: '800' }}>{mode === 'exam' ? 'Active exam timetable details' : 'Active timetable details'}</Text>
          <Text style={{ color: muted, fontSize: 10, marginTop: 3 }}>{TIMETABLE_COLLECTION}{mode === 'exam' ? ' · exam' : ''}</Text>
        </View>
        <Text style={{ color: muted, fontSize: 18 }}>{expanded ? '−' : '+'}</Text>
      </TouchableOpacity>
      {expanded && <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <View style={[styles.detailBox, { backgroundColor: fieldBg, borderColor: border }]}>
          <Text style={{ color: muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>CURRENT ACTIVE SET</Text>
          <View style={styles.metrics}>
            {[['Documents', documents.length], ['Pending edits', pendingRows.length], ['Classes', groups.length]].map(([label, value]) => <View key={label} style={[styles.metric, { backgroundColor: bg, borderColor: border }]}><Text style={{ color: text, fontSize: 16, fontWeight: '800' }}>{value}</Text><Text style={{ color: muted, fontSize: 9, marginTop: 2 }}>{label}</Text></View>)}
          </View>
          {!!groups.length && <View style={styles.groupSection}>
            <Text style={{ color: muted, fontSize: 9, fontWeight: '800', marginBottom: 5 }}>ACTIVE DEPARTMENTS & SEMESTERS</Text>
            <View style={[styles.groupWrap, !showAllGroups && groups.length > 4 && styles.groupWrapCollapsed]}>{groups.map(group => <View key={group} style={[styles.groupChip, { backgroundColor: bg, borderColor: border }]}><Text style={{ color: text, fontSize: 10, fontWeight: '700' }}>{group}</Text></View>)}</View>
            {groups.length > 4 && <TouchableOpacity onPress={() => setShowAllGroups(value => !value)} style={styles.moreGroups}>
              <Text style={styles.moreGroupsText}>{showAllGroups ? 'Show less' : 'More…'}</Text>
            </TouchableOpacity>}
          </View>}
          <View style={styles.metaGrid}>
            {latestDocument?.version ? <Text style={{ color: muted, fontSize: 10 }}>Version  ·  {latestDocument.version}</Text> : null}
            {latestDocument?.effectiveDate ? <Text style={{ color: muted, fontSize: 10 }}>Effective  ·  {latestDocument.effectiveDate}</Text> : null}
            {latestDocument?.uploadedBy ? <Text style={{ color: muted, fontSize: 10 }}>Uploaded by  ·  {latestDocument.uploadedBy}</Text> : null}
            {dateLabel ? <Text style={{ color: muted, fontSize: 10 }}>Updated  ·  {dateLabel}</Text> : null}
            {manifest?.sourceHash ? <Text style={{ color: muted, fontSize: 10 }}>PDF fingerprint  ·  {String(manifest.sourceHash).slice(0, 12)}…</Text> : null}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={{ color: text, fontSize: 12, fontWeight: '800' }}>Edit a timetable class</Text>
            <Text style={{ color: muted, fontSize: 9, marginTop: 2 }}>Find and update a specific class</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditMode(value => !value); resetEditFilters(); }} activeOpacity={0.8}
            style={[styles.editButton, { backgroundColor: editMode ? fieldBg : C.purple, borderColor: editMode ? border : C.purple }]}>
            <Text style={{ color: editMode ? muted : '#FFFFFF', fontSize: 11, fontWeight: '800' }}>{editMode ? 'Close' : '✎  Edit timetable'}</Text>
          </TouchableOpacity>
        </View>
        {editMode && <View style={[styles.detailBox, { backgroundColor: fieldBg, borderColor: border }]}>
          <Text style={{ color: muted, fontSize: 10, marginBottom: 5 }}>Choose the class filters. Matching classes appear only after Room is selected.</Text>
          <Text style={[styles.filterLabel, { color: text }]}>Department</Text><View style={styles.choiceWrap}>{departmentOptions.map(dept => choice(dept.toUpperCase(), dept, editDept, () => { setEditDept(dept); setEditSemester(''); setEditDay(''); setEditLecture(''); setEditRoom(''); }))}</View>
          {!!editDept && <><Text style={[styles.filterLabel, { color: text }]}>Semester</Text><View style={styles.choiceWrap}>{[...new Set(documents.filter(d => String(d.dept || docBaseId(d).split('_sem')[0] || '').toLowerCase() === editDept).map(d => Number(d.semester || docBaseId(d).match(/_sem(\d+)/)?.[1])).filter(Boolean))].sort((a,b)=>a-b).map(sem => choice(`Sem ${sem}`, String(sem), editSemester, () => { setEditSemester(String(sem)); setEditDay(''); setEditLecture(''); setEditRoom(''); }))}</View></>}
          {!!editSemester && <><Text style={[styles.filterLabel, { color: text }]}>Weekday</Text><View style={styles.choiceWrap}>{dayOptions.map(day => choice(day, day, editDay, () => { setEditDay(day); setEditLecture(''); setEditRoom(''); }))}</View></>}
          {!!editDay && <><Text style={[styles.filterLabel, { color: text }]}>Lecture number</Text><View style={styles.choiceWrap}>{lectureOptions.map(lecture => choice(`L${lecture}`, String(lecture), editLecture, () => { setEditLecture(String(lecture)); setEditRoom(''); }))}</View></>}
          {!!editLecture && <><Text style={[styles.filterLabel, { color: text }]}>Room</Text><View style={styles.choiceWrap}>{roomOptions.map(room => choice(room, room, editRoom, () => setEditRoom(room)))}</View></>}
          {!!editRoom && <ScrollView style={{ maxHeight: 230, marginTop: 8 }} nestedScrollEnabled>{matchingClasses.map(({ document, room, slot }, index) => <TouchableOpacity key={`${document._docId}-${slot.subject}-${index}`} onPress={() => setSelectedClass({ document, room, slot })} style={[styles.pendingItem, { backgroundColor: bg, borderColor: border }]}><Text style={{ color: text, fontSize: 11, fontWeight: '800' }}>{slot.subject || 'Untitled class'}</Text><Text style={{ color: muted, fontSize: 10, marginTop: 3 }}>{slot.prof || slot.teacher || 'Teacher not set'} · {room} · L{slot.lectureNum ?? slot.n}</Text><Text style={{ color: C.purple, fontSize: 10, fontWeight: '800', marginTop: 4 }}>Tap to edit</Text></TouchableOpacity>)}{!matchingClasses.length && <Text style={{ color: muted, fontSize: 11 }}>No class matches these filters.</Text>}</ScrollView>}
        </View>}

        <Text style={{ color: text, fontSize: 12, fontWeight: '800', marginTop: 12, marginBottom: 6 }}>Pending Edit cells ({pendingRows.length})</Text>
        {!pendingRows.length ? <Text style={{ color: muted, fontSize: 11 }}>No cells are waiting for staff edits.</Text> : (
          <ScrollView style={{ maxHeight: 270 }} nestedScrollEnabled>
            {pendingRows.map(({ document, cell }, index) => (
              <TouchableOpacity key={`${document._docId}-${cell.cell_id}-${index}`} onPress={() => setSelected({ document, cell })} style={[styles.pendingItem, { backgroundColor: fieldBg, borderColor: border }]}>
                <Text style={{ color: text, fontSize: 11, fontWeight: '800' }}>{String(document.dept || '').toUpperCase()} · Sem {document.semester} · {cell.day} · L{cell.lecture_num}</Text>
                <Text numberOfLines={2} style={{ color: muted, fontSize: 10, marginTop: 4 }}>{cell.source_text || cell.reason || 'Cell needs manual entry'}</Text>
                <Text style={{ color: C.purple, fontSize: 10, fontWeight: '800', marginTop: 5 }}>Tap to edit</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>}

      <TimetableEntryEditor
        visible={!!selected}
        dark={dark}
        title="Resolve pending timetable cell"
        context={selected ? `${String(selected.document.dept || '').toUpperCase()} · Semester ${selected.document.semester} · ${selected.cell.day} · Lecture ${selected.cell.lecture_num}\n${selected.cell.source_text || selected.cell.reason || ''}` : ''}
        initialEntries={[]}
        allowMultiple
        onClose={() => setSelected(null)}
        onSave={save}
      />
      <TimetableEntryEditor
        visible={!!selectedClass}
        dark={dark}
        title="Edit timetable class"
        context={selectedClass ? `${String(selectedClass.document.dept || '').toUpperCase()} · Semester ${selectedClass.document.semester} · ${selectedClass.slot.day} · Lecture ${selectedClass.slot.lectureNum ?? selectedClass.slot.n} · ${selectedClass.room}` : ''}
        initialEntries={selectedClass ? [{ ...selectedClass.slot, room: selectedClass.room }] : []}
        onClose={() => setSelectedClass(null)}
        onSave={saveClass}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: 8, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  heading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  detailBox: { borderWidth: 1, borderRadius: 10, padding: 10 },
  pendingItem: { borderWidth: 1, borderRadius: 10, padding: 9, marginBottom: 6 },
  metrics: { flexDirection: 'row', gap: 7, marginTop: 8 },
  metric: { flex: 1, borderWidth: 1, borderRadius: 9, padding: 8 },
  metaGrid: { gap: 4, marginTop: 8 },
  groupSection: { marginTop: 10 },
  groupWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  groupWrapCollapsed: { maxHeight: 62, overflow: 'hidden' },
  groupChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  moreGroups: { alignSelf: 'flex-start', marginTop: 6, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#DDD3FF' },
  moreGroupsText: { color: '#35118F', fontSize: 11, fontWeight: '900' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 6 },
  editButton: { minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  filterLabel: { fontSize: 10, fontWeight: '800', marginTop: 8, marginBottom: 5 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
});
