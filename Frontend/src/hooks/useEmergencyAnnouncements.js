import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fsAdd, fsDelete, fsList, fsUpdate } from '../firebase/firestore';

const COLLECTION = 'emergency_announcements';
const READ_KEY = 'campusai_emergency_read';
const POLL_INTERVAL = 15000;

function sortAnnouncements(items) {
  return [...items].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

export default function useEmergencyAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);
  const [readIds, setReadIds] = useState([]);

  const load = useCallback(async () => {
    const docs = await fsList(COLLECTION);
    const now = Date.now();
    setAnnouncements(sortAnnouncements(docs
      .map(item => ({ ...item, id: item.id || item._docId }))
      .filter(item => !item.expiresAt || Number(item.expiresAt) > now)));
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(READ_KEY).then(value => {
      if (value) setReadIds(JSON.parse(value));
    }).catch(() => {});
    load();
    const timer = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [load]);

  const unreadCount = useMemo(
    () => announcements.filter(item => !readIds.includes(item.id)).length,
    [announcements, readIds]
  );

  const markRead = useCallback((id) => {
    setReadIds(previous => {
      const next = previous.includes(id) ? previous : [...previous, id];
      AsyncStorage.setItem(READ_KEY, JSON.stringify(next.slice(-200))).catch(() => {});
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(previous => {
      const next = Array.from(new Set([...previous, ...announcements.map(item => item.id)]));
      AsyncStorage.setItem(READ_KEY, JSON.stringify(next.slice(-200))).catch(() => {});
      return next;
    });
  }, [announcements]);

  const createAnnouncement = useCallback(async (data) => {
    const created = { ...data, createdAt: Date.now() };
    const id = await fsAdd(COLLECTION, created);
    const announcement = { ...created, id };
    setAnnouncements(previous => sortAnnouncements([announcement, ...previous]));
    return announcement;
  }, []);

  const editAnnouncement = useCallback(async (announcement) => {
    await fsUpdate(`${COLLECTION}/${announcement.id}`, announcement);
    setAnnouncements(previous => sortAnnouncements(previous.map(item => item.id === announcement.id ? announcement : item)));
  }, []);

  const deleteAnnouncement = useCallback(async (id) => {
    await fsDelete(`${COLLECTION}/${id}`);
    setAnnouncements(previous => previous.filter(item => item.id !== id));
  }, []);

  return {
    announcements, readIds, unreadCount, markRead, markAllRead,
    createAnnouncement, editAnnouncement, deleteAnnouncement,
  };
}