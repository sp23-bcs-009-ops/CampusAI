import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Linking,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { getAiServerUrl } from '../constants/network';
import { loadChats, newSessionId, saveChat } from '../utils/chatHistory';
import ChatHistorySidebar from '../components/ChatHistorySidebar';

// ─── Guest-only palette (teal, intentionally distinct from the purple AI Chat) ──
const G = {
  accent:  '#0E7C86',
  accentBg:'rgba(20,184,166,0.10)',
};

// ─── Official external links (all live in the scraped COMSATS knowledge) ─────
const LINKS = [
  { icon: '🌐', label: 'Official Website',   sub: 'comsats.edu.pk',            url: 'https://www.comsats.edu.pk/' },
  { icon: '🏛️', label: 'About COMSATS',      sub: 'History & vision',          url: 'https://www.comsats.edu.pk/about-comsats.aspx' },
  { icon: '🗺️', label: 'Campuses',           sub: 'All campuses directory',    url: 'https://www.comsats.edu.pk/campuses.aspx' },
  { icon: '📝', label: 'Admissions',         sub: 'How to apply',              url: 'https://www.comsats.edu.pk/admissions.aspx' },
  { icon: '📚', label: 'Academic Programs',  sub: 'Degrees offered',           url: 'https://www.comsats.edu.pk/academic-programs.aspx' },
  { icon: '🔬', label: 'Research',           sub: 'Research & innovation',     url: 'https://www.comsats.edu.pk/comsats-research.aspx' },
  { icon: '🎓', label: 'Student Portal',     sub: 'atk-cms.comsats.edu.pk',    url: 'https://atk-cms.comsats.edu.pk/' },
];

// ─── Suggested website-only question chips ───────────────────────────────────
const CHIPS = [
  '🎓 What programs does COMSATS offer?',
  '📝 How do I apply for admission?',
  '🗺️ Where are the COMSATS campuses?',
  '📅 What are BCS-1 classes on Monday?',
  '👩‍🏫 Is Aamir Ali free on Monday?',
];

function publicAnswerText(answer) {
  if (!answer || typeof answer !== 'object') return '';
  if (answer.type === 'schedule') {
    const lines = [`${answer.class || 'Class'} — ${answer.day || 'schedule'}`.trim()];
    for (const item of answer.classes || []) {
      lines.push([item.time, item.subject, item.teacher, item.room].filter(Boolean).join(' · '));
    }
    if (answer.note) lines.push(answer.note);
    return lines.filter(Boolean).join('\n');
  }
  if (answer.type === 'teacher_availability' || answer.type === 'room_availability') {
    const who = answer.teacher || (answer.room ? `Room ${answer.room}` : 'Availability');
    const lines = [who];
    for (const day of answer.days || []) {
      if (day.free?.length) lines.push(`${day.day}: free ${day.free.join(', ')}`);
      for (const busy of day.busy || []) {
        lines.push(`${day.day}: ${busy.slot || 'busy'}`);
      }
    }
    return lines.filter(Boolean).join('\n');
  }
  try {
    return JSON.stringify(answer);
  } catch {
    return '';
  }
}

export default function GuestModeScreen({ dark, tab = 'chat', onTabChange, onExitGuest }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedChats, setSavedChats] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollViewRef = useRef();
  const messagesRef = useRef([]);
  const guestUser = { type: 'guest' };

  const sessionIdRef = useRef(newSessionId('guest'));
  const [activeChatId, setActiveChatId] = useState(sessionIdRef.current);

  useEffect(() => {
    loadChats(guestUser).then(setSavedChats).catch(() => {});
  }, []);

  // ── Theme tokens (teal guest theme) ────────────────────────────────────────
  const bg       = dark ? '#071A1C' : '#F1FBFB';
  const cardBg   = dark ? '#0C2528' : '#FFFFFF';
  const tp       = dark ? '#E6FFFD' : '#0B2E31';
  const ts       = dark ? '#5EEAD4' : '#0E7C86';
  const bdr      = dark ? '#134E4A' : '#CCEDEE';
  const heroBg   = dark ? '#0F3D3F' : '#0E7C86';
  const userBg   = dark ? '#134E4A' : '#D5F5F6';
  const botBg    = dark ? '#0C2528' : '#FFFFFF';
  const userBdr  = dark ? '#2DD4BF' : '#7FD8DC';
  const botBdr   = dark ? '#134E4A' : '#CCEDEE';

  // ── Send a website-only question ───────────────────────────────────────────
  const sendQuestion = async (questionText) => {
    const q = questionText.trim();
    if (!q || loading) return;

    let transcript = [...messagesRef.current, { role: 'user', text: q }];
    messagesRef.current = transcript;
    setMessages(transcript);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${getAiServerUrl()}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, session_id: sessionIdRef.current }),
      });

      if (res.status === 429) throw new Error('Too many requests. Please wait a minute and try again.');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      let reply;
      if (typeof data.answer === 'string') reply = { role: 'bot', text: data.answer };
      else if (data.answer && typeof data.answer === 'object') reply = { role: 'bot', text: publicAnswerText(data.answer) };
      else reply = { role: 'error', text: "I couldn't find that on the COMSATS website. Try rephrasing your question." };
      transcript = [...transcript, reply];
    } catch (err) {
      console.error(err);
      let errorMsg = "I can't reach the Campus AI backend right now. Please try again later.";
      if (err.message.includes('Too many requests')) {
        errorMsg = err.message;
      } else if (err.message.includes('Failed to fetch') || err.message.includes('Network request failed')) {
        errorMsg = `Can't reach the Campus AI backend at ${getAiServerUrl()}. Please start it and try again.`;
      }
      transcript = [...transcript, { role: 'error', text: `⚠️ ${errorMsg}` }];
    } finally {
      messagesRef.current = transcript;
      setMessages(transcript);
      setLoading(false);
      saveChat(guestUser, { id: sessionIdRef.current, messages: transcript })
        .then(next => { if (next) setSavedChats(next); })
        .catch(() => {});
    }
  };


  // ── Shared header with segmented tabs ──────────────────────────────────────
  const renderHeader = () => (
    <View style={[styles.segWrap, { backgroundColor: dark ? '#0C2528' : '#FFFFFF', borderBottomColor: bdr }]}>
      {[
        { key: 'chat',  label: '🌐  Website AI' },
        { key: 'about', label: '🎓  About Us' },
      ].map(t => {
        const active = tab === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onTabChange && onTabChange(t.key)}
            style={[styles.segBtn, active && { backgroundColor: G.accent }]}>
            <Text style={[styles.segText, { color: active ? '#fff' : ts }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── About Us tab ───────────────────────────────────────────────────────────
  const renderAbout = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
      {/* Hero */}
      <View style={[styles.aboutHero, { backgroundColor: heroBg }]}>
        <Text style={styles.aboutHeroIcon}>🎓</Text>
        <Text style={styles.aboutHeroTitle}>COMSATS University</Text>
        <Text style={styles.aboutHeroSub}>Islamabad · Attock Campus</Text>
      </View>

      {/* Intro */}
      <View style={[styles.aboutCard, { backgroundColor: cardBg, borderColor: bdr }]}>
        <Text style={[styles.aboutSection, { color: tp }]}>About the University</Text>
        <Text style={[styles.aboutBody, { color: ts }]}>
          COMSATS University Islamabad (CUI) is a public sector university with multiple
          campuses across Pakistan. It is recognised for its focus on science, technology,
          engineering and education, offering undergraduate and postgraduate programs
          in Computer Science, Software Engineering, Electrical Engineering, Mathematics
          and more.
        </Text>
        <Text style={[styles.aboutBody, { color: ts, marginBottom: 0 }]}>
          The Attock Campus hosts modern lecture theatres, laboratories and faculty
          offices, and runs the same academic calendar and curriculum as the other
          campuses of the university.
        </Text>
      </View>

      {/* Quick facts */}
      <View style={[styles.aboutCard, { backgroundColor: cardBg, borderColor: bdr }]}>
        <Text style={[styles.aboutSection, { color: tp }]}>Quick Facts</Text>
        {[
          ['🏛️', 'Campuses', 'Islamabad, Attock, Lahore, Sahiwal, Abbottabad, Vehari, Sheikhupura & more'],
          ['📚', 'Programs', 'BS, MS/MPhil and PhD across multiple disciplines'],
          ['🔬', 'Focus', 'Science, technology, engineering & applied research'],
          ['📅', 'Founded', '1998 (as COMSATS Institute of Information Technology)'],
        ].map(([icon, label, value], i, arr) => (
          <View key={i} style={[styles.factRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={styles.factIcon}>{icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.factLabel, { color: tp }]}>{label}</Text>
              <Text style={[styles.factValue, { color: ts }]}>{value}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* External links */}
      <View style={[styles.aboutCard, { backgroundColor: cardBg, borderColor: bdr }]}>
        <Text style={[styles.aboutSection, { color: tp }]}>Useful Links</Text>
        <Text style={[styles.linksHint, { color: ts }]}>
          Opens in your browser · all links go to official COMSATS pages
        </Text>
        {LINKS.map((l, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.linkRow, { borderColor: bdr }]}
            onPress={() => Linking.openURL(l.url).catch(() => {})}>
            <Text style={styles.linkIcon}>{l.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.linkLabel, { color: tp }]}>{l.label}</Text>
              <Text style={[styles.linkSub, { color: ts }]}>{l.sub}</Text>
            </View>
            <Text style={[styles.linkArrow, { color: G.accent }]}>↗</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Guest sign-in hint */}
      <View style={[styles.aboutCard, { backgroundColor: G.accentBg, borderColor: G.accent }]}>
        <Text style={[styles.aboutSection, { color: tp }]}>Want the full app?</Text>
        <Text style={[styles.aboutBody, { color: ts }]}>
          Sign in with your university account to unlock your timetable, class
          notifications, events and more.
        </Text>
        <TouchableOpacity
          onPress={() => onExitGuest && onExitGuest()}
          style={styles.signInBtn}>
          <Text style={styles.signInBtnText}>Sign In / Create Account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const startNewChat = () => {
    const nextId = newSessionId('guest');
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

  // ── AI Chat tab ────────────────────────────────────────────────────────────
  const renderChat = () => (
    <ChatHistorySidebar
      open={historyOpen}
      onToggle={() => setHistoryOpen(value => !value)}
      chats={savedChats}
      activeChatId={activeChatId}
      onNewChat={startNewChat}
      onOpenChat={openChat}
      accent={G.accent}
      panelBg={bg}
      cardBg={cardBg}
      textColor={tp}
      mutedColor={ts}
      borderColor={bdr}
      activeBg={dark ? '#134E4A' : '#E7F8F8'}
    >
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>

        {/* Hero welcome card */}
        {messages.length === 0 && (
          <View style={[styles.heroCard, { backgroundColor: heroBg }]}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>🌐  PUBLIC CAMPUS ASSISTANT</Text>
            </View>
            <Text style={styles.heroTitle}>Ask about the university</Text>
            <Text style={styles.heroSub}>
              I can answer public COMSATS Attock questions from the saved website knowledge and published campus records.{'\n'}
              I cannot open a personal profile or a personal timetable.
            </Text>
            <View style={styles.heroChips}>
              {CHIPS.map((chip, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.heroChip}
                  onPress={() => sendQuestion(chip.replace(/^[^\w]+/, '').trim())}>
                  <Text style={styles.heroChipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Scope note shown above the conversation */}
        {messages.length > 0 && (
          <View style={[styles.scopeNote, { backgroundColor: G.accentBg, borderColor: bdr }]}>
            <Text style={[styles.scopeNoteText, { color: ts }]}>
              🌐 Public campus information only. No personal profile.
            </Text>
          </View>
        )}

        {/* Messages — centered cards, distinct from the side-bubble chat */}
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const isError = msg.role === 'error';
          return (
            <View key={i} style={styles.centerRow}>
              <View
                style={[
                  styles.centerCard,
                  isUser
                    ? { backgroundColor: userBg, borderColor: userBdr, alignSelf: 'flex-end' }
                    : isError
                      ? { backgroundColor: dark ? '#3B1414' : '#FEE2E2', borderColor: '#FCA5A5', alignSelf: 'flex-start' }
                      : { backgroundColor: botBg, borderColor: botBdr, alignSelf: 'flex-start' },
                ]}>
                <Text style={[styles.centerRole, { color: isUser ? G.accent : (isError ? '#B91C1C' : G.accent) }]}>
                  {isUser ? '🧑 You' : isError ? '⚠️ Notice' : '🌐 COMSATS Guide'}
                </Text>
                <Text style={{ color: tp, lineHeight: 22, fontSize: 14 }}>{msg.text}</Text>
              </View>
            </View>
          );
        })}

        {/* Typing indicator */}
        {loading && (
          <View style={styles.centerRow}>
            <View style={[styles.centerCard, { backgroundColor: botBg, borderColor: botBdr, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
              <ActivityIndicator size="small" color={G.accent} />
              <Text style={{ color: ts, fontSize: 13 }}>Searching the website…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input card */}
      <View style={[styles.inputCard, { backgroundColor: cardBg, borderTopColor: bdr }]}>
        <View style={[styles.inputScope, { borderColor: bdr }]}>
          <Text style={[styles.inputScopeText, { color: G.accent }]}>🌐 Public campus information</Text>
        </View>
        <View style={[styles.inputInner, { backgroundColor: dark ? '#0F3D3F' : '#F1FBFB', borderColor: bdr }]}>
          <TextInput
            style={[styles.textInput, { color: tp }]}
            placeholder="Ask about the university…"
            placeholderTextColor={ts}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={300}
            onSubmitEditing={() => sendQuestion(input)}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: input.trim() && !loading ? 1 : 0.45 }]}
            disabled={!input.trim() || loading}
            onPress={() => sendQuestion(input)}>
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
    </ChatHistorySidebar>
  );

  // ── Screen ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {renderHeader()}
      {tab === 'chat' ? renderChat() : renderAbout()}
    </View>
  );
}


const styles = StyleSheet.create({
  /* Segmented tabs */
  segWrap: { flexDirection: 'row', padding: 8, gap: 8, borderBottomWidth: 1 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  segText: { fontSize: 13, fontWeight: '700' },

  /* Chat hero */
  heroCard: { borderRadius: 22, padding: 24, marginBottom: 20, marginTop: 4 },
  heroBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14,
  },
  heroBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 20, marginTop: 8 },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  heroChip: {
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    paddingVertical: 8, paddingHorizontal: 14,
  },
  heroChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  /* Scope banner */
  scopeNote: {
    borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14,
    alignSelf: 'center', marginBottom: 18,
  },
  scopeNoteText: { fontSize: 11, fontWeight: '700' },

  /* Centered message cards */
  centerRow: { flexDirection: 'row', marginBottom: 14 },
  centerCard: {
    maxWidth: '92%', borderRadius: 18, borderWidth: 1, padding: 14,
  },
  centerRole: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6 },

  /* Input */
  inputCard: { padding: 12, borderTopWidth: 1 },
  inputScope: {
    alignSelf: 'center', borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8,
  },
  inputScopeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  inputInner: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderWidth: 1, borderRadius: 18, padding: 6, paddingLeft: 16,
  },
  textInput: {
    flex: 1, maxHeight: 110, minHeight: 38,
    fontSize: 14, paddingTop: 9, paddingBottom: 9,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 12, marginLeft: 8,
    backgroundColor: G.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  /* About */
  aboutHero: { borderRadius: 22, padding: 24, alignItems: 'center', marginBottom: 16 },
  aboutHeroIcon: { fontSize: 44, marginBottom: 8 },
  aboutHeroTitle: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  aboutHeroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  aboutCard: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 14 },
  aboutSection: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  aboutBody: { fontSize: 13, lineHeight: 21, marginBottom: 8 },
  factRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E4F4F5' },
  factIcon: { fontSize: 20 },
  factLabel: { fontSize: 13, fontWeight: '700' },
  factValue: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  linksHint: { fontSize: 11, marginBottom: 12 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8,
  },
  linkIcon: { fontSize: 20 },
  linkLabel: { fontSize: 13, fontWeight: '700' },
  linkSub: { fontSize: 11, marginTop: 1 },
  linkArrow: { fontSize: 16, fontWeight: '800' },
  signInBtn: {
    marginTop: 12, backgroundColor: G.accent, borderRadius: 14,
    paddingVertical: 12, alignItems: 'center',
  },
  signInBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
