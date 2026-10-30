import React, { useMemo, useState } from 'react';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const slotStart = (slot) => {
  const m = String(slot).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  let h = Number(m[1]);
  if (h <= 7) h += 12; // "1:30" style afternoon times
  return h * 60 + Number(m[2]);
};

export default function TimetableView({ classes }) {
  const classNames = useMemo(() => Object.keys(classes).sort(), [classes]);
  const [selected, setSelected] = useState(classNames[0] || '');
  const [search, setSearch] = useState('');

  const filteredNames = useMemo(
    () => classNames.filter((c) => c.toLowerCase().includes(search.toLowerCase())),
    [classNames, search]
  );

  const active = classes[selected] || {};

  // All slots used by this class, sorted by start time
  const slots = useMemo(() => {
    const s = new Set();
    for (const day of Object.values(active))
      for (const slot of Object.keys(day)) s.add(slot);
    return [...s].sort((a, b) => slotStart(a) - slotStart(b));
  }, [active]);

  const days = DAY_ORDER.filter((d) => active[d] && Object.keys(active[d]).length > 0);

  return (
    <div className="panel">
      <div className="controls">
        <input
          type="text"
          placeholder="🔍 Filter classes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {filteredNames.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {!selected || days.length === 0 ? (
        <div className="empty-state">
          <div className="big">📭</div>
          <p>No schedule found for this class.</p>
        </div>
      ) : (
        <div className="tt-wrap">
          <table className="tt">
            <thead>
              <tr>
                <th className="day-col">Day</th>
                {slots.map((s) => <th key={s}>{s}</th>)}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td className="day-label">{day}</td>
                  {slots.map((slot) => {
                    const entries = active[day]?.[slot] || [];
                    return (
                      <td key={slot} className="slot-cell">
                        {entries.length === 0 ? (
                          <div className="empty-cell">—</div>
                        ) : (
                          entries.map((e, i) => (
                            <div key={i} className={`lecture ${/lab/i.test(e.subject || '') ? 'lab' : ''}`}>
                              <div className="subj">{e.subject || 'N/A'}</div>
                              <div className="sub">
                                {e.teacher || 'N/A'}<br />
                                📍 {e.room || 'N/A'}
                              </div>
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
