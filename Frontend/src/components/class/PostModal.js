import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C } from '../../constants/colors';
import { NOTIF_TYPES, DEPT_MAX_SEM, FALLBACK_LECTURE_SLOTS } from '../../constants/config';
import { ErrBanner, PrimaryButton, SectionLabel, Chip } from '../ui';

const DEPT_LIST = [
  { key: 'cs', label: 'CS — Computer Science' },
  { key: 'se', label: 'SE — Software Engineering' },
  { key: 'ai', label: 'AI — Artificial Intelligence' },
];

/**
 * PostModal — Teacher only.
 * Step 1: type select
 * Step 2: dept + semester select
 * Step 3: form (subject drawn from timetable data for that dept/sem)
 */
export default function PostModal({ visible, dark, onClose, onSubmit, editNotif, lectureSlots, subjectsMap, user, getAvailableRooms }) {
  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  const isEdit = !!editNotif;

  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');

  const [step,       setStep]       = useState(isEdit ? 3 : 1);
  const [type,       setType]       = useState(editNotif?.type || null);
  const [dept,       setDept]       = useState(editNotif?.dept || '');
  const [semester,   setSemester]   = useState(editNotif?.semester || '');
  const [subject,    setSubject]    = useState(editNotif?.subject || '');
  const [lectureNum, setLectureNum] = useState(editNotif?.lectureNum || null);
  const [room,       setRoom]       = useState(editNotif?.room || null);
  const [reason,     setReason]     = useState(editNotif?.reason || '');
  const [date,       setDate]       = useState(editNotif?.date || '');
  const [deadline,   setDeadline]   = useState(editNotif?.deadline || '');
  const [body,       setBody]       = useState(editNotif?.body || '');
  const [err,        setErr]        = useState('');
  const [showDatePick,     setShowDatePick]     = useState(false);
  const [showDeadlinePick, setShowDeadlinePick] = useState(false);
  const [dateObj,     setDateObj]     = useState(new Date());
  const [deadlineObj, setDeadlineObj] = useState(new Date());

  useEffect(() => {
    if (!visible) return;
    setStep(editNotif ? 3 : 1);
    setType(editNotif?.type || null);
    setDept(editNotif?.dept || '');
    setSemester(editNotif?.semester || '');
    setSubject(editNotif?.subject || '');
    setLectureNum(editNotif?.lectureNum || null);
    setRoom(editNotif?.room || null);
    setReason(editNotif?.reason || '');
    setDate(editNotif?.date || '');
    setDeadline(editNotif?.deadline || '');
    setBody(editNotif?.body || '');
    setErr('');
  }, [visible, editNotif]);

  const bg  = dark ? '#1A1A3E' : '#FFFFFF';
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const ib  = dark ? '#0A0A1E' : '#F8F7FF';

  const inp = { borderWidth: 1.5, borderColor: bdr, borderRadius: 12, padding: 11, color: tp, backgroundColor: ib, fontSize: 13, marginBottom: 12 };

  // Subjects available for selected dept+semester
  const subjectOptions = (dept && semester && subjectsMap)
    ? Array.from(new Set((subjectsMap[dept]?.[semester] || []).map(toSubjectName).filter(Boolean)))
    : [];

  const semCount = dept ? (DEPT_MAX_SEM[dept] || 8) : 8;

  const usesLecture = type === 'arrange' || type === 'cancel' || type === 'quiz';
  const isStaffReservation = type === 'room_reservation';
  const isStaff = user?.type === 'staff';
  const ROOMS_LIST  = ['LT1','LT2','LT3','LT4','LT5','LT6','LT8','LT9'];
  const availableRooms = getAvailableRooms ? getAvailableRooms({ dept, semester, date, lectureNum }) : [];

  function reset() {
    setStep(isEdit ? 3 : 1); setType(editNotif?.type || null);
    setDept(editNotif?.dept || ''); setSemester(editNotif?.semester || '');
    setSubject(editNotif?.subject || ''); setLectureNum(editNotif?.lectureNum || null);
    setRoom(editNotif?.room || null); setDate(editNotif?.date || '');
    setReason(editNotif?.reason || '');
    setDeadline(editNotif?.deadline || ''); setBody(editNotif?.body || '');
    setErr('');
  }

  function handleClose() { reset(); onClose(); }

  function openDatePicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dateObj,
        mode: 'date',
        onChange: (_, selected) => {
          if (selected) {
            setDateObj(selected);
            setDate(selected.toISOString().split('T')[0]);
            setRoom(null);
          }
        },
      });
      return;
    }
    setShowDatePick(true);
  }

  function openDeadlinePicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: deadlineObj,
        mode: 'date',
        onChange: (event, selectedDate) => {
          if (event?.type !== 'set' || !selectedDate) return;
          DateTimePickerAndroid.open({
            value: deadlineObj,
            mode: 'time',
            is24Hour: true,
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent?.type !== 'set' || !selectedTime) return;
              const combined = new Date(selectedDate);
              combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              setDeadlineObj(combined);
              setDeadline(combined.toISOString().slice(0, 16));
            },
          });
        },
      });
      return;
    }
    setShowDeadlinePick(true);
  }

  function handleSubmit() {
    if (!isStaffReservation && type !== 'other' && !subject) { setErr('Please select a subject.'); return; }
    if (usesLecture && !lectureNum)   { setErr('Please select a Lecture.'); return; }
    if (isStaffReservation && !lectureNum) { setErr('Please select a time slot.'); return; }
    if (usesLecture && !date)         { setErr('Please select a date.'); return; }
    if (isStaffReservation && !date)  { setErr('Please select a date.'); return; }
    if ((type === 'arrange' || isStaffReservation) && !room) { setErr('Please select an available room.'); return; }
    if (isStaffReservation && !reason) { setErr('Please select a reservation reason.'); return; }
    if (type === 'assignment' && !deadline) { setErr('Please set a deadline.'); return; }

    const notif = {
      id:         editNotif?.id || `${Date.now()}`,
      type, dept, semester: Number(semester),
      subject:    subject || 'General',
      lectureNum: lectureNum ? Number(lectureNum) : null,
      date:       date || null,
      deadline:   deadline || null,
      room:       type === 'arrange' || isStaffReservation ? room : null,
      reason:     isStaffReservation ? reason : null,
      body,
      postedBy:   editNotif?.postedBy || user?.fullName || user?.name || (isStaff ? 'Staff' : 'Teacher'),
      pinned:     editNotif?.pinned || false,
      title:      NOTIF_TYPES[type]?.label + (subject ? ` — ${subject}` : ''),
    };
    onSubmit(notif);
    handleClose();
  }

  const t = type ? NOTIF_TYPES[type] : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: bg, borderTopColor: bdr }]}>
          <View style={[styles.handle, { backgroundColor: ts }]} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── Step 1: Type select ── */}
            {step === 1 && (
              <>
                <Text style={[styles.heading, { color: tp }]}>Notification type</Text>
                {Object.entries(NOTIF_TYPES)
                  .filter(([key]) => !isStaff || key === 'room_reservation')
                  .map(([key, nt]) => {
                  const c = nt[dark ? 'd' : 'l'];
                  return (
                    <TouchableOpacity key={key}
                      onPress={() => { setType(key); setErr(''); setStep(2); }}
                      style={[styles.typeRow, { backgroundColor: c.bg, borderColor: c.bd }]}>
                      <Text style={[styles.typeLabel, { color: c.tx }]}>{nt.label}</Text>
                      <Text style={{ color: c.tx }}>›</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* ── Step 2: Dept + Semester ── */}
            {step === 2 && (
              <>
                <BackBtn onPress={() => setStep(1)} ts={ts} />
                <Text style={[styles.heading, { color: tp }]}>Target class</Text>
                <SectionLabel text="Department" dark={dark} />
                <View style={styles.chipRow}>
                  {DEPT_LIST.map(d => (
                    <Chip key={d.key} label={d.label} active={dept === d.key}
                      onPress={() => { setDept(d.key); setSemester(''); setSubject(''); }}
                      dark={dark} />
                  ))}
                </View>
                {dept && <>
                  <SectionLabel text="Semester" dark={dark} style={{ marginTop: 12 }} />
                  <View style={styles.chipRow}>
                    {Array.from({ length: semCount }, (_, i) => i + 1).map(n => (
                      <Chip key={n} label={`Sem ${n}`} active={semester === String(n)}
                        onPress={() => { setSemester(String(n)); setSubject(''); }}
                        dark={dark} />
                    ))}
                  </View>
                </>}
                {dept && semester && (
                  <PrimaryButton label="Continue →" onPress={() => { setErr(''); setStep(3); }}
                    style={{ marginTop: 16 }} />
                )}
              </>
            )}

            {/* ── Step 3: Form ── */}
            {step === 3 && t && (
              <>
                {!isEdit && <BackBtn onPress={() => setStep(2)} ts={ts} />}

                {/* Dept/sem badge */}
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, { backgroundColor: t[dark?'d':'l'].bg, borderColor: t[dark?'d':'l'].bd }]}>
                    <Text style={[styles.badgeText, { color: t[dark?'d':'l'].tx }]}>{t.label}</Text>
                  </View>
                  {dept && semester && (
                    <View style={[styles.badge, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: C.purple + '44' }]}>
                      <Text style={[styles.badgeText, { color: ts }]}>{dept.toUpperCase()} · Sem {semester}</Text>
                    </View>
                  )}
                </View>

                {/* Subject */}
                {type !== 'other' && !isStaffReservation && <>
                  <SectionLabel text="Subject" dark={dark} />
                  {subjectOptions.length > 0
                    ? <View style={styles.subjectList}>
                        {subjectOptions.map((s, idx) => (
                          <TouchableOpacity key={`${s}-${idx}`}
                            onPress={() => setSubject(s)}
                            style={[styles.subjectItem, {
                              backgroundColor: subject === s ? C.purple : ib,
                              borderColor: subject === s ? C.purple : bdr,
                            }]}>
                            <Text style={{ color: subject === s ? '#fff' : tp, fontSize: 13, fontWeight: '600' }}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    : <TextInput value={subject} onChangeText={setSubject}
                        placeholder="Subject name" placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'}
                        style={inp} />
                  }
                </>}

                {/* Date + Lecture */}
                {(usesLecture || isStaffReservation) && <>
                  <SectionLabel text="Date" dark={dark} />
                  <TouchableOpacity
                    onPress={openDatePicker}
                    style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 13, color: date ? tp : (dark ? '#4A3A7A' : '#B0A8D8') }}>{date || 'Select date'}</Text>
                          <Text style={{ fontSize: 16 }}>📅</Text>
                  </TouchableOpacity>
                  {showDatePick && (
                    <DateTimePicker
                      value={dateObj}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selected) => {
                        setShowDatePick(Platform.OS === 'ios');
                        if (event?.type !== 'set' || !selected) return;
                        setDateObj(selected);
                        setDate(selected.toISOString().split('T')[0]);
                        setRoom(null);
                      }}
                    />
                  )}
                  <SectionLabel text={isStaffReservation ? 'Time Slot' : 'Lecture Slot'} dark={dark} />
                  <View style={styles.lecRow}>
                    {Object.entries(slots).map(([n, sl]) => {
                      const active = lectureNum === Number(n);
                      return (
                        <TouchableOpacity key={n} onPress={() => { setLectureNum(Number(n)); setRoom(null); }}
                          style={[styles.lecBtn, {
                            backgroundColor: active ? C.purple : ib,
                            borderColor: active ? C.purple : bdr,
                          }]}>
                          <Text style={[styles.lecBtnN, { color: active ? '#fff' : tp }]}>L{n}</Text>
                          <Text style={{ fontSize: 8, color: active ? 'rgba(255,255,255,0.8)' : ts }}>{sl.start}</Text>
                          <Text style={{ fontSize: 8, color: active ? 'rgba(255,255,255,0.7)' : ts }}>{sl.end}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>}

                {/* Room (arrange or staff reservation) */}
                {(type === 'arrange' || isStaffReservation) && <>
                  <SectionLabel text="Available rooms" dark={dark} />
                  {date && lectureNum && availableRooms.length === 0 && (
                    <Text style={{ color: ts, fontSize: 12, marginBottom: 10 }}>No rooms are available for this date and time.</Text>
                  )}
                  <View style={styles.chipRow}>
                    {(date && lectureNum ? availableRooms : ROOMS_LIST.map(value => ({ room: value }))).map(option => (
                      <Chip key={option.room} label={option.label || option.room} active={room === option.room}
                        onPress={() => setRoom(option.room)} dark={dark} />
                    ))}
                  </View>
                </>}

                {isStaffReservation && <>
                  <SectionLabel text="Reserved for" dark={dark} />
                  <View style={styles.chipRow}>
                    {[
                      { value: 'event', label: 'Reserved for event' },
                      { value: 'class', label: 'Reserved for Class' },
                      { value: 'other', label: 'Reserved for other' },
                    ].map(option => (
                      <Chip key={option.value} label={option.label} active={reason === option.value}
                        onPress={() => setReason(option.value)} dark={dark} />
                    ))}
                  </View>
                </>}

                {/* Deadline (assignment only) */}
                {type === 'assignment' && <>
                  <SectionLabel text="Deadline" dark={dark} />
                  <TouchableOpacity
                    onPress={openDeadlinePicker}
                    style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 13, color: deadline ? tp : (dark ? '#4A3A7A' : '#B0A8D8') }}>{deadline ? deadline.replace('T', ' ') : 'Select deadline'}</Text>
                    <Text style={{ fontSize: 16 }}>⏰</Text>
                  </TouchableOpacity>
                  {showDeadlinePick && (
                    <DateTimePicker
                      value={deadlineObj}
                      mode="datetime"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(event, selected) => {
                        setShowDeadlinePick(Platform.OS === 'ios');
                        if (event?.type !== 'set' || !selected) return;
                        setDeadlineObj(selected);
                        // BUG FIX: use slice(0, 16) correctly for ISO format "YYYY-MM-DDTHH:MM"
                        setDeadline(selected.toISOString().slice(0, 16));
                      }}
                    />
                  )}
                </>}

                {/* Details */}
                <SectionLabel text={<>Details <Text style={{ fontWeight: '400', opacity: 0.55 }}>(optional)</Text></>} dark={dark} />
                <TextInput value={body} onChangeText={setBody}
                  placeholder="Any additional info..." placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'}
                  multiline numberOfLines={3}
                  style={[inp, { textAlignVertical: 'top', height: 80 }]} />

                <ErrBanner msg={err} />
                <PrimaryButton label={isEdit ? 'Save Changes' : 'Post Notification'} onPress={handleSubmit} />
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BackBtn({ onPress, ts }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{ color: ts, fontSize: 13, fontWeight: '600' }}>‹ Back</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,15,74,0.5)' },
  sheet:    { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, paddingBottom: 40, maxHeight: '92%' },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, opacity: 0.4 },
  heading:  { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  typeRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  typeLabel:{ fontSize: 14, fontWeight: '700' },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  subjectList: { marginBottom: 12 },
  subjectItem: { padding: 11, borderRadius: 10, borderWidth: 1.5, marginBottom: 7 },
  lecRow:   { flexDirection: 'row', gap: 6, marginBottom: 12 },
  lecBtn:   { flex: 1, padding: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  lecBtnN:  { fontSize: 12, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  badge:    { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3, borderWidth: 1 },
  badgeText:{ fontSize: 11, fontWeight: '700' },
});
