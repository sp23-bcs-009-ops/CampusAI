import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Linking, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { DEPT_MAP, DEPT_MAX_SEM, SEM_LABELS, STUDENT_DEPARTMENTS } from '../constants/config';
import { calcAge } from '../utils/helpers';
import { InfoRow } from '../components/ui';

export default function ProfileScreen({ user, onUpdate, onRoleChange, onLogout, dark, subjectsList = [], availableSubjects = [] }) {
  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');
  const normalizeSubjects = (arr) => (arr || []).map(toSubjectName).filter(Boolean);
  const subjectOptions = Array.from(new Set(normalizeSubjects(subjectsList)));
  const addSubjectOptions = Array.from(new Set(normalizeSubjects(availableSubjects)));

  const [editing,      setEditing]      = useState(false);
  const [editPhone,    setEditPhone]    = useState(false);
  const [fullName,     setFullName]     = useState(user.fullName || '');
  const [dob,          setDob]          = useState(user.dob || '');
  const [phone,        setPhone]        = useState(user.phone || '');
  const [tmpPhone,     setTmpPhone]     = useState(user.phone || '');
  const [saved,        setSaved]        = useState(false);
  const [showDobPick,  setShowDobPick]  = useState(false);
  const [dobObj,       setDobObj]       = useState(dob ? new Date(dob) : new Date(2000, 0, 1));
  const [mySubjects,   setMySubjects]   = useState(normalizeSubjects(user.subjects?.length ? user.subjects : subjectOptions));
  const [editSubjects, setEditSubjects] = useState(false);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [addSubjectSearch, setAddSubjectSearch] = useState('');
  const [editSem,      setEditSem]      = useState(false);
  const [sem,          setSem]          = useState(user.semester || 1);
  const [dept,         setDept]         = useState(user.dept || 'cs');

  const bg     = dark ? '#0A0A1E' : '#F5F4FF';
  const cardBg = dark ? '#1A1A3E' : '#FFFFFF';
  const tp     = dark ? '#EDE9FF' : '#1A0F4A';
  const ts     = dark ? '#9B7EF8' : '#6C47D4';
  const bdr    = dark ? '#2A1C6B' : '#E2E0F5';
  const muted  = dark ? '#4A3A7A' : '#B0A8D8';
  const ib     = dark ? '#0A0A1E' : '#FAFAFE';

  const age      = calcAge(dob || user.dob);
  const initials = (fullName || user.fullName || user.name || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const inpStyle = { borderWidth: 1.5, borderColor: C.purple, borderRadius: 8, padding: 8, fontSize: 13, color: tp, backgroundColor: ib, marginTop: 4 };

  function saveProfile() {
    if (!fullName.trim()) return;
    onUpdate({ ...user, fullName, dob, semester: sem, subjects: normalizeSubjects(mySubjects) });
    setSaved(true); setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  }
  function savePhone() { setPhone(tmpPhone); onUpdate({ ...user, phone: tmpPhone }); setEditPhone(false); }
  function toggleSubject(subj) {
    setMySubjects(prev => prev.includes(subj) ? prev.filter(s => s !== subj) : [...prev, subj]);
  }
  function beginSubjectEdit(showSearch = false) {
    if (!user.subjects?.length) setMySubjects(subjectOptions);
    setEditSubjects(true);
    setShowAddSubject(showSearch);
    setAddSubjectSearch('');
  }
  function saveSubjects() {
    onUpdate({ ...user, subjects: normalizeSubjects(mySubjects) });
    setEditSubjects(false);
    setShowAddSubject(false);
    setAddSubjectSearch('');
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }
  function saveSemester() {
    onUpdate({ ...user, semester: sem });
    setEditSem(false);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  useEffect(() => {
    setSem(user.semester || 1);
    setDept(user.dept || 'cs');
  }, [user.semester, user.dept]);

  function saveTestStudentAcademicInfo() {
    const semester = Math.min(Number(sem) || 1, DEPT_MAX_SEM[dept] || 8);
    const selectedDepartment = STUDENT_DEPARTMENTS.find(item => item.code === dept);
    onUpdate({
      ...user,
      dept,
      department: selectedDepartment?.label || DEPT_MAP[dept] || dept.toUpperCase(),
      semester,
      subjects: [],
    });
    setMySubjects([]);
    setSem(semester);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: tp }}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Banner */}
        <View style={[styles.banner, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{fullName || user.fullName || user.name}</Text>
          <Text style={styles.sub}>{user.type.charAt(0).toUpperCase() + user.type.slice(1)} · {user.email || 'N/A'}</Text>
          <View style={styles.badges}>
            {user.type === 'student' && (
              <View style={styles.badge}><Text style={styles.badgeText}>{SEM_LABELS[sem] || sem} Semester</Text></View>
            )}
            <View style={styles.badge}><Text style={styles.badgeText}>{user.department}</Text></View>
          </View>
        </View>

        {saved && (
          <View style={[styles.savedBanner, { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }]}>
            <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>✓ Profile updated!</Text>
          </View>
        )}

        {user.testMode && (
          <View style={[styles.card, { backgroundColor: '#FFF7ED', borderColor: '#FDBA74' }]}> 
            <Text style={[styles.cardTitle, { color: '#9A3412', marginBottom: 4 }]}>Test Account</Text>
            <Text style={{ color: '#9A3412', fontSize: 11, lineHeight: 16, marginBottom: 10 }}>
              This development-only account has no real email. Switch roles to test each view.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['student', 'teacher', 'staff'].map(type => (
                <TouchableOpacity key={type} onPress={() => onRoleChange(type)}
                  style={{ flex: 1, borderWidth: 1.5, borderColor: user.type === type ? '#EA580C' : '#FDBA74', borderRadius: 10, padding: 8, alignItems: 'center', backgroundColor: user.type === type ? '#FFEDD5' : '#FFF' }}>
                  <Text style={{ color: '#9A3412', fontSize: 11, fontWeight: '700' }}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Personal info */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: bdr }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: tp }]}>Personal Info</Text>
            {!editing
              ? <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✏️ Edit</Text>
                </TouchableOpacity>
              : <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setEditing(false)} style={[styles.editBtn, { backgroundColor: dark ? '#2A1C6B' : '#F0EEFF' }]}>
                    <Text style={{ color: ts, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveProfile} style={styles.editBtn}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Save</Text>
                  </TouchableOpacity>
                </View>
            }
          </View>

          <InfoRow label="Full Name" dark={dark}>
            {editing
              ? <TextInput value={fullName} onChangeText={setFullName} style={inpStyle} />
              : <Text style={{ fontSize: 13, fontWeight: '600', color: tp }}>{fullName || <Text style={{ color: muted }}>Not set</Text>}</Text>
            }
          </InfoRow>

          <InfoRow label={`Date of Birth${age !== null ? ` (${age} yrs)` : ''}`} dark={dark}>
            {editing
              ? <>
                  <TouchableOpacity onPress={() => setShowDobPick(true)}
                    style={[inpStyle, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 13, color: dob ? tp : muted }}>{dob || 'Select date'}</Text>
                    <Text style={{ fontSize: 15 }}>📅</Text>
                  </TouchableOpacity>
                  {showDobPick && (
                    <DateTimePicker value={dobObj} mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      maximumDate={new Date()}
                      onChange={(_, selected) => {
                        setShowDobPick(Platform.OS === 'ios');
                        if (selected) { setDobObj(selected); setDob(selected.toISOString().split('T')[0]); }
                      }} />
                  )}
                </>
              : <Text style={{ fontSize: 13, fontWeight: '600', color: tp }}>
                  {dob ? new Date(dob).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : <Text style={{ color: muted }}>Not set</Text>}
                </Text>
            }
          </InfoRow>

          <InfoRow label="Phone Number" dark={dark}>
            {editPhone
              ? <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <TextInput value={tmpPhone} onChangeText={setTmpPhone} placeholder="+92 300 0000000"
                    placeholderTextColor={muted} style={[inpStyle, { flex: 1, marginTop: 0 }]} />
                  <TouchableOpacity onPress={savePhone} style={[styles.editBtn, { paddingHorizontal: 10 }]}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditPhone(false)} style={[styles.editBtn, { backgroundColor: dark ? '#2A1C6B' : '#F0EEFF', paddingHorizontal: 10 }]}>
                    <Text style={{ color: ts, fontSize: 12, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              : <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: tp }}>{phone || <Text style={{ color: muted }}>Not set</Text>}</Text>
                  <TouchableOpacity onPress={() => { setTmpPhone(phone); setEditPhone(true); }}>
                    <Text style={{ color: ts, fontSize: 12, fontWeight: '600' }}>{phone ? 'Edit' : 'Add'}</Text>
                  </TouchableOpacity>
                </View>
            }
          </InfoRow>

          <InfoRow label="Email Address" dark={dark}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: tp, flex: 1 }} numberOfLines={1}>{user.email}</Text>
              <Text style={{ color: muted, fontSize: 16, marginLeft: 8 }}>🔒</Text>
            </View>
          </InfoRow>
        </View>

        {/* Academic info */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: bdr }]}>
          <Text style={[styles.cardTitle, { color: tp, marginBottom: 4 }]}>Academic Info</Text>
          {user.testMode && user.type === 'student' ? (
            <>
              <Text style={{ color: ts, fontSize: 11, fontWeight: '700', marginTop: 8 }}>Department</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
                {STUDENT_DEPARTMENTS.map(({ code, label }) => (
                  <TouchableOpacity key={code} onPress={() => {
                    setDept(code);
                    setSem(current => Math.min(Number(current) || 1, DEPT_MAX_SEM[code] || 8));
                  }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: dept === code ? C.purple : bdr, backgroundColor: dept === code ? (dark ? '#2A1C6B' : '#EDE9FF') : ib }}>
                    <Text style={{ color: dept === code ? C.purple : tp, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: ts, fontSize: 11, fontWeight: '700', marginTop: 12 }}>Semester</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 }}>
                {Array.from({ length: DEPT_MAX_SEM[dept] || 8 }, (_, index) => index + 1).map(value => (
                  <TouchableOpacity key={value} onPress={() => setSem(value)} style={{ width: 38, paddingVertical: 7, alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: Number(sem) === value ? C.purple : bdr, backgroundColor: Number(sem) === value ? (dark ? '#2A1C6B' : '#EDE9FF') : ib }}>
                    <Text style={{ color: Number(sem) === value ? C.purple : tp, fontSize: 11, fontWeight: '700' }}>{value}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={saveTestStudentAcademicInfo} style={[styles.editBtn, { alignSelf: 'flex-end', marginTop: 12 }]}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Save Department & Semester</Text>
              </TouchableOpacity>
            </>
          ) : <InfoRow label="Department" dark={dark} value={user.department} />}
          {user.type === 'student' && !user.testMode && (
            <InfoRow label="Semester" dark={dark} value={`${SEM_LABELS[sem] || sem} Semester (${sem} of 8)`} />
          )}
          <InfoRow label="Student ID" dark={dark} value={user.email ? user.email.split('@')[0] : 'N/A'} />
        </View>

        {/* Change Subject — students only */}
        {user.type === 'student' && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: bdr }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: tp }]}>Change Subjects</Text>
              {!editSubjects
                ? <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => beginSubjectEdit(true)} style={[styles.editBtn, { backgroundColor: dark ? '#2A1C6B' : '#F0EEFF' }]}>
                      <Text style={{ color: ts, fontSize: 12, fontWeight: '700' }}>＋ Add Subject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => beginSubjectEdit(false)} style={styles.editBtn}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✏️ Edit</Text>
                    </TouchableOpacity>
                  </View>
                : <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => { setMySubjects(normalizeSubjects(user.subjects?.length ? user.subjects : subjectOptions)); setEditSubjects(false); setShowAddSubject(false); setAddSubjectSearch(''); }} style={[styles.editBtn, { backgroundColor: dark ? '#2A1C6B' : '#F0EEFF' }]}>
                      <Text style={{ color: ts, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveSubjects} style={styles.editBtn}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Save</Text>
                    </TouchableOpacity>
                  </View>
              }
            </View>
            <View style={{ backgroundColor: '#FEF9C3', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FDE047' }}>
              <Text style={{ fontSize: 11, color: '#854D0E', fontWeight: '600', lineHeight: 16 }}>
                ⚠️ Only selected subjects will appear in your Floor Map and Class Notifications. Deselected subjects will be completely hidden from your view.
              </Text>
            </View>
            {subjectOptions.length === 0
              ? <Text style={{ fontSize: 12, color: muted, fontStyle: 'italic', paddingBottom: 14 }}>No subjects available. Upload a timetable first.</Text>
              : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 14 }}>
                  {subjectOptions.map((subj, idx) => {
                    const selected = mySubjects.includes(subj);
                    return (
                      <TouchableOpacity key={`${subj}-${idx}`}
                        onPress={() => editSubjects && toggleSubject(subj)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, borderColor: selected ? C.purple : bdr, backgroundColor: selected ? '#EDE9FF' : ib }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? C.purple : muted }}>
                          {selected ? '✓ ' : ''}{subj}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
            }
            {showAddSubject && editSubjects && (
              <View style={{ borderTopWidth: 1, borderTopColor: bdr, paddingTop: 12, marginTop: 2, marginBottom: 12 }}>
                <Text style={{ color: tp, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>Add Subject</Text>
                <TextInput
                  value={addSubjectSearch}
                  onChangeText={setAddSubjectSearch}
                  placeholder="Search timetable subjects"
                  placeholderTextColor={muted}
                  style={inpStyle}
                  autoCapitalize="none"
                />
                {!!addSubjectSearch.trim() && (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: bdr, borderRadius: 10, overflow: 'hidden' }}>
                    {addSubjectOptions.filter(subject => subject.toLocaleLowerCase().includes(addSubjectSearch.trim().toLocaleLowerCase())).length > 0
                      ? addSubjectOptions.filter(subject => subject.toLocaleLowerCase().includes(addSubjectSearch.trim().toLocaleLowerCase())).map(subject => {
                        const selected = mySubjects.includes(subject);
                        return (
                          <TouchableOpacity key={subject} onPress={() => toggleSubject(subject)} style={{ padding: 11, backgroundColor: selected ? (dark ? '#27204A' : '#F3F0FF') : ib, borderBottomWidth: 1, borderBottomColor: bdr, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ color: tp, fontSize: 13, fontWeight: '600' }}>{subject}</Text>
                            <Text style={{ color: selected ? C.purple : ts, fontSize: 12, fontWeight: '700' }}>{selected ? 'Added ✓' : 'Add +'}</Text>
                          </TouchableOpacity>
                        );
                      })
                      : <Text style={{ color: muted, fontSize: 12, padding: 11 }}>No matching subjects found.</Text>}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Change Semester — students only */}
        {user.type === 'student' && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: bdr }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: tp }]}>Change Semester</Text>
              {!editSem
                ? <TouchableOpacity onPress={() => setEditSem(true)} style={styles.editBtn}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✏️ Edit</Text>
                  </TouchableOpacity>
                : <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => { setSem(user.semester); setEditSem(false); }} style={[styles.editBtn, { backgroundColor: dark ? '#2A1C6B' : '#F0EEFF' }]}>
                      <Text style={{ color: ts, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveSemester} style={styles.editBtn}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Save</Text>
                    </TouchableOpacity>
                  </View>
              }
            </View>
            <View style={{ backgroundColor: '#FEF9C3', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FDE047' }}>
              <Text style={{ fontSize: 11, color: '#854D0E', fontWeight: '600', lineHeight: 16 }}>
                ⚠️ Changing your semester will affect which timetable and notifications you see. Only change this if your email-based semester is incorrect (e.g. you are a repeater).
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 14 }}>
              {[1,2,3,4,5,6,7,8].map(s => (
                <TouchableOpacity key={s}
                  onPress={() => editSem && setSem(s)}
                  style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: sem === s ? C.purple : bdr, backgroundColor: sem === s ? C.purple : ib, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: sem === s ? '#fff' : tp }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Quick links */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: bdr }]}>
          <Text style={[styles.cardTitle, { color: tp, marginBottom: 4 }]}>Quick Links</Text>
          <InfoRow label="Student Portal" dark={dark}>
            <TouchableOpacity onPress={() => Linking.openURL('https://atk-cms.comsats.edu.pk/')}
              style={[styles.editBtn, { alignSelf: 'flex-start', marginTop: 4, flexDirection: 'row', gap: 6 }]}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Open Portal 🔗</Text>
            </TouchableOpacity>
          </InfoRow>
        </View>

        {/* Sign out */}
        <TouchableOpacity onPress={onLogout} style={[styles.signOutBtn, { borderColor: '#FCA5A5' }]}>
          <Text style={styles.signOutText}>🚪 Sign Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1 },
  banner:      { padding: 24, alignItems: 'center', gap: 8 },
  avatar:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  avatarText:  { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  name:        { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub:         { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  badges:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badge:       { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  badgeText:   { color: '#fff', fontSize: 11, fontWeight: '700' },
  savedBanner: { margin: 14, borderWidth: 1, borderRadius: 10, padding: 10 },
  card:        { margin: 14, marginBottom: 0, borderRadius: 20, borderWidth: 1, padding: 14, paddingBottom: 0 },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTitle:   { fontSize: 13, fontWeight: '700' },
  editBtn:     { backgroundColor: C.purple, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 5 },
  signOutBtn:  { margin: 14, marginTop: 18, padding: 13, borderRadius: 14, borderWidth: 2, alignItems: 'center' },
  signOutText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
});
