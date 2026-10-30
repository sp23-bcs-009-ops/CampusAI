import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C } from '../constants/colors';

const emptyEntry = () => ({ subject: '', teacher: '', room: '', group: '' });

export default function TimetableEntryEditor({ visible, dark, title, context, initialEntries, allowMultiple = false, onClose, onSave }) {
  const [entries, setEntries] = useState([emptyEntry()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bg = dark ? '#12123A' : '#FFFFFF';
  const pageBg = dark ? '#0A0A1E' : '#F5F4FF';
  const text = dark ? '#EDE9FF' : '#1A0F4A';
  const muted = dark ? '#9B7EF8' : '#6C47D4';
  const border = dark ? '#2A1C6B' : '#E2E0F5';

  useEffect(() => {
    if (!visible) return;
    setEntries(initialEntries?.length
      ? initialEntries.map(item => ({
        subject: item.subject || '', teacher: item.prof || item.teacher || '',
        room: item.room || '', group: item.labGroup || item.group || '',
      }))
      : [emptyEntry()]);
    setError('');
  }, [visible, initialEntries]);

  function updateEntry(index, key, value) {
    setEntries(current => current.map((entry, idx) => idx === index ? { ...entry, [key]: value } : entry));
  }

  async function save() {
    const valid = entries.filter(item => item.subject.trim() && item.teacher.trim() && item.room.trim());
    if (!valid.length || valid.length !== entries.length) {
      setError('Complete Subject, Teacher, and Class for every entry.');
      return;
    }
    setSaving(true); setError('');
    try { await onSave(valid); onClose(); }
    catch (e) { setError(e.message || 'Could not save the timetable entry.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: bg, borderColor: border }]}>
          <View style={[styles.handle, { backgroundColor: muted }]} />
          <Text style={[styles.title, { color: text }]}>{title || 'Edit timetable entry'}</Text>
          {!!context && <Text style={[styles.context, { color: muted }]}>{context}</Text>}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 14 }}>
            {entries.map((entry, index) => (
              <View key={index} style={[styles.entryCard, { borderColor: border, backgroundColor: pageBg }]}>
                <View style={styles.entryHeader}>
                  <Text style={{ color: muted, fontSize: 12, fontWeight: '800' }}>Class {index + 1}</Text>
                  {allowMultiple && entries.length > 1 && <TouchableOpacity onPress={() => setEntries(items => items.filter((_, idx) => idx !== index))}>
                    <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '700' }}>Remove</Text>
                  </TouchableOpacity>}
                </View>
                {[
                  ['subject', 'Subject name'], ['teacher', 'Teacher name'],
                  ['room', 'Class / room name'], ['group', 'Group (optional)'],
                ].map(([key, label]) => (
                  <TextInput key={key} value={entry[key]} onChangeText={value => updateEntry(index, key, value)}
                    placeholder={label} placeholderTextColor={muted}
                    style={[styles.input, { color: text, borderColor: border, backgroundColor: bg }]} />
                ))}
              </View>
            ))}
            {allowMultiple && entries.length < 4 && <TouchableOpacity onPress={() => setEntries(current => [...current, emptyEntry()])} style={[styles.add, { borderColor: border }]}>
              <Text style={{ color: muted, fontSize: 12, fontWeight: '700' }}>＋ Add another class in this cell</Text>
            </TouchableOpacity>}
            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={onClose} style={[styles.action, { borderColor: border }]}>
              <Text style={{ color: muted, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={save} style={[styles.action, { backgroundColor: C.purple, borderColor: C.purple }]}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,10,35,0.58)' },
  sheet: { maxHeight: '92%', borderWidth: 1, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  context: { fontSize: 11, marginTop: 4, marginBottom: 12 },
  entryCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 10 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, marginTop: 8, fontSize: 12 },
  add: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, padding: 11, alignItems: 'center', marginTop: 10 },
  error: { color: '#B91C1C', fontSize: 11, marginTop: 9 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  action: { minWidth: 88, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 },
});
