import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../../constants/colors';
import { NOTIF_TYPES, FALLBACK_LECTURE_SLOTS } from '../../constants/config';
import { fmtDate, fmtDatetime } from '../../utils/helpers';

export default function NotifCard({ notif, dark, user, onPin, onEdit, onDelete, lectureSlots }) {
  if (!notif) return null;

  const toSubjectName = (s) => (typeof s === 'string' ? s : s?.subject || '');

  const [expanded, setExpanded] = useState(false);
  const slots = lectureSlots || FALLBACK_LECTURE_SLOTS;

  const t   = NOTIF_TYPES[notif.type] || NOTIF_TYPES.other;
  const c   = t[dark ? 'd' : 'l'];
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const bg  = dark ? '#1A1A3E' : '#FFFFFF';

  const sl = notif.lectureNum ? slots[notif.lectureNum] : null;
  const dateLabel = notif.deadline
    ? `Deadline: ${fmtDatetime(notif.deadline)}`
    : notif.date && sl
      ? `${fmtDate(notif.date)} · L${notif.lectureNum} (${sl.start}–${sl.end})`
      : null;

  // Permission: only teacher can edit/delete
  const canEdit   = user?.type === 'teacher' || (user?.type === 'staff' && notif.type === 'room_reservation');
  const canDelete = user?.type === 'teacher' || (user?.type === 'staff' && notif.type === 'room_reservation');

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: notif.pinned ? c.bd : bdr }]}>
      {notif.pinned && <View style={[styles.pinStrip, { backgroundColor: C.purple }]} />}
      <View style={styles.inner}>
        <View style={styles.topRow}>
          {/* Icon area */}
          <View style={[styles.iconBox, { backgroundColor: c.bg, borderColor: c.bd }]}>
            <Text style={{ fontSize: 16 }}>
               {notif.type === 'arrange' ? '📅' : notif.type === 'room_reservation' ? '🔒' : notif.type === 'cancel' ? '❌' :
               notif.type === 'assignment' ? '📋' : notif.type === 'quiz' ? '📝' : 'ℹ️'}
            </Text>
          </View>
          {/* Title area */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.bd }]}>
                <Text style={[styles.badgeText, { color: c.tx }]}>{t.label}</Text>
              </View>
              {notif.pinned && <Text style={{ fontSize: 12 }}>📌</Text>}
              {notif.dept && notif.semester && (
                <View style={[styles.badge, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: C.purple + '44' }]}>
                  <Text style={[styles.badgeText, { color: ts }]}>{notif.dept?.toUpperCase()} · Sem {notif.semester}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.title, { color: tp }]} numberOfLines={2}>{notif.title}</Text>
            {toSubjectName(notif.subject) && toSubjectName(notif.subject) !== 'General' && (
              <Text style={{ fontSize: 11, color: ts, marginTop: 2 }}>{toSubjectName(notif.subject)}</Text>
            )}
          </View>
          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => onPin(notif.id)} style={styles.actionBtn}>
              <Text style={{ opacity: notif.pinned ? 1 : 0.35, fontSize: 14 }}>📌</Text>
            </TouchableOpacity>
            {canEdit && (
              <TouchableOpacity onPress={() => onEdit(notif)} style={styles.actionBtn}>
                <Text style={{ opacity: 0.55, fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
            )}
            {canDelete && (
              <TouchableOpacity onPress={() => onDelete(notif.id, notif.type, notif)} style={styles.actionBtn}>
                <Text style={{ opacity: 0.45, fontSize: 14 }}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {dateLabel && (
          <View style={styles.dateRow}>
            <Text style={{ fontSize: 11, color: ts, fontWeight: '600' }}>🕐 {dateLabel}</Text>
            {notif.room && (
              <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.bd }]}>
                <Text style={[styles.badgeText, { color: c.tx }]}>{notif.room}</Text>
              </View>
            )}
          </View>
        )}

        {notif.type === 'room_reservation' && notif.reason && (
          <Text style={{ fontSize: 11, color: ts, marginTop: 7, fontWeight: '600' }}>
            Reserved for {notif.reason}
          </Text>
        )}

        {notif.body ? (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{ fontSize: 12, color: dark ? '#C4B5FD' : '#4A3A7A', lineHeight: 18 }}
              numberOfLines={expanded ? undefined : 2}>
              {notif.body}
            </Text>
            {notif.body.length > 80 && (
              <TouchableOpacity onPress={() => setExpanded(!expanded)}>
                <Text style={{ color: C.blue, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
                  {expanded ? 'Show less ↑' : 'Read more ↓'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={{ fontSize: 10, color: dark ? '#4A3A7A' : '#B0A8D8' }}>{notif.postedBy}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
  pinStrip: { height: 3 },
  inner:    { padding: 12 },
  topRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBox:  { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 3, alignItems: 'center' },
  badge:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  badgeText:{ fontSize: 10, fontWeight: '700' },
  title:    { fontSize: 13, fontWeight: '700' },
  actions:  { flexDirection: 'column', gap: 2, flexShrink: 0 },
  actionBtn:{ padding: 3 },
  dateRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  footer:   { marginTop: 10 },
});
