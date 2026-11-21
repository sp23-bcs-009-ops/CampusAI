import React from 'react';

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatValue(date, mode) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (mode === 'date') return day;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return mode === 'time' ? time : `${day}T${time}`;
}

function parseValue(value, mode, currentValue) {
  if (mode === 'date') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  }

  if (mode === 'time') {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) return null;
    const date = new Date(currentValue);
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return date;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

export const DateTimePickerAndroid = {
  open() {
    throw new Error('Android date picker was called on web.');
  },
};

export default function DateTimePickerAdapter({
  value,
  mode = 'date',
  maximumDate,
  minimumDate,
  onChange,
}) {
  const type = mode === 'date' ? 'date' : mode === 'time' ? 'time' : 'datetime-local';
  return (
    React.createElement('input', {
      type,
      'aria-label': mode === 'date' ? 'Choose date' : mode === 'time' ? 'Choose time' : 'Choose date and time',
      value: formatValue(value, mode),
      max: maximumDate ? formatValue(maximumDate, mode) : undefined,
      min: minimumDate ? formatValue(minimumDate, mode) : undefined,
      onChange: event => {
        const input = event.target.value;
        let selected = parseValue(input, mode, value);
        if (!selected) return;

        if (mode === 'date') {
          if (maximumDate && formatValue(selected, mode) > formatValue(maximumDate, mode)) {
            selected = new Date(maximumDate.getFullYear(), maximumDate.getMonth(), maximumDate.getDate(), 12);
          } else if (minimumDate && formatValue(selected, mode) < formatValue(minimumDate, mode)) {
            selected = new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate(), 12);
          }
        } else if (maximumDate && selected > maximumDate) {
          selected = new Date(maximumDate);
        } else if (minimumDate && selected < minimumDate) {
          selected = new Date(minimumDate);
        }

        onChange?.({ type: 'set' }, selected);
      },
      style: {
        alignSelf: 'flex-start',
        minHeight: 38,
        borderWidth: 1,
        borderColor: '#C8C2DC',
        borderRadius: 8,
        padding: '6px 10px',
        backgroundColor: '#FFFFFF',
        color: '#1A0F4A',
        fontSize: 13,
      },
    })
  );
}
