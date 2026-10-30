import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { EVENT_CATS, LF_CATS, can } from '../constants/config';
import { fsSet, fsUpdate, fsDelete, fsList } from '../firebase/firestore';
import { getEventStatus } from '../utils/helpers';
import EventCard from '../components/events/EventCard';
import EventPostModal from '../components/events/EventPostModal';
import LFCard from '../components/lostfound/LFCard';
import LFPostModal from '../components/lostfound/LFPostModal';

// ─── Sample initial data ──────────────────────────────────────────────────
const SAMPLE_EVENTS = [
  { id:'e1', cat:'academic', title:'Final Year Project Presentations', date:'2026-05-10', time:'09:00', endTime:'17:00', venue:'CS Block — Ground Floor', deadline:null, contact:'Dr. Khalid Awan', body:'All FYP groups must present. Attendance mandatory for Sem 7 & 8.', images:[], postedBy:'CS Department', createdAt:'2026-04-18' },
  { id:'e2', cat:'career',   title:'Industrial Visit — NESCOM',         date:'2026-04-28', time:'07:30', endTime:'18:00', venue:'Main Gate', deadline:'2026-04-24T17:00', contact:'Ms. Nadia — PS Office', body:'Limited seats. Submit form to PS Office.', images:[], postedBy:'CS Department', createdAt:'2026-04-17' },
  { id:'e3', cat:'sports',   title:'Inter-Department Cricket Tournament',date:'2026-04-25', time:'14:00', endTime:'18:00', venue:'University Ground', deadline:'2026-04-22T12:00', contact:'Sports Society', body:'Register your team. Trophy and prizes for winners.', images:[], postedBy:'Sports Society', createdAt:'2026-04-15' },
];

const SAMPLE_LF = [
  { id:'lf1', type:'found', cat:'phone',  title:'iPhone Found',     location:'CS Block 2nd Floor — near stairs', date:'2026-04-19', time:'13:30', contact:'sp23-bcs-045@cuiatk.edu.pk', body:'Black iPhone with cracked screen. Kept at CS Dept office.', images:[], resolved:false, postedBy:'Ali Raza',  createdAt:'2026-04-19' },
  { id:'lf2', type:'lost',  cat:'wallet', title:'Blue Wallet Lost',  location:'Ground Floor corridor',           date:'2026-04-18', time:'11:00', contact:'sp23-bcs-072@cuiatk.edu.pk', body:'Blue leather wallet with student ID inside.',             images:[], resolved:false, postedBy:'Sara Khan', createdAt:'2026-04-18' },
];

export default function UniNewsScreen({ user, dark, isGuest }) {
  const [subTab, setSubTab] = useState('events'); // 'events' | 'lostfound'
  const navBg  = dark ? '#12123A' : '#FFFFFF';
  const bdr    = dark ? '#2A1C6B' : '#E2E0F5';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#0A0A1E' : '#F5F4FF' }} edges={['left', 'right']}>
      {/* Sub-tab switcher */}
      <View style={[styles.subTabBar, { backgroundColor: navBg, borderBottomColor: bdr }]}>
        {[{ k: 'events', l: '🏛️ Events' }, { k: 'lostfound', l: '🔍 Lost & Found' }].map(t => (
          <TouchableOpacity key={t.k} onPress={() => setSubTab(t.k)}
            style={[styles.subTabBtn, subTab === t.k && styles.subTabBtnActive]}>
            <Text style={[styles.subTabText, subTab === t.k && styles.subTabTextActive]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {subTab === 'events'    && <EventsTab    user={user} dark={dark} isGuest={isGuest} />}
      {subTab === 'lostfound' && <LostFoundTab user={user} dark={dark} isGuest={isGuest} />}
    </SafeAreaView>
  );
}

// ─── Events Tab ───────────────────────────────────────────────────────────
function EventsTab({ user, dark, isGuest }) {
  const [events,       setEvents]       = useState([]);
  const [catFilter,    setCatFilter]    = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showPost,     setShowPost]     = useState(false);
  const [editItem,     setEditItem]     = useState(null);
  const [loadingFB,    setLoadingFB]    = useState(false);
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const ts = dark ? '#9B7EF8' : '#6C47D4';

  async function loadEvents() {
    setLoadingFB(true);
    try {
      const docs = await fsList('events');
      // deduplicate by id field
      const seen = new Set();
      const unique = docs.filter(d => { const key = d.id; if (seen.has(key)) return false; seen.add(key); return true; });
      setEvents(unique);
    } catch {
      setEvents(SAMPLE_EVENTS);
    } finally {
      setLoadingFB(false);
    }
  }

  // Load from Firebase on mount (skip for guests)
  useEffect(() => { if (!isGuest) loadEvents(); }, [isGuest]);

  const canPost = !isGuest && can.postEvent(user);

  function eventDocId(itemOrId) {
    if (typeof itemOrId === 'object' && itemOrId) return itemOrId._docId || itemOrId.id;
    const match = events.find(e => e.id === itemOrId || e._docId === itemOrId);
    return match?._docId || match?.id || itemOrId;
  }

  const filtered = isGuest ? [] : events
    .filter(e => catFilter    === 'all' || e.cat === catFilter)
    .filter(e => statusFilter === 'all' || getEventStatus(e) === statusFilter)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  async function handlePost(ev) {
    const docId = editItem ? eventDocId(editItem) : ev.id;
    if (editItem) {
      try { await fsUpdate(`events/${docId}`, ev); }
      catch (e) { console.warn('Failed to update event', e); }
    } else {
      try { await fsSet(`events/${ev.id}`, ev); }
      catch (e) { console.warn('Failed to save event', e); }
    }
    setEditItem(null);
    await loadEvents(); // reload from Firebase to get authoritative list
  }

  async function handleDelete(itemOrId) {
    const id = typeof itemOrId === 'object' ? itemOrId.id : itemOrId;
    const docId = eventDocId(itemOrId);
    setEvents(prev => prev.filter(e => e.id !== id));
    try { await fsDelete(`events/${docId}`); }
    catch (e) {
      console.warn('Failed to delete event', e);
      await loadEvents();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>COMSATS Attock</Text>
            <Text style={styles.headerTitle}>University Events</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.countBadge}><Text style={styles.countText}>{events.length}</Text></View>
            {canPost && (
              <TouchableOpacity onPress={() => { setEditItem(null); setShowPost(true); }} style={styles.addBtn}>
                <Text style={{ color: '#fff', fontSize: 20 }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* Status filter */}
        <FlatList
          data={[{k:'all',l:'All'},{k:'ongoing',l:'Ongoing'},{k:'upcoming',l:'Upcoming'},{k:'closed',l:'Closed'},{k:'ended',l:'Ended'}]}
          horizontal showsHorizontalScrollIndicator={false} keyExtractor={f=>f.k} style={{ marginBottom: 8 }}
          renderItem={({item:f}) => {
            const active = statusFilter === f.k;
            return (
              <TouchableOpacity onPress={() => setStatusFilter(f.k)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && { color: C.purple }]}>{f.l}</Text>
              </TouchableOpacity>
            );
          }}
        />
        {/* Category filter */}
        <FlatList
          data={[{key:'all',label:'All',color:C.purple},...EVENT_CATS]}
          horizontal showsHorizontalScrollIndicator={false} keyExtractor={c=>c.key} style={{ marginBottom: 12 }}
          renderItem={({item:c}) => {
            const active = catFilter === c.key;
            return (
              <TouchableOpacity onPress={() => setCatFilter(c.key)} style={[styles.catChip, active && { backgroundColor: c.color + '22', borderColor: c.color }]}>
                <Text style={[styles.catChipText, active && { color: c.color }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={e => e._docId || String(e.id)}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>📭</Text>
            <Text style={{ fontSize: 13, color: ts }}>No events found</Text>
          </View>
        }
        renderItem={({ item: e }) => (
          <EventCard
            ev={e} dark={dark} user={user}
            onEdit={item => { setEditItem(item); setShowPost(true); }}
            onDelete={handleDelete}
          />
        )}
      />

      <EventPostModal
        visible={showPost} dark={dark}
        editEvent={editItem}
        onClose={() => { setShowPost(false); setEditItem(null); }}
        onPost={handlePost}
      />
    </View>
  );
}

// ─── Lost & Found Tab ─────────────────────────────────────────────────────
function LostFoundTab({ user, dark, isGuest }) {
  const [items,      setItems]      = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [catFilter,  setCatFilter]  = useState('all');
  const [showPost,   setShowPost]   = useState(false);
  const bg = dark ? '#0A0A1E' : '#F5F4FF';
  const ts = dark ? '#9B7EF8' : '#6C47D4';

  async function loadLF() {
    try {
      const docs = await fsList('lostfound');
      // deduplicate by id field
      const seen = new Set();
      const unique = docs.filter(d => { const key = d.id; if (seen.has(key)) return false; seen.add(key); return true; });
      setItems(unique);
    } catch {
      setItems(SAMPLE_LF);
    }
  }

  // Load from Firebase on mount (skip for guests)
  useEffect(() => { if (!isGuest) loadLF(); }, [isGuest]);

  const canPost = !isGuest && can.postLF(user);

  function lfDocId(itemOrId) {
    if (typeof itemOrId === 'object' && itemOrId) return itemOrId._docId || itemOrId.id;
    const match = items.find(i => i.id === itemOrId || i._docId === itemOrId);
    return match?._docId || match?.id || itemOrId;
  }

  const filtered = isGuest ? [] : items
    .filter(i => typeFilter === 'all' || i.type === typeFilter)
    .filter(i => catFilter  === 'all' || i.cat  === catFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  async function handlePost(item) {
    try { await fsSet(`lostfound/${item.id}`, item); } catch (e) { console.warn('Failed to save lost/found post', e); }
    await loadLF(); // reload from Firebase to get authoritative, deduplicated list
  }

  async function handleResolve(itemOrId) {
    const id = typeof itemOrId === 'object' ? itemOrId.id : itemOrId;
    const docId = lfDocId(itemOrId);
    setItems(prev => prev.map(i => i.id === id ? { ...i, resolved: true } : i));
    try { await fsUpdate(`lostfound/${docId}`, { resolved: true }); }
    catch (e) {
      console.warn('Failed to resolve lost/found post', e);
      await loadLF();
    }
  }

  async function handleDelete(itemOrId) {
    const id = typeof itemOrId === 'object' ? itemOrId.id : itemOrId;
    const docId = lfDocId(itemOrId);
    setItems(prev => prev.filter(i => i.id !== id));
    try { await fsDelete(`lostfound/${docId}`); }
    catch (e) {
      console.warn('Failed to delete lost/found post', e);
      await loadLF();
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: dark ? C.purpleDeep : C.purple }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerSub}>COMSATS Attock</Text>
            <Text style={styles.headerTitle}>Lost & Found</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.countBadge}><Text style={styles.countText}>{items.filter(i => !i.resolved).length}</Text></View>
            {canPost && (
              <TouchableOpacity onPress={() => setShowPost(true)} style={styles.addBtn}>
                <Text style={{ color: '#fff', fontSize: 20 }}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {/* Type filter */}
        <FlatList
          data={[{k:'all',l:'All'},{k:'found',l:'Found'},{k:'lost',l:'Lost'}]}
          horizontal showsHorizontalScrollIndicator={false} keyExtractor={f=>f.k} style={{ marginBottom: 8 }}
          renderItem={({item:f}) => {
            const active = typeFilter === f.k;
            return (
              <TouchableOpacity onPress={() => setTypeFilter(f.k)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterChipText, active && { color: C.purple }]}>{f.l}</Text>
              </TouchableOpacity>
            );
          }}
        />
        {/* Category filter */}
        <FlatList
          data={[{key:'all',label:'All'},...LF_CATS]}
          horizontal showsHorizontalScrollIndicator={false} keyExtractor={c=>c.key} style={{ marginBottom: 12 }}
          renderItem={({item:c}) => {
            const active = catFilter === c.key;
            return (
              <TouchableOpacity onPress={() => setCatFilter(c.key)} style={[styles.catChip, active && styles.catChipActive]}>
                <Text style={[styles.catChipText, active && { color: C.purple }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i._docId || String(i.id)}
        contentContainerStyle={{ padding: 14, paddingBottom: 32 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
            <Text style={{ fontSize: 13, color: ts }}>No items found</Text>
          </View>
        }
        renderItem={({ item: i }) => (
          <LFCard
            item={i} dark={dark} user={user}
            onResolve={handleResolve}
            onDelete={handleDelete}
          />
        )}
      />

      <LFPostModal
        visible={showPost} dark={dark}
        onClose={() => setShowPost(false)}
        onPost={handlePost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  subTabBar:     { flexDirection: 'row', borderBottomWidth: 1 },
  subTabBtn:     { flex: 1, paddingVertical: 12, alignItems: 'center' },
  subTabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.purple },
  subTabText:    { fontSize: 13, fontWeight: '600', color: '#B0A8D8' },
  subTabTextActive: { color: C.purple },

  header:        { padding: 16, paddingBottom: 0 },
  headerTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerSub:     { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  headerTitle:   { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerRight:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  countBadge:    { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  countText:     { color: '#fff', fontSize: 11, fontWeight: '700' },
  addBtn:        { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  filterChip:    { marginRight: 5, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  filterChipActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  filterChipText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
  catChip:       { marginRight: 5, marginBottom: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'transparent' },
  catChipActive: { backgroundColor: C.purple + '22', borderColor: C.purple },
  catChipText:   { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
});
