import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { C } from '../../constants/colors';
import { EVENT_CATS } from '../../constants/config';
import { getEventStatus, fmtDatetime } from '../../utils/helpers';

const STATUS_STYLE = {
  ongoing:  { bg: '#DCFCE7', tx: '#166534', label: 'Ongoing' },
  upcoming: { bg: '#EDE9FF', tx: '#3D2B8E', label: 'Upcoming' },
  ended:    { bg: '#F3F4F6', tx: '#6B7280', label: 'Ended' },
  closed:   { bg: '#FEE2E2', tx: '#B91C1C', label: 'Registration Closed' },
};

export default function EventCard({ ev, dark, user, onEdit, onDelete }) {
  if (!ev) return null;
  
  const [expanded, setExpanded] = useState(false);
  const status = getEventStatus(ev);
  const cat    = EVENT_CATS.find(c => c.key === ev.cat) || EVENT_CATS[EVENT_CATS.length - 1];
  const ss     = STATUS_STYLE[status];
  const tp     = dark ? '#EDE9FF' : '#1A0F4A';
  const ts     = dark ? '#9B7EF8' : '#6C47D4';
  const bdr    = dark ? '#2A1C6B' : '#E2E0F5';
  const bg     = dark ? '#1A1A3E' : '#FFFFFF';

  const canModify = user?.type === 'teacher' || user?.type === 'staff';

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: bdr }]}>
      <View style={[styles.topStrip, { backgroundColor: cat.color }]} />
      <View style={styles.inner}>

        {/* Badges + title */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: cat.color + '18', borderColor: cat.color + '44' }]}>
            <Text style={[styles.badgeText, { color: cat.color }]}>{cat.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: ss.bg }]}>
            <Text style={[styles.badgeText, { color: ss.tx }]}>{ss.label}</Text>
          </View>
        </View>
        <Text style={[styles.title, { color: tp }]}>{ev.title}</Text>

        {/* Date / time / venue */}
        <View style={styles.metaBlock}>
          <Text style={[styles.metaLine, { color: tp }]}>
            📅 {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            {ev.time ? ` · ${ev.time}` : ''}
            {ev.endTime ? ` – ${ev.endTime}` : ''}
          </Text>
          <Text style={[styles.metaLine, { color: ts }]}>📍 {ev.venue}</Text>
          {ev.deadline && (
            <Text style={[styles.metaLine, { color: '#EF4444', fontWeight: '600' }]}>
              ⏰ Deadline: {fmtDatetime(ev.deadline)}
            </Text>
          )}
          {ev.contact && (
            <Text style={[styles.metaLine, { color: ts }]}>👤 {ev.contact}</Text>
          )}
        </View>

        {/* Body */}
        {ev.body ? (
          <>
            <Text style={{ fontSize: 12, color: dark ? '#C4B5FD' : '#4A3A7A', lineHeight: 18 }}
              numberOfLines={expanded ? undefined : 2}>
              {ev.body}
            </Text>
            {ev.body.length > 80 && (
              <TouchableOpacity onPress={() => setExpanded(!expanded)}>
                <Text style={{ color: C.blue, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
                  {expanded ? 'Show less ↑' : 'Read more ↓'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}

        {/* Image placeholders */}
        {ev.images?.length > 0 && (
          <View style={styles.imgRow}>
            {ev.images.map((img, i) => (
              <Image key={i} source={{ uri: img.uri }} style={[styles.imgThumb, { resizeMode: 'cover' }]} />
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={{ fontSize: 10, color: dark ? '#4A3A7A' : '#B0A8D8' }}>
            Posted by {ev.postedBy} · {ev.createdAt}
          </Text>
          {canModify && (
            <View style={styles.footerActions}>
              <TouchableOpacity onPress={() => onEdit(ev)} style={styles.actionBtn}>
                <Text style={{ fontSize: 13 }}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(ev)} style={styles.actionBtn}>
                <Text style={{ fontSize: 13 }}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card:       { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  topStrip:   { height: 4 },
  inner:      { padding: 12 },
  badgeRow:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  badge:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  title:      { fontSize: 14, fontWeight: '700', marginBottom: 8, lineHeight: 20 },
  metaBlock:  { gap: 4, marginBottom: 8 },
  metaLine:   { fontSize: 12, lineHeight: 18 },
  imgRow:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  imgThumb:   { width: 68, height: 68, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  footerActions: { flexDirection: 'row', gap: 6 },
  actionBtn:  { padding: 4 },
});
