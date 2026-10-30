import { useCallback, useEffect, useState } from 'react';
import { fsGet, fsSet } from '../firebase/firestore';

export const SCHEDULE_MODES = {
  regular: { label: 'Regular', description: 'Regular campus timetable', color: '#16A34A' },
  holiday: { label: 'Holiday', description: 'No regular classes', color: '#D97706' },
  exam:    { label: 'Exam', description: 'Exam period schedule', color: '#DC2626' },
};

const MODE_PATH = 'settings/schedule_mode';
const POLL_INTERVAL = 15000;

export default function useScheduleMode() {
  const [mode, setMode] = useState('regular');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fsGet(MODE_PATH);
    if (data?.mode && SCHEDULE_MODES[data.mode]) setMode(data.mode);
    if (data?.updatedAt) setUpdatedAt(data.updatedAt);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [load]);

  const changeMode = useCallback(async (nextMode, userEmail) => {
    if (!SCHEDULE_MODES[nextMode]) return;
    const nextUpdatedAt = Date.now();
    await fsSet(MODE_PATH, { mode: nextMode, updatedAt: nextUpdatedAt, updatedBy: userEmail || 'Staff' });
    setMode(nextMode);
    setUpdatedAt(nextUpdatedAt);
  }, []);

  return { mode, modeInfo: SCHEDULE_MODES[mode], updatedAt, loading, changeMode };
}