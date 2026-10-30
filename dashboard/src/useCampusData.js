/**
 * useCampusData — loads timetable, teachers, and events.
 *
 * Source priority:
 *   1. Firestore (timetable_classes, teachers, events, meta/timetable)
 *   2. Bundled local snapshot (same data the migration script uploads)
 *
 * `source` in the returned state tells the UI which one is active so the
 * header can show a "Live · Firebase" or "Local snapshot" badge.
 */
import { useEffect, useState, useCallback } from 'react';
import { fsList, fsGet } from './firebase';
import localSnapshot from './data/localSnapshot.json';

export default function useCampusData() {
  const [state, setState] = useState({
    loading: true,
    source: null,          // 'firebase' | 'local'
    classes: {},           // { className: {Day: {slot: [entry]}} }
    teachers: {},          // { teacherName: [{day,time,class,subject,room}] }
    events: [],
    meta: null,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));

    // ── Try Firestore first ─────────────────────────────────────
    try {
      const [classDocs, teacherDocs] = await Promise.all([
        fsList('timetable_classes'),
        fsList('teachers'),
      ]);

      if (classDocs.length > 0) {
        const classes = {};
        for (const doc of classDocs) {
          if (doc.class && doc.data) classes[doc.class] = doc.data;
        }
        const teachers = {};
        for (const doc of teacherDocs) {
          if (doc.name && doc.schedule) teachers[doc.name] = doc.schedule;
        }

        let events = [];
        try { events = await fsList('events'); } catch { /* events optional */ }

        let meta = null;
        try { meta = await fsGet('meta/timetable'); } catch { /* optional */ }

        setState({
          loading: false, source: 'firebase',
          classes, teachers, events: normaliseEvents(events), meta, error: null,
        });
        return;
      }
    } catch {
      /* fall through to local snapshot */
    }

    // ── Fallback: bundled snapshot ──────────────────────────────
    setState({
      loading: false,
      source: 'local',
      classes: localSnapshot.classes,
      teachers: localSnapshot.teachers,
      events: [],
      meta: localSnapshot.meta,
      error: null,
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}

function normaliseEvents(events) {
  return (events || [])
    .filter((e) => e.title)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
