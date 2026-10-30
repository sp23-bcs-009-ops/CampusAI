import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Pressable, useWindowDimensions,
} from 'react-native';
import { groupChatsByAge } from '../utils/chatHistoryCore.js';

const PHONE_WIDTH = 720;

/**
 * Collapsible history for both chatbot screens.
 * Desktop keeps the panel beside the composer. Phones overlay the chat.
 */
export default function ChatHistorySidebar({
  open,
  onToggle,
  chats,
  activeChatId,
  onNewChat,
  onOpenChat,
  accent,
  panelBg,
  cardBg,
  textColor,
  mutedColor,
  borderColor,
  activeBg,
  children,
}) {
  const { width } = useWindowDimensions();
  const phone = width < PHONE_WIDTH;
  const groups = groupChatsByAge(chats);

  const choose = (chat) => {
    onOpenChat(chat);
    if (phone && open) onToggle();
  };

  const start = () => {
    onNewChat();
    if (phone && open) onToggle();
  };

  const panel = (
    <View style={{
      width: phone ? Math.min(300, Math.max(220, width - 48)) : 260,
      backgroundColor: panelBg,
      borderRightWidth: 1,
      borderRightColor: borderColor,
      paddingTop: 12,
      paddingHorizontal: 12,
    }}>
      <TouchableOpacity
        onPress={start}
        accessibilityLabel="New chat"
        style={{
          borderWidth: 1,
          borderColor: accent,
          backgroundColor: cardBg,
          borderRadius: 16,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>New chat</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {groups.length === 0 && (
          <Text style={{ color: mutedColor, fontSize: 12 }}>No saved chats</Text>
        )}
        {groups.map(group => (
          <View key={group.label} style={{ marginBottom: 14 }}>
            <Text style={{ color: mutedColor, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
              {group.label}
            </Text>
            {group.chats.map(chat => {
              const active = chat.id === activeChatId;
              return (
                <TouchableOpacity
                  key={chat.id}
                  onPress={() => choose(chat)}
                  accessibilityLabel={chat.title}
                  style={{
                    borderWidth: 1,
                    borderColor: active ? accent : borderColor,
                    backgroundColor: active ? activeBg : cardBg,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginBottom: 6,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: textColor, fontSize: 13, fontWeight: '600' }}>
                    {chat.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: panelBg }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <TouchableOpacity
          onPress={onToggle}
          accessibilityLabel={open ? 'Hide chats' : 'Show chats'}
          accessibilityState={{ expanded: open }}
          style={{
            alignSelf: 'flex-start',
            borderWidth: 1,
            borderColor: borderColor,
            backgroundColor: cardBg,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>
            {open ? 'Hide chats' : 'Chats'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {!phone && open ? panel : null}
        <View style={{ flex: 1 }}>{children}</View>
        {phone && open ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
            <Pressable
              onPress={onToggle}
              accessibilityLabel="Close chats"
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }}
            />
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}>
              {panel}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
