import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal, Pressable } from 'react-native';
import { C } from '../../constants/colors';
import { LF_CATS } from '../../constants/config';
import { fmtDate } from '../../utils/helpers';

export default function LFCard({ item, dark, user, onResolve, onEdit, onDelete }) {
  if (!item) return null;

  const images = Array.isArray(item.images) ? item.images : [];
  const getImageUri = (img) => {
    if (!img) return null;
    if (typeof img === 'string') return img;
    if (typeof img === 'object') {
      if (typeof img.uri === 'string') return img.uri;
      if (typeof img.url === 'string') return img.url;
      if (typeof img.imageUrl === 'string') return img.imageUrl;
      if (typeof img.photoUrl === 'string') return img.photoUrl;
      if (typeof img.path === 'string') return img.path;
    }
    return null;
  };

  const [expanded, setExpanded] = useState(false);
  const [viewerUri, setViewerUri] = useState(null);
  const cat         = LF_CATS.find(c => c.key === item.cat) || LF_CATS[LF_CATS.length - 1];
  const isFound     = item.type === 'found';
  const typeColor   = isFound ? '#16A34A' : '#EF4444';
  const typeBg      = isFound ? '#DCFCE7' : '#FEE2E2';
  const tp          = dark ? '#EDE9FF' : '#1A0F4A';
  const ts          = dark ? '#9B7EF8' : '#6C47D4';
  const bdr         = dark ? '#2A1C6B' : '#E2E0F5';
  const bg          = item.resolved ? (dark ? '#1A1A2A' : '#F8F9FA') : (dark ? '#1A1A3E' : '#FFFFFF');
  const imageUris   = images.map(getImageUri).filter(Boolean);
  const fallbackUri = getImageUri(item.image) || getImageUri(item.imageUrl) || getImageUri(item.photoUrl);
  const allUris     = imageUris.length > 0 ? imageUris : (fallbackUri ? [fallbackUri] : []);

  // Permissions
  const canResolve = user?.type === 'staff';
  const canModify  = user?.type === 'staff';

  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: bdr, opacity: item.resolved ? 0.65 : 1 }]}>
      <View style={[styles.topStrip, { backgroundColor: typeColor }]} />
      <View style={styles.inner}>

        <View style={styles.topRow}>
          {/* Icon */}
          <View style={[styles.iconBox, { backgroundColor: typeBg, borderColor: typeColor + '44' }]}>
            <Text style={{ fontSize: 18 }}>
              {item.cat === 'phone' ? '📱' : item.cat === 'wallet' ? '👜' :
               item.cat === 'bag' ? '🎒' : item.cat === 'stationery' ? '✏️' :
               item.cat === 'clothing' ? '👕' : '📦'}
            </Text>
          </View>
          {/* Info */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: typeBg }]}>
                <Text style={[styles.badgeText, { color: typeColor }]}>{isFound ? 'Found' : 'Lost'}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: dark ? '#2A1C6B' : '#EDE9FF' }]}>
                <Text style={[styles.badgeText, { color: ts }]}>{cat.label}</Text>
              </View>
              {item.resolved && (
                <View style={[styles.badge, { backgroundColor: '#DCFCE7' }]}>
                  <Text style={[styles.badgeText, { color: '#166534' }]}>✓ Resolved</Text>
                </View>
              )}
            </View>
            <Text style={[styles.title, { color: tp }]}>{item.title}</Text>
          </View>
          {/* Actions */}
          {canResolve && !item.resolved && (
            <TouchableOpacity onPress={() => onResolve(item)} style={styles.resolveBtn}>
              <Text style={{ fontSize: 18 }}>✅</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Meta */}
        <View style={styles.metaBlock}>
          <Text style={{ fontSize: 11, color: ts }}>📍 {item.location}</Text>
          <Text style={{ fontSize: 11, color: ts }}>
            🕐 {fmtDate(item.date)}{item.time ? ` at ${item.time}` : ''}
          </Text>
          {item.contact && (
            <Text style={{ fontSize: 11, color: ts }}>📞 {item.contact}</Text>
          )}
        </View>

        {/* Body */}
        {item.body ? (
          <>
            <Text style={{ fontSize: 12, color: dark ? '#C4B5FD' : '#4A3A7A', lineHeight: 18 }}
              numberOfLines={expanded ? undefined : 2}>
              {item.body}
            </Text>
            {item.body.length > 60 && (
              <TouchableOpacity onPress={() => setExpanded(!expanded)}>
                <Text style={{ color: C.blue, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
                  {expanded ? 'Show less ↑' : 'Read more ↓'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}

        {/* Images */}
        {allUris.length > 0 && (
          <View style={styles.imgRow}>
            {allUris.map((uri, i) => (
              <TouchableOpacity key={`${item.id}-img-${i}`} activeOpacity={0.85} onPress={() => setViewerUri(uri)}>
                <Image source={{ uri }} style={styles.imgThumb} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Modal visible={!!viewerUri} transparent animationType="fade" onRequestClose={() => setViewerUri(null)}>
          <Pressable style={styles.viewerOverlay} onPress={() => setViewerUri(null)}>
            <View style={styles.viewerBox}>
              {viewerUri ? <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" /> : null}
              <Text style={styles.viewerText}>Tap anywhere to close</Text>
            </View>
          </Pressable>
        </Modal>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={{ fontSize: 10, color: dark ? '#4A3A7A' : '#B0A8D8' }}>
            By {item.postedBy} · {item.createdAt}
          </Text>
          {canModify && (
            <View style={styles.footerActions}>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(item)} style={styles.actionBtn}>
                  <Text style={{ fontSize: 13 }}>✏️</Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={() => onDelete(item)} style={styles.actionBtn}>
                  <Text style={{ fontSize: 13 }}>🗑️</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card:       { borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
  topStrip:   { height: 3 },
  inner:      { padding: 12 },
  topRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconBox:    { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 3, alignItems: 'center' },
  badge:      { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  title:      { fontSize: 13, fontWeight: '700' },
  resolveBtn: { padding: 4, flexShrink: 0 },
  metaBlock:  { gap: 3, marginVertical: 8 },
  imgRow:     { flexDirection: 'row', gap: 6, marginTop: 8 },
  imgThumb:   { width: 60, height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDE9FF' },
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(10,10,30,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  viewerBox:   { width: '100%', maxWidth: 540, alignItems: 'center' },
  viewerImage: { width: '100%', height: 420, borderRadius: 18, backgroundColor: '#000' },
  viewerText:  { marginTop: 12, color: '#fff', fontSize: 12, fontWeight: '600', opacity: 0.85 },
  footer:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  footerActions: { flexDirection: 'row', gap: 6 },
  actionBtn:  { padding: 4 },
});
