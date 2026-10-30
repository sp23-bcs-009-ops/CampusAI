import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { ALLOWED_DOMAIN, USER_TYPES } from '../constants/config';
import { getSemester, getDepartmentLabel, getDept } from '../utils/helpers';
import { COMSATSLogo, InputField, PrimaryButton, ErrBanner } from '../components/ui';
import { authSignUp, authSignIn, authAnonymousSignIn, authSendVerification, authGetUser, authGoogleSignIn, saveUserProfile, getUserProfile } from '../firebase/firestore';
import { upsertTeacherRecord } from '../firebase/teachers';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

// ⚠️ Replace with your actual Google OAuth Client IDs from Google Cloud Console
const GOOGLE_CLIENT_ID_ANDROID = '245229034731-v0c3ul7q8206r6t8drttjen4lcbvb6c9.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID_WEB     = '245229034731-v0c3ul7q8206r6t8drttjen4lcbvb6c9.apps.googleusercontent.com';

export default function LoginScreen({ onLogin, onGuest }) {
  const [mode,        setMode]        = useState('login');
  const [step,        setStep]        = useState(1);
  const [selType,     setSelType]     = useState(null);
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [fullName,    setFullName]    = useState('');
  const [dob,         setDob]         = useState('');
  const [dobDate,     setDobDate]     = useState(new Date(2000, 0, 1));
  const [showDobPick, setShowDobPick] = useState(false);
  const [err,         setErr]         = useState('');
  const [isRepeater,  setIsRepeater]  = useState(false);
  const [repeatSem,   setRepeatSem]   = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [awaitVerify, setAwaitVerify] = useState(false);
  const [idToken,     setIdToken]     = useState(null);

  // ── Google Sign In ───────────────────────────────────────────────────────
  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    androidClientId: GOOGLE_CLIENT_ID_ANDROID,
    webClientId:     GOOGLE_CLIENT_ID_WEB,
  });

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { id_token } = googleResponse.authentication;
      handleGoogleResponse(id_token);
    }
  }, [googleResponse]);

  async function handleGoogleResponse(token) {
    setLoading(true); setErr('');
    try {
      const auth = await authGoogleSignIn(token);
      const gEmail = auth.email;
      if (!gEmail.endsWith(ALLOWED_DOMAIN)) {
        setErr(`Please use your university email (${ALLOWED_DOMAIN})`);
        setLoading(false); return;
      }
      const dept = getDept(gEmail);
      onLogin({
        email: gEmail,
        type: 'student',
        name: auth.displayName || gEmail.split('@')[0],
        fullName: auth.displayName || '',
        dob: '', phone: '',
        semester: getSemester(gEmail),
        department: getDepartmentLabel(gEmail),
        dept,
        photoUrl: auth.photoUrl || null,
      });
    } catch (ex) {
      setErr('Google sign in failed: ' + ex.message);
    } finally { setLoading(false); }
  }

  function validateEmail(mail) {
    if (!mail.endsWith(ALLOWED_DOMAIN)) return `Email must end with ${ALLOWED_DOMAIN}`;
    return null;
  }

  // BUG FIX: renamed param from `em` to `email` for clarity and consistency
  function buildUserObj(email) {
    const dept = getDept(email);
    return {
      email, type: selType || 'student',
      name: email.split('@')[0],
      fullName, dob, phone: '',
      semester: (selType === 'student' && isRepeater) ? repeatSem : getSemester(email),
      isRepeater: selType === 'student' ? isRepeater : false,
      department: getDepartmentLabel(email),
      dept,
    };
  }

  async function handleLogin() {
    const e = validateEmail(email);
    if (e) { setErr(e); return; }
    setErr(''); setLoading(true);
    try {
      const auth = await authSignIn(email, password);
      const profile = await getUserProfile(email);

if (profile) {
  if (profile.type === 'teacher' && profile.fullName) {
    const teacher = await upsertTeacherRecord({ name: profile.fullName });
    if (profile.teacherId !== teacher._docId) {
      profile.teacherId = teacher._docId;
      await saveUserProfile(email, profile);
    }
  }
  onLogin(profile);
} else {
  const profile = buildUserObj(email);
  if (profile.type === 'teacher') {
    const teacher = await upsertTeacherRecord({ name: profile.fullName });
    profile.teacherId = teacher._docId;
  }
  await saveUserProfile(email, profile);
  onLogin(profile);
}
    } catch (ex) {
      setErr(ex.message.includes('INVALID') ? 'Invalid email or password.' : ex.message);
    } finally { setLoading(false); }
  }

  async function handleTestLogin(type) {
    setLoading(true); setErr('');
    try {
      const auth = await authAnonymousSignIn();
      const normalizedType = type;
      const dept = 'cs';
      const departmentLabel = 'Test Account';
      onLogin({
        email: `test-${type}@local.test`,
        type: normalizedType,
        testMode: true,
        name: `Test ${type}`,
        fullName: `Test ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        dob: '', phone: '', semester: 7,
        department: departmentLabel,
        dept,
      });
    } catch (ex) {
      setErr('Test account failed: ' + ex.message);
    } finally { setLoading(false); }
  }

  // BUG FIX: handleSignupNext was placed after its usage — moved before render (consistent order)
  function handleSignupNext() {
    if (!selType) { setErr('Please select your role.'); return; }
    setErr(''); setStep(2);
  }

  async function handleSignupSubmit() {
    const e = validateEmail(email);
    if (e) { setErr(e); return; }
    if (!fullName.trim()) { setErr('Full name is required.'); return; }
    if (!dob)             { setErr('Date of birth is required.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setErr(''); setLoading(true);
    try {
      const auth = await authSignUp(email, password);
      await authSendVerification(auth.idToken);
      setIdToken(auth.idToken);
      setAwaitVerify(true);
    } catch (ex) {
      if (ex.message.includes('EMAIL_EXISTS')) {
        setErr('This email is already registered. Please sign in.');
      } else {
        setErr(ex.message);
      }
    } finally { setLoading(false); }
  }

async function handleCheckVerification() {
  setLoading(true); setErr('');
  try {
    const user = await authGetUser(idToken);
    if (user?.emailVerified) {
      const profile = buildUserObj(email);
      if (profile.type === 'teacher') {
        const teacher = await upsertTeacherRecord({ name: profile.fullName });
        profile.teacherId = teacher._docId;
      }
      await saveUserProfile(email, profile);
      onLogin(profile);
    } else {
      setErr('Email not verified yet. Please check your inbox and click the link.');
    }
  } catch (ex) {
    setErr(ex.message);
  } finally { setLoading(false); }
}

  async function handleResendVerification() {
    setLoading(true); setErr('');
    try {
      await authSendVerification(idToken);
      setErr('Verification email resent! Check your inbox.');
    } catch (ex) {
      setErr(ex.message);
    } finally { setLoading(false); }
  }

  const ROLE_ICONS = { student: '🎓', teacher: '👨‍🏫', staff: '🏢' };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={C.purple} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <COMSATSLogo size={52} />
            <View>
              <Text style={styles.headerSub}>COMSATS University Islamabad</Text>
              <Text style={styles.headerSub2}>Attock Campus</Text>
            </View>
          </View>
          <Text style={styles.appTitle}>University{'\n'}Assist <Text style={{ opacity: 0.6 }}>AI</Text></Text>
          <Text style={styles.appSub}>Your smart campus companion</Text>
        </View>

        {/* Tab toggle */}
        <View style={styles.tabRow}>
          {['login', 'signup'].map(m => (
            <TouchableOpacity key={m}
              onPress={() => { setMode(m); setErr(''); setStep(1); }}
              style={[styles.tabBtn, mode === m && styles.tabBtnActive]}>
              <Text style={[styles.tabBtnText, mode === m && styles.tabBtnTextActive]}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

          {/* ── Email Verification Waiting Screen ── */}
          {awaitVerify && (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>📧</Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1A0F4A', marginBottom: 8 }}>Check Your Email</Text>
              <Text style={{ fontSize: 13, color: '#6C47D4', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
                A verification link has been sent to{'\n'}<Text style={{ fontWeight: '700' }}>{email}</Text>{'\n\n'}Click the link in the email, then tap the button below.
              </Text>
              {err ? <ErrBanner msg={err} /> : null}
              {loading
                ? <ActivityIndicator color={C.purple} size="large" style={{ marginBottom: 16 }} />
                : <>
                    <PrimaryButton label="✓ I've Verified My Email" onPress={handleCheckVerification} style={{ marginBottom: 12, width: '100%' }} />
                    <TouchableOpacity onPress={handleResendVerification} style={{ padding: 10 }}>
                      <Text style={{ color: C.purple, fontSize: 13, fontWeight: '600' }}>Resend verification email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setAwaitVerify(false); setStep(2); }} style={{ padding: 10 }}>
                      <Text style={{ color: '#B0A8D8', fontSize: 12 }}>← Back to sign up</Text>
                    </TouchableOpacity>
                  </>
              }
            </View>
          )}

          {/* ── Login ── */}
          {!awaitVerify && mode === 'login' && (
            <View style={styles.authCard}>
              <InputField label="University Email" value={email} onChangeText={v => { setEmail(v); setErr(''); }}
                placeholder="sp23-bcs-012@cuiatk.edu.pk" keyboardType="email-address" />
              <InputField label="Password" value={password} onChangeText={setPassword}
                placeholder="••••••••" secureTextEntry />
              {err ? <ErrBanner msg={err} /> : null}
              {loading
                ? <ActivityIndicator color={C.purple} size="large" style={{ marginTop: 12 }} />
                : <PrimaryButton label="Sign In" onPress={handleLogin} style={{ marginTop: 4 }} />
              }
              <TouchableOpacity style={{ alignItems: 'center', marginTop: 10 }}>
                <Text style={{ color: C.purple, fontSize: 12, fontWeight: '600' }}>Forgot password?</Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.divLine} />
                <Text style={styles.divText}>OR</Text>
                <View style={styles.divLine} />
              </View>

              <TouchableOpacity
                onPress={() => googlePromptAsync()}
                disabled={!googleRequest || loading}
                style={[styles.guestBtn, { flexDirection: 'row', gap: 10, marginBottom: 10, borderColor: '#DB4437' }]}>
                <Text style={{ fontSize: 18 }}>🔴</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#DB4437' }}>Continue with Google</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onGuest} style={styles.guestBtn}>
                <Text style={styles.guestBtnText}>🌐 Continue as Guest</Text>
              </TouchableOpacity>
              <Text style={styles.guestNote}>Guest access · Limited features</Text>

              {__DEV__ && (
                <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#E2E0F5' }}>
                  <Text style={{ color: '#6C47D4', fontSize: 11, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
                    Development test account
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {['student', 'teacher', 'staff'].map(type => (
                      <TouchableOpacity key={type} onPress={() => handleTestLogin(type)} disabled={loading}
                        style={{ flexBasis: '48%', borderWidth: 1, borderColor: '#B0A8D8', borderRadius: 10, padding: 8, alignItems: 'center' }}>
                        <Text style={{ color: C.purple, fontSize: 11, fontWeight: '700' }}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── Sign Up Step 1: Role ── */}
          {!awaitVerify && mode === 'signup' && step === 1 && (
            <>
              <Text style={styles.stepLabel}>I am a...</Text>
              {USER_TYPES.map(u => (
                <TouchableOpacity key={u.id} onPress={() => setSelType(u.id)}
                  style={[styles.roleRow, selType === u.id && styles.roleRowActive]}>
                  <Text style={{ fontSize: 26 }}>{ROLE_ICONS[u.id]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleLabel, selType === u.id && { color: C.purple }]}>{u.label}</Text>
                    <Text style={styles.roleSub}>{u.sub}</Text>
                  </View>
                  {selType === u.id && <Text style={{ color: C.purple }}>✓</Text>}
                </TouchableOpacity>
              ))}
              {err ? <ErrBanner msg={err} /> : null}
              <PrimaryButton label="Continue →" onPress={handleSignupNext} style={{ marginTop: 16 }} />
            </>
          )}

          {/* ── Sign Up Step 2: Form ── */}
          {!awaitVerify && mode === 'signup' && step === 2 && (
            <>
              <TouchableOpacity onPress={() => setStep(1)} style={{ marginBottom: 12 }}>
                <Text style={{ color: C.purple, fontSize: 13, fontWeight: '600' }}>‹ Back</Text>
              </TouchableOpacity>
              <View style={[styles.roleBadge, { backgroundColor: '#EDE9FF' }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.purple }}>
                  {ROLE_ICONS[selType]} {USER_TYPES.find(u => u.id === selType)?.label}
                </Text>
              </View>
              <InputField label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="Ahmed Ali Khan" />
              {/* Date of Birth — calendar picker */}
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.purple, marginBottom: 4, marginTop: 4 }}>Date of Birth *</Text>
              <TouchableOpacity
                onPress={() => setShowDobPick(true)}
                style={{ borderWidth: 1.5, borderColor: '#E2E0F5', borderRadius: 12, padding: 11, marginBottom: 12, backgroundColor: '#FAFAFE', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: dob ? '#1A0F4A' : '#B0A8D8' }}>{dob || 'Select date of birth'}</Text>
                <Text style={{ fontSize: 16 }}>📅</Text>
              </TouchableOpacity>
              {showDobPick && (
                <DateTimePicker
                  value={dobDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onChange={(_, selected) => {
                    setShowDobPick(Platform.OS === 'ios');
                    if (selected) {
                      setDobDate(selected);
                      setDob(selected.toISOString().split('T')[0]);
                    }
                  }}
                />
              )}
              <InputField label="University Email" value={email} onChangeText={v => { setEmail(v); setErr(''); }}
                placeholder="sp23-bcs-012@cuiatk.edu.pk" keyboardType="email-address" />
              <InputField label="Password" value={password} onChangeText={setPassword}
                placeholder="Create a password" secureTextEntry />

              {/* Repeater toggle — students only */}
              {selType === 'student' && (
                <>
                  <TouchableOpacity
                    onPress={() => setIsRepeater(p => !p)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: isRepeater ? C.purple : '#E2E0F5', backgroundColor: isRepeater ? '#EDE9FF' : '#FAFAFE' }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: C.purple, backgroundColor: isRepeater ? C.purple : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {isRepeater && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isRepeater ? C.purple : '#1A0F4A' }}>I am a Repeater</Text>
                  </TouchableOpacity>

                  {isRepeater && (
                    <>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.purple, marginBottom: 6 }}>Select Your Current Semester *</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {[1,2,3,4,5,6,7,8].map(s => (
                          <TouchableOpacity key={s} onPress={() => setRepeatSem(s)}
                            style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 2, borderColor: repeatSem === s ? C.purple : '#E2E0F5', backgroundColor: repeatSem === s ? C.purple : '#FAFAFE', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: repeatSem === s ? '#fff' : '#1A0F4A' }}>{s}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
              {err ? <ErrBanner msg={err} /> : null}
              {loading
                ? <ActivityIndicator color={C.purple} size="large" style={{ marginTop: 12 }} />
                : <PrimaryButton label="Create Account" onPress={handleSignupSubmit} style={{ marginTop: 4 }} />
              }
            </>
          )}
        </ScrollView>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.purple },
  header:  { backgroundColor: C.purple, padding: 24, paddingBottom: 20 },
  headerInner: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  headerSub:   { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  headerSub2:  { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  appTitle:    { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5, lineHeight: 36 },
  appSub:      { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 },

  tabRow:      { flexDirection: 'row', backgroundColor: '#F0EEFF', margin: 16, borderRadius: 14, padding: 4 },
  tabBtn:      { flex: 1, padding: 10, borderRadius: 11, alignItems: 'center' },
  tabBtnActive:{ backgroundColor: C.purple },
  tabBtnText:  { fontSize: 13, fontWeight: '700', color: C.purple },
  tabBtnTextActive: { color: '#fff' },

  form:        { paddingHorizontal: 18, paddingBottom: 20, backgroundColor: '#fff', flexGrow: 1 },
  stepLabel:   { fontSize: 13, fontWeight: '700', color: C.purple, marginBottom: 12 },
  roleRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 13, borderRadius: 14, borderWidth: 2, borderColor: '#E2E0F5', marginBottom: 10, backgroundColor: '#FAFAFE' },
  roleRowActive: { borderColor: C.purple, backgroundColor: '#EDE9FF' },
  roleLabel:   { fontSize: 14, fontWeight: '700', color: '#1A0F4A' },
  roleSub:     { fontSize: 11, color: '#9B7EF8' },
  roleBadge:   { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14, alignItems: 'flex-start' },

  authCard:    { backgroundColor: '#fff', borderRadius: 18, marginHorizontal: 18, padding: 16, paddingBottom: 18, marginBottom: 20, boxShadow: '0 6px 12px rgba(26, 15, 74, 0.08)', elevation: 3 },
  divider:     { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  divLine:     { flex: 1, height: 1, backgroundColor: '#E2E0F5' },
  divText:     { marginHorizontal: 10, fontSize: 11, color: '#B0A8D8', fontWeight: '600' },
  guestBtn:    { borderWidth: 2, borderColor: '#E2E0F5', borderRadius: 14, padding: 12, alignItems: 'center', backgroundColor: '#FAFAFE' },
  guestBtnText:{ fontSize: 13, fontWeight: '700', color: C.purple },
  guestNote:   { textAlign: 'center', fontSize: 11, color: '#B0A8D8', marginTop: 6 },
});
