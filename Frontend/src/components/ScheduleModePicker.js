import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SCHEDULE_MODES } from '../hooks/useScheduleMode';

export default function ScheduleModePicker({ user, dark, schedule }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const modeInfo = schedule?.modeInfo || SCHEDULE_MODES.regular;
  const isStaff = user?.type === 'staff';
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#B9A7FF' : '#6C47D4';
  const bg = dark ? '#12123A' : '#FFFFFF';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';

  function requestChange(nextMode) {
    if (nextMode !== schedule?.mode) setPending(nextMode);
  }

  async function confirmChange() {
    if (!pending) return;
    await schedule.changeMode(pending, user?.email);
    setPending(null);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity
        disabled={!isStaff}
        onPress={() => setOpen(true)}
        style={[styles.indicator, { borderColor: modeInfo.color, backgroundColor: modeInfo.color }]}
        accessibilityLabel="Schedule mode">
        <View style={[styles.dot, { backgroundColor: modeInfo.color }]} />
        <Text style={styles.label}>{modeInfo.label.toUpperCase()} MODE</Text>
      </TouchableOpacity>

      {isStaff && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.backdrop}>
            <View style={[styles.panel, { backgroundColor: bg }]}> 
              <View style={styles.header}>
                <View>
                  <Text style={{ color: '#DC2626', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }}>CAMPUS SCHEDULE</Text>
                  <Text style={[styles.title, { color: tp }]}>Change Schedule Mode</Text>
                </View>
                <TouchableOpacity onPress={() => setOpen(false)}><Text style={{ color: ts, fontSize: 22 }}>✕</Text></TouchableOpacity>
              </View>
              <Text style={[styles.subtitle, { color: ts }]}>Select the mode for the entire campus.</Text>
              {Object.entries(SCHEDULE_MODES).map(([key, info]) => (
                <TouchableOpacity key={key} onPress={() => requestChange(key)}
                  style={[styles.option, { borderColor: pending === key || (!pending && schedule?.mode === key) ? info.color : bdr, backgroundColor: pending === key ? `${info.color}18` : 'transparent' }]}> 
                  <View style={[styles.optionDot, { backgroundColor: info.color }]} />
                  <View style={{ flex: 1 }}><Text style={[styles.optionTitle, { color: tp }]}>{info.label}</Text><Text style={{ color: ts, fontSize: 11 }}>{info.description}</Text></View>
                  {(pending === key || (!pending && schedule?.mode === key)) && <Text style={{ color: info.color, fontWeight: '900' }}>✓</Text>}
                </TouchableOpacity>
              ))}
              {pending && (
                <View style={[styles.confirm, { borderColor: SCHEDULE_MODES[pending].color, backgroundColor: `${SCHEDULE_MODES[pending].color}12` }]}> 
                  <Text style={[styles.confirmText, { color: tp }]}>Switch campus mode to <Text style={{ fontWeight: '900' }}>{SCHEDULE_MODES[pending].label}</Text>?</Text>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity onPress={() => setPending(null)}><Text style={{ color: ts, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity onPress={confirmChange} style={styles.confirmButton}><Text style={{ color: '#fff', fontWeight: '800' }}>Confirm Change</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  indicator: { minWidth: 108, maxWidth: 150, borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,10,35,0.6)', justifyContent: 'center', padding: 20 },
  panel: { borderRadius: 20, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 19, fontWeight: '900', marginTop: 3 },
  subtitle: { fontSize: 12, marginTop: 7, marginBottom: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 8 },
  optionDot: { width: 10, height: 10, borderRadius: 5 },
  optionTitle: { fontSize: 13, fontWeight: '800' },
  confirm: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 5 },
  confirmText: { fontSize: 12, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 12 },
  confirmButton: { backgroundColor: '#991B1B', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
});