import React, { useState } from 'react';
import useCampusData from './useCampusData';
import TimetableView from './components/TimetableView';
import TeachersView from './components/TeachersView';
import EventsView from './components/EventsView';

const TABS = [
  { key: 'timetable', label: '📅 Timetable' },
  { key: 'teachers', label: '👨‍🏫 Teachers' },
  { key: 'events', label: '🎉 Events' },
];

export default function App() {
  const data = useCampusData();
  const [tab, setTab] = useState('timetable');

  if (data.loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          Loading campus data…
        </div>
      </div>
    );
  }

  const classCount = Object.keys(data.classes).length;
  const teacherCount = Object.keys(data.teachers).length;
  const roomCount = countRooms(data.classes);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">🎓</div>
          <div>
            <h1>Campus AI — Admin Dashboard</h1>
            <p>COMSATS Wah · timetable, teachers &amp; events</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {data.source === 'firebase' ? (
            <span className="badge live"><span className="dot" /> Live · Firebase</span>
          ) : (
            <span className="badge local"><span className="dot" /> Local snapshot</span>
          )}
          <button className="reload-btn" onClick={data.reload}>↻ Reload</button>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><div className="num">{classCount}</div><div className="lbl">Classes</div></div>
        <div className="stat"><div className="num">{teacherCount}</div><div className="lbl">Teachers</div></div>
        <div className="stat"><div className="num">{roomCount}</div><div className="lbl">Rooms</div></div>
        <div className="stat"><div className="num">{data.events.length}</div><div className="lbl">Events</div></div>
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'timetable' && <TimetableView classes={data.classes} />}
      {tab === 'teachers' && <TeachersView teachers={data.teachers} />}
      {tab === 'events' && <EventsView events={data.events} source={data.source} />}

      <p className="footnote">
        {data.source === 'firebase'
          ? `Reading live from Firestore project "universityassistentai"`
          : 'Firestore unreachable or not migrated yet — showing bundled snapshot. Run scripts/migrate_to_firestore.mjs, then reload.'}
        {data.meta?.updatedAt ? ` · data updated ${String(data.meta.updatedAt).slice(0, 10)}` : ''}
      </p>
    </div>
  );
}

function countRooms(classes) {
  const rooms = new Set();
  for (const days of Object.values(classes))
    for (const slots of Object.values(days))
      for (const entries of Object.values(slots))
        for (const e of entries) if (e.room?.trim()) rooms.add(e.room.trim());
  return rooms.size;
}
