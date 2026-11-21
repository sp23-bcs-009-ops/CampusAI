import { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Image
} from 'react-native';
import DateTimeField from '../DateTimeField';
import { C } from '../../constants/colors';
import { LF_CATS } from '../../constants/config';
import { PostModalShell, PostSubmit, PrimaryButton, SectionLabel } from '../ui';
import { pickPostImage } from '../../utils/postImages';

export default function LFPostModal({ visible, dark, onClose, onPost }) {
  const [step,     setStep]     = useState(1);
  const [type,     setType]     = useState('found');
  const [cat,      setCat]      = useState('other');
  const [title,    setTitle]    = useState('');
  const [location, setLocation] = useState('');
  const [date,     setDate]     = useState('');
  const [time,     setTime]     = useState('');
  const [contact,  setContact]  = useState('');
  const [body,     setBody]     = useState('');
  const [images,   setImages]   = useState([]);
  const [err,      setErr]      = useState('');

  const bg  = dark ? '#1A1A3E' : '#FFFFFF';
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const ib  = dark ? '#0A0A1E' : '#F8F7FF';
  const inp = { borderWidth: 1.5, borderColor: bdr, borderRadius: 12, padding: 11, color: tp, backgroundColor: ib, fontSize: 13, marginBottom: 12 };

  async function pickImage() {
    const image = await pickPostImage(images, 2);
    if (image) setImages(prev => [...prev, image]);
  }

  const [uploading, setUploading] = useState(false);

  async function handlePost() {
    if (!title.trim())    { setErr('Title is required.'); return; }
    if (!location.trim()) { setErr('Location is required.'); return; }
    if (!date)            { setErr('Date is required.'); return; }
    
    setUploading(true);
    setErr('');
    try {
      onPost({
        id: `${Date.now()}`, type, cat, title, location, date, time, contact, body, images,
        resolved: false, postedBy: 'User',
        createdAt: new Date().toISOString().split('T')[0],
      });
      handleClose();
    } catch (e) {
      setErr('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  function handleClose() {
    setStep(1); setType('found'); setCat('other'); setTitle('');
    setLocation(''); setDate(''); setTime(''); setContact('');
    setBody(''); setImages([]); setErr(''); onClose();
  }

  return (
    <PostModalShell visible={visible} onClose={handleClose} backgroundColor={bg} borderColor={bdr} handleColor={ts}>


            {/* ── Step 1: Warning ── */}
            {step === 1 && (
              <>
                <View style={[styles.warnBox, { backgroundColor: dark ? '#1A1A3E' : '#EDE9FF', borderColor: C.purple + '44' }]}>
                  <Text style={[styles.warnTitle, { color: C.purple }]}>ℹ️ Responsible Posting</Text>
                  <Text style={[styles.warnText, { color: C.purpleDark }]}>• Post accurate item details and contact info.</Text>
                  <Text style={[styles.warnText, { color: C.purpleDark }]}>• Mark as resolved once the item is claimed.</Text>
                  <Text style={[styles.warnText, { color: C.purpleDark }]}>• Do not share sensitive personal information publicly.</Text>
                </View>
                <PrimaryButton label="Continue" onPress={() => setStep(2)} />
                <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
                  <Text style={{ color: ts, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 2: Form ── */}
            {step === 2 && (
              <>
                <Text style={[styles.heading, { color: tp }]}>Lost & Found Post</Text>

                {/* Found / Lost toggle */}
                <View style={[styles.toggleRow, { backgroundColor: dark ? '#0A0A1E' : '#F0EEFF' }]}>
                  {['found', 'lost'].map(t => (
                    <TouchableOpacity key={t} onPress={() => setType(t)}
                      style={[styles.toggleBtn, { backgroundColor: type === t ? (t === 'found' ? '#16A34A' : '#EF4444') : 'transparent' }]}>
                      <Text style={[styles.toggleText, { color: type === t ? '#fff' : ts }]}>
                        {t === 'found' ? '✓ Found' : '? Lost'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Category */}
                <SectionLabel text="Category" dark={dark} />
                <View style={styles.chipRow}>
                  {LF_CATS.map(c => (
                    <TouchableOpacity key={c.key} onPress={() => setCat(c.key)}
                      style={[styles.catChip, {
                        backgroundColor: cat === c.key ? C.purple : ib,
                        borderColor: cat === c.key ? C.purple : bdr,
                      }]}>
                      <Text style={[styles.catChipText, { color: cat === c.key ? '#fff' : ts }]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <SectionLabel text="Title *" dark={dark} />
                <TextInput value={title} onChangeText={setTitle} placeholder='"Blue backpack found"'
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} style={inp} />

                <SectionLabel text="Location *" dark={dark} />
                <TextInput value={location} onChangeText={setLocation} placeholder="Where found/lost"
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} style={inp} />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="Date *" dark={dark} />
                    <DateTimeField value={date || 'YYYY-MM-DD'} textColor={date ? tp : (dark ? '#4A3A7A' : '#B0A8D8')} mode="date" icon="📅" onChange={setDate}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SectionLabel text="Time" dark={dark} />
                    <DateTimeField value={time || 'HH:MM'} textColor={time ? tp : (dark ? '#4A3A7A' : '#B0A8D8')} mode="time" icon="⏰" is24Hour onChange={setTime}
                      style={[inp, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]} />
                  </View>
                </View>

                <SectionLabel text="Contact" dark={dark} />
                <TextInput value={contact} onChangeText={setContact} placeholder="Email or phone"
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} style={inp} />

                <SectionLabel text="Description (optional)" dark={dark} />
                <TextInput value={body} onChangeText={setBody} placeholder="Colour, brand, contents..."
                  placeholderTextColor={dark?'#4A3A7A':'#B0A8D8'} multiline numberOfLines={2}
                  style={[inp, { height: 60, textAlignVertical: 'top' }]} />

                {/* Image picker */}
                <SectionLabel text={`Images (max 2 · ${images.length}/2)`} dark={dark} />
                <TouchableOpacity onPress={pickImage}
                  style={[styles.imgPickBtn, { borderColor: bdr, backgroundColor: ib }]}>
                  <Text style={{ color: ts, fontWeight: '600' }}>📷 Add Image</Text>
                </TouchableOpacity>
                {images.length > 0 && (
                  <View style={styles.imgPreviewRow}>
                    {images.map((img, i) => (
                      <TouchableOpacity key={`${img.uri || i}`} onPress={() => setImages(prev => prev.filter((_,j) => j !== i))}>
                        <Image source={{ uri: img.uri }} style={styles.imgThumb} resizeMode="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <PostSubmit error={err} uploading={uploading} label="Post" mutedColor={ts} onSubmit={handlePost} />
              </>
            )}

    </PostModalShell>
  );
}

const styles = StyleSheet.create({
  heading:     { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  warnBox:     { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 18 },
  warnTitle:   { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  warnText:    { fontSize: 12, lineHeight: 20, marginBottom: 2 },
  cancelBtn:   { alignItems: 'center', padding: 12, marginTop: 8 },
  toggleRow:   { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 14 },
  toggleBtn:   { flex: 1, padding: 9, borderRadius: 10, alignItems: 'center' },
  toggleText:  { fontSize: 13, fontWeight: '700' },
  chipRow:     { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14, gap: 6 },
  catChip:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5 },
  catChipText: { fontSize: 10, fontWeight: '700' },
  imgPickBtn:  { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  imgPreviewRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  imgThumb:    { width: 72, height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
