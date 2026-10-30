import React, { useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { C } from '../../constants/colors';
import { EVENT_CATS } from '../../constants/config';
import { ErrBanner, PrimaryButton, SectionLabel } from '../ui';
import { storageUpload } from '../../firebase/firestore';

export default function EventPostModal({ visible, dark, onClose, onPost, editEvent }) {
  const isEdit = !!editEvent;
  const [step,        setStep]        = useState(isEdit ? 2 : 1);
  const [cat,         setCat]         = useState(editEvent?.cat        || 'academic');
  const [title,       setTitle]       = useState(editEvent?.title      || '');
  const [date,        setDate]        = useState(editEvent?.date       || '');
  const [time,        setTime]        = useState(editEvent?.time       || '');
  const [endTime,     setEndTime]     = useState(editEvent?.endTime    || '');
  const [venue,       setVenue]       = useState(editEvent?.venue      || '');
  const [hasDeadline, setHasDeadline] = useState(!!(editEvent?.deadline));
  const [deadline,    setDeadline]    = useState(editEvent?.deadline   || '');
  const [contact,     setContact]     = useState(editEvent?.contact    || '');
  const [body,        setBody]        = useState(editEvent?.body       || '');
  const [images,      setImages]      = useState(editEvent?.images     || []);
  const [err,         setErr]         = useState('');
  const [showDatePick,     setShowDatePick]     = useState(false);
  const [showStartPick,    setShowStartPick]    = useState(false);
  const [showEndPick,      setShowEndPick]      = useState(false);
  const [showDeadlinePick, setShowDeadlinePick] = useState(false);
  const [dateObj,     setDateObj]     = useState(new Date());
  const [startObj,    setStartObj]    = useState(new Date());
  const [endObj,      setEndObj]      = useState(new Date());
  const [deadlineObj, setDeadlineObj] = useState(new Date());

  const bg  = dark ? '#1A1A3E' : '#FFFFFF';
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const ib  = dark ? '#0A0A1E' : '#F8F7FF';
  const inp = { borderWidth: 1.5, borderColor: bdr, borderRadius: 12, padding: 11, color: tp, backgroundColor: ib, fontSize: 13, marginBottom: 12 };

  async function pickImage() {
    if (images.length >= 3) return;
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ImagePicker.MediaTypeOptions.Images, 
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.1,
      base64: true 
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      // Since Firebase Storage is unavailable, use base64 data URI
      const imageUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      setImages(prev => [...prev, { uri: imageUri }]);
    }
  }

  const [uploading, setUploading] = useState(false);

  async function handlePost() {
    if (!title.trim()) { setErr('Event title is required.'); return; }
    if (!date)         { setErr('Event date is required.'); return; }
    if (!venue.trim()) { setErr('Venue is required.'); return; }
    
    setUploading(true);
    setErr('');
    try {
      // Bypass Firebase Storage and use the base64 data URIs directly
      const finalImages = images;

      onPost({
        id:       editEvent?.id || `${Date.now()}`,
        cat, title, date, time, endTime, venue,
        deadline: hasDeadline ? deadline : null,
        contact, body, images: finalImages,
        postedBy:   editEvent?.postedBy || 'Staff',
        createdAt:  editEvent?.createdAt || new Date().toISOString().split('T')[0],
      });
      handleClose();
    } catch (e) {
      setErr('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    if (!isEdit) {
      setStep(1); setCat('academic'); setTitle(''); setDate(''); setTime('');
      setEndTime(''); setVenue(''); setHasDeadline(false); setDeadline('');
      setContact(''); setBody(''); setImages([]);
    }
    setErr(''); onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: bg, borderTopColor: bdr }]}>
          <View style={[styles.handle, { backgroundColor: ts }]} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── Step 1: Warning ── */}
            {step === 1 && (
              <>
                <View style={styles.warnBox}>
                  <Text style={styles.warnTitle}>⚠️ Before You Post</Text>
                  <Text style={styles.warnText}>• Only post real university-related events.</Text>
                  <Text style={styles.warnText}>• False or misleading posts may result in account suspension.</Text>
                  <Text style={styles.warnText}>• You are responsible for the accuracy of your post.</Text>
                </View>
                <PrimaryButton label="I Understand — Continue" onPress={() => setStep(2)} />
                <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
                  <Text style={{ color: ts, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 2: Form ── */}
            {step === 2 && (
              <>
                <Text style={[styles.heading, { color: tp }]}>{isEdit ? 'Edit Event' : 'New Event'}</Text>

                {/* Category */}
                <SectionLabel text="Category" dark={dark} />
                <View style={styles.chipRow}>
                  {EVENT_CATS.map(c => (
                    <TouchableOpacity key={c.key} onPress={() => setCat(c.key)}
                      style={[styles.catChip, { backgroundColor: cat === c.key ? c.color : ib, borderColor: cat === c.key ? c.color : bdr }]}>
                      <Text style={[styles.catChipText, { color: cat === c.key ? '#fff' : ts }]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <SectionLabel text="Event Title *" dark={dark} />
                <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Annual Sports Gala"
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} style={inp} />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="Date *" dark={dark} />
                    <TouchableOpacity onPress={() => setShowDatePick(true)}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 12, color: date ? tp : (dark?'#4A3A7A':'#B0A8D8') }}>{date || 'YYYY-MM-DD'}</Text>
                      <Text>📅</Text>
                    </TouchableOpacity>
                    {showDatePick && (
                      <DateTimePicker value={dateObj} mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, s) => { setShowDatePick(Platform.OS === 'ios'); if (s) { setDateObj(s); setDate(s.toISOString().split('T')[0]); } }} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="Start" dark={dark} />
                    <TouchableOpacity onPress={() => setShowStartPick(true)}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 12, color: time ? tp : (dark?'#4A3A7A':'#B0A8D8') }}>{time || 'HH:MM'}</Text>
                      <Text>⏰</Text>
                    </TouchableOpacity>
                    {showStartPick && (
                      <DateTimePicker value={startObj} mode="time" is24Hour
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, s) => { setShowStartPick(Platform.OS === 'ios'); if (s) { setStartObj(s); setTime(`${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`); } }} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="End" dark={dark} />
                    <TouchableOpacity onPress={() => setShowEndPick(true)}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 12, color: endTime ? tp : (dark?'#4A3A7A':'#B0A8D8') }}>{endTime || 'HH:MM'}</Text>
                      <Text>⏰</Text>
                    </TouchableOpacity>
                    {showEndPick && (
                      <DateTimePicker value={endObj} mode="time" is24Hour
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, s) => { setShowEndPick(Platform.OS === 'ios'); if (s) { setEndObj(s); setEndTime(`${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`); } }} />
                    )}
                  </View>
                </View>

                <SectionLabel text="Venue *" dark={dark} />
                <TextInput value={venue} onChangeText={setVenue} placeholder="e.g. CS Block Ground Floor"
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} style={inp} />

                {/* Deadline toggle */}
                <TouchableOpacity onPress={() => setHasDeadline(!hasDeadline)} style={styles.checkRow}>
                  <View style={[styles.checkbox, { borderColor: bdr, backgroundColor: hasDeadline ? C.purple : ib }]}>
                    {hasDeadline && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: tp }}>Has registration / application deadline</Text>
                </TouchableOpacity>
                {hasDeadline && (
                  <>
                    <TouchableOpacity onPress={() => setShowDeadlinePick(true)}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                      <Text style={{ fontSize: 13, color: deadline ? tp : (dark?'#4A3A7A':'#B0A8D8') }}>{deadline ? deadline.replace('T',' ') : 'Select deadline'}</Text>
                      <Text>⏰</Text>
                    </TouchableOpacity>
                    {showDeadlinePick && (
                      <DateTimePicker value={deadlineObj} mode="datetime"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={(_, s) => { setShowDeadlinePick(Platform.OS === 'ios'); if (s) { setDeadlineObj(s); setDeadline(s.toISOString().slice(0,16)); } }} />
                    )}
                  </>
                )}

                <SectionLabel text="Contact / Info" dark={dark} />
                <TextInput value={contact} onChangeText={setContact} placeholder="e.g. Dr. Ahmed — Room 204"
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} style={inp} />

                <SectionLabel text="Details (optional)" dark={dark} />
                <TextInput value={body} onChangeText={setBody} placeholder="Describe the event..."
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} multiline numberOfLines={3}
                  style={[inp, { height: 72, textAlignVertical: 'top' }]} />

                {/* Image picker */}
                <SectionLabel text={`Images (max 3 · ${images.length}/3)`} dark={dark} />
                <TouchableOpacity onPress={pickImage}
                  style={[styles.imgPickBtn, { borderColor: bdr, backgroundColor: ib }]}>
                  <Text style={{ color: ts, fontWeight: '600' }}>📷 Add Image</Text>
                </TouchableOpacity>
                {images.length > 0 && (
                  <View style={styles.imgPreviewRow}>
                    {images.map((img, i) => (
                      <TouchableOpacity key={i} onPress={() => setImages(prev => prev.filter((_,j) => j !== i))}>
                        <View style={[styles.imgThumb, { backgroundColor: dark ? '#2A1C6B' : '#EDE9FF' }]}>
                          <Text style={{ fontSize: 20 }}>🖼️</Text>
                          <Text style={{ fontSize: 8, color: ts }}>tap to remove</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <ErrBanner msg={err} />
                {uploading ? (
                  <View style={{ alignItems: 'center', padding: 14 }}>
                    <ActivityIndicator size="small" color={C.purple} />
                    <Text style={{ fontSize: 12, color: ts, marginTop: 8 }}>Uploading...</Text>
                  </View>
                ) : (
                  <PrimaryButton label={isEdit ? 'Save Changes' : 'Post Event'} onPress={handlePost} style={{ marginTop: 4 }} />
                )}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:   { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,15,74,0.5)' },
  sheet:     { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, padding: 20, paddingBottom: 40, maxHeight: '92%' },
  handle:    { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, opacity: 0.4 },
  heading:   { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  warnBox:   { backgroundColor: '#FEF9C3', borderWidth: 1, borderColor: '#CA8A04', borderRadius: 14, padding: 14, marginBottom: 18 },
  warnTitle: { fontSize: 13, fontWeight: '700', color: '#854D0E', marginBottom: 6 },
  warnText:  { fontSize: 12, color: '#854D0E', lineHeight: 20, marginBottom: 2 },
  cancelBtn: { alignItems: 'center', padding: 12, marginTop: 8 },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14, gap: 6 },
  catChip:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5 },
  catChipText: { fontSize: 10, fontWeight: '700' },
  checkRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  checkbox:  { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  imgPickBtn:{ borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  imgPreviewRow:{ flexDirection: 'row', gap: 8, marginBottom: 12 },
  imgThumb:  { width: 72, height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
