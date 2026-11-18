import { useState } from 'react';
import { Platform, Text, TouchableOpacity } from 'react-native';
import DateTimePicker from './DateTimePickerAdapter';

function formatValue(date, mode) {
  if (mode === 'date') return date.toISOString().split('T')[0];
  if (mode === 'datetime') return date.toISOString().slice(0, 16);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function DateTimeField({ value, textColor, style, fontSize = 13, mode, icon, is24Hour, onChange }) {
  const [visible, setVisible] = useState(false);
  const [date, setDate] = useState(() => new Date());

  return <>
    <TouchableOpacity onPress={() => setVisible(true)} style={style}>
      <Text style={{ fontSize, color: textColor }}>{value}</Text>
      <Text>{icon}</Text>
    </TouchableOpacity>
    {visible && <DateTimePicker
      value={date}
      mode={mode}
      is24Hour={is24Hour}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={(_, selected) => {
        setVisible(Platform.OS === 'ios');
        if (selected) {
          setDate(selected);
          onChange(formatValue(selected, mode));
        }
      }}
    />}
  </>;
}
