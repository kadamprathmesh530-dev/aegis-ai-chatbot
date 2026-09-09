import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://aegis-ai-chatbot.onrender.com';

type Conversation = {
  id: string;
  title: string;
  updated_at?: string;
};

type ConversationListProps = {
  onSelectConversation: (conversation: Conversation) => void;
  onNewChat: () => void;
  onClose: () => void;
};

export default function ConversationList({
  onSelectConversation,
  onNewChat,
  onClose,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem(
        'aegis_auth_token'
      );

      if (!token) {
        throw new Error('Please log in again.');
      }

      const response = await fetch(
        `${API_BASE_URL}/api/conversations`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Failed to load conversations.'
        );
      }

      setConversations(data.conversations || []);
    } catch (err: any) {
      console.error('Conversation loading error:', err);
      setError(
        err.message || 'Could not load conversation history.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>

        <Pressable
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {/* New Chat */}
      <Pressable
        onPress={onNewChat}
        style={styles.newChatButton}
      >
        <Text style={styles.newChatIcon}>+</Text>
        <Text style={styles.newChatText}>New Chat</Text>
      </Pressable>

      {/* Conversations */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.muted}>
            Loading conversations...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>

          <Pressable
            onPress={loadConversations}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>
            No conversations yet
          </Text>
          <Text style={styles.muted}>
            Start a new chat with AegisAI.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {conversations.map((conversation) => (
            <Pressable
              key={conversation.id}
              onPress={() =>
                onSelectConversation(conversation)
              }
              style={({ pressed }) => [
                styles.conversationItem,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.chatIcon}>
                <Text>💬</Text>
              </View>

              <View style={styles.conversationInfo}>
                <Text
                  style={styles.conversationTitle}
                  numberOfLines={1}
                >
                  {conversation.title || 'New Conversation'}
                </Text>

                {conversation.updated_at && (
                  <Text style={styles.date}>
                    {new Date(
                      conversation.updated_at
                    ).toLocaleDateString()}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    paddingHorizontal: 16,
  },

  header: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1d1d27',
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 30,
  },

  newChatButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  newChatIcon: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '500',
    marginRight: 8,
  },

  newChatText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },

  list: {
    flex: 1,
  },

  conversationItem: {
    minHeight: 64,
    borderRadius: 14,
    backgroundColor: '#15151b',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  pressed: {
    opacity: 0.7,
  },

  chatIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#22222b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  conversationInfo: {
    flex: 1,
  },

  conversationTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },

  date: {
    color: '#777780',
    fontSize: 11,
    marginTop: 4,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },

  emptyTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },

  muted: {
    color: '#777780',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },

  error: {
    color: '#ff7777',
    textAlign: 'center',
    fontSize: 14,
  },

  retryButton: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },

  retryText: {
    color: '#000000',
    fontWeight: '700',
  },
});