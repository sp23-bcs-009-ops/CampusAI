import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
} from 'react-native';
import DateTimeField from '../DateTimeField';
import { C } from '../../constants/colors';
import { EVENT_CATS } from '../../constants/config';
import { PostSubmit, PrimaryButton, SectionLabel } from '../ui';
import { pickPostImage } from '../../utils/postImages';

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

  const bg  = dark ? '#1A1A3E' : '#FFFFFF';
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const ib  = dark ? '#0A0A1E' : '#F8F7FF';
  const inp = { borderWidth: 1.5, borderColor: bdr, borderRadius: 12, padding: 11, color: tp, backgroundColor: ib, fontSize: 13, marginBottom: 12 };

  async function pickImage() {
    const image = await pickPostImage(images, 3);
    if (image) setImages(prev => [...prev, image]);
  }

  const [uploading, setUploading] = useState(false);

  async function handlePost() {
    if (!title.trim()) { setErr('Event title is required.'); return; }
    if (!date)         { setErr('Event date is required.'); return; }
    if (!venue.trim()) { setErr('Venue is required.'); return; }
    
    setUploading(true);
    setErr('');
    try {
      onPost({
        id:       editEvent?.id || `${Date.now()}`,
        cat, title, date, time, endTime, venue,
        deadline: hasDeadline ? deadline : null,
        contact, body, images,
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
    <PostModalShell visible={visible} onClose={handleClose} backgroundColor={bg} borderColor={bdr} handleColor={ts}>


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
                    <DateTimeField value={date || 'YYYY-MM-DD'} textColor={date ? tp : (dark ? '#4A3A7A' : '#B0A8D8')} fontSize={12} mode="date" icon="📅" onChange={setDate}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="Start" dark={dark} />
                    <DateTimeField value={time || 'HH:MM'} textColor={time ? tp : (dark ? '#4A3A7A' : '#B0A8D8')} fontSize={12} mode="time" icon="⏰" is24Hour onChange={setTime}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="End" dark={dark} />
                    <DateTimeField value={endTime || 'HH:MM'} textColor={endTime ? tp : (dark ? '#4A3A7A' : '#B0A8D8')} fontSize={12} mode="time" icon="⏰" is24Hour onChange={setEndTime}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} />
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
                    <DateTimeField value={deadline ? deadline.replace('T', ' ') : 'Select deadline'} textColor={deadline ? tp : (dark ? '#4A3A7A' : '#B0A8D8')} mode="datetime" icon="⏰" onChange={setDeadline}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} />
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

                <PostSubmit error={err} uploading={uploading} label={isEdit ? 'Save Changes' : 'Post Event'} mutedColor={ts} onSubmit={handlePost} />
              </>
            )}

    </PostModalShell>
  );
}

const styles = StyleSheet.create({
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
