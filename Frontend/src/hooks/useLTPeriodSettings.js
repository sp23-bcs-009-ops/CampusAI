import { useCallback, useEffect, useState } from 'react';
import { fsGet, fsSet } from '../firebase/firestore';
import {
  DEFAULT_LT_PERIOD_SETTINGS,
  normalizeLTPeriodSettings,
} from '../utils/ltPeriodSettings';

const SETTINGS_PATH = 'settings/lt_period_settings';
const POLL_INTERVAL = 15000;

export default function useLTPeriodSettings() {
  const [settings, setSettings] = useState(DEFAULT_LT_PERIOD_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const document = await fsGet(SETTINGS_PATH);
      if (!active) return;
      if (document) {
        const next = normalizeLTPeriodSettings(document);
        setSettings(current => (
          current.durationMinutes === next.durationMinutes
          && current.breakEnabled === next.breakEnabled
          && current.breakDurationMinutes === next.breakDurationMinutes
          && current.breaksAfter.join(',') === next.breaksAfter.join(',')
            ? current
            : next
        ));
      }
      setLoading(false);
    };

    load();
    const timer = setInterval(load, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const save = useCallback(async (nextSettings, updatedBy) => {
    const normalized = normalizeLTPeriodSettings(nextSettings);
    await fsSet(SETTINGS_PATH, {
      ...normalized,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy || 'Staff',
    });
    setSettings(normalized);
    return normalized;
  }, []);

  const reset = useCallback(async (updatedBy) => save(DEFAULT_LT_PERIOD_SETTINGS, updatedBy), [save]);

  return { settings, loading, save, reset };
}
