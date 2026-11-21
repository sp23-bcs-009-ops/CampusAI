import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C } from '../constants/colors';
import {
  DEFAULT_LT_PERIOD_SETTINGS,
  normalizeLTPeriodSettings,
} from '../utils/ltPeriodSettings';

const BREAK_DURATIONS = [5, 10, 15, 20, 30];
const BREAK_POSITIONS = [1, 2, 3, 4, 5];

export default function LTPeriodSettingsPanel({ dark, settings, loading, onSave, onReset }) {
  const [draft, setDraft] = useState(() => normalizeLTPeriodSettings(settings));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [customUnit, setCustomUnit] = useState('minutes');
  const text = dark ? '#EDE9FF' : '#1A0F4A';
  const muted = dark ? '#9B7EF8' : '#6C47D4';
  const border = dark ? '#2A1C6B' : '#E2E0F5';
  const selectedBg = dark ? '#2A1C6B' : '#EDE9FF';

  useEffect(() => {
    setDraft(normalizeLTPeriodSettings(settings));
    const duration = normalizeLTPeriodSettings(settings).durationMinutes;
    if (duration && ![30, 60].includes(duration)) {
      const useHours = duration % 60 === 0;
      setCustomAmount(String(useHours ? duration / 60 : duration));
      setCustomUnit(useHours ? 'hours' : 'minutes');
    }
  }, [settings]);

  function updateCustomDuration(amount = customAmount, unit = customUnit) {
    const duration = Number(amount) * (unit === 'hours' ? 60 : 1);
    setDraft(current => ({ ...current, durationMinutes: Number.isInteger(duration) && duration > 0 && duration <= 300 ? duration : null }));
  }

  async function saveDraft() {
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
    } catch (saveError) {
      setError(saveError?.message || 'Could not save LT period settings.');
    } finally {
      setSaving(false);
    }
  }

  async function resetToTimetable() {
    setSaving(true);
    setError('');
    try {
      await onReset();
      setDraft(DEFAULT_LT_PERIOD_SETTINGS);
      setAdvancedOpen(false);
    } catch (resetError) {
      setError(resetError?.message || 'Could not restore timetable defaults.');
    } finally {
      setSaving(false);
    }
  }

  function toggleBreakPosition(lectureNumber) {
    setDraft(current => {
      const breaksAfter = new Set(current.breaksAfter);
      if (breaksAfter.has(lectureNumber)) {
        if (breaksAfter.size === 1) return current;
        breaksAfter.delete(lectureNumber);
      } else {
        breaksAfter.add(lectureNumber);
      }
      return {
        ...current,
        breaksAfter: [...breaksAfter].sort((a, b) => a - b),
      };
    });
  }

  return (
    <View style={[styles.container, { borderColor: border }]}>
      <Text style={[styles.title, { color: text }]}>LT lecture periods</Text>
      <Text style={[styles.description, { color: muted }]}>
        Shared campus-wide. The timetable remains unchanged; reset restores its original times.
      </Text>

      <Text style={[styles.label, { color: text }]}>Class duration</Text>
      <View style={styles.options}>
        {[
          { value: null, label: 'Timetable default' },
          { value: 30, label: '30 min' },
          { value: 60, label: '1 hour' },
        ].map(option => (
          <TouchableOpacity
            key={String(option.value)}
            disabled={loading || saving}
            onPress={() => setDraft(current => ({ ...current, durationMinutes: option.value }))}
            style={[styles.option, { borderColor: border }, draft.durationMinutes === option.value && { backgroundColor: selectedBg, borderColor: C.purple }]}>
            <Text style={[styles.optionText, { color: text }]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          disabled={loading || saving}
          onPress={() => updateCustomDuration()}
          style={[styles.option, { borderColor: border }, draft.durationMinutes !== null && ![30, 60].includes(draft.durationMinutes) && { backgroundColor: selectedBg, borderColor: C.purple }]}>
          <Text style={[styles.optionText, { color: text }]}>Custom</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <TextInput keyboardType="number-pad" value={customAmount} onChangeText={value => { setCustomAmount(value); if (draft.durationMinutes !== null && ![30, 60].includes(draft.durationMinutes)) updateCustomDuration(value); }} placeholder="Duration" placeholderTextColor={muted} style={[styles.customInput, { color: text, borderColor: border }]} />
        {['minutes', 'hours'].map(unit => <TouchableOpacity key={unit} onPress={() => { setCustomUnit(unit); if (draft.durationMinutes !== null && ![30, 60].includes(draft.durationMinutes)) updateCustomDuration(customAmount, unit); }} style={[styles.option, { borderColor: customUnit === unit ? C.purple : border, backgroundColor: customUnit === unit ? selectedBg : 'transparent' }]}><Text style={[styles.optionText, { color: text }]}>{unit}</Text></TouchableOpacity>)}
      </View>
      <Text style={[styles.description, { color: muted, marginTop: 0 }]}>Custom duration: enter 1–300 minutes or 1–5 hours, then select Custom.</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: text, marginBottom: 2 }]}>Break</Text>
          <Text style={[styles.description, { color: muted, marginTop: 0 }]}>
            {draft.breaksAfter.map(number => `after Lec ${number}`).join(', ') || 'No break position selected'}
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.breakEnabled }}
          disabled={loading || saving}
          onPress={() => setDraft(current => ({ ...current, breakEnabled: !current.breakEnabled }))}
          style={[styles.toggle, { backgroundColor: draft.breakEnabled ? '#DCFCE7' : selectedBg }]}>
          <Text style={{ color: draft.breakEnabled ? '#166534' : muted, fontSize: 11, fontWeight: '800' }}>
            {draft.breakEnabled ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      {draft.breakEnabled && (
        <>
          <Text style={[styles.label, { color: text }]}>Break length</Text>
          <View style={styles.options}>
            {BREAK_DURATIONS.map(minutes => (
              <TouchableOpacity
                key={minutes}
                disabled={loading || saving}
                onPress={() => setDraft(current => ({ ...current, breakDurationMinutes: minutes }))}
                style={[styles.option, { borderColor: border }, draft.breakDurationMinutes === minutes && { backgroundColor: selectedBg, borderColor: C.purple }]}>
                <Text style={[styles.optionText, { color: text }]}>{minutes} min</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={loading || saving}
            onPress={() => setAdvancedOpen(open => !open)}
            style={[styles.advancedButton, { borderColor: border }]}>
            <Text style={[styles.optionText, { color: C.purple }]}>
              {advancedOpen ? 'Hide advanced settings' : 'Advanced settings'}
            </Text>
          </TouchableOpacity>
          {advancedOpen && (
            <View style={[styles.advanced, { borderColor: border }]}>
              <Text style={[styles.description, { color: muted, marginTop: 0, marginBottom: 8 }]}>
                Select each lecture after which a break is inserted. Default: one break after Lec 3.
              </Text>
              <View style={styles.options}>
                {BREAK_POSITIONS.map(number => {
                  const selected = draft.breaksAfter.includes(number);
                  return (
                    <TouchableOpacity
                      key={number}
                      disabled={loading || saving}
                      onPress={() => toggleBreakPosition(number)}
                      style={[styles.option, { borderColor: selected ? C.purple : border }, selected && { backgroundColor: selectedBg }]}>
                      <Text style={[styles.optionText, { color: text }]}>After Lec {number}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[styles.description, { color: muted, marginBottom: 0 }]}>
                {draft.breaksAfter.length} break{draft.breaksAfter.length === 1 ? '' : 's'} selected.
              </Text>
            </View>
          )}
        </>
      )}

      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <TouchableOpacity
          disabled={loading || saving}
          onPress={resetToTimetable}
          style={[styles.secondaryAction, { borderColor: border }]}>
          <Text style={[styles.optionText, { color: muted }]}>Reset to timetable</Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={loading || saving}
          onPress={saveDraft}
          style={[styles.primaryAction, { backgroundColor: C.purple, opacity: loading || saving ? 0.6 : 1 }]}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Apply campus-wide'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 12, padding: 11, gap: 8 },
  title: { fontSize: 12, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  description: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  optionText: { fontSize: 10, fontWeight: '700' },
  customInput: { minWidth: 90, borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggle: { minWidth: 64, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  advancedButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  advanced: { borderWidth: 1, borderRadius: 10, padding: 9, gap: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 7, marginTop: 4 },
  secondaryAction: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  primaryAction: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  primaryText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  error: { color: '#DC2626', fontSize: 10 },
});
