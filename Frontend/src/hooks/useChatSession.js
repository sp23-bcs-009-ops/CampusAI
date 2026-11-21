import { useEffect, useRef, useState } from 'react';
import { loadChats, newSessionId } from '../utils/chatHistory';

export default function useChatSession(user, prefix) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedChats, setSavedChats] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesRef = useRef([]);
  const sessionIdRef = useRef(newSessionId(prefix));
  const [activeChatId, setActiveChatId] = useState(sessionIdRef.current);

  useEffect(() => { loadChats(user).then(setSavedChats).catch(() => {}); }, [user?.email, user?.type]);

  function updateSession(id, nextMessages) {
    if (!id) return;
    const restored = Array.isArray(nextMessages) ? nextMessages : [];
    sessionIdRef.current = id;
    setActiveChatId(id);
    messagesRef.current = restored;
    setMessages(restored);
    setInput('');
  }

  const startNewChat = () => updateSession(newSessionId(prefix), []);
  const openChat = chat => updateSession(chat?.id, chat?.messages);

  return {
    messages, setMessages, input, setInput, loading, setLoading,
    savedChats, setSavedChats, historyOpen, setHistoryOpen,
    messagesRef, sessionIdRef, activeChatId, startNewChat, openChat,
  };
}
