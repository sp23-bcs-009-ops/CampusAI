import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../constants/colors';
import { getAiServerUrl } from '../constants/network';
import { getAuthTokens } from '../firebase/firestore';

export default function TimetableUploadPanel({ dark, ttMeta, examTimetable, mode, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState('');

  const tp = dark ? '#EDE9FF' : '#1A0F4A';
  const ts = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  const ib = dark ? '#0A0A1E' : '#F8F7FF';
  const cardBg = dark ? '#12123A' : '#FFFFFF';
  const meta = mode === 'exam' ? examTimetable?.meta : ttMeta;

  async function handleUpload() {
    const isExamUpload = mode === 'exam';
    const result = await DocumentPicker.getDocumentAsync({
      type: isExamUpload
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = result.assets?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(null);
    setProgress(isExamUpload ? 'Sending Excel datesheet...' : 'Sending PDF...');
    try {
      const fileBlob = await fetch(file.uri).then(response => response.blob());
      const formData = new FormData();
      formData.append(isExamUpload ? 'xlsx' : 'pdf', fileBlob, file.name);
      if (!isExamUpload) {
        formData.append('version', `v${new Date().toLocaleDateString('en-GB')}`);
        formData.append('effectiveDate', new Date().toISOString().split('T')[0]);
      }
      formData.append('scheduleMode', isExamUpload ? 'exam' : 'regular');

      const { idToken } = getAuthTokens();
      if (!idToken) throw new Error('Please sign in again before uploading.');
      setProgress(isExamUpload ? 'Validating Excel sheets and exam rows...' : 'Extracting timetable cells with Python layout rules...');

      const response = await fetch(`${getAiServerUrl()}${isExamUpload ? '/upload-exam-timetable' : '/upload-timetable'}`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.detail || data.error || 'Server error');

      setStatus('success');
      setMsg(isExamUpload
        ? `✓ ${data.message}\nClasses: ${data.classCount} · Exams: ${data.rowCount}`
        : `✓ ${data.message}\nRooms: ${data.roomCount} · Subjects: ${data.subjectCount}`);
      onUploaded?.({});
    } catch (error) {
      setStatus('error');
      setMsg(error.message.includes('Network') || error.message.includes('fetch')
        ? `Cannot connect to FastAPI at ${getAiServerUrl()}. Check that the backend is running.`
        : `Error: ${error.message}`);
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: bdr }]}>
      <View style={[styles.header, { backgroundColor: C.purpleDark }]}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>📄 {mode === 'exam' ? 'Exam' : 'Regular'} Timetable Management</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>{mode === 'exam' ? 'Staff only · Excel datesheet' : 'Staff only · Text PDF'}</Text>
      </View>
      <View style={{ padding: 12 }}>
        {meta && <View style={[styles.infoBox, { backgroundColor: ib, borderColor: bdr }]}>
          <Text style={[styles.infoLabel, { color: ts }]}>CURRENT TIMETABLE</Text>
          {meta.version && meta.version !== 'pending'
            ? <>
              <Text style={{ fontSize: 12, fontWeight: '600', color: tp }}>{meta.version}{meta.effectiveDate ? ` · w.e.f ${meta.effectiveDate}` : ''}</Text>
              <Text style={{ fontSize: 10, color: ts }}>Uploaded by {meta.uploadedBy}</Text>
            </>
            : <Text style={{ fontSize: 11, color: ts, fontStyle: 'italic' }}>No timetable loaded yet</Text>}
        </View>}

        <TouchableOpacity onPress={handleUpload} disabled={uploading}
          style={[styles.uploadButton, { borderColor: bdr, backgroundColor: ib }]}>
          {uploading
            ? <>
              <ActivityIndicator color={C.purple} size="small" />
              <Text style={{ fontSize: 11, color: ts, marginTop: 8, textAlign: 'center' }}>{progress}</Text>
            </>
            : <>
              <Text style={{ fontSize: 22, marginBottom: 4 }}>⬆️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: tp }}>{mode === 'exam' ? 'Upload Exam Datesheet (Excel)' : 'Upload Timetable PDF'}</Text>
              <Text style={{ fontSize: 10, color: ts }}>{mode === 'exam' ? 'XLSX sheets · text_pdf_timetables' : 'Python layout rules · text_pdf_timetables'}</Text>
            </>}
        </TouchableOpacity>

        {status && <View style={[styles.status, {
          backgroundColor: status === 'success' ? '#DCFCE7' : '#FEE2E2',
          borderColor: status === 'success' ? '#16A34A' : '#FCA5A5',
        }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: status === 'success' ? '#166534' : '#B91C1C', lineHeight: 18 }}>{msg}</Text>
        </View>}

        <View style={[styles.status, { backgroundColor: '#EDE9FF', borderColor: '#9B7EF844', marginTop: 8 }]}>
          <Text style={{ fontSize: 10, color: '#6C47D4', fontWeight: '600' }}>Server URL is detected automatically from the current Expo host.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = {
  card: { marginHorizontal: 14, marginTop: 4, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  header: { padding: 12 },
  infoBox: { borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1 },
  infoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  uploadButton: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 8 },
  status: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
};
