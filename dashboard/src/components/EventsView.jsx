import React, { useMemo, useState } from 'react';

const CATS = ['all', 'workshop', 'seminar', 'sports', 'cultural', 'competition', 'other'];

export default function EventsView({ events, source }) {
  const [cat, setCat] = useState('all');

  const cats = useMemo(() => {
    const used = new Set(events.map((e) => e.cat).filter(Boolean));
    return CATS.filter((c) => c === 'all' || used.has(c));
  }, [events]);

  const filtered = events.filter((e) => cat === 'all' || e.cat === cat);

  if (events.length === 0) {
    return (
      <div className="panel">
        <div className="empty-state">
          <div className="big">🎉</div>
          {source === 'firebase' ? (
            <p>
              No events in Firestore yet.<br />
              Events posted from the mobile app's <b>Uni News</b> screen will appear here automatically.
            </p>
          ) : (
            <p>
              Events live in Firestore (<code>events</code> collection) and are posted from the
              mobile app. This machine can't reach Firebase right now, so none can be shown —
              open the dashboard on a machine with internet access to see them.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      {cats.length > 1 && (
        <div className="controls">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => (
              <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
            ))}
          </select>
        </div>
      )}

      {filtered.map((ev) => (
        <div key={ev._docId || ev.id} className="ev-card">
          <div className="ev-top">
            <div className="ev-title">{ev.title}</div>
            {ev.cat && <span className="ev-cat">{ev.cat}</span>}
          </div>
          <div className="ev-meta">
            {ev.date && <>📅 {ev.date}{ev.time ? ` · ${ev.time}` : ''}{ev.endTime ? ` – ${ev.endTime}` : ''}<br /></>}
            {ev.venue && <>📍 {ev.venue}<br /></>}
            {ev.contact && <>👤 {ev.contact}<br /></>}
            {ev.deadline && <>⏰ Deadline: {ev.deadline}</>}
          </div>
          {ev.body && <div className="ev-body">{ev.body}</div>}
          {ev.postedBy && (
            <div className="ev-meta" style={{ marginTop: 8, opacity: 0.7 }}>
              Posted by {ev.postedBy}{ev.createdAt ? ` · ${ev.createdAt}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
