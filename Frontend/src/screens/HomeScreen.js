import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../constants/colors';
import { SS } from '../constants/colors';
import { DEPT_MAP, DEPT_MAX_SEM, DEPT_FLOOR_ROOMS, FALLBACK_LECTURE_SLOTS, ISSUE_CATEGORIES, can } from '../constants/config';
import { getAiServerUrl } from '../constants/network';
import { toMin, getFullRoomStatus, getRoomTimetableSlots } from '../utils/helpers';
import { fsAdd, fsDelete, fsList, fsSet, fsUpdate, getAuthTokens } from '../firebase/firestore';
import ArcMap from '../components/map/ArcMap';
import { COMSATSLogo } from '../components/ui';
import { SCHEDULE_MODES } from '../hooks/useScheduleMode';
import TimetableAdminPanel from '../components/TimetableAdminPanel';
import SearchClass from '../components/SearchClass';


export default function HomeScreen({
  user, dark, now, timetable, lectureSlots, lectureSlotsByDepartmentSemester,
  timetableDocuments = [], timetableManifest,
  arrangedClasses, cancelledSlots,
  ttMeta, onTTUploaded, isGuest,
  schedule, examTimetable, officeTarget, onOfficeTargetHandled,
}) {
  const [selectedDepartment, setSelectedDepartment] = useState('cs');
  const [selRoom, setSelRoom] = useState(null);
  const [showTT, setShowTT] = useState(false);
  const [issueReports, setIssueReports] = useState([]);
  const [officeFocus, setOfficeFocus] = useState(null);
  const [teacherDocs, setTeacherDocs] = useState([]);
  const [officeRoom, setOfficeRoom] = useState(null);
  const [officeSearch, setOfficeSearch] = useState('');
  const [officeSaving, setOfficeSaving] = useState(false);
  const [officeError, setOfficeError] = useState('');

  const roomDepartment = (roomId) => {
    const room = String(roomId || '').trim();
    if (!room) return 'cs';
    if (/^(Electric|Computer Lab|DLD\/MP|Communication|Electronics\/ECA|Physics|Control System|Embedded System|Industrial Electronics|Research|Final Year Project|Seminar Hall|EE\s+Com\s+Lab|EE\s+DLD\s+Lab|ECA\s+Lab|EM\s+Lab|IE\s+Lab)/i.test(room)) return 'ee';
    if (/^(Lecture Hall|Class Room|LH\s*\d|CR\s*\d)/i.test(room)) return 'math';
    if (/^(LT|Lab)/i.test(room)) return 'cs';
    return 'cs';
  };

  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const cur = now.getHours() * 60 + now.getMinutes();
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const cardBg = dark ? '#12123A' : '#FFFFFF';
  const currentMode = schedule?.mode || 'regular';
  const modeInfo = schedule?.modeInfo || SCHEDULE_MODES.regular;
  const isRegular = currentMode === 'regular';
  const isHoliday = currentMode === 'holiday';
  const isExam = currentMode === 'exam';
  const activeTimetable = isExam ? (examTimetable?.timetables || {}) : timetable;
  const visibleTimetable = isHoliday ? {} : activeTimetable;
  const activeLectureSlots = isExam
    ? (examTimetable?.lectureSlots || slots)
    : slots;

  useEffect(() => {
    let active = true;
    fsList('teachers').then(docs => { if (active) setTeacherDocs(docs); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fsList('issue_reports').then(async reports => {
      const nowMs = Date.now();
      const expired = reports.filter(r => r.status === 'completed' && r.completedAt && nowMs - new Date(r.completedAt).getTime() >= 86400000);
      await Promise.all(expired.map(r => r._docId ? fsDelete(`issue_reports/${r._docId}`).catch(() => {}) : null));
      if (active) setIssueReports(reports.filter(r => !expired.includes(r)));
    });
    return () => { active = false; };
  }, [user?.email, user?.uid]);

  const viewerId = user?.uid || user?.email || '';
  const visibleIssueReports = issueReports.filter(report =>
    report.status === 'acknowledged' || report.status === 'completed'
      || user?.type === 'staff'
      || report.reporterId === viewerId
  );
  const markerReports = visibleIssueReports.filter(report =>
    report.status !== 'pending' || user?.type === 'staff' || report.reporterId === viewerId
  );
  const reportedIssues = Object.fromEntries(
    Object.entries(markerReports.reduce((groups, report) => {
      (groups[report.roomId] ||= []).push(report);
      return groups;
    }, {})).map(([roomId, reports]) => [
      roomId,
      reports.every(report => report.status === 'completed') ? 'completed' : 'active',
    ])
  );

  async function createIssueReport(report) {
    const created = {
      ...report,
      reporterId: viewerId,
      reporterName: user?.fullName || user?.name || user?.email || 'User',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    const id = await fsAdd('issue_reports', created);
    setIssueReports(current => [...current, { ...created, _docId: id }]);
  }

  async function updateIssueReport(report, status) {
    const patch = { status };
    if (status === 'acknowledged') patch.acknowledgedAt = new Date().toISOString();
    if (status === 'completed') patch.completedAt = new Date().toISOString();
    await fsUpdate(`issue_reports/${report._docId}`, patch);
    setIssueReports(current => current.map(item => item._docId === report._docId ? { ...item, ...patch } : item));
  }

  async function deleteIssueReport(report) {
    await fsDelete(`issue_reports/${report._docId}`);
    setIssueReports(current => current.filter(item => item._docId !== report._docId));
  }

  const floorHasActive = (f) =>
    (DEPT_FLOOR_ROOMS[department]?.[f] || []).some(id => {
      const st = getFullRoomStatus(id, now, visibleTimetable, arrangedClasses, cancelledSlots, activeLectureSlots).status;
      return st === 'mine' || st === 'arranged';
    });

  const selectedRoomStatus = selRoom
    ? getFullRoomStatus(selRoom, now, visibleTimetable, arrangedClasses, cancelledSlots, activeLectureSlots)
    : null;

  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const todayClasses = Object.values(visibleTimetable || {})
    .flat()
    .filter(s => s?.isMine && s.day === dayName)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const currentClass = todayClasses.find(s => cur >= toMin(s.start) && cur < toMin(s.end));
  const currentClassDepartment = currentClass?.room ? roomDepartment(currentClass.room) : null;
  const department = officeFocus?.department || currentClassDepartment || selectedDepartment || 'cs';
  const availableFloors = Object.keys(DEPT_FLOOR_ROOMS[department] || { 1: [] }).map(Number).sort((a, b) => a - b);
  const [floor, setFloor] = useState(availableFloors[0] || 1);

  useEffect(() => {
    const target = officeTarget;
    if (!target?.roomId || !target?.department) return;
    setOfficeFocus({ ...target });
    setSelectedDepartment(target.department);
    setFloor(Number(target.floor) || 1);
    setSelRoom(null);
    onOfficeTargetHandled?.();
  }, [officeTarget?.key]);

  useEffect(() => {
    if (!availableFloors.includes(floor)) {
      setFloor(availableFloors[0] || 1);
    }
  }, [department, availableFloors, floor]);

  const officeTeachers = officeRoom ? teacherDocs.filter(teacher =>
    teacher.office?.department === officeRoom.department
      && Number(teacher.office?.floor) === Number(officeRoom.floor)
      && teacher.office?.roomId === officeRoom.roomId) : [];
  const officeCandidates = teacherDocs.filter(teacher =>
    String(teacher.name || '').toLocaleLowerCase().includes(officeSearch.trim().toLocaleLowerCase())
      && !officeTeachers.some(assigned => assigned._docId === teacher._docId));
  const nextClass = todayClasses.find(s => toMin(s.start) > cur);
  const roomLabel = (slot) => slot?.room ? ` · ${slot.room}` : '';

  function handleMapRoomPress({ roomId, room } = {}) {
    if (!roomId) return;
    setOfficeFocus(null);
    const officeRoomType = room?.type === 'office' && !/(lab|conference|common room)/i.test(`${room.id} ${room.label || ''}`);
    if (officeRoomType) {
      setOfficeError(''); setOfficeSearch('');
      setOfficeRoom({ roomId, label: room.label || roomId, department, floor: Number(floor) });
      return;
    }
    setSelRoom(roomId);
  }

  async function assignTeacherOffice(teacher) {
    if (!teacher?._docId || !officeRoom) return;
    setOfficeSaving(true); setOfficeError('');
    const office = { department: officeRoom.department, floor: Number(officeRoom.floor), roomId: officeRoom.roomId, label: officeRoom.label };
    try {
      await fsUpdate(`teachers/${encodeURIComponent(teacher._docId)}`, { office });
      setTeacherDocs(current => current.map(item => item._docId === teacher._docId ? { ...item, office } : item));
      setOfficeSearch('');
    } catch (error) {
      fsList('teachers').then(setTeacherDocs);
      setOfficeError(error.message || 'Could not assign this office.');
    } finally { setOfficeSaving(false); }
  }

  async function removeTeacherOffice(teacher) {
    if (!teacher?._docId) return;
    setOfficeSaving(true); setOfficeError('');
    try {
      await fsUpdate(`teachers/${encodeURIComponent(teacher._docId)}`, { office: null });
      setTeacherDocs(current => current.map(item => item._docId === teacher._docId ? { ...item, office: null } : item));
    } catch (error) {
      fsList('teachers').then(setTeacherDocs);
      setOfficeError(error.message || 'Could not remove this office assignment.');
    } finally { setOfficeSaving(false); }
  }

  const statusMessage = isHoliday
    ? 'Currently Holiday'
    : currentClass
      ? `In session: ${currentClass.subject} (${currentClass.start}-${currentClass.end})${roomLabel(currentClass)}`
      : nextClass
        ? `Next class: ${nextClass.subject} at ${nextClass.start}${roomLabel(nextClass)}`
        : 'No more classes today';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>

        {/* Top header */}
        <View style={[styles.homeHeader, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
          <View style={styles.homeHeaderTopRow}>
            <COMSATSLogo size={46} />
            <View style={{ flex: 1 }}>
              <Text style={styles.homeHeaderTitle}>COMSATS · ATTOCK</Text>
              <Text style={styles.homeHeaderSub}>
                {user?.type === 'staff'
                  ? `Staff${user?.email ? ` · ${user.email.split('@')[0]}` : ''}`
                  : `${user?.type ? `${user.type.charAt(0).toUpperCase()}${user.type.slice(1)}` : 'User'} · Sem ${user?.semester || '-'}${user?.email ? ` · ${user.email.split('@')[0]}` : ''}`}
              </Text>
            </View>
          </View>

          <Text style={styles.homeHeaderDate}>{dateLabel}</Text>
          <Text style={styles.homeHeaderTime}>{timeLabel}</Text>

          {!isGuest && (
            <View style={styles.homeHeaderStatusPill}>
              <Text style={styles.homeHeaderStatusText}>{statusMessage}</Text>
            </View>
          )}
        </View>

        {/* Floor selector */}
        <View style={[styles.floorBar, { backgroundColor: cardBg, borderBottomColor: bdr }]}>
          <View style={styles.floorBarTop}>
            <Text style={[styles.mapTitle, { color: tp }]}>Live Floor Map</Text>
            <Text style={[styles.departmentLabel, { color: ts }]}>{DEPT_MAP[department] || department}</Text>
          </View>
          <View style={styles.floorControls}>
            <View style={styles.floorBtns}>
            {availableFloors.map(f => {
              const active = floor === f;
              const hasBadge = floorHasActive(f) && !active;
              return (
                <View key={f} style={{ position: 'relative' }}>
                  <TouchableOpacity
                    onPress={() => { setOfficeFocus(null); setFloor(f); }}
                    style={[styles.floorBtn, active && styles.floorBtnActive]}>
                    <Text style={[styles.floorBtnText, active && styles.floorBtnTextActive]}>F{f}</Text>
                  </TouchableOpacity>
                  {hasBadge && (
                    <View style={styles.floorBadge}>
                      <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>!</Text>
                    </View>
                  )}
                </View>
              );
            })}
            </View>
            <View style={styles.departmentToggleRow}>
            {Object.keys(DEPT_FLOOR_ROOMS).map((dept) => {
              const active = department === dept;
              return (
                <TouchableOpacity
                  key={dept}
                  onPress={() => { setOfficeFocus(null); setSelectedDepartment(dept); }}
                  style={[styles.departmentChip, active && styles.departmentChipActive]}
                >
                  <Text style={[styles.departmentChipText, active && styles.departmentChipTextActive]}>{dept.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
            </View>
          </View>
        </View>

        {/* Map */}
        <View style={[styles.mapCard, { backgroundColor: cardBg, borderColor: bdr }]}>
          <ArcMap
            floor={floor} dark={dark} timetable={visibleTimetable} now={now}
            arrangedClasses={arrangedClasses} cancelledSlots={cancelledSlots}
            lectureSlots={activeLectureSlots} mode={currentMode}
            onRoomPress={handleMapRoomPress} department={department} reportedIssues={reportedIssues}
            focusedRoomId={officeFocus?.department === department && Number(officeFocus?.floor) === Number(floor) ? officeFocus.roomId : null}
          />
        </View>

        <Text style={[styles.mapHint, { color: ts }]}>Tap a room for details</Text>

        {/* Legend */}
        <View style={styles.legend}>
          {Object.entries(SS).map(([key, s]) => {
            const c = s[dark ? 'd' : 'l'];
            return (
              <View key={key} style={[styles.legendItem, { backgroundColor: c.bg, borderColor: c.bd }]}>
                <View style={[styles.legendDot, { backgroundColor: c.dt }]} />
                <Text style={[styles.legendText, { color: c.tx }]}>{c.lb}</Text>
              </View>
            );
          })}
        </View>

        {/* Timetable button — reflects the active mode's own timetable */}
        {!isGuest && (isRegular || isExam) && (
          <TouchableOpacity
            onPress={() => setShowTT(true)}
            style={[styles.ttBtn, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: dark ? '#3D2B8E' : '#C4B5FD' }]}>
            <Text style={{ fontSize: 16 }}>📋</Text>
            <Text style={[styles.ttBtnText, { color: ts }]}>{isExam ? 'View Exam Timetable' : 'View Weekly Timetable'}</Text>
            <Text style={{ color: ts, marginLeft: 'auto' }}>›</Text>
          </TouchableOpacity>
        )}

        {/* Search Class — filter the active timetable (all logged-in roles) */}
        {!isGuest && (isRegular || isExam) && (
          <SearchClass dark={dark} timetable={visibleTimetable} lectureSlots={activeLectureSlots} now={now} mode={currentMode} />
        )}

        {/* Admin: TT Upload */}
        {can.uploadTimetable(user) && (
          <AdminTTUpload dark={dark} ttMeta={ttMeta} examTimetable={examTimetable} mode={currentMode} onUploaded={onTTUploaded} />
        )}
        {user?.type === 'staff' && (
          <TimetableAdminPanel
            dark={dark} user={user} mode={currentMode}
            documents={isExam ? (examTimetable?.rawDocuments || []) : timetableDocuments}
            manifest={isExam ? (examTimetable?.manifest || null) : timetableManifest}
            onSaved={onTTUploaded}
          />
        )}

      </ScrollView>

      {/* Office details and Staff assignment */}
      <Modal visible={!!officeRoom} transparent animationType="slide" onRequestClose={() => !officeSaving && setOfficeRoom(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !officeSaving && setOfficeRoom(null)} />
        <View style={[styles.officeModal, { backgroundColor: cardBg, borderTopColor: bdr }]}>
          <View style={[styles.handle, { backgroundColor: ts }]} />
          <Text style={{ color: tp, fontSize: 18, fontWeight: '800' }}>Office details</Text>
          <Text style={{ color: ts, fontSize: 12, marginTop: 5 }}>{officeRoom?.label} ({officeRoom?.roomId}) · {DEPT_MAP[officeRoom?.department] || officeRoom?.department} · Floor {officeRoom?.floor}</Text>
          {!!officeError && <Text style={{ color: '#DC2626', fontSize: 12, marginTop: 8 }}>{officeError}</Text>}
          <Text style={{ color: tp, fontSize: 13, fontWeight: '800', marginTop: 16, marginBottom: 4 }}>Assigned teachers</Text>
          <ScrollView style={{ maxHeight: user?.type === 'staff' ? 180 : 330 }}>
            {officeTeachers.map(teacher => (
              <View key={teacher._docId || teacher.name} style={[styles.officeTeacherRow, { borderBottomColor: bdr }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: tp, fontSize: 14, fontWeight: '700' }}>{teacher.name}</Text>
                  <Text style={{ color: ts, fontSize: 11 }}>{teacher.department || 'Department not set'}{teacher.position ? ` · ${teacher.position}` : ''}</Text>
                </View>
                {user?.type === 'staff' && <TouchableOpacity disabled={officeSaving} onPress={() => removeTeacherOffice(teacher)}>
                  <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '800' }}>{officeSaving ? '…' : 'Remove'}</Text>
                </TouchableOpacity>}
              </View>
            ))}
            {!officeTeachers.length && <Text style={{ color: ts, paddingVertical: 10 }}>No teachers are assigned to this office yet.</Text>}
          </ScrollView>
          {user?.type === 'staff' && <>
            <Text style={{ color: tp, fontSize: 13, fontWeight: '800', marginTop: 14 }}>Add a teacher</Text>
            <TextInput value={officeSearch} onChangeText={setOfficeSearch} placeholder="Search teacher" placeholderTextColor={ts}
              style={[styles.officeSearch, { backgroundColor: bg, color: tp, borderColor: bdr }]} />
            <ScrollView style={{ maxHeight: 190 }} keyboardShouldPersistTaps="handled">
              {officeCandidates.map(teacher => (
                <TouchableOpacity key={teacher._docId || teacher.name} disabled={officeSaving} onPress={() => assignTeacherOffice(teacher)} style={[styles.officeTeacherRow, { borderBottomColor: bdr }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: tp, fontSize: 14, fontWeight: '700' }}>{teacher.name}</Text>
                    <Text style={{ color: ts, fontSize: 11 }}>{teacher.department || 'Department not set'}{teacher.position ? ` · ${teacher.position}` : ''}</Text>
                  </View>
                  <Text style={{ color: C.purple, fontWeight: '800' }}>{officeSaving ? '…' : 'Assign'}</Text>
                </TouchableOpacity>
              ))}
              {!teacherDocs.length && <Text style={{ color: ts, paddingVertical: 10 }}>No teachers found. Add teachers to the directory first.</Text>}
              {!!teacherDocs.length && !officeCandidates.length && <Text style={{ color: ts, paddingVertical: 10 }}>No unassigned teachers match this search.</Text>}
            </ScrollView>
          </>}
          <TouchableOpacity onPress={() => setOfficeRoom(null)} disabled={officeSaving} style={[styles.officeClose, { backgroundColor: dark ? '#27204A' : '#EEEAFB' }]}>
            <Text style={{ color: ts, fontWeight: '700' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Room popup */}
      {selRoom && selectedRoomStatus && (
        <RoomPopup
          roomId={selRoom} status={selectedRoomStatus} dark={dark}
          timetable={visibleTimetable} now={now} slots={activeLectureSlots} mode={currentMode}
          user={user} issueReports={visibleIssueReports}
          onCreateIssue={createIssueReport} onUpdateIssue={updateIssueReport} onDeleteIssue={deleteIssueReport}
          onClose={() => setSelRoom(null)}
        />
      )}

      {/* Timetable modal */}
      {showTT && (
        <TimetableModal
          dark={dark} timetable={visibleTimetable}
          mode={currentMode}
          semester={user?.type === 'staff' ? null : (user?.semester || 7)}
          department={user?.type === 'staff' ? '' : user?.dept}
          user={user}
          lectureSlotsByDepartmentSemester={lectureSlotsByDepartmentSemester}
          ttMeta={isExam ? (examTimetable?.meta || null) : ttMeta}
          onClose={() => setShowTT(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Room Popup ───────────────────────────────────────────────────────────
function RoomPopup({ roomId, status, dark, timetable, now, slots, mode = 'regular', user, issueReports = [], onCreateIssue, onUpdateIssue, onDeleteIssue, onClose }) {
  const { status: st, slot, issue } = status;
  const c = SS[st][dark ? 'd' : 'l'];
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const bg = dark ? '#12123A' : '#FFFFFF';
  const [category, setCategory] = useState('');
  const [details, setDetails] = useState('');
  const [savingIssue, setSavingIssue] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showNextClass, setShowNextClass] = useState(false);
  const isLab = /lab/i.test(roomId);
  const categories = isLab ? ISSUE_CATEGORIES.lab : ISSUE_CATEGORIES.room;
  const roomIssues = issueReports.filter(report => report.roomId === roomId);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const curM = now.getHours() * 60 + now.getMinutes();
  const next = getRoomTimetableSlots(roomId, timetable)
    .filter(s => s.day === day && toMin(s.start) > curM)
    .sort((a, b) => toMin(a.start) - toMin(b.start))[0];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <ScrollView style={[styles.popup, { backgroundColor: bg, borderTopColor: bdr }]} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.handle, { backgroundColor: ts }]} />
        <View style={styles.popupHeader}>
          <View style={[styles.roomBadge, { backgroundColor: c.bg, borderColor: c.bd }]}>
            <Text style={[styles.roomBadgeText, { color: c.tx }]}>{roomId}</Text>
          </View>
          <View>
            <Text style={[styles.roomId, { color: tp }]}>{roomId}</Text>
            <View style={[styles.statusPill, { backgroundColor: c.bg, borderColor: c.bd }]}>
              <Text style={[styles.statusText, { color: c.tx }]}>{c.lb}</Text>
            </View>
          </View>
        </View>
        {issue && (
          <View style={styles.issueBox}>
            <Text style={styles.issueText}>⚠️ {issue}</Text>
          </View>
        )}
        {slot ? (
          [['Subject', slot.subject], ['Professor', slot.prof], ['Class', `${String(slot.dept || slot._dept || slot.department || 'Department not specified').toUpperCase()} ${(slot.semester ?? slot.sem) ? `Semester ${slot.semester ?? slot.sem}` : 'Semester not specified'}`], ['Time', `${slot.start} – ${slot.end}`]].map(([l, v]) => (
            <View key={l} style={[styles.infoRow, { borderBottomColor: bdr }]}>
              <Text style={{ fontSize: 13, color: ts }}>{l}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: tp }}>{v}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: ts, fontSize: 14, marginBottom: 8 }}>
            {mode === 'holiday' ? 'Currently Holiday — no timetable is active.' : mode === 'exam' ? 'No exam scheduled in this slot.' : 'No class right now.'}
          </Text>
        )}
        {next && (
          <View style={[styles.nextBox, { backgroundColor: dark ? '#1A1A3E' : '#F0EEFF', borderColor: bdr }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.nextLabel, { color: ts }]}>Next class today</Text>
              <TouchableOpacity onPress={() => setShowNextClass(value => !value)} hitSlop={8}>
                <Text style={{ color: C.purple, fontSize: 11, fontWeight: '800' }}>{showNextClass ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {showNextClass && <>
              <Text style={{ fontSize: 13, fontWeight: '600', color: tp, marginTop: 5 }}>{next.subject} — {next.start}</Text>
              <Text style={{ fontSize: 12, color: ts }}>{next.prof}</Text>
              <Text style={{ fontSize: 11, color: ts, marginTop: 3 }}>
                {`${String(next.dept || next._dept || next.department || 'Department not specified').toUpperCase()} ${(next.semester ?? next.sem) ? `Semester ${next.semester ?? next.sem}` : 'Semester not specified'}`}
              </Text>
            </>}
          </View>
        )}
        {user && (
          <View style={[styles.reportSection, { borderTopColor: bdr }]}> 
            <Text style={[styles.reportTitle, { color: tp }]}>Issue Reports</Text>

            {roomIssues.length > 0 && roomIssues.map(report => {
              const categoryLabel = categories.find(item => item.key === report.category)?.label || report.category;
              const staff = user.type === 'staff';
              return (
                <View key={report._docId} style={[styles.reportCard, { backgroundColor: dark ? '#1A1A3E' : '#F4F7FF', borderColor: report.status === 'pending' ? '#93C5FD' : '#60A5FA' }]}> 
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[styles.reportCategory, { color: tp }]}>{categoryLabel}</Text>
                    <Text style={[styles.reportStatus, { color: report.status === 'completed' ? '#15803D' : report.status === 'acknowledged' ? '#1D4ED8' : '#B45309' }]}>
                      {report.status === 'completed' ? '✓ Completed' : report.status === 'acknowledged' ? 'Acknowledged' : 'Pending review'}
                    </Text>
                  </View>
                  {!!report.details && <Text style={{ color: ts, fontSize: 11, marginTop: 4 }}>{report.details}</Text>}
                  {staff && (
                    <View style={styles.reportActions}>
                      {report.status === 'pending' && <TouchableOpacity onPress={() => onUpdateIssue(report, 'acknowledged')} style={[styles.reportAction, { backgroundColor: '#DBEAFE' }]}><Text style={{ color: '#1D4ED8', fontSize: 10, fontWeight: '800' }}>Acknowledge</Text></TouchableOpacity>}
                      {report.status !== 'completed' && <TouchableOpacity onPress={() => onUpdateIssue(report, 'completed')} style={[styles.reportAction, { backgroundColor: '#DCFCE7' }]}><Text style={{ color: '#15803D', fontSize: 10, fontWeight: '800' }}>Completed</Text></TouchableOpacity>}
                      <TouchableOpacity onPress={() => onDeleteIssue(report)} style={[styles.reportAction, { backgroundColor: '#FEE2E2' }]}><Text style={{ color: '#B91C1C', fontSize: 10, fontWeight: '800' }}>Delete</Text></TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {!showReportForm ? (
              <TouchableOpacity onPress={() => setShowReportForm(true)} style={styles.reportIssueButton}>
                <Text style={styles.reportIssueButtonText}>Report Issue</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.reportForm, { backgroundColor: dark ? '#0A0A1E' : '#F8FAFF', borderColor: bdr }]}> 
                <Text style={[styles.reportFormLabel, { color: ts }]}>Report a problem in this room</Text>
                <Text style={[styles.reportNotice, { color: ts }]}>Please report only genuine problems. False reports may affect campus support.</Text>
                <View style={styles.categoryRow}>
                  {categories.map(item => (
                    <TouchableOpacity key={item.key} onPress={() => setCategory(item.key)} style={[styles.categoryChip, { borderColor: category === item.key ? '#2563EB' : bdr, backgroundColor: category === item.key ? '#DBEAFE' : bg }]}> 
                      <Text style={{ color: category === item.key ? '#1D4ED8' : ts, fontSize: 10, fontWeight: '700' }}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={details} onChangeText={setDetails} multiline placeholder="Add details (optional)" placeholderTextColor={dark ? '#94A3B8' : '#94A3B8'} style={[styles.reportInput, { color: tp, borderColor: bdr }]} />
                <View style={styles.reportFormActions}>
                  <TouchableOpacity onPress={() => setShowReportForm(false)} style={styles.cancelReportButton}>
                    <Text style={styles.cancelReportText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={!category || savingIssue}
                    onPress={async () => {
                      setSavingIssue(true);
                      try {
                        await onCreateIssue({ roomId, category, details: details.trim(), date: new Date().toISOString().slice(0, 10), slotStart: slot?.start || '', subject: slot?.subject || '' });
                        setCategory(''); setDetails(''); setShowReportForm(false);
                      } finally { setSavingIssue(false); }
                    }}
                    style={[styles.submitReport, { backgroundColor: category ? '#2563EB' : '#94A3B8' }]}
                  >
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{savingIssue ? 'Submitting...' : 'Submit Report'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
        <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: C.purple }]}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ─── Timetable Modal ──────────────────────────────────────────────────────
function TimetableModal({ dark, timetable, mode = 'regular', semester, department, user, lectureSlotsByDepartmentSemester, ttMeta, onClose }) {
  const isStaff = user?.type === 'staff';
  const isExamView = mode === 'exam';
  const [staffDept, setStaffDept] = useState('');
  const [staffSemester, setStaffSemester] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const cardBg = dark ? '#1A1A3E' : '#FFFFFF';
  const targetSemester = isStaff ? (staffSemester ? Number(staffSemester) : null) : Number(semester || 7);
  const targetDepartment = isStaff ? staffDept : String(department || '').toLowerCase();
  const allSlots = Object.values(timetable || {}).flat().filter(slot => slot.day);
  const personalTimetableViewer = user?.type === 'student' || user?.type === 'teacher';
  const baseSlots = allSlots.filter(slot =>
    (!targetSemester || Number(slot.sem) === targetSemester)
    && (!targetDepartment || String(slot.dept || slot._dept || '').toLowerCase() === targetDepartment)
  );
  const staffHasTarget = !isStaff || Boolean(selectedTeacher || (staffDept && staffSemester));
  const matchingSlots = staffHasTarget ? baseSlots.filter(slot =>
    (!selectedTeacher || String(slot.prof || slot.teacher || '') === selectedTeacher)
    // Exam entries carry no per-user `mine` flag; dept/semester already scoped them.
    && (isExamView || !personalTimetableViewer || Boolean(slot.isMine ?? slot.mine))
  ) : [];
  const departmentSemesterKey = targetDepartment && targetSemester ? `${targetDepartment}_sem${targetSemester}` : '';
  const slots = lectureSlotsByDepartmentSemester?.[departmentSemesterKey] || {};
  const slotReference = Object.entries(slots).length
    ? Object.entries(slots).map(([number, value]) => [number, value])
    : [...new Map(matchingSlots.map(slot => [
      `${Number(slot.lectureNum ?? slot.n)}|${slot.start || ''}|${slot.end || ''}`,
      [String(Number(slot.lectureNum ?? slot.n)), { start: slot.start || '', end: slot.end || '' }],
    ])).values()];
  const teacherOptions = Array.from(new Set(baseSlots.map(slot => String(slot.prof || slot.teacher || '').trim()).filter(Boolean)))
    .filter(name => !teacherSearch || name.toLocaleLowerCase().includes(teacherSearch.trim().toLocaleLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const rowsByDay = {};

  // Build the weekly view from the same Firestore roomMap data used by ArcMap.
  for (const slot of matchingSlots) {
    const lectureNum = Number(slot.lectureNum ?? slot.n);
    if (!rowsByDay[slot.day]) rowsByDay[slot.day] = [];
    rowsByDay[slot.day].push({
      ...slot,
      n: lectureNum,
      start: slot.start,
      end: slot.end,
      subject: slot.subject,
      prof: slot.prof || slot.teacher,
      room: slot.room || Object.entries(timetable || {}).find(([, list]) => list?.includes(slot))?.[0] || '',
      mine: Boolean(slot.isMine ?? slot.mine),
    });
  }
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Exam timetable days may be real dates; order them chronologically, then
  // fall back to weekday order, then first appearance.
  const examDayRank = day => {
    const weekday = dayOrder.indexOf(day);
    if (weekday >= 0) return { rank: 1, key: weekday };
    const time = Date.parse(day);
    if (!Number.isNaN(time)) return { rank: 0, key: time };
    return { rank: 2, key: 0 };
  };
  const displayRows = Object.entries(rowsByDay)
    .sort(([dayA], [dayB]) => {
      if (!isExamView) return dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
      const a = examDayRank(dayA);
      const b = examDayRank(dayB);
      return (a.rank - b.rank) || (a.key - b.key);
    })
    .map(([day, daySlots]) => ({
      day,
      slots: daySlots.sort((a, b) => (a.n - b.n) || String(a.start).localeCompare(String(b.start)) || a.room.localeCompare(b.room)),
    }));

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.ttModal, { backgroundColor: cardBg, borderTopColor: bdr }]}>
        {/* Header */}
        <View style={[styles.ttHeader, { backgroundColor: C.purple }]}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>{isStaff ? (isExamView ? 'STAFF EXAM VIEW' : 'STAFF TIMETABLE VIEW') : `BS ${String(targetDepartment).toUpperCase()} · SEM ${targetSemester}${isExamView ? ' · EXAM' : ''}`}</Text>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{isExamView ? 'Exam Timetable' : 'Weekly Timetable'}</Text>
            {ttMeta?.effectiveDate && (
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>w.e.f {ttMeta.effectiveDate}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.ttCloseBtn}>
            <Text style={{ color: '#fff', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
        {isStaff && <View style={{ paddingHorizontal: 12, paddingTop: 10, backgroundColor: bg }}>
          <Text style={{ color: tp, fontSize: 11, fontWeight: '800', marginBottom: 6 }}>Department</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[['', 'All'], ...Object.entries(DEPT_MAP)].map(([key, label]) => (
              <TouchableOpacity key={key || 'all'} onPress={() => { setStaffDept(key); setStaffSemester(''); setSelectedTeacher(''); setTeacherSearch(''); }} style={{ borderWidth: 1, borderColor: staffDept === key ? C.purple : bdr, backgroundColor: staffDept === key ? '#EDE9FF' : cardBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 }}>
                <Text style={{ color: staffDept === key ? C.purple : ts, fontSize: 10, fontWeight: '700' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <>
            <Text style={{ color: tp, fontSize: 11, fontWeight: '800', marginTop: 9, marginBottom: 6 }}>Semester</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[['', 'All'], ...Array.from({ length: staffDept ? (DEPT_MAX_SEM[staffDept] || 8) : 8 }, (_, i) => [String(i + 1), `Sem ${i + 1}`])].map(([key, label]) => (
                <TouchableOpacity key={key || 'all'} onPress={() => { setStaffSemester(key); setSelectedTeacher(''); setTeacherSearch(''); }} style={{ borderWidth: 1, borderColor: staffSemester === key ? C.purple : bdr, backgroundColor: staffSemester === key ? '#EDE9FF' : cardBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 }}>
                  <Text style={{ color: staffSemester === key ? C.purple : ts, fontSize: 10, fontWeight: '700' }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
          <TextInput value={teacherSearch} onChangeText={value => { setTeacherSearch(value); setSelectedTeacher(''); }} placeholder="Search teacher name" placeholderTextColor={ts} style={{ color: tp, borderWidth: 1, borderColor: bdr, backgroundColor: cardBg, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginTop: 9, fontSize: 11 }} />
          {!!teacherSearch && <ScrollView style={{ maxHeight: 110 }} keyboardShouldPersistTaps="handled">
            {teacherOptions.map(name => <TouchableOpacity key={name} onPress={() => { setSelectedTeacher(name); setTeacherSearch(name); }} style={{ paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: bdr }}>
              <Text style={{ color: tp, fontSize: 11 }}>{name}</Text>
            </TouchableOpacity>)}
            {!teacherOptions.length && <Text style={{ color: ts, fontSize: 10, paddingVertical: 6 }}>No matching teacher names</Text>}
          </ScrollView>}
          {!!selectedTeacher && <TouchableOpacity onPress={() => { setSelectedTeacher(''); setTeacherSearch(''); }}><Text style={{ color: C.purple, fontSize: 10, marginTop: 5 }}>Clear teacher filter · {selectedTeacher}</Text></TouchableOpacity>}
        </View>}
        {/* Lecture time reference */}
        {!isExamView && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: C.purpleDark, paddingVertical: 6, paddingHorizontal: 10, flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ alignItems: 'center' }}>
          {slotReference.sort(([a], [b]) => Number(a) - Number(b)).map(([n, sl], index) => (
            <View key={`${n}-${sl.start}-${sl.end}-${index}`} style={styles.slotChip}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>L{n}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 8 }}>{sl.start}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 8 }}>{sl.end}</Text>
            </View>
          ))}
        </ScrollView>
        )}
        {/* Body */}
        <ScrollView style={{ flex: 1, backgroundColor: bg }}>
          {isStaff && !staffHasTarget ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>🔎</Text>
              <Text style={{ fontSize: 13, color: ts, textAlign: 'center' }}>Choose a department and semester, or search and select a teacher, to load matching classes.</Text>
            </View>
          ) : displayRows.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
              <Text style={{ fontSize: 13, color: ts }}>{isStaff ? 'No classes match the selected filters.' : isExamView ? 'No exam timetable has been uploaded yet' : 'Timetable loads from Firebase'}</Text>
              {!isStaff && !isExamView && <Text style={{ fontSize: 11, color: ts, marginTop: 6, opacity: 0.7 }}>Upload a timetable PDF to see it here</Text>}
            </View>
          ) : displayRows.map(({ day, slots: daySlots }, idx) => (
            <View key={day || idx} style={{ padding: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: tp, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{day}</Text>
              {(daySlots || []).map((s, i) => {
                const accent = isExamView ? '#DC2626' : (s.mine ? '#EF4444' : C.purple);
                const badgeColor = isExamView ? '#B91C1C' : (s.mine ? '#B91C1C' : C.purple);
                return (
                  <View key={i} style={[styles.ttRow, { backgroundColor: cardBg, borderColor: bdr, borderLeftColor: accent }]}>
                    <View style={[styles.ttLecBadge, { backgroundColor: isExamView || s.mine ? '#FEE2E2' : '#EDE9FF', borderColor: accent }]}>
                      {isExamView ? (
                        <>
                          <Text style={{ fontSize: 8, fontWeight: '800', color: badgeColor }}>{s.start}</Text>
                          <Text style={{ fontSize: 7, color: badgeColor, opacity: 0.8 }}>{s.end}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: badgeColor }}>L{s.n}</Text>
                          <Text style={{ fontSize: 7, color: badgeColor, opacity: 0.8 }}>{s.start}–{s.end}</Text>
                        </>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: tp }}>{s.subject}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: ts, marginTop: 2 }}>
                        {String(s._dept || s.dept || '').toUpperCase()} · Semester {s.sem || targetSemester || '—'}
                      </Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={{ fontSize: 10, color: ts }}>{s.prof}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: s.mine ? '#B91C1C' : C.purple }}>{s.room}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Admin TT Upload ──────────────────────────────────────────────────────
function AdminTTUpload({ dark, ttMeta, examTimetable, mode, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState('');

  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const ib = dark ? '#0A0A1E' : '#F8F7FF';
  const cardBg = dark ? '#12123A' : '#FFFFFF';
  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setUploading(true); setStatus(null); setProgress('📤 Sending PDF...');
    try {
      // Convert file URI to blob for proper multipart handling
      const fileBlob = await fetch(file.uri).then(res => res.blob());

      const formData = new FormData();
      formData.append('pdf', fileBlob, file.name);
      formData.append('version', `v${new Date().toLocaleDateString('en-GB')}`);
      formData.append('effectiveDate', new Date().toISOString().split('T')[0]);
      formData.append('scheduleMode', mode === 'exam' ? 'exam' : 'regular');

      const { idToken } = getAuthTokens();
      if (!idToken) throw new Error('Please sign in again before uploading.');

      setProgress('🔍 Extracting timetable cells with Python layout rules...');

      const response = await fetch(`${getAiServerUrl()}/upload-timetable`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${idToken}` },
        // Don't set Content-Type header - fetch will set it with proper boundary
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.detail || data.error || 'Server error');

      setStatus('success');
      setMsg(`✓ ${data.message}\nRooms: ${data.roomCount} · Subjects: ${data.subjectCount}`);
      onUploaded?.({});
    } catch (e) {
      setStatus('error');
      if (e.message.includes('Network') || e.message.includes('fetch')) {
        setMsg(`Cannot connect to FastAPI at ${getAiServerUrl()}. Check that the backend is running.`);
      } else {
        setMsg('Error: ' + e.message);
      }
    } finally {
      setUploading(false); setProgress('');
    }
  }

  return (
    <View style={[styles.uploadCard, { backgroundColor: cardBg, borderColor: bdr }]}>
      <View style={[styles.uploadHeader, { backgroundColor: C.purpleDark }]}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>📄 {mode === 'exam' ? 'Exam' : 'Regular'} Timetable Management</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>Staff / Admin only</Text>
      </View>
      <View style={{ padding: 12 }}>
        {(mode === 'exam' ? examTimetable?.meta : ttMeta) && (
          <View style={[styles.ttInfoBox, { backgroundColor: ib, borderColor: bdr }]}>
            <Text style={[styles.ttInfoLabel, { color: ts }]}>CURRENT TIMETABLE</Text>
            {(mode === 'exam' ? examTimetable?.meta : ttMeta).version && (mode === 'exam' ? examTimetable?.meta : ttMeta).version !== 'pending'
              ? <>
                <Text style={{ fontSize: 12, fontWeight: '600', color: tp }}>{(mode === 'exam' ? examTimetable?.meta : ttMeta).version}{(mode === 'exam' ? examTimetable?.meta : ttMeta).effectiveDate ? ` · w.e.f ${(mode === 'exam' ? examTimetable?.meta : ttMeta).effectiveDate}` : ''}</Text>
                <Text style={{ fontSize: 10, color: ts }}>Uploaded by {(mode === 'exam' ? examTimetable?.meta : ttMeta).uploadedBy}</Text>
              </>
              : <Text style={{ fontSize: 11, color: ts, fontStyle: 'italic' }}>No timetable loaded yet</Text>
            }
          </View>
        )}

        <TouchableOpacity onPress={handleUpload} disabled={uploading}
          style={[styles.uploadBtn, { borderColor: bdr, backgroundColor: ib }]}>
          {uploading
            ? <>
              <ActivityIndicator color={C.purple} size="small" />
              <Text style={{ fontSize: 11, color: ts, marginTop: 8, textAlign: 'center' }}>{progress}</Text>
            </>
            : <>
              <Text style={{ fontSize: 22, marginBottom: 4 }}>⬆️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tp }}>Upload Timetable PDF</Text>
              <Text style={{ fontSize: 10, color: ts }}>Python layout rules · text_pdf_timetables</Text>
            </>
          }
        </TouchableOpacity>

        {status && (
          <View style={[styles.statusBox, {
            backgroundColor: status === 'success' ? '#DCFCE7' : '#FEE2E2',
            borderColor: status === 'success' ? '#16A34A' : '#FCA5A5',
          }]}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: status === 'success' ? '#166534' : '#B91C1C', lineHeight: 18 }}>
              {msg}
            </Text>
          </View>
        )}

        <View style={[styles.statusBox, { backgroundColor: '#EDE9FF', borderColor: '#9B7EF844', marginTop: 8 }]}>
          <Text style={{ fontSize: 10, color: '#6C47D4', fontWeight: '600' }}>
            Server URL is detected automatically from the current Expo host.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  officeModal: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '82%', borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30 },
  officeSearch: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, marginBottom: 8, fontSize: 13 },
  officeTeacherRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  officeClose: { marginTop: 12, alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
  homeHeader: { margin: 14, marginBottom: 10, borderRadius: 18, padding: 16 },
  homeHeaderTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  homeHeaderTitle: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1.1 },
  homeHeaderSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  homeHeaderDate: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 14, fontWeight: '700', letterSpacing: 0.8 },
  homeHeaderTime: { color: '#fff', fontSize: 36, fontWeight: '900', letterSpacing: 0.5, marginTop: 2 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 11, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  modeDot: { width: 8, height: 8, borderRadius: 4 },
  modePillText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  modeDescription: { color: 'rgba(255,255,255,0.75)', fontSize: 10, flex: 1 },
  homeHeaderStatusPill: { marginTop: 12, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  homeHeaderStatusText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  floorBar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  floorBarTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  floorControls: { position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6, minHeight: 28 },
  departmentLabel: { fontSize: 12, fontWeight: '800' },
  departmentToggleRow: { position: 'absolute', left: 0, flexDirection: 'row', gap: 6 },
  departmentChip: { minWidth: 42, alignItems: 'center', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
  departmentChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  departmentChipText: { fontSize: 10, fontWeight: '800', color: '#3356A8', letterSpacing: 0.4 },
  departmentChipTextActive: { color: '#FFFFFF' },
  mapTitle: { fontSize: 13, fontWeight: '700' },
  floorBtns: { flexDirection: 'row', gap: 4 },
  floorBtn: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#EDE9FF' },
  floorBtnActive: { backgroundColor: C.purple },
  floorBtnText: { fontSize: 11, fontWeight: '600', color: C.purple },
  floorBtnTextActive: { color: '#fff' },
  floorBadge: { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  mapCard: { marginHorizontal: 14, marginTop: 10, borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  mapHint: { textAlign: 'center', fontSize: 11, marginTop: 8, marginBottom: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 6, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 10, fontWeight: '600' },
  ttBtn: { marginHorizontal: 14, marginBottom: 12, padding: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ttBtnText: { fontSize: 12, fontWeight: '700' },
  modeCard: { marginHorizontal: 14, marginBottom: 12, borderWidth: 1, borderRadius: 14, padding: 12 },
  modeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  uploadTitle: { fontSize: 13, fontWeight: '800' },
  modeOptions: { flexDirection: 'row', gap: 8 },
  modeOption: { flex: 1, borderWidth: 1.5, borderRadius: 10, alignItems: 'center', paddingVertical: 9 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,15,74,0.5)' },
  popup: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 24, paddingBottom: 40 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18, opacity: 0.4 },
  popupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  roomBadge: { width: 50, height: 50, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  roomBadgeText: { fontSize: 13, fontWeight: '700' },
  roomId: { fontSize: 18, fontWeight: '700' },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, alignSelf: 'flex-start', marginTop: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  issueBox: { backgroundColor: '#DBEAFE', borderRadius: 10, padding: 10, marginBottom: 12 },
  issueText: { fontSize: 12, fontWeight: '600', color: '#1E40AF' },
  reportSection: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  reportTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  reportNotice: { fontSize: 10, lineHeight: 15, marginBottom: 8 },
  reportIssueButton: { alignSelf: 'flex-end', borderRadius: 10, backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 9, marginTop: 8 },
  reportIssueButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  reportCard: { borderWidth: 1, borderRadius: 10, padding: 9, marginBottom: 7 },
  reportCategory: { fontSize: 12, fontWeight: '800', flex: 1 },
  reportStatus: { fontSize: 10, fontWeight: '800' },
  reportActions: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  reportAction: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  reportForm: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  reportFormLabel: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  categoryChip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  reportInput: { minHeight: 58, borderWidth: 1, borderRadius: 9, padding: 8, marginTop: 9, textAlignVertical: 'top', fontSize: 12 },
  reportFormActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 9 },
  cancelReportButton: { borderRadius: 9, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 12, paddingVertical: 9 },
  cancelReportText: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  submitReport: { alignItems: 'center', borderRadius: 9, paddingVertical: 9, marginTop: 9 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  nextBox: { marginTop: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  nextLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  closeBtn: { marginTop: 16, padding: 13, borderRadius: 14, alignItems: 'center' },

  ttModal: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1 },
  ttHeader: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ttCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  slotChip: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6, marginRight: 5, alignItems: 'center', minWidth: 38 },
  ttRow: { flexDirection: 'row', gap: 10, marginBottom: 7, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, padding: 8 },
  ttLecBadge: { width: 36, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', padding: 4 },

  uploadCard: { marginHorizontal: 14, marginTop: 4, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  uploadHeader: { padding: 12 },
  ttInfoBox: { borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1 },
  ttInfoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  uploadBtn: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 8 },
  statusBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
});
