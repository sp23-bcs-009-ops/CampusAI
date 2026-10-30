import React, { useEffect, useRef, useState } from 'react';
import {
  Animated, PanResponder, Modal, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';

function formatDate(value) {
  if (!value) return '';
  return new Date(Number(value)).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function EmergencyAnnouncements({ user, dark, announcements, readIds, unreadCount, markRead, markAllRead, createAnnouncement, editAnnouncement, deleteAnnouncement }) {
  const [open, setOpen] = useState(false);
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState(null);
  const [active, setActive] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const slide = useRef(new Animated.Value(-180)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);

  function dismissActive(markAsRead = true) {
    if (!active) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    if (markAsRead) markRead(active.id);
    Animated.parallel([
      Animated.timing(slide, { toValue: -180, duration: 220, useNativeDriver: true }),
      Animated.timing(dragX, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setActive(null));
  }

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
    onPanResponderMove: (_, gesture) => {
      dragX.setValue(gesture.dx);
      slide.setValue(Math.min(0, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      const dismissed = Math.abs(gesture.dx) > 80 || gesture.dy < -45 || gesture.dy > 45;
      if (dismissed) dismissActive();
      else Animated.parallel([
        Animated.spring(dragX, { toValue: 0, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, useNativeDriver: true }),
      ]).start();
    },
    onPanResponderTerminate: () => dismissActive(false),
  })).current;

  useEffect(() => {
    if (!announcements.length) return;
    const newest = announcements.find(item => !readIds.includes(item.id));
    if (!newest) return;
    if (!newest.id || active?.id === newest.id) return;
    setActive(newest);
    Animated.sequence([
      Animated.timing(slide, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => {
      dismissTimer.current = setTimeout(() => dismissActive(), 15000);
    });
  }, [announcements, readIds, active, slide, markRead]);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  const bg = dark ? '#12123A' : '#FFFFFF';
  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#B9A7FF' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const canManage = user?.type === 'staff';

  function showComposer(item = null) {
    setEditing(item);
    setTitle(item?.title || '');
    setBody(item?.body || '');
    setComposer(true);
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    const data = { title: title.trim(), body: body.trim(), postedBy: user?.email || 'Staff', priority: 'critical' };
    if (editing) await editAnnouncement({ ...editing, ...data });
    else await createAnnouncement(data);
    setComposer(false);
  }

  function openHistory() {
    setOpen(true);
    markAllRead();
  }

  return (
    <>
      <TouchableOpacity onPress={openHistory} accessibilityLabel="Emergency announcements" style={styles.iconButton}>
        <Text style={styles.bell}>⚠</Text>
        {unreadCount > 0 && <View style={styles.count}><Text style={styles.countText}>{unreadCount > 9 ? '9+' : unreadCount}</Text></View>}
      </TouchableOpacity>

      {active && (
        <Modal visible transparent animationType="none" onRequestClose={() => dismissActive()}>
          <Animated.View {...panResponder.panHandlers} style={[styles.toast, { transform: [{ translateY: slide }, { translateX: dragX }] }] }>
            <View style={styles.toastIcon}><Text style={{ color: '#fff', fontSize: 19, fontWeight: '900' }}>!</Text></View>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => { markRead(active.id); openHistory(); }}>
              <Text style={styles.toastLabel}>EMERGENCY ANNOUNCEMENT</Text>
              <Text style={styles.toastTitle} numberOfLines={1} ellipsizeMode="tail">{active.title}</Text>
              <Text style={styles.toastBody} numberOfLines={2}>{active.body}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => dismissActive()} style={styles.toastClose}>
              <Text style={{ color: '#fff', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </Animated.View>
        </Modal>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.panel, { backgroundColor: bg }]}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.panelKicker}>CAMPUS ALERTS</Text>
                <Text style={[styles.panelTitle, { color: tp }]}>Emergency Announcements</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}><Text style={{ color: ts, fontSize: 22 }}>✕</Text></TouchableOpacity>
            </View>
            {canManage && <TouchableOpacity onPress={() => showComposer()} style={styles.addButton}><Text style={styles.addText}>＋ New Emergency Announcement</Text></TouchableOpacity>}
            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
              {announcements.length === 0
                ? <Text style={[styles.empty, { color: ts }]}>No emergency announcements.</Text>
                : announcements.map(item => (
                  <View key={item.id} style={[styles.item, { borderColor: bdr, backgroundColor: dark ? '#1A1A3E' : '#FFF7F2' }]}>
                    <View style={styles.itemTop}><Text style={styles.itemTag}>URGENT</Text><Text style={[styles.date, { color: ts }]}>{formatDate(item.createdAt)}</Text></View>
                    <Text style={[styles.itemTitle, { color: tp }]}>{item.title}</Text>
                    <Text style={[styles.itemBody, { color: ts }]}>{item.body}</Text>
                    {canManage && <View style={styles.actions}><TouchableOpacity onPress={() => showComposer(item)}><Text style={styles.actionText}>Edit</Text></TouchableOpacity><TouchableOpacity onPress={() => deleteAnnouncement(item.id)}><Text style={[styles.actionText, { color: '#B91C1C' }]}>Delete</Text></TouchableOpacity></View>}
                  </View>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={composer} transparent animationType="fade" onRequestClose={() => setComposer(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.composer, { backgroundColor: bg }]}>
          <Text style={[styles.panelTitle, { color: tp }]}>{editing ? 'Edit' : 'New'} Emergency Announcement</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor="#A09AB8" style={[styles.input, { color: tp, borderColor: bdr }]} />
          <TextInput value={body} onChangeText={setBody} placeholder="What happened?" placeholderTextColor="#A09AB8" multiline style={[styles.input, styles.bodyInput, { color: tp, borderColor: bdr }]} />
          <View style={styles.composerActions}><TouchableOpacity onPress={() => setComposer(false)}><Text style={{ color: ts, fontWeight: '700' }}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={save} style={styles.saveButton}><Text style={{ color: '#fff', fontWeight: '700' }}>Publish</Text></TouchableOpacity></View>
        </View></View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bell: { color: '#fff', fontSize: 19, fontWeight: '900' },
  count: { position: 'absolute', right: -3, top: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F97316', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  toast: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, elevation: 20, backgroundColor: '#991B1B', borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, minHeight: 78, flexDirection: 'row', alignItems: 'center', boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)' },
  toastIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  toastLabel: { color: '#FED7AA', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  toastTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
  toastBody: { color: '#FEE2E2', fontSize: 11, marginTop: 2 },
  toastClose: { padding: 5, marginLeft: 5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,10,35,0.58)', justifyContent: 'flex-end' },
  panel: { maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  panelKicker: { color: '#DC2626', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  panelTitle: { fontSize: 18, fontWeight: '900', marginTop: 3 },
  addButton: { backgroundColor: '#991B1B', borderRadius: 11, padding: 11, alignItems: 'center', marginBottom: 12 },
  addText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { textAlign: 'center', padding: 36, fontSize: 13 },
  item: { borderWidth: 1, borderLeftWidth: 4, borderLeftColor: '#DC2626', borderRadius: 12, padding: 13, marginBottom: 10 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTag: { color: '#B91C1C', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  date: { fontSize: 10 },
  itemTitle: { fontSize: 14, fontWeight: '800', marginTop: 6 },
  itemBody: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 10 },
  actionText: { color: '#6C47D4', fontSize: 11, fontWeight: '800' },
  composer: { margin: 20, borderRadius: 18, padding: 18 },
  input: { borderWidth: 1.5, borderRadius: 10, padding: 11, fontSize: 13, marginTop: 12 },
  bodyInput: { minHeight: 110, textAlignVertical: 'top' },
  composerActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 16 },
  saveButton: { backgroundColor: '#991B1B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});