import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { fsDelete, fsList } from '../firebase/firestore';
import { normalizeTeacherName, upsertTeacherRecord } from '../firebase/teachers';

const EMPTY_FORM = { name: '', department: 'CS', position: '' };

const DEPARTMENT_NAMES = {
  'mathematics department, attock campus': 'Math',
  'electrical engineering department, attock campus': 'EE',
  'computer engineering department, attock campus': 'CE',
};
const compactDepartment = value => DEPARTMENT_NAMES[String(value || '').trim().toLocaleLowerCase()] || value;
const TEACHER_TITLES = new Set(['MR', 'MRS', 'MS', 'MISS', 'DR', 'PROF', 'PROFESSOR']);

function teacherNameTokens(value) {
  const tokens = String(value || '').toLocaleUpperCase().match(/[A-Z0-9]+/g) || [];
  while (tokens.length && TEACHER_TITLES.has(tokens[0])) tokens.shift();
  return tokens.sort();
}

function editDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

function sameTeacherName(left, right) {
  const a = teacherNameTokens(left);
  const b = teacherNameTokens(right);
  if (!a.length || a.length !== b.length) return false;
  let differences = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    differences += 1;
    const shortest = Math.min(a[index].length, b[index].length);
    if (shortest < 5 || editDistance(a[index], b[index]) / Math.max(a[index].length, b[index].length) > 0.18) return false;
  }
  return differences <= 1;
}

export default function TeacherDirectoryScreen({ dark, user, subjectsBySemester = {}, onShowTeacherOffice }) {
  const [search, setSearch] = useState('');
  const [teacherDocs, setTeacherDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showDepartmentFilter, setShowDepartmentFilter] = useState(false);

  const loadTeachers = useCallback(async () => {
    setLoading(true);
    try { setTeacherDocs(await fsList('teachers')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadTeachers(); }, [loadTeachers, reloadKey]);

  const teachers = useMemo(() => {
    const byName = new Map();
    const merge = (name, additions = {}) => {
      const cleanName = String(name || '').trim();
      if (!cleanName) return;
      const key = normalizeTeacherName(cleanName);
      const item = byName.get(key) || { name: cleanName, subjects: new Set(), departments: new Set(), schedule: [] };
      Object.assign(item, Object.fromEntries(Object.entries(additions).filter(([, value]) => value !== undefined && value !== '')));
      byName.set(key, item);
    };

    teacherDocs.forEach(doc => {
      const schedule = Array.isArray(doc.schedule) ? doc.schedule : [];
      merge(doc.name, {
        ...doc,
        schedule,
        subjects: new Set(schedule.map(slot => slot?.subject).filter(Boolean)),
        departments: new Set(doc.department ? [String(doc.department).trim()] : []),
      });
    });
    Object.values(subjectsBySemester || {}).flat().forEach(row => {
      const name = row?.prof || row?.teacher;
      const key = normalizeTeacherName(name);
      if (!key) return;
      merge(name);
      const item = byName.get(key);
      if (row?.subject) item.subjects.add(String(row.subject).trim());
      if (row?.dept && !item.department) item.departments.add(String(row.dept).toUpperCase());
    });
    return Array.from(byName.values()).map(item => ({
      ...item,
      subjects: Array.from(item.subjects || []).sort(),
      departments: Array.from(item.departments || []).sort(),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [teacherDocs, subjectsBySemester]);

  const departmentOptions = Array.from(new Set(teachers.flatMap(teacher => teacher.departments))).sort((a, b) => a.localeCompare(b));
  const filtered = teachers.filter(teacher => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || teacher.name.toLocaleLowerCase().includes(query)
      || teacher.subjects.some(subject => subject.toLocaleLowerCase().includes(query))
      || teacher.departments.some(dept => dept.toLocaleLowerCase().includes(query));
    const matchesDepartment = !selectedDepartment || teacher.departments.includes(selectedDepartment);
    return matchesSearch && matchesDepartment;
  });
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const card = dark ? '#12123A' : '#FFFFFF';
  const text = dark ? '#EDE9FF' : '#1A0F4A';
  const muted = dark ? '#9B7EF8' : '#6C47D4';
  const border = dark ? '#2A1C6B' : '#E2E0F5';

  async function handleAddTeacher() {
    if (!form.name.trim()) { setError('Teacher name is required.'); return; }
    setSaving(true); setError('');
    try {
      await upsertTeacherRecord(form);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      setReloadKey(value => value + 1);
    } catch (e) {
      setError(e.message || 'Could not save teacher.');
    } finally { setSaving(false); }
  }

  function handleDeleteTeacher() {
    if (user?.type !== 'staff' || !selectedTeacher?._docId) return;
    setDeleteError('');
    const timetableRows = Object.values(subjectsBySemester || {}).flat();
    const assignedClass = timetableRows.find(row => sameTeacherName(
      row?.prof || row?.teacher, selectedTeacher.name,
    ));
    const savedSchedule = Array.isArray(selectedTeacher.schedule) ? selectedTeacher.schedule[0] : null;
    const linkedClass = assignedClass || savedSchedule;
    if (linkedClass) {
      const subject = linkedClass.subject || '担当授業';
      const department = String(linkedClass.dept || linkedClass.department || '').toUpperCase();
      const semester = linkedClass.sem || linkedClass.semester;
      const classLabel = [department, semester ? `Semester ${semester}` : ''].filter(Boolean).join(' ');
      setDeleteError(`${classLabel ? `${classLabel}の` : ''}${subject}に登録されているため削除できません。先にタイムテーブルの担当情報を変更してください。`);
      return;
    }

    Alert.alert(
      '先生を削除',
      `${selectedTeacher.name} をTeacher Listから削除します。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await fsDelete(`teachers/${encodeURIComponent(selectedTeacher._docId)}`);
              setSelectedTeacher(null);
              setReloadKey(value => value + 1);
            } catch (error) {
              setDeleteError(error?.message || '先生を削除できませんでした。');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}>
      <View style={[styles.header, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
        <Text style={styles.kicker}>CAMPUS DIRECTORY</Text>
        <View style={styles.headingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Teacher List</Text>
            <Text style={styles.subtitle}>{teachers.length} teachers · Firestore</Text>
          </View>
          {user?.type === 'staff' && (
            <TouchableOpacity onPress={() => { setForm(EMPTY_FORM); setError(''); setShowAdd(true); }} style={styles.addButton}>
              <Text style={styles.addButtonText}>＋ Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Search teachers or subjects"
          placeholderTextColor={dark ? '#8D82B8' : '#8B83A8'}
          style={[styles.search, { color: text, backgroundColor: card, borderColor: border }]}
        />
        <TouchableOpacity onPress={() => setShowDepartmentFilter(true)} style={[styles.filterButton, { backgroundColor: card, borderColor: selectedDepartment ? C.purple : border }]}>
          <Text style={[styles.filterButtonText, { color: selectedDepartment ? C.purple : muted }]}>{selectedDepartment ? compactDepartment(selectedDepartment) : 'Filter'}</Text>
          <Text style={{ color: muted, fontSize: 10 }}>▾</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {loading ? <ActivityIndicator color={C.purple} style={{ marginTop: 36 }} /> : filtered.length ? filtered.map(teacher => (
          <View key={teacher._docId || normalizeTeacherName(teacher.name)} style={[styles.person, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{teacher.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</Text></View>
            <View style={styles.info}>
              <Text style={[styles.name, { color: text }]}>{teacher.name}</Text>
              {!!teacher.departments.length && <Text style={[styles.department, { color: muted }]}>{teacher.departments.map(compactDepartment).join(' · ')}</Text>}
              {!!teacher.position && <Text style={[styles.position, { color: muted }]}>{teacher.position}</Text>}
              <Text style={[styles.subjects, { color: dark ? '#C4B5FD' : '#55458B' }]} numberOfLines={3}>
                {teacher.subjects.length ? teacher.subjects.join(' · ') : 'No subject details in timetable'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setDeleteError(''); setSelectedTeacher(teacher); }} style={styles.detailsButton}>
              <Text style={[styles.detailsButtonText, { color: muted }]}>Details</Text>
            </TouchableOpacity>
          </View>
        )) : (
          <View style={styles.empty}>
            <Text style={{ fontSize: 34, marginBottom: 8 }}>👩‍🏫</Text>
            <Text style={[styles.emptyTitle, { color: text }]}>{teachers.length ? 'No matching teachers' : 'Teacher data not available'}</Text>
            <Text style={[styles.emptyBody, { color: muted }]}>
              {teachers.length ? 'Try a different name or subject.' : 'Teachers will appear here after staff add them or a teacher account signs up.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showDepartmentFilter} transparent animationType="fade" onRequestClose={() => setShowDepartmentFilter(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.modalTitle, { color: text }]}>Filter by department</Text>
            <ScrollView style={styles.departmentOptions}>
              {[{ value: '', label: 'All departments' }, ...departmentOptions.map(value => ({ value, label: compactDepartment(value) }))].map(option => (
                <TouchableOpacity key={option.value || 'all'} onPress={() => { setSelectedDepartment(option.value); setShowDepartmentFilter(false); }} style={[styles.departmentOption, { borderBottomColor: border }]}>
                  <Text style={{ color: option.value === selectedDepartment ? C.purple : text, fontWeight: option.value === selectedDepartment ? '800' : '600' }}>{option.label}</Text>
                  {option.value === selectedDepartment && <Text style={{ color: C.purple, fontWeight: '800' }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowDepartmentFilter(false)} style={[styles.action, { backgroundColor: dark ? '#27204A' : '#EEEAFB' }]}>
                <Text style={{ color: muted, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedTeacher} transparent animationType="fade" onRequestClose={() => setSelectedTeacher(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.modalTitle, { color: text }]}>{selectedTeacher?.name}</Text>
            <Text style={[styles.modalHint, { color: muted }]}>Department: {selectedTeacher?.departments?.join(' · ') || 'Not specified'}</Text>
            {!!selectedTeacher?.position && <Text style={[styles.modalHint, { color: muted }]}>Position: {selectedTeacher.position}</Text>}
            <Text style={[styles.modalHint, { color: muted }]}>Subjects: {selectedTeacher?.subjects?.length ? selectedTeacher.subjects.join(' · ') : 'No subject details in timetable'}</Text>
            {!!deleteError && <Text style={styles.error}>{deleteError}</Text>}
            <View style={styles.modalActions}>
              {!!selectedTeacher?.office?.roomId && (
                <TouchableOpacity onPress={() => { onShowTeacherOffice?.(selectedTeacher); setSelectedTeacher(null); }} style={[styles.action, { backgroundColor: C.purple }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Office</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setSelectedTeacher(null)} style={[styles.action, { backgroundColor: dark ? '#27204A' : '#EEEAFB' }]}>
                <Text style={{ color: muted, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
              {user?.type === 'staff' && !!selectedTeacher?._docId && (
                <TouchableOpacity disabled={deleting} onPress={handleDeleteTeacher} style={[styles.action, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ color: '#B91C1C', fontWeight: '800' }}>{deleting ? 'Deleting…' : 'Delete'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.modalTitle, { color: text }]}>Add teacher</Text>
            <Text style={[styles.modalHint, { color: muted }]}>A teacher with the same name will be updated.</Text>
            {[
              ['name', 'Full name *'], ['department', 'Department'], ['position', 'Position'],
            ].map(([key, label]) => (
              <TextInput key={key} value={form[key]} onChangeText={value => setForm(current => ({ ...current, [key]: value }))}
                placeholder={label} placeholderTextColor={dark ? '#8D82B8' : '#8B83A8'}
                style={[styles.field, { color: text, backgroundColor: bg, borderColor: border }]} />
            ))}
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={[styles.action, { backgroundColor: dark ? '#27204A' : '#EEEAFB' }]}>
                <Text style={{ color: muted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={saving} onPress={handleAddTeacher} style={[styles.action, { backgroundColor: C.purple }]}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{saving ? 'Saving…' : 'Save teacher'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  kicker: { color: '#D8CCFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 },
  title: { color: '#fff', fontSize: 23, fontWeight: '800' },
  subtitle: { color: '#E5DEFF', fontSize: 12, marginTop: 4 },
  addButton: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  addButtonText: { color: C.purple, fontSize: 12, fontWeight: '800' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 14, marginBottom: 4 },
  search: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13 },
  filterButton: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterButtonText: { fontSize: 11, fontWeight: '800' },
  departmentOptions: { maxHeight: 330, marginTop: 10 },
  departmentOption: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { padding: 14, paddingTop: 10, paddingBottom: 28, gap: 10 },
  person: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#6C47D4', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800' },
  department: { fontSize: 10, fontWeight: '700', marginTop: 3 },
  detailsButton: { paddingHorizontal: 8, paddingVertical: 6 },
  detailsButtonText: { fontSize: 10, fontWeight: '800' },
  position: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  meta: { fontSize: 10, marginTop: 3 },
  subjects: { fontSize: 11, lineHeight: 16, marginTop: 5 },
  empty: { alignItems: 'center', paddingHorizontal: 26, paddingVertical: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  emptyBody: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10,10,30,0.65)', justifyContent: 'center', padding: 20 },
  modal: { borderWidth: 1, borderRadius: 18, padding: 18 },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalHint: { fontSize: 11, marginTop: 4, marginBottom: 12 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8, fontSize: 13 },
  error: { color: '#DC2626', fontSize: 11, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  action: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
});
