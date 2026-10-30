import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { C } from '../constants/colors';
import { getAiServerUrl } from '../constants/network';
import { getAuthTokens } from '../firebase/firestore';
import { loadChats, newSessionId, saveChat } from '../utils/chatHistory';
import ChatHistorySidebar from '../components/ChatHistorySidebar';

// ── Day order for stable sorting ──────────────────────────────────────────────
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ChatScreen({ user, dark }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [savedChats, setSavedChats] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollViewRef = useRef();
  const messagesRef = useRef([]);

  // Stable per-conversation id. A new chat does not reuse the previous context.
  const sessionIdRef = useRef(newSessionId(user?.email || 'user'));
  const [activeChatId, setActiveChatId] = useState(sessionIdRef.current);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    loadChats(user).then(setSavedChats).catch(() => {});
  }, [user?.email, user?.type]);

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const bg         = dark ? '#0A0A1E' : '#F5F4FF';
  const cardBg     = dark ? '#12123A' : '#FFFFFF';
  const tp         = dark ? '#EDE9FF' : '#1A0F4A';
  const ts         = dark ? '#9B7EF8' : '#6C47D4';
  const bdr        = dark ? '#2A1C6B' : '#E2E0F5';
  const botBg      = dark ? '#1A1A3E' : '#F8F7FF';
  const userBg     = dark ? '#2D1B69' : '#EAE6FF';
  const botBorder  = dark ? '#3D2B8E' : '#E2E0F5';
  const userBorder = dark ? '#4A2B99' : '#D1C8FF';
  const tagBg      = dark ? 'rgba(155,126,248,0.12)' : 'rgba(108,71,212,0.07)';

  // ── Universal Day-Grouped Renderer ────────────────────────────────────────
  const renderStructuredResponse = (data) => {
    let title = '';
    let items = [];

    if (data.type === 'schedule') {
      title = `📅  ${data.class || ''} Schedule`;
      items = data.classes || [];

    } else if (data.type === 'teacher_classes') {
      title = `👨‍🏫  ${data.teacher || ''} — Classes`;
      items = data.classes || [];

    } else if (data.type === 'class_rooms') {
      title = `🏛️  ${data.class || ''} — Rooms`;
      items = data.rooms || [];

    } else if (data.type === 'teacher_availability') {
      title = `👨‍🏫  ${data.teacher || ''} — Availability`;
      for (const d of data.days || []) {
        if (d.free?.length)
          items.push({ day: d.day, isFree: true, text: 'Free: ' + d.free.join(', ') });
        for (const b of d.busy || []) {
          items.push({
            day: d.day,
            time: b.slot,
            subject: (b.subjects || []).join(', ') || 'Busy',
            class: (b.classes || []).join(', '),
            room:  (b.rooms  || []).join(', '),
          });
        }
      }

    } else if (data.type === 'room_availability') {
      title = `🏛️  Room ${data.room || ''} — Availability`;
      for (const d of data.days || []) {
        if (d.free?.length)
          items.push({ day: d.day, isFree: true, text: 'Free: ' + d.free.join(', ') });
        for (const b of d.busy || []) {
          items.push({
            day: d.day,
            time: b.slot,
            subject: (b.subjects || []).join(', ') || 'Busy',
            class: (b.classes || []).join(', '),
            teacher: (b.teachers || []).join(', '),
          });
        }
      }

    } else if (data.type === 'rooms_schedule' || data.type === 'rooms_free') {
      title = `🏛️  Rooms — ${data.type === 'rooms_schedule' ? 'Schedule' : 'Free Slots'}`;
      for (const r of data.rooms || []) {
        if (r.free?.length)
          items.push({ day: r.day, isFree: true, text: `${r.room} free: ${r.free.join(', ')}` });
        for (const b of r.busy || []) {
          items.push({
            day: r.day,
            time: b.slot,
            subject: (b.subjects && b.subjects.length && b.subjects.some(s => s)) ? b.subjects.join(', ') : 'Busy',
            class: (b.classes || []).join(', '),
            room: r.room,
            teacher: (b.teachers || []).join(', '),
          });
        }
      }

    } else if (data.type === 'teachers_free_now') {
      const list = (data.teachers || []).slice(0, 30);
      const extra = (data.teachers || []).length - list.length;
      return (
        <View>
          <Text style={[styles.sTitle, { color: tp }]}>
            🟢  Free Teachers — {data.day}{data.slot ? ` @ ${data.slot}` : ''}
          </Text>
          {list.map((t, i) => (
            <Text key={i} style={{ color: ts, fontSize: 13, marginBottom: 3 }}>• {t}</Text>
          ))}
          {extra > 0 && <Text style={{ color: ts, fontSize: 12, marginTop: 4 }}>…and {extra} more.</Text>}
        </View>
      );

    } else if (data.type === 'teacher_ambiguous') {
      return (
        <View>
          <Text style={{ color: tp, marginBottom: 8, fontSize: 14 }}>{data.message}</Text>
          {(data.matches || []).map((m, i) => (
            <Text key={i} style={{ color: ts, fontSize: 13, marginBottom: 3 }}>• {m}</Text>
          ))}
        </View>
      );

    } else {
      return <Text style={{ color: tp, lineHeight: 22, fontSize: 13 }}>{JSON.stringify(data, null, 2)}</Text>;
    }

    // ── Nothing found ────────────────────────────────────────────────────
    if (items.length === 0) {
      return (
        <View>
          <Text style={[styles.sTitle, { color: tp }]}>{title}</Text>
          <Text style={{ color: ts, fontSize: 13, marginTop: 4 }}>No schedule found.</Text>
        </View>
      );
    }

    // ── Group by day (stable order) ──────────────────────────────────────
    const grouped = {};
    for (const item of items) {
      const d = item.day || 'Unknown Day';
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(item);
    }

    const sortedDays = Object.keys(grouped).sort(
      (a, b) => (DAY_ORDER.indexOf(a) ?? 99) - (DAY_ORDER.indexOf(b) ?? 99)
    );

    return (
      <View>
        {data.note ? <Text style={{ color: ts, fontSize: 13, marginBottom: 6 }}>{data.note}</Text> : null}
        <Text style={[styles.sTitle, { color: tp }]}>{title}</Text>

        {sortedDays.map((dayName, dIdx) => (
          <View key={dIdx} style={{ marginBottom: 6 }}>
            {/* ── Day Header ── */}
            <View style={[styles.dayHeader, { backgroundColor: dark ? 'rgba(155,126,248,0.12)' : 'rgba(108,71,212,0.07)', borderColor: bdr }]}>
              <Text style={{ fontSize: 12, marginRight: 5 }}>🗓️</Text>
              <Text style={[styles.dayHeaderText, { color: ts }]}>{dayName}</Text>
            </View>

            {/* ── Class Cards ── */}
            <View style={styles.scheduleCards}>
              {grouped[dayName].map((item, idx) => {
                if (item.isFree) {
                  return (
                    <View key={idx} style={[styles.scard, { backgroundColor: cardBg, borderColor: '#16a34a' }]}>
                      <View style={[styles.scardAccent, { backgroundColor: '#16a34a' }]} />
                      <View style={{ flex: 1, padding: 10 }}>
                        <Text style={{ color: '#16a34a', fontSize: 13, fontWeight: '600' }}>🟢 {item.text}</Text>
                      </View>
                    </View>
                  );
                }

                // Strip "Day - " prefix from time if it slipped through
                let displayTime = item.time || '';
                if (displayTime.includes(' - ')) displayTime = displayTime.split(' - ').slice(1).join(' - ');

                const tags = [];
                if (item.teacher) tags.push(`👩‍🏫 ${item.teacher}`);
                if (item.room)    tags.push(`📍 ${item.room}`);
                if (item.class)   tags.push(`🎓 ${item.class}`);

                return (
                  <View key={idx} style={[styles.scard, { backgroundColor: cardBg, borderColor: bdr }]}>
                    <View style={[styles.scardAccent, { backgroundColor: C.purple }]} />
                    <View style={styles.scardBody}>
                      <View style={[styles.timePill, { backgroundColor: dark ? '#2A1C6B' : '#EAE6FF' }]}>
                        <Text style={[styles.timePillText, { color: C.purple }]}>⏰ {displayTime}</Text>
                      </View>
                      <Text style={[styles.scardSubject, { color: tp }]}>{item.subject || '—'}</Text>
                      {tags.length > 0 && (
                        <View style={styles.scardMeta}>
                          {tags.map((tag, ti) => (
                            <View key={ti} style={[styles.tag, { borderColor: bdr, backgroundColor: tagBg }]}>
                              <Text style={[styles.tagText, { color: ts }]}>{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    );
  };

  // ── Send Question ─────────────────────────────────────────────────────────
  const sendQuestion = async (questionText) => {
    const q = questionText.trim();
    if (!q) return;

    let transcript = [...messagesRef.current, { role: 'user', text: q }];
    messagesRef.current = transcript;
    setMessages(transcript);
    setInput('');
    setLoading(true);

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = getAuthTokens().idToken;
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${getAiServerUrl()}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: q, session_id: sessionIdRef.current }),
      });

      if (res.status === 429) throw new Error('Too many requests. Please wait a minute and try again.');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      let reply;
      if (data.answer && typeof data.answer === 'object') reply = { role: 'bot', structuredObj: data.answer };
      else if (typeof data.answer === 'string') reply = { role: 'bot', text: data.answer };
      else reply = { role: 'error', text: 'I got an unexpected response.' };
      transcript = [...transcript, reply];
    } catch (err) {
      console.error(err);
      let errorMsg = err.message;
      if (err.message.includes('Failed to fetch') || err.message.includes('Network request failed')) {
        errorMsg = `Can't reach the Campus AI backend at ${getAiServerUrl()}. Start it first (run START_CAMPUS_AI or: cd backend && uvicorn API:app).`;
      }
      transcript = [...transcript, { role: 'error', text: `⚠️ ${errorMsg}` }];
    } finally {
      messagesRef.current = transcript;
      setMessages(transcript);
      setLoading(false);
      saveChat(user, { id: sessionIdRef.current, messages: transcript })
        .then(next => { if (next) setSavedChats(next); })
        .catch(() => {});
    }
  };

  const startNewChat = () => {
    const nextId = newSessionId(user?.email || 'user');
    sessionIdRef.current = nextId;
    setActiveChatId(nextId);
    messagesRef.current = [];
    setMessages([]);
    setInput('');
  };

  const openChat = (chat) => {
    if (!chat?.id) return;
    sessionIdRef.current = chat.id;
    setActiveChatId(chat.id);
    const restored = Array.isArray(chat.messages) ? chat.messages : [];
    messagesRef.current = restored;
    setMessages(restored);
    setInput('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ChatHistorySidebar
      open={historyOpen}
      onToggle={() => setHistoryOpen(value => !value)}
      chats={savedChats}
      activeChatId={activeChatId}
      onNewChat={startNewChat}
      onOpenChat={openChat}
      accent={C.purple}
      panelBg={bg}
      cardBg={cardBg}
      textColor={tp}
      mutedColor={ts}
      borderColor={bdr}
      activeBg={dark ? '#1A1A3E' : '#F5F4FF'}
    >
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
      >
        {/* Welcome card */}
        {messages.length === 0 && (
          <View style={[styles.welcomeCard, { backgroundColor: cardBg, borderColor: bdr }]}>
            <Text style={styles.welcomeTitle}>👋 Hey! I'm Campus AI</Text>
            <Text style={[styles.welcomeSub, { color: ts }]}>
              Your university timetable assistant.{'\n'}
              Ask me about your schedule, lectures, rooms, or just say hello!
            </Text>

            <View style={styles.chipsGrid}>
              {[
                '📅 My schedule today',
                '📚 BSCS 5 Monday lectures',
                '🏛️ BCS1 Wednesday classes',
                '👋 Hello!',
                '⏰ BSSE 3 Friday timetable',
              ].map((chip, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.chip, { backgroundColor: dark ? '#1A1A3E' : '#F5F4FF', borderColor: bdr }]}
                  onPress={() => sendQuestion(chip.replace(/^[^\w]+/, '').trim())}
                >
                  <Text style={[styles.chipText, { color: ts }]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Messages */}
        {messages.map((msg, i) => {
          const isUser  = msg.role === 'user';
          const isError = msg.role === 'error';
          return (
            <View key={i} style={[styles.msgRow, isUser && styles.msgRowUser]}>
              <View style={[styles.avatar, {
                backgroundColor: isUser
                  ? (dark ? '#2A1C6B' : '#E2D9FF')
                  : (dark ? '#3D2B8E' : '#C4B5FD'),
              }]}>
                <Text style={{ fontSize: 16 }}>{isUser ? '🎓' : '⚡'}</Text>
              </View>

              <View style={[styles.bubble, isUser
                ? { backgroundColor: userBg, borderColor: userBorder, borderTopRightRadius: 4 }
                : { backgroundColor: isError ? '#FEE2E2' : botBg, borderColor: isError ? '#FCA5A5' : botBorder, borderTopLeftRadius: 4 }
              ]}>
                {isError ? (
                  <Text style={{ color: '#B91C1C', fontSize: 14 }}>{msg.text}</Text>
                ) : isUser ? (
                  <Text style={{ color: tp, fontSize: 14 }}>{msg.text}</Text>
                ) : msg.structuredObj ? (
                  renderStructuredResponse(msg.structuredObj)
                ) : (
                  <Text style={{ color: tp, lineHeight: 22, fontSize: 14 }}>{msg.text}</Text>
                )}
              </View>
            </View>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <View style={styles.msgRow}>
            <View style={[styles.avatar, { backgroundColor: dark ? '#3D2B8E' : '#C4B5FD' }]}>
              <Text style={{ fontSize: 16 }}>⚡</Text>
            </View>
            <View style={[styles.bubble, { backgroundColor: botBg, borderColor: botBorder, borderTopLeftRadius: 4, paddingVertical: 14 }]}>
              <ActivityIndicator size="small" color={C.purple} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: cardBg, borderTopColor: bdr }]}>
        <View style={[styles.inputInner, { backgroundColor: dark ? '#1A1A3E' : '#F5F4FF', borderColor: bdr }]}>
          <TextInput
            style={[styles.textInput, { color: tp }]}
            placeholder="Ask about your timetable..."
            placeholderTextColor={ts}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={200}
            onSubmitEditing={() => sendQuestion(input)}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: input.trim() || loading ? 1 : 0.45, backgroundColor: C.purple }]}
            disabled={!input.trim() || loading}
            onPress={() => sendQuestion(input)}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
    </ChatHistorySidebar>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  /* Welcome */
  welcomeCard: {
    borderRadius: 20, borderWidth: 1, padding: 24,
    alignItems: 'center', marginBottom: 20, marginTop: 20,
  },
  welcomeTitle: {
    fontSize: 20, fontWeight: '800', color: C.purple, marginBottom: 8, textAlign: 'center',
  },
  welcomeSub: {
    fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20,
  },
  chipsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8,
  },
  chip: {
    borderRadius: 20, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14,
  },
  chipText: { fontSize: 12, fontWeight: '500' },

  /* Messages */
  msgRow: {
    flexDirection: 'row', gap: 10, marginBottom: 16,
  },
  msgRowUser: {
    flexDirection: 'row-reverse', alignSelf: 'flex-end',
  },
  avatar: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  bubble: {
    padding: 14, borderRadius: 16, borderWidth: 1, flexShrink: 1, maxWidth: '88%',
  },

  /* Input */
  inputBar: { padding: 12, borderTopWidth: 1 },
  inputInner: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderWidth: 1, borderRadius: 16, padding: 6, paddingLeft: 16,
  },
  textInput: {
    flex: 1, maxHeight: 100, minHeight: 36,
    fontSize: 14, paddingTop: 8, paddingBottom: 8,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },

  /* Schedule title */
  sTitle: {
    fontSize: 15, fontWeight: '700', marginBottom: 10,
  },

  /* Day Header */
  dayHeader: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 8, borderWidth: 1,
    paddingVertical: 5, paddingHorizontal: 10,
    marginBottom: 8, marginTop: 6,
    alignSelf: 'flex-start',
  },
  dayHeaderText: {
    fontSize: 13, fontWeight: '700', letterSpacing: 0.3,
  },

  /* Cards */
  scheduleCards: { gap: 7, marginBottom: 6 },
  scard: {
    borderWidth: 1, borderRadius: 12, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'stretch',
  },
  scardAccent: { width: 4 },
  scardBody: { flex: 1, padding: 12 },
  timePill: {
    alignSelf: 'flex-start', borderRadius: 20,
    paddingVertical: 3, paddingHorizontal: 10, marginBottom: 6,
  },
  timePillText: { fontSize: 11, fontWeight: '700' },
  scardSubject: {
    fontSize: 14, fontWeight: '700', marginBottom: 7, lineHeight: 20,
  },
  scardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: {
    borderWidth: 1, borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8,
  },
  tagText: { fontSize: 11, fontWeight: '500' },
});
