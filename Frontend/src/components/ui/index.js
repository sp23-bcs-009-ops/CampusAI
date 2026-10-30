import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Ellipse, Text as SvgText } from 'react-native-svg';
import { C } from '../../constants/colors';

// ─── COMSATS Logo ─────────────────────────────────────────────────────────
export function COMSATSLogo({ size = 40 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="48" fill="#3D2B8E" />
      <Circle cx="50" cy="50" r="34" fill="#1A56B0" />
      <Ellipse cx="50" cy="50" rx="8"  ry="26" fill="none" stroke="white" strokeWidth="2.5" />
      <Ellipse cx="50" cy="50" rx="17" ry="26" fill="none" stroke="white" strokeWidth="2" />
      <Ellipse cx="50" cy="50" rx="26" ry="26" fill="none" stroke="white" strokeWidth="1.5" />
      <Ellipse cx="50" cy="50" rx="26" ry="7"  fill="none" stroke="white" strokeWidth="1.8" />
      <Path d="M 18 72 A 38 38 0 0 0 82 72" fill="white" />
      <SvgText x="50" y="84" textAnchor="middle" fontSize="8" fill="#3D2B8E" fontWeight="700">ISLAMABAD</SvgText>
    </Svg>
  );
}

// ─── Primary button ───────────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, style, disabled, loading }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.primaryBtn, style, (disabled || loading) && styles.btnDisabled]}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={styles.primaryBtnText}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

// ─── Input field ──────────────────────────────────────────────────────────
export function InputField({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, dark, style }) {
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const bdr = dark ? '#3D2B8E' : '#E2E0F5';
  const bg  = dark ? '#0A0A1E' : '#F8F7FF';
  return (
    <View style={{ marginBottom: 13 }}>
      {label && <Text style={[styles.inputLabel, { color: C.purple }]}>{label}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? '#4A3A7A' : '#B0A8D8'}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        style={[styles.input, { borderColor: bdr, backgroundColor: bg, color: tp }, style]}
      />
    </View>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────
export function ErrBanner({ msg }) {
  if (!msg) return null;
  return (
    <View style={styles.errBanner}>
      <Text style={styles.errText}>{msg}</Text>
    </View>
  );
}

// ─── Section label ────────────────────────────────────────────────────────
export function SectionLabel({ text, dark }) {
  return (
    <Text style={[styles.sectionLabel, { color: dark ? '#9B7EF8' : C.purple }]}>{text}</Text>
  );
}

// ─── Pill / chip button ───────────────────────────────────────────────────
export function Chip({ label, active, onPress, activeColor, dark }) {
  const bg  = active ? (activeColor || C.purple) : (dark ? 'rgba(255,255,255,0.12)' : '#EDE9FF');
  const tx  = active ? '#fff' : (dark ? 'rgba(255,255,255,0.85)' : C.purple);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: tx }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Dark mode toggle ─────────────────────────────────────────────────────
export function DarkToggle({ dark, onToggle }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.8}
      style={styles.darkToggle}>
      <Text style={{ fontSize: 16 }}>{dark ? '☀️' : '🌙'}</Text>
    </TouchableOpacity>
  );
}

// ─── Info row (My Page) ───────────────────────────────────────────────────
export function InfoRow({ label, value, dark, children }) {
  const tp  = dark ? '#EDE9FF' : '#1A0F4A';
  const ts  = dark ? '#9B7EF8' : '#6C47D4';
  const bdr = dark ? '#2A1C6B' : '#E2E0F5';
  return (
    <View style={[styles.infoRow, { borderBottomColor: bdr }]}>
      <Text style={[styles.infoLabel, { color: ts }]}>{label}</Text>
      {children || <Text style={[styles.infoValue, { color: tp }]}>{value || '—'}</Text>}
    </View>
  );
}

// ─── Warning banner ───────────────────────────────────────────────────────
export function WarningBanner({ msg, dark }) {
  return (
    <View style={[styles.warnBanner, { backgroundColor: dark ? '#2A1C0A' : '#FEF9C3' }]}>
      <Text style={{ fontSize: 10, color: '#854D0E', fontWeight: '600' }}>⚠️ {msg}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  primaryBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.purple,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 5 },
  input: {
    borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 13,
  },

  errBanner: {
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: 10, padding: 10, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
  },
  errText: { color: '#B91C1C', fontSize: 12, fontWeight: '600', flex: 1 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 8,
  },

  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, marginRight: 5, marginBottom: 5,
  },
  chipText: { fontSize: 10, fontWeight: '700' },

  darkToggle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  infoRow: {
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  infoLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { fontSize: 13, fontWeight: '600' },

  warnBanner: {
    borderWidth: 1, borderColor: '#CA8A04',
    borderRadius: 10, padding: 10, marginTop: 10,
  },
});
