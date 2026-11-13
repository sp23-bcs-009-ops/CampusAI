import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import ScheduleModePicker from '../components/ScheduleModePicker';
import TimetableAdminPanel from '../components/TimetableAdminPanel';
import { canUseDeveloperMode } from '../utils/developerClock';
import { AdminTTUpload } from './HomeScreen';

export default function SettingsScreen({
  user, dark, onToggleDark, onOpenProfile, onOpenAnnouncements, schedule,
  ttMeta, timetableDocuments = [], timetableManifest, examTimetable,
  onTTUploaded,
}) {
  const mode = schedule?.mode || 'regular';
  const isExam = mode === 'exam';
  const documents = isExam ? (examTimetable?.rawDocuments || []) : timetableDocuments;
  const manifest = isExam ? (examTimetable?.manifest || null) : timetableManifest;
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const cardBg = dark ? '#12123A' : '#FFFFFF';
  const text = dark ? '#EDE9FF' : '#1A0F4A';
  const muted = dark ? '#9B7EF8' : '#6C47D4';
  const border = dark ? '#2A1C6B' : '#E2E0F5';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: text }]}>Staff Settings</Text>
        <Text style={[styles.subtitle, { color: muted }]}>Campus controls and administrative tools</Text>

        <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Appearance</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: text }]}>Dark mode</Text>
              <Text style={[styles.itemDescription, { color: muted }]}>Change the app theme on this device.</Text>
            </View>
            <TouchableOpacity onPress={onToggleDark} style={[styles.action, { backgroundColor: C.purple }]}>
              <Text style={styles.actionText}>{dark ? 'Turn off' : 'Turn on'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Campus operations</Text>
          <Text style={[styles.itemTitle, { color: text, marginBottom: 8 }]}>Campus schedule mode</Text>
          <ScheduleModePicker user={user} dark={dark} schedule={schedule} />
          <View style={[styles.separator, { borderColor: border }]} />
          <Text style={[styles.itemTitle, { color: text }]}>Emergency announcements</Text>
          <Text style={[styles.itemDescription, { color: muted }]}>Review announcements or manage them as staff.</Text>
          <View style={styles.announcementControl}>
            <TouchableOpacity onPress={onOpenAnnouncements} style={[styles.action, { backgroundColor: C.purple }]}>
              <Text style={styles.actionText}>Open announcements</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Timetable management</Text>
          <AdminTTUpload
            dark={dark} ttMeta={ttMeta} examTimetable={examTimetable}
            mode={mode} onUploaded={onTTUploaded}
          />
          <TimetableAdminPanel
            dark={dark} user={user} mode={mode}
            documents={documents} manifest={manifest} onSaved={onTTUploaded}
          />
        </View>

        {canUseDeveloperMode(user) && (
          <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Developer testing</Text>
            <Text style={[styles.itemDescription, { color: muted }]}>
              Developer mode and simulated campus time remain in My Profile.
            </Text>
            <TouchableOpacity onPress={onOpenProfile} style={[styles.profileLink, { borderColor: border }]}>
              <Text style={{ color: C.purple, fontSize: 12, fontWeight: '800' }}>Open My Profile</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 14, paddingBottom: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: '900' },
  subtitle: { fontSize: 11, marginTop: -8 },
  section: { borderWidth: 1, borderRadius: 16, padding: 13, gap: 9 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemTitle: { fontSize: 12, fontWeight: '700' },
  itemDescription: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  action: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  separator: { borderTopWidth: 1, marginVertical: 3 },
  announcementControl: { alignSelf: 'flex-start', marginTop: 3 },
  profileLink: { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 3 },
});
