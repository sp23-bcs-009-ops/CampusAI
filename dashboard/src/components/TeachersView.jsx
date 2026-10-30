import React, { useMemo, useState } from 'react';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const slotStart = (slot) => {
  const m = String(slot).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  let h = Number(m[1]);
  if (h <= 7) h += 12;
  return h * 60 + Number(m[2]);
};

export default function TeachersView({ teachers }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const names = useMemo(
    () =>
      Object.keys(teachers)
        .filter((n) => n.toLowerCase().includes(search.toLowerCase()))
        .sort(),
    [teachers, search]
  );

  return (
    <div className="panel">
      <div className="controls">
        <input
          type="text"
          placeholder="🔍 Search teachers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 380 }}
        />
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
          {names.length} teacher{names.length === 1 ? '' : 's'}
        </span>
      </div>

      {names.length === 0 ? (
        <div className="empty-state">
          <div className="big">🔍</div>
          <p>No teachers match "{search}".</p>
        </div>
      ) : (
        <div className="grid-cards">
          {names.map((name) => {
            const schedule = teachers[name] || [];
            const classSet = [...new Set(schedule.map((s) => s.class))];
            const isOpen = expanded === name;
            const sorted = [...schedule].sort(
              (a, b) =>
                DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) ||
                slotStart(a.time) - slotStart(b.time)
            );

            return (
              <div
                key={name}
                className="t-card"
                onClick={() => setExpanded(isOpen ? null : name)}
              >
                <div className="name">{name}</div>
                <div className="meta">
                  {schedule.length} lecture{schedule.length === 1 ? '' : 's'}/week · {classSet.length} class{classSet.length === 1 ? '' : 'es'}
                </div>
                <div className="chips">
                  {classSet.slice(0, 4).map((c) => <span key={c} className="chip">{c}</span>)}
                  {classSet.length > 4 && <span className="chip">+{classSet.length - 4}</span>}
                </div>

                {isOpen && (
                  <div className="t-detail">
                    {sorted.map((s, i) => (
                      <div key={i} className="t-row">
                        <span className="d">{s.day.slice(0, 3)}</span>
                        <span className="tm">{s.time}</span>
                        <span>{s.subject} · {s.class} · {s.room}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
