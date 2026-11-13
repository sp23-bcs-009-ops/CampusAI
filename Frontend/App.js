import React, { useState, useEffect, useRef } from 'react';
import { Alert, AppState, View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { C } from './src/constants/colors';
import { NAV_TABS, GUEST_NAV_TABS, hasStaffRole } from './src/constants/config';
import useTimetable from './src/hooks/useTimetable';
import useNotifs from './src/hooks/useNotifs';
import {
  clearAuthToken,
  getAuthTokens,
  getNotificationSettings,
  refreshAuthToken,
  saveNotificationSettings,
  authGetUser,
} from './src/firebase/firestore';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ClassScreen from './src/screens/ClassScreen';
import UniNewsScreen from './src/screens/UniNewsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ChatScreen from './src/screens/ChatScreen';
import GuestModeScreen from './src/screens/GuestModeScreen';
import InternalScreen from './src/screens/InternalScreen';
import TeacherDirectoryScreen from './src/screens/TeacherDirectoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EmergencyAnnouncements from './src/components/EmergencyAnnouncements';
import useEmergencyAnnouncements from './src/hooks/useEmergencyAnnouncements';
import useScheduleMode from './src/hooks/useScheduleMode';
import ScheduleModePicker from './src/components/ScheduleModePicker';
import { buildClashingSubjectAliasMap, normalizeSubjectKey, resolveSubjectAlias } from './src/utils/clashingSubjectAliases';
import { getDeveloperNow } from './src/utils/developerClock';
import { getClassMuteKey } from './src/utils/classMutes';
import { ensureNotificationPermissionAsync } from './src/utils/pushNotifications';
import { syncMyClassLocalNotifications } from './src/utils/myClassNotifications';

const NAV_ICON_COLORS = {
  chat: { light: '#0284C7', dark: '#38BDF8' },
  class: { light: '#16A34A', dark: '#4ADE80' },
  home: { light: '#6C47D4', dark: '#A78BFA' },
  uninews: { light: '#D97706', dark: '#FBBF24' },
  directory: { light: '#0F766E', dark: '#2DD4BF' },
  profile: { light: '#DB2777', dark: '#F472B6' },
  about: { light: '#0E7C86', dark: '#14B8A6' },
};

function localUserSettingsKey(user) {
  const identity = String(user?.uid || user?.email || '').trim().toLowerCase();
  return identity ? `campusai_user_settings:${identity}` : null;
}

async function restoreLocalUserSettings(user) {
  const key = localUserSettingsKey(user);
  if (!key) return user;
  const serialized = await AsyncStorage.getItem(key);
  if (!serialized) return user;

  let settings;
  try {
    settings = JSON.parse(serialized);
  } catch (error) {
    console.warn('Could not parse saved user settings.', error);
    return user;
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    console.warn('Saved user settings have an unexpected format.');
    return user;
  }

  return {
    ...user,
    staffRoleEnabled: settings.staffRoleEnabled === true,
    mutedClassKeys: Array.isArray(settings.mutedClassKeys)
      ? settings.mutedClassKeys.filter(value => typeof value === 'string')
      : (user.mutedClassKeys || []),
  };
}

function notificationProfileSettings(user) {
  return {
    enabled: user.notificationEnabled !== false,
    dept: user.dept || '',
    semester: Number(user.semester) || 0,
    role: user.type || '',
    displayName: user.fullName || user.name || '',
    subjects: JSON.stringify(Array.isArray(user.subjects) ? user.subjects : []),
    mutedClassKeys: JSON.stringify(Array.isArray(user.mutedClassKeys) ? user.mutedClassKeys : []),
    updatedAt: new Date().toISOString(),
  };
}

export default function App() {
  const [screen, setScreen] = useState('login');
  const [user, setUser] = useState(null);
  const [dark, setDark] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [emergencyOpenRequest, setEmergencyOpenRequest] = useState(0);
  const [officeTarget, setOfficeTarget] = useState(null);
  const [navStart, setNavStart] = useState(1);
  const navScrollRef = useRef(null);
  const navInitialised = useRef(false);
  const { width: windowWidth } = useWindowDimensions();

  // Guest mode: only Website AI + About Us are reachable — everything else
  // (Home, Class Notification, Teacher list, etc.) is blocked for guests.
  const isGuest = user?.type === 'guest';
  const staffAccess = hasStaffRole(user);
  const navItems = isGuest ? GUEST_NAV_TABS : NAV_TABS.filter(tab => tab.key !== 'settings' || staffAccess);
  const maxNavStart = Math.max(0, navItems.length - 3);
  const navStartClamped = Math.min(navStart, maxNavStart);

  const navViewportWidth = Math.max(0, windowWidth - (maxNavStart > 0 ? 96 : 0));
  const navItemWidth = navViewportWidth / Math.min(3, Math.max(1, navItems.length));
  const [wallClockNow, setWallClockNow] = useState(new Date());
  const now = getDeveloperNow(wallClockNow, user);
  const emergency = useEmergencyAnnouncements();
  const schedule = useScheduleMode();

  // Keep activeTab valid for the current role: guests only have the guest
  // chat + About Us; signed-in users never land on the guest-only "about" tab.
  useEffect(() => {
    if (isGuest) {
      if (activeTab !== 'chat' && activeTab !== 'about') setActiveTab('chat');
    } else if (activeTab === 'about' || (activeTab === 'settings' && !staffAccess)) {
      setActiveTab('home');
    }
  }, [isGuest, activeTab, staffAccess]);

  // ── Persistent login (profile + Firebase auth token) ─────────────────────
  useEffect(() => {
    let active = true;
    async function restoreSession() {
      const [storedUser, refreshToken] = await Promise.all([
        AsyncStorage.getItem('campusai_user'),
        AsyncStorage.getItem('campusai_refresh_token'),
      ]);
      if (refreshToken) {
        await refreshAuthToken(refreshToken);
      }
      if (!storedUser) return;

      let restoredUser = await restoreLocalUserSettings(JSON.parse(storedUser));
      const idToken = getAuthTokens().idToken;
      if (idToken && !restoredUser.uid) {
        try {
          const authUser = await authGetUser(idToken);
          restoredUser = { ...restoredUser, uid: authUser?.localId || restoredUser.uid };
        } catch (error) {
          console.warn('Could not restore the Firebase user ID.', error);
        }
      }
      if (restoredUser.uid) {
        const notificationSettings = await getNotificationSettings(restoredUser.uid);
        if (typeof notificationSettings?.enabled === 'boolean') {
          restoredUser.notificationEnabled = notificationSettings.enabled;
        }
        saveNotificationSettings(restoredUser.uid, notificationProfileSettings(restoredUser))
          .catch(error => console.warn('Failed to sync notification preferences.', error));
      }
      if (!active) return;
      setUser(restoredUser);
      setScreen('main');
      AsyncStorage.setItem('campusai_user', JSON.stringify(restoredUser)).catch(error => {
        console.warn('Failed to restore user session.', error);
      });
    }
    restoreSession().catch(error => console.warn('Failed to restore user session.', error));
    return () => { active = false; };
  }, []);

  function persistAuthToken() {
    const { refreshToken } = getAuthTokens();
    if (refreshToken) {
      AsyncStorage.setItem('campusai_refresh_token', refreshToken).catch(() => { });
    }
  }

  async function handleLogin(u) {
    let restoredUser = u;
    try {
      restoredUser = await restoreLocalUserSettings(u);
    } catch (error) {
      console.warn('Failed to restore local user settings.', error);
    }
    if (restoredUser.uid) {
      const notificationSettings = await getNotificationSettings(restoredUser.uid);
      if (typeof notificationSettings?.enabled === 'boolean') {
        restoredUser = { ...restoredUser, notificationEnabled: notificationSettings.enabled };
      }
      saveNotificationSettings(restoredUser.uid, notificationProfileSettings(restoredUser))
        .catch(error => console.warn('Failed to sync notification preferences.', error));
    }
    setUser(restoredUser);
    // Start every session on a tab that belongs to its role — this also
    // clears a stale guest "About Us" tab when signing in as a real user.
    setActiveTab(restoredUser?.type === 'guest' ? 'chat' : 'home');
    AsyncStorage.setItem('campusai_user', JSON.stringify(restoredUser)).catch(() => { });
    persistAuthToken();
    setScreen('main');
  }
  function handleUpdate(u, { persistNotificationPreferences = true } = {}) {
    setUser(u);
    AsyncStorage.setItem('campusai_user', JSON.stringify(u)).catch(() => { });
    if (persistNotificationPreferences && u.uid) {
      saveNotificationSettings(u.uid, notificationProfileSettings(u))
        .catch(error => console.warn('Failed to sync notification preferences.', error));
    }
    const settingsKey = localUserSettingsKey(u);
    if (settingsKey) {
      AsyncStorage.setItem(settingsKey, JSON.stringify({
        staffRoleEnabled: u.staffRoleEnabled === true,
        mutedClassKeys: Array.isArray(u.mutedClassKeys) ? u.mutedClassKeys : [],
      })).catch(error => console.warn('Failed to save local user settings.', error));
    }
  }
  function handleRoleChange(type) {
    handleUpdate({ ...user, type });
  }
  function handleToggleClassMute(slot, room, mode) {
    const key = getClassMuteKey(slot, room, mode);
    const muted = new Set(user?.mutedClassKeys || []);
    if (muted.has(key)) muted.delete(key);
    else muted.add(key);
    handleUpdate({ ...user, mutedClassKeys: [...muted] });
  }
  async function handleToggleNotifications(enabled) {
    const uid = user?.uid;
    if (!uid) {
      Alert.alert('Notifications unavailable', 'Sign in again before changing notification settings.');
      return;
    }
    try {
      if (enabled) {
        const permitted = await ensureNotificationPermissionAsync();
        if (!permitted) {
          Alert.alert('Permission required', 'Allow notifications in your device settings to turn alerts on.');
          return;
        }
      }
      const updatedUser = { ...user, notificationEnabled: enabled };
      await saveNotificationSettings(uid, notificationProfileSettings(updatedUser));
      if (user?.uid === uid) {
        handleUpdate(updatedUser, { persistNotificationPreferences: false });
      }
    } catch (error) {
      Alert.alert('Could not update notifications', error.message || 'Please try again.');
    }
  }

  function handleLogout() {
    syncMyClassLocalNotifications({ enabled: false }).catch(error => {
      console.warn('Failed to cancel class reminders on logout.', error);
    });
    AsyncStorage.removeItem('campusai_user').catch(() => { });
    AsyncStorage.removeItem('campusai_refresh_token').catch(() => { });
    clearAuthToken();
    setUser(null); setScreen('login');
  }

  // ── Timetable ─────────────────────────────────────────────────────────────
  const {
    lectureSlots,
    timetables,
    displayRows,
    displayRowsBySemester,
    subjectsList,
    subjectsBySemester,
    lectureSlotsByDepartmentSemester,
    loading: timetableLoading,
    rawDocuments: timetableDocuments,
    currentManifest: timetableManifest,
    exam,
    meta: ttMeta,
    reload: reloadTT,
  } = useTimetable();

  // ── Notifs ────────────────────────────────────────────────────────────────
  const { arrangedClasses, cancelledSlots } = useNotifs(lectureSlots);

  // Clock tick every minute
  useEffect(() => {
    const t = setInterval(() => setWallClockNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ── isMine: mark slots belonging to the current user's subjects ───────────
  function normaliseRoomId(roomId) {
    const raw = String(roomId || '').trim();
    if (!raw) return raw;

    const ltMatch = raw.match(/LT\s*(\d+)/i);
    if (ltMatch) return `LT${ltMatch[1]}`;

    const labMatch = raw.match(/(?:C\.?\s*Lab|Lab)\s*(\d+)/i);
    if (labMatch) return `Lab${labMatch[1]}`;

    return raw;
  }

  const currentSem = user?.type === 'staff' ? null : Number(user?.semester || 7);
  const currentDept = String(user?.dept || '').toLowerCase();
  const semSubjects = (currentSem ? (subjectsBySemester?.[currentSem] || subjectsList || []) : [])
    .filter(subject => !subject?.dept || !currentDept || String(subject.dept).toLowerCase() === currentDept);
  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');
  const semSubjectNames = Array.from(new Set(semSubjects.map(toSubjectName).filter(Boolean)));
  const availableSubjectNames = Array.from(new Set(
    Object.values(subjectsBySemester || {}).flat()
      .filter(subject => !subject?.dept || !currentDept || String(subject.dept).toLowerCase() === currentDept)
      .map(toSubjectName)
      .filter(Boolean)
  ));
  const userSubjects = Array.from(new Set((user?.subjects?.length > 0 ? user.subjects : semSubjectNames).map(toSubjectName).filter(Boolean)));

  // Merge all semester timetables so map can show in-session occupancy campus-wide.
  const mergedRawTimetable = {};
  for (const [semKey, roomMap] of Object.entries(timetables || {})) {
    const semNum = Number(semKey);
    for (const [room, slots] of Object.entries(roomMap || {})) {
      const nr = normaliseRoomId(room);
      if (!mergedRawTimetable[nr]) mergedRawTimetable[nr] = [];
      for (const slot of (slots || [])) {
        mergedRawTimetable[nr].push({ ...slot, sem: slot?.sem ?? semNum });
      }
    }
  }

  // Reconcile abbreviations only when the timetable itself has a same-room,
  // same-time clash and both records name the same teacher.
  const subjectAliasMap = buildClashingSubjectAliasMap(mergedRawTimetable);
  const userSubjectKeys = new Set(userSubjects.map(subject =>
    normalizeSubjectKey(resolveSubjectAlias(subject, subjectAliasMap))
  ));
  const mutedClassKeys = new Set(user?.mutedClassKeys || []);

  const timetable = Object.fromEntries(
    Object.entries(mergedRawTimetable).map(([room, slots]) => [
      room,
      (slots || []).map(slot => {
        const normalizedSlot = {
          ...slot,
          subject: resolveSubjectAlias(slot.subject, subjectAliasMap),
        };
        const muteKey = getClassMuteKey(normalizedSlot, room, 'regular');
        return {
          ...normalizedSlot,
          isMine: user?.type === 'staff' ? false : user?.type === 'teacher'
            ? String(slot?.prof || slot?.teacher || '').trim().toLocaleLowerCase() === String(user?.fullName || user?.name || '').trim().toLocaleLowerCase()
            : userSubjectKeys.has(normalizeSubjectKey(resolveSubjectAlias(slot.subject, subjectAliasMap))),
          muteKey,
          isMuted: mutedClassKeys.has(muteKey),
        };
      }),
    ])
  );

  const examWithOwnership = {
    ...exam,
    timetables: Object.fromEntries(Object.entries(exam?.timetables || {}).map(([room, slots]) => [
      room,
      (slots || []).map(slot => {
        const normalizedSlot = {
          ...slot,
          subject: resolveSubjectAlias(slot.subject, subjectAliasMap),
        };
        const muteKey = getClassMuteKey(normalizedSlot, room, 'exam');
        return {
          ...normalizedSlot,
          isMine: user?.type === 'staff' ? false : user?.type === 'teacher'
            ? String(slot?.prof || slot?.teacher || '').trim().toLocaleLowerCase() === String(user?.fullName || user?.name || '').trim().toLocaleLowerCase()
            : userSubjectKeys.has(normalizeSubjectKey(normalizedSlot.subject)),
          muteKey,
          isMuted: mutedClassKeys.has(muteKey),
        };
      }),
    ])),
  };

  useEffect(() => {
    let active = true;
    const sync = async () => {
      if (screen !== 'main') return;
      if (!user || user.type === 'guest') {
        await syncMyClassLocalNotifications({ enabled: false });
        return;
      }
      if (user.notificationEnabled === false) {
        await syncMyClassLocalNotifications({ enabled: false });
        return;
      }
      if (timetableLoading || schedule.loading) return;

      const activeTimetable = schedule.mode === 'exam'
        ? examWithOwnership.timetables
        : schedule.mode === 'regular' ? timetable : {};
      const result = await syncMyClassLocalNotifications({
        enabled: true,
        uid: user.uid,
        dept: user.dept,
        semester: user.semester,
        mode: schedule.mode,
        timetable: activeTimetable,
        mutedClassKeys: user.mutedClassKeys || [],
        now: new Date(),
      });
      if (result.permissionDenied) {
        console.warn('Class reminders were not scheduled because notification permission is denied.');
      }
    };

    sync().catch(error => console.warn('Failed to sync class reminders.', error));
    const subscription = AppState.addEventListener('change', state => {
      if (!active || state !== 'active') return;
      if (screen !== 'main' || !user || user.type === 'guest') return;

      Promise.all([
        reloadTT(),
        schedule.reload(),
        user.uid ? getNotificationSettings(user.uid) : Promise.resolve(null),
      ]).then(([, , notificationSettings]) => {
        if (typeof notificationSettings?.enabled !== 'boolean') return;
        setUser(current => {
          if (!current || current.uid !== user.uid) return current;
          const updated = { ...current, notificationEnabled: notificationSettings.enabled };
          AsyncStorage.setItem('campusai_user', JSON.stringify(updated)).catch(error => {
            console.warn('Failed to save refreshed notification settings.', error);
          });
          return updated;
        });
      }).catch(error => console.warn('Failed to refresh class reminder data.', error));
    });
    const rollingWindowTimer = setInterval(() => {
      sync().catch(error => console.warn('Failed to refresh the class reminder window.', error));
    }, 24 * 60 * 60 * 1000);

    return () => {
      active = false;
      clearInterval(rollingWindowTimer);
      subscription.remove();
    };
  }, [
    screen,
    user?.uid,
    user?.type,
    user?.notificationEnabled,
    user?.dept,
    user?.semester,
    user?.fullName,
    user?.name,
    JSON.stringify(user?.subjects || []),
    JSON.stringify(user?.mutedClassKeys || []),
    schedule.mode,
    schedule.loading,
    schedule.reload,
    timetableLoading,
    timetableManifest?.updatedAt,
    exam?.manifest?.updatedAt,
    ttMeta?.updatedAt,
    exam?.meta?.updatedAt,
    reloadTT,
  ]);

  const subjectsMap = { cs: { [currentSem]: semSubjectNames } };

  // BUG FIX: Pass displayRows into ttMeta so TimetableModal can render them
  const ttRows = displayRowsBySemester?.[currentSem] || displayRows;
  const ttMetaWithRows = ttMeta ? { ...ttMeta, displayRows: ttRows } : null;

  const renderTab = () => {
    // Guest mode is a closed area: guests only ever see the guest chat and
    // About Us — never Home, Class Notification, Teacher list, etc.
    if (isGuest) {
      return (
        <GuestModeScreen
          dark={dark}
          tab={activeTab === 'about' ? 'about' : 'chat'}
          onTabChange={setActiveTab}
          onExitGuest={handleLogout}
        />
      );
    }
    // Signed-in users never open the guest-only "about" tab (safety net —
    // the effect above already redirects it).
    switch (activeTab === 'about' ? 'home' : activeTab) {
      case 'home':
        return (
          <HomeScreen
            user={user} dark={dark} now={now}
            timetable={timetable} lectureSlots={lectureSlots}
            lectureSlotsByDepartmentSemester={lectureSlotsByDepartmentSemester}
            timetableDocuments={timetableDocuments}
            timetableManifest={timetableManifest}
            arrangedClasses={arrangedClasses} cancelledSlots={cancelledSlots}
            ttMeta={ttMetaWithRows} onTTUploaded={() => reloadTT()}
            onUpdateUser={handleUpdate}
            schedule={schedule} examTimetable={examWithOwnership}
            onToggleClassMute={handleToggleClassMute}
            officeTarget={officeTarget}
            onOfficeTargetHandled={() => setOfficeTarget(null)}
          />
        );
      case 'class':
        return (
          <ClassScreen
            user={user} dark={dark}
            lectureSlots={lectureSlots} subjectsMap={subjectsMap} timetables={timetables}
            schedule={schedule}
          />
        );
      case 'chat':
        return (
          <View style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF' }}>
            <ChatScreen user={user} dark={dark} />
          </View>
        );
      case 'uninews':
        return <UniNewsScreen user={user} dark={dark} />;
      case 'directory':
        return <TeacherDirectoryScreen dark={dark} user={user} subjectsBySemester={subjectsBySemester}
          onShowTeacherOffice={teacher => { setOfficeTarget({ ...teacher.office, key: `${teacher._docId || teacher.name}_${Date.now()}` }); setActiveTab('home'); }} />;
      case 'profile':
        return (
          <ProfileScreen
            user={user} dark={dark}
            subjectsList={semSubjectNames}
            availableSubjects={availableSubjectNames}
            onUpdate={handleUpdate}
            onToggleNotifications={handleToggleNotifications}
            onRoleChange={handleRoleChange}
            onLogout={handleLogout}
          />
        );
      case 'settings':
        return staffAccess ? (
          <SettingsScreen
            user={user} dark={dark} onToggleDark={() => setDark(value => !value)}
            onOpenProfile={() => setActiveTab('profile')}
            onOpenAnnouncements={() => setEmergencyOpenRequest(value => value + 1)}
            schedule={schedule}
            ttMeta={ttMeta} timetableDocuments={timetableDocuments}
            timetableManifest={timetableManifest} examTimetable={exam}
            onTTUploaded={() => reloadTT()}
          />
        ) : null;
      case 'internal':
        return (
          <View style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF' }}>
            <InternalScreen user={user} dark={dark} />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      {screen === 'login' ? (
        <LoginScreen
          onLogin={handleLogin}
          onGuest={() => handleLogin({ type: 'guest', name: 'Guest' })}
        />
      ) : (
        <SafeAreaView style={styles.app} edges={['top', 'bottom', 'left', 'right']}>
          {/* Top bar */}
          <View style={[styles.topBar, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
            <Text style={styles.topBarTitle}>CampusAI</Text>
            {!isGuest && <ScheduleModePicker user={user} dark={dark} schedule={schedule} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              {!isGuest && <EmergencyAnnouncements user={user} dark={dark} openRequest={emergencyOpenRequest} {...emergency} />}
              {isGuest && (
                <TouchableOpacity
                  accessibilityLabel="Exit Guest Mode and sign in"
                  onPress={handleLogout}
                  style={styles.guestExitBtn}>
                  <Text style={styles.guestExitText}>Sign In</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setDark(!dark)} style={styles.darkBtn}>
                <Text style={{ fontSize: 16 }}>{dark ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tab content */}
          <View style={{ flex: 1 }}>{renderTab()}</View>

          {/* Bottom nav */}
          <View style={[styles.tabBar, { backgroundColor: dark ? '#12123A' : '#FFFFFF', borderTopColor: dark ? '#2A1C6B' : '#E2E0F5' }]}>
            {maxNavStart > 0 && (
            <TouchableOpacity
              accessibilityLabel="Show previous navigation screens"
              disabled={navStartClamped <= 0}
              onPress={() => {
                const next = Math.max(0, navStartClamped - 1);
                setNavStart(next);
                navScrollRef.current?.scrollTo({ x: next * navItemWidth, animated: true });
              }}
              style={styles.navArrow}>
              <Text style={[styles.navArrowText, { color: navStartClamped <= 0 ? (dark ? '#4A3A7A' : '#D0CCE0') : (dark ? '#EDE9FF' : '#6C47D4') }]}>‹</Text>
            </TouchableOpacity>
            )}
            <View style={{ width: navViewportWidth, overflow: 'hidden', flex: maxNavStart > 0 ? undefined : 1 }}>
              <ScrollView
                ref={navScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={navItemWidth || 1}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onLayout={() => {
                  if (!navInitialised.current && navItemWidth > 0) {
                    navScrollRef.current?.scrollTo({ x: navStartClamped * navItemWidth, animated: false });
                    navInitialised.current = true;
                  }
                }}
                onMomentumScrollEnd={event => {
                  const next = Math.max(0, Math.min(maxNavStart, Math.round(event.nativeEvent.contentOffset.x / navItemWidth)));
                  setNavStart(next);
                }}>
                {navItems.map(tab => {
                  const active = activeTab === tab.key;
                  const ic = NAV_ICON_COLORS[tab.key]?.[dark ? 'dark' : 'light'] || (dark ? '#A78BFA' : '#6C47D4');
                  const labelColor = active ? ic : (dark ? '#8B7BB8' : '#81799F');
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setActiveTab(tab.key)}
                      style={[styles.tabBtn, { width: navItemWidth }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}>
                      <Svg width={21} height={21} viewBox="0 0 24 24" fill={ic}>
                        <Path d={tab.icon} />
                      </Svg>
                      <Text numberOfLines={2} style={[styles.tabLabel, { color: labelColor, fontWeight: active ? '700' : '500' }]}>
                        {tab.label}
                      </Text>
                      {active && <View style={styles.tabDot} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            {maxNavStart > 0 && (
            <TouchableOpacity
              accessibilityLabel="Show next navigation screens"
              disabled={navStartClamped >= maxNavStart}
              onPress={() => {
                const next = Math.min(maxNavStart, navStartClamped + 1);
                setNavStart(next);
                navScrollRef.current?.scrollTo({ x: next * navItemWidth, animated: true });
              }}
              style={styles.navArrow}>
              <Text style={[styles.navArrowText, { color: navStartClamped >= maxNavStart ? (dark ? '#4A3A7A' : '#D0CCE0') : (dark ? '#EDE9FF' : '#6C47D4') }]}>›</Text>
            </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 },
  topBarTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  darkBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  guestExitBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  guestExitText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tabBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 10, borderTopWidth: 1 },
  navArrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  navArrowText: { fontSize: 36, lineHeight: 40, fontWeight: '400' },
  tabBtn: { alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 3, height: 52 },
  tabLabel: { fontSize: 9, textAlign: 'center', lineHeight: 11 },
  tabDot: { width: 16, height: 3, borderRadius: 2, backgroundColor: C.purple, marginTop: 1 },
});
