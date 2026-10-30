import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadChatsFrom, newSessionId, saveChatTo } from './chatHistoryCore.js';

export { newSessionId };

export function loadChats(user) {
  return loadChatsFrom(AsyncStorage, user);
}

export function saveChat(user, chat) {
  return saveChatTo(AsyncStorage, user, chat);
}
