import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';

import Markdown from 'react-native-markdown-display';

import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../components/login-screen';
import RegisterScreen from '../components/register-screen';
import ConversationList from '../components/conversation-list';
import ChangePasswordScreen from '../components/change-password-screen';

const API_BASE_URL =
  'https://aegis-ai-chatbot.onrender.com';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type Conversation = {
  id: string;
  title: string;
  updated_at?: string;
};

export default function HomeScreen() {
  // ============================================================
  // AUTH
  // ============================================================

  const [checkingAuth, setCheckingAuth] =
    useState(true);

  const [loggedIn, setLoggedIn] =
    useState(false);

  const [username, setUsername] =
    useState('User');

  // ============================================================
  // CREATE ACCOUNT
  // ============================================================

  const [showRegister, setShowRegister] =
    useState(false);

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  const [showChangePassword, setShowChangePassword] =
    useState(false);

  // ============================================================
  // CHAT
  // ============================================================

  const [message, setMessage] =
    useState('');

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [selectedImage, setSelectedImage] =
    useState<string | null>(null);

  const [conversationId, setConversationId]=
    useState<string | null>(null);

  // ============================================================
  // HISTORY
  // ============================================================

  const [showHistory, setShowHistory] =
    useState(false);

  // ============================================================
  // PROFILE MENU
  // ============================================================

  const [showProfileMenu, setShowProfileMenu] =
    useState(false);

  // ============================================================
  // FEEDBACK
  // ============================================================

  const [feedback, setFeedback] = useState<{
    [messageId: string]:
      | 'like'
      | 'dislike'
      | null;
  }>({});

  // ============================================================
  // SCROLL
  // ============================================================

  const scrollViewRef =
    useRef<ScrollView>(null);

  // ============================================================
  // THINKING ANIMATION
  // ============================================================

  const dot1 =
    useRef(new Animated.Value(0.35)).current;

  const dot2 =
    useRef(new Animated.Value(0.35)).current;

  const dot3 =
    useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!loading) return;

    const animateDot = (
      dot: Animated.Value,
      delay: number
    ) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),

          Animated.timing(dot, {
            toValue: 1,
            duration: 350,
            useNativeDriver: true,
          }),

          Animated.timing(dot, {
            toValue: 0.35,
            duration: 350,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animations = [
      animateDot(dot1, 0),
      animateDot(dot2, 180),
      animateDot(dot3, 360),
    ];

    animations.forEach((animation) =>
      animation.start()
    );

    return () => {
      animations.forEach((animation) =>
        animation.stop()
      );
    };
  }, [loading, dot1, dot2, dot3]);

  // ============================================================
  // CHECK AUTH
  // ============================================================

  useEffect(() => {
    checkAuth();
  }, []);

  // ============================================================
  // AUTO SCROLL
  // ============================================================

  useEffect(() => {
    if (messages.length > 0 || loading) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({
          animated: true,
        });
      }, 120);

      return () => clearTimeout(timer);
    }
  }, [messages, loading]);

  // ============================================================
  // CHECK AUTH FUNCTION
  // ============================================================

  const checkAuth = async () => {
    try {
      const token =
        await AsyncStorage.getItem(
          'aegis_auth_token'
        );

      const savedUser =
        await AsyncStorage.getItem(
          'aegis_auth_user'
        );

      if (token) {
        setLoggedIn(true);

        if (savedUser) {
          const user =
            JSON.parse(savedUser);

          setUsername(
            user.username || 'User'
          );
        }
      }
    } catch (error) {
      console.error(
        'Auth check error:',
        error
      );
    } finally {
      setCheckingAuth(false);
    }
  };

  // ============================================================
  // LOGIN SUCCESS
  // ============================================================

  const handleLoginSuccess = async (
    user: any
  ) => {
    setLoggedIn(true);

    setShowRegister(false);

    setUsername(
      user?.username || 'User'
    );

    setMessages([]);

    setConversationId(null);

    setShowProfileMenu(false);

    setFeedback({});
  };

  // ============================================================
  // REGISTER SUCCESS
  // ============================================================

  const handleRegisterSuccess = async (
    user: any
  ) => {
    setLoggedIn(true);

    setShowRegister(false);

    setUsername(
      user?.username || 'User'
    );

    setMessages([]);

    setConversationId(null);

    setShowProfileMenu(false);

    setFeedback({});
  };

  // ============================================================
  // LOGOUT
  // ============================================================

  const handleLogout = async () => {
    try {
      const token =
        await AsyncStorage.getItem(
          'aegis_auth_token'
        );

      // --------------------------------------------------------
      // BACKEND LOGOUT
      // --------------------------------------------------------

      if (token) {
        try {
          await fetch(
            `${API_BASE_URL}/api/auth/logout`,
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            }
          );
        } catch (error) {
          console.log(
            'Backend logout request failed:',
            error
          );
        }
      }

      // --------------------------------------------------------
      // REMOVE LOCAL SESSION
      // --------------------------------------------------------

      await AsyncStorage.removeItem(
        'aegis_auth_token'
      );

      await AsyncStorage.removeItem(
        'aegis_auth_user'
      );

      setLoggedIn(false);

      setUsername('User');

      setMessages([]);

      setConversationId(null);

      setMessage('');
      setSelectedImage(null);

      setShowHistory(false);

      setShowProfileMenu(false);

      setShowChangePassword(false);

      setShowRegister(false);

      setFeedback({});
    } catch (error) {
      console.error(
        'Logout error:',
        error
      );
    }
  };

  // ============================================================
  // NEW CHAT
  // ============================================================

  const startNewChat = () => {
    setConversationId(null);

    setMessages([]);

    setMessage('');
    setSelectedImage(null);

    setFeedback({});

    setShowHistory(false);

    setShowProfileMenu(false);
  };

  // ============================================================
  // COPY MESSAGE
  // ============================================================

  const copyMessage = async (
    content: string
  ) => {
    try {
      await Clipboard.setStringAsync(
        content
      );
    } catch (error) {
      console.error(
        'Copy error:',
        error
      );
    }
  };

  // ============================================================
  // LOAD CONVERSATION
  // ============================================================

  const loadConversation = async (
    conversation: Conversation
  ) => {
    try {
      setLoading(true);

      const token =
        await AsyncStorage.getItem(
          'aegis_auth_token'
        );

      if (!token) {
        setLoggedIn(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/conversations/${conversation.id}`,
        {
          method: 'GET',

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );

      const data =
        await response.json();

      // ========================================================
      // SESSION EXPIRED
      // ========================================================

      if (response.status === 401) {
        await AsyncStorage.removeItem(
          'aegis_auth_token'
        );

        await AsyncStorage.removeItem(
          'aegis_auth_user'
        );

        setLoggedIn(false);

        setMessages([]);

        setConversationId(null);

        setShowHistory(false);

        throw new Error(
          'Your session expired. Please log in again.'
        );
      }

      // ========================================================
      // API ERROR
      // ========================================================

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Failed to load conversation.'
        );
      }

      // ========================================================
      // LOAD MESSAGES
      // ========================================================

      const loadedMessages: Message[] = (
        data.messages || []
      ).map((item: any) => ({
        id: String(item.id),

        role:
          item.role === 'assistant'
            ? 'assistant'
            : 'user',

        content:
          item.content || '',
      }));

      setConversationId(
        String(conversation.id)
      );

      setMessages(
        loadedMessages
      );

      setMessage('');
      setSelectedImage(null);

      setFeedback({});

      setShowHistory(false);

      setShowProfileMenu(false);

    } catch (error: any) {
      console.error(
        'Conversation loading error:',
        error
      );

      setMessages([
        {
          id:
            Date.now().toString(),

          role: 'assistant',

          content:
            error.message ||
            'Could not load this conversation.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // IMAGE PICKER
  // ============================================================
const [selectedImageBase64, setSelectedImageBase64] =
  useState<string | null>(null);

const [selectedImageMimeType, setSelectedImageMimeType] =
  useState<string>('image/jpeg');

  const pickImage = async () => {
  try {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow gallery access to select an image.'
      );
      return;
    }

    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];

      setSelectedImage(asset.uri);
      setSelectedImageBase64(asset.base64 || null);
      setSelectedImageMimeType('image/jpeg');
    }
  } catch (error) {
    console.error('Image picker error:', error);

    Alert.alert(
      'Image Error',
      'Could not select the image. Please try again.'
    );
  }
};

  // ============================================================
  // SEND MESSAGE
  // ============================================================

 const sendMessage = async () => {
  const cleanMessage = message.trim();

  if ((!cleanMessage && !selectedImage) || loading) {
    return;
  }

  const token = await AsyncStorage.getItem(
    'aegis_auth_token'
  );

  if (!token) {
    setLoggedIn(false);
    return;
  }

  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content:
      cleanMessage || '📷 Image',
  };

  setMessages((prev) => [
    ...prev,
    userMessage,
  ]);

  setMessage('');
  setLoading(true);

  try {
    let imageData: string | null = null;
    let imageMimeType = 'image/jpeg';

    // ============================================================
// USE IMAGEPICKER BASE64
// ============================================================

if (selectedImageBase64) {
  imageData = selectedImageBase64;
  imageMimeType = 'image/jpeg';
}
    // ==========================================================
    // API REQUEST
    // ==========================================================

    const response = await fetch(
      `${API_BASE_URL}/api/chat`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,
        },

        body: JSON.stringify({
          conversationId:
            conversationId,

          message:
            cleanMessage ||
            'Please analyze this image.',

          imageData:
            imageData,

          imageMimeType:
            imageMimeType,
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
          'Failed to send message.'
      );
    }

    // ==========================================================
    // UPDATE CONVERSATION
    // ==========================================================

    if (data.conversationId) {
      setConversationId(
        data.conversationId
      );
    }

    // ==========================================================
    // ASSISTANT RESPONSE
    // ==========================================================

    if (
      data.assistantMessage?.content
    ) {
      const assistantMessage: Message = {
        id:
          data.assistantMessage.id ||
          `${Date.now()}-assistant`,

        role: 'assistant',

        content:
          data.assistantMessage.content,
      };

      setMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);
    }

    // Clear selected image
    setSelectedImage(null);

  } catch (error) {
    console.error(
      'Send message error:',
      error
    );

    Alert.alert(
      'Message Error',
      'Could not send the message. Please try again.'
    );
  } finally {
    setLoading(false);
  }
};

  // ============================================================
  // AUTH LOADING SCREEN
  // ============================================================

  if (checkingAuth) {
    return (
      <View
        style={
          styles.loadingScreen
        }
      >
        <ActivityIndicator
          size="large"
        />

        <Text
          style={
            styles.loadingScreenText
          }
        >
          Starting AegisAI...
        </Text>
      </View>
    );
  }

  // ============================================================
  // LOGIN / REGISTER
  // ============================================================

  if (!loggedIn) {
    if (showRegister) {
      return (
        <RegisterScreen
          onRegisterSuccess={
            handleRegisterSuccess
          }

          onBackToLogin={() =>
            setShowRegister(false)
          }
        />
      );
    }

    return (
      <LoginScreen
        onLoginSuccess={
          handleLoginSuccess
        }

        onCreateAccount={() =>
          setShowRegister(true)
        }
      />
    );
  }

  // ============================================================
  // CHANGE PASSWORD SCREEN
  // ============================================================

  if (showChangePassword) {
    return (
      <SafeAreaView
        style={
          styles.historyContainer
        }
      >
        <ChangePasswordScreen
          onBack={() =>
            setShowChangePassword(false)
          }
        />
      </SafeAreaView>
    );
  }

  // ============================================================
  // HISTORY SCREEN
  // ============================================================

  if (showHistory) {
    return (
      <SafeAreaView
        style={
          styles.historyContainer
        }
      >
        <ConversationList
          onSelectConversation={
            loadConversation
          }

          onNewChat={
            startNewChat
          }

          onClose={() =>
            setShowHistory(false)
          }
        />
      </SafeAreaView>
    );
  }

  // ============================================================
  // CHAT SCREEN
  // ============================================================

  return (
    <SafeAreaView
      style={styles.container}
    >
      {/* ======================================================
          HEADER
      ====================================================== */}

      <View style={styles.header}>

        {/* ====================================================
            BRAND
        ==================================================== */}

        <View
          style={
            styles.brandContainer
          }
        >
          <View
            style={
              styles.headerLogoContainer
            }
          >
            <Image
              source={require('../../assets/images/aegisai-logo.png')}
              style={
                styles.headerLogo
              }
              resizeMode="contain"
            />
          </View>

          <View>
            <Text
              style={styles.logo}
            >
              AegisAI
            </Text>

            <Text
              style={styles.status}
            >
              AI Assistant
            </Text>
          </View>
        </View>

        {/* ====================================================
            HEADER ACTIONS
        ==================================================== */}

        <View
          style={
            styles.headerActions
          }
        >
          {/* ==================================================
              HISTORY BUTTON
          ================================================== */}

          <Pressable
            onPress={() => {
              setShowHistory(true);
              setShowProfileMenu(false);
            }}

            hitSlop={10}

            style={({ pressed }) => [
              styles.iconButton,

              pressed &&
                styles.iconButtonPressed,
            ]}
          >
            <Text
              style={
                styles.historyIcon
              }
            >
              ☰
            </Text>
          </Pressable>

          {/* ==================================================
              PROFILE BUTTON
          ================================================== */}

          <Pressable
            onPress={() =>
              setShowProfileMenu(
                (prev) => !prev
              )
            }

            style={
              styles.profileButton
            }
          >
            <Text
              style={
                styles.profileText
              }
            >
              {username
                .substring(0, 1)
                .toUpperCase()}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ======================================================
          PROFILE MENU
      ====================================================== */}

      {showProfileMenu && (
        <View
          style={
            styles.profileMenu
          }
        >
          <Text
            style={
              styles.profileMenuUsername
            }
          >
            {username}
          </Text>

          <View
            style={
              styles.profileMenuDivider
            }
          />

          {/* CHANGE PASSWORD */}

          <Pressable
            onPress={() => {
              setShowProfileMenu(false);
              setShowChangePassword(true);
            }}

            style={({ pressed }) => [
              styles.profileMenuButton,

              pressed &&
                styles.profileMenuButtonPressed,
            ]}
          >
            <Text
              style={
                styles.profileMenuButtonText
              }
            >
              Change Password
            </Text>
          </Pressable>

          {/* LOGOUT */}

          <Pressable
            onPress={handleLogout}

            style={({ pressed }) => [
              styles.logoutButton,

              pressed &&
                styles.logoutButtonPressed,
            ]}
          >
            <Text
              style={
                styles.logoutText
              }
            >
              Logout
            </Text>
          </Pressable>
        </View>
      )}

      {/* ======================================================
          CHAT + KEYBOARD
      ====================================================== */}

      <KeyboardAvoidingView
        style={
          styles.chatContainer
        }

        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : 'height'
        }

        keyboardVerticalOffset={
          Platform.OS === 'ios'
            ? 0
            : 20
        }
      >
        {/* ====================================================
            MESSAGES
        ==================================================== */}

        <ScrollView
          ref={scrollViewRef}

          contentContainerStyle={[
            styles.chatContent,

            messages.length === 0 &&
              styles.emptyContent,
          ]}

          showsVerticalScrollIndicator={
            false
          }
        >
          {/* ==================================================
              EMPTY STATE
          ================================================== */}

          {messages.length === 0 && (
            <View
              style={
                styles.emptyState
              }
            >
              {/* AEGISAI HERO LOGO */}

              <View
                style={
                  styles.heroLogoContainer
                }
              >
                <Image
                  source={require('../../assets/images/aegisai-logo.png')}
                  style={
                    styles.heroLogo
                  }
                  resizeMode="contain"
                />
              </View>

              <Text
                style={
                  styles.welcomeTitle
                }
              >
                Hello, {username}
              </Text>

              <Text
                style={
                  styles.subtitle
                }
              >
                How can I help you?
              </Text>
            </View>
          )}

          {/* ==================================================
              MESSAGE LIST
          ================================================== */}

          {messages.map((item) => (
            <View
              key={item.id}

              style={[
                styles.messageRow,

                item.role === 'user'
                  ? styles.userRow
                  : styles.assistantRow,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,

                  item.role === 'user'
                    ? styles.userBubble
                    : styles.assistantBubble,
                ]}
              >
                {/* =================================================
                    AI LABEL
                ================================================= */}

                {item.role ===
                  'assistant' && (
                  <Text
                    style={
                      styles.aiLabel
                    }
                  >
                    AegisAI
                  </Text>
                )}

                {/* =================================================
                    MESSAGE CONTENT
                ================================================= */}

                {item.role === 'assistant' ? (
                  <Markdown
                    style={
                      markdownStyles
                    }
                  >
                    {item.content}
                  </Markdown>
                ) : (
                  <Text
                    style={[
                      styles.messageText,
                      styles.userText,
                    ]}
                  >
                    {item.content}
                  </Text>
                )}

                {/* =================================================
                    AI ACTIONS
                ================================================= */}

                {item.role ===
                  'assistant' && (
                  <View
                    style={
                      styles.feedbackRow
                    }
                  >
                    {/* COPY */}

                    <Pressable
                      onPress={() =>
                        copyMessage(
                          item.content
                        )
                      }

                      style={
                        styles.feedbackButton
                      }
                    >
                      <Text
                        style={
                          styles.feedbackText
                        }
                      >
                        ▢ Copy
                      </Text>
                    </Pressable>

                    {/* LIKE */}

                    <Pressable
                      onPress={() =>
                        setFeedback(
                          (prev) => ({
                            ...prev,
                            [item.id]:
                              prev[
                                item.id
                              ] === 'like'
                                ? null
                                : 'like',
                          })
                        )
                      }

                      style={[
                        styles.feedbackButton,

                        feedback[
                          item.id
                        ] === 'like' &&
                          styles.feedbackButtonSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.feedbackText,

                          feedback[
                            item.id
                          ] === 'like' &&
                            styles.feedbackTextSelected,
                        ]}
                      >
                        👍
                      </Text>
                    </Pressable>

                    {/* DISLIKE */}

                    <Pressable
                      onPress={() =>
                        setFeedback(
                          (prev) => ({
                            ...prev,
                            [item.id]:
                              prev[
                                item.id
                              ] === 'dislike'
                                ? null
                                : 'dislike',
                          })
                        )
                      }

                      style={[
                        styles.feedbackButton,

                        feedback[
                          item.id
                        ] === 'dislike' &&
                          styles.feedbackButtonSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.feedbackText,

                          feedback[
                            item.id
                          ] === 'dislike' &&
                            styles.feedbackTextSelected,
                        ]}
                      >
                        👎
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          ))}

          {/* ==================================================
              AI THINKING
          ================================================== */}

          {loading && (
            <View
              style={
                styles.loadingRow
              }
            >
              <View
                style={
                  styles.loadingBubble
                }
              >
                <Animated.View
                  style={[
                    styles.thinkingDot,
                    {
                      opacity: dot1,
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.thinkingDot,
                    {
                      opacity: dot2,
                    },
                  ]}
                />

                <Animated.View
                  style={[
                    styles.thinkingDot,
                    {
                      opacity: dot3,
                    },
                  ]}
                />

                <Text
                  style={
                    styles.loadingText
                  }
                >
                  AegisAI is thinking
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ======================================================
            INPUT
        ====================================================== */}

        <View
          style={styles.inputArea}
        >
          {selectedImage && (
            <View
              style={styles.imagePreviewContainer}
            >
              <Image
                source={{ uri: selectedImage }}
                style={styles.imagePreview}
                resizeMode="cover"
              />

              <Pressable
                onPress={() => setSelectedImage(null)}
                style={styles.removeImageButton}
                hitSlop={8}
              >
                <Text
                  style={styles.removeImageText}
                >
                  ×
                </Text>
              </Pressable>
            </View>
          )}

          <View
            style={styles.inputBox}
          >
            <Pressable
              onPress={pickImage}
              disabled={loading}
              style={styles.attachButton}
              hitSlop={6}
            >
              <Text
                style={styles.attachText}
              >
                📎
              </Text>
            </Pressable>

            <TextInput
              value={message}

              onChangeText={
                setMessage
              }

              placeholder={
                'Message AegisAI...'
              }

              placeholderTextColor="#777"

              multiline

              textAlignVertical="top"

              returnKeyType="default"

              blurOnSubmit={false}

              style={styles.input}

              editable={!loading}
            />

            {/* SEND BUTTON */}

            <Pressable
              onPress={
                sendMessage
              }

              disabled={
  (!message.trim() && !selectedImage) ||
  loading
}

              style={[
  styles.sendButton,
  ((!message.trim() && !selectedImage) || loading) &&
    styles.sendButtonDisabled,
]}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color="#000"
                />
              ) : (
                <Text
                  style={
                    styles.sendText
                  }
                >
                  ↑
                </Text>
              )}
            </Pressable>
          </View>

          <Text
            style={
              styles.disclaimer
            }
          >
            AegisAI can make
            mistakes. Check
            important information.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============================================================
// MAIN STYLES
// ============================================================

const styles =
  StyleSheet.create({

    // ==========================================================
    // AUTH LOADING
    // ==========================================================

    loadingScreen: {
      flex: 1,
      backgroundColor: '#0b0b0f',
      justifyContent: 'center',
      alignItems: 'center',
    },

    loadingScreenText: {
      color: '#9999a3',
      marginTop: 12,
      fontSize: 14,
    },

    // ==========================================================
    // MAIN
    // ==========================================================

    container: {
      flex: 1,
      backgroundColor: '#0b0b0f',
    },

    historyContainer: {
      flex: 1,
      backgroundColor: '#0b0b0f',
    },

    // ==========================================================
    // HEADER
    // ==========================================================

    header: {
      height: 70,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: '#1e1e25',
    },

    brandContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    headerLogoContainer: {
      width: 42,
      height: 42,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },

    headerLogo: {
      width: 42,
      height: 42,
    },

    logo: {
      color: '#ffffff',
      fontSize: 22,
      fontWeight: '800',
    },

    status: {
      color: '#777780',
      fontSize: 12,
      marginTop: 2,
    },

    // ==========================================================
    // HEADER ACTIONS
    // ==========================================================

    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },

    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: '#19191f',
      borderWidth: 1,
      borderColor: '#292932',
      alignItems: 'center',
      justifyContent: 'center',
    },

    iconButtonPressed: {
      opacity: 0.65,
    },

    historyIcon: {
      color: '#ffffff',
      fontSize: 20,
    },

    profileButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#25252d',
      alignItems: 'center',
      justifyContent: 'center',
    },

    profileText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },

    // ==========================================================
    // PROFILE MENU
    // ==========================================================

    profileMenu: {
      position: 'absolute',
      top: 62,
      right: 18,
      width: 190,
      backgroundColor: '#19191f',
      borderWidth: 1,
      borderColor: '#30303a',
      borderRadius: 14,
      paddingVertical: 10,
      zIndex: 100,
      elevation: 10,
    },

    profileMenuUsername: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },

    profileMenuDivider: {
      height: 1,
      backgroundColor: '#2b2b34',
      marginVertical: 4,
    },

    profileMenuButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      marginHorizontal: 6,
    },

    profileMenuButtonPressed: {
      backgroundColor: '#2b2b34',
    },

    profileMenuButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
    },

    // ==========================================================
    // LOGOUT
    // ==========================================================

    logoutButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      marginHorizontal: 6,
    },

    logoutButtonPressed: {
      backgroundColor: '#2b2b34',
    },

    logoutText: {
      color: '#ff7777',
      fontSize: 14,
      fontWeight: '600',
    },

    // ==========================================================
    // CHAT
    // ==========================================================

    chatContainer: {
      flex: 1,
    },

    chatContent: {
      padding: 16,
      paddingBottom: 30,
    },

    emptyContent: {
      flexGrow: 1,
    },

    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 25,
    },

    // ==========================================================
    // HERO LOGO
    // ==========================================================

    heroLogoContainer: {
      width: 110,
      height: 110,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },

    heroLogo: {
      width: 110,
      height: 110,
    },

    welcomeTitle: {
      color: '#ffffff',
      fontSize: 36,
      fontWeight: '800',
      textAlign: 'center',
    },

    subtitle: {
      color: '#9999a3',
      fontSize: 18,
      marginTop: 10,
      textAlign: 'center',
    },

    // ==========================================================
    // MESSAGE
    // ==========================================================

    messageRow: {
      width: '100%',
      marginVertical: 7,
      paddingHorizontal: 2,
    },

    userRow: {
      alignItems: 'flex-end',
    },

    assistantRow: {
      alignItems: 'flex-start',
    },

    messageBubble: {
      maxWidth: '94%',
      paddingHorizontal: 17,
      paddingVertical: 13,
      borderRadius: 18,
    },

    userBubble: {
      backgroundColor: '#2a2a34',
      borderBottomRightRadius: 5,
      borderWidth: 1,
      borderColor: '#343440',
    },

    assistantBubble: {
      backgroundColor: '#15151b',
      borderBottomLeftRadius: 5,
      borderWidth: 1,
      borderColor: '#24242c',
    },

    aiLabel: {
      color: '#aaaab4',
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 6,
    },

    messageText: {
      fontSize: 16,
      lineHeight: 25,
      letterSpacing: 0.1,
    },

    userText: {
      color: '#ffffff',
    },

    // ==========================================================
    // FEEDBACK
    // ==========================================================

    feedbackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
    },

    feedbackButton: {
      minWidth: 34,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
      paddingHorizontal: 8,
    },

    feedbackText: {
      color: '#858590',
      fontSize: 12,
      fontWeight: '600',
    },

    feedbackButtonSelected: {
      backgroundColor: '#2b2b34',
    },

    feedbackTextSelected: {
      color: '#ffffff',
    },

    // ==========================================================
    // THINKING
    // ==========================================================

    loadingRow: {
      alignItems: 'flex-start',
      marginVertical: 6,
    },

    loadingBubble: {
      backgroundColor: '#17171d',
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },

    thinkingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#9999a3',
      marginRight: 3,
    },

    loadingText: {
      color: '#9999a3',
      fontSize: 14,
      marginLeft: 6,
    },

    // ==========================================================
    // INPUT
    // ==========================================================

    inputArea: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 10,
      backgroundColor: '#0b0b0f',
    },

    imagePreviewContainer: {
      position: 'relative',
      marginBottom: 10,
      marginLeft: 4,
      alignSelf: 'flex-start',
    },

    imagePreview: {
      width: 92,
      height: 92,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2b2b34',
    },

    removeImageButton: {
      position: 'absolute',
      top: -8,
      right: -8,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#25252d',
      borderWidth: 1,
      borderColor: '#3a3a45',
      alignItems: 'center',
      justifyContent: 'center',
    },

    removeImageText: {
      color: '#ffffff',
      fontSize: 20,
      lineHeight: 22,
      fontWeight: '600',
    },

    inputBox: {
      minHeight: 58,
      maxHeight: 140,
      backgroundColor: '#17171d',
      borderWidth: 1,
      borderColor: '#2b2b34',
      borderRadius: 24,
      paddingLeft: 18,
      paddingRight: 8,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'flex-end',
    },

    attachButton: {
      width: 40,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 2,
      marginBottom: 0,
    },

    attachText: {
      fontSize: 21,
    },

    input: {
      flex: 1,
      color: '#ffffff',
      fontSize: 16,
      paddingTop: 10,
      paddingBottom: 10,
      maxHeight: 115,
    },

    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      marginBottom: 0,
    },

    sendButtonDisabled: {
      backgroundColor: '#303038',
    },

    sendText: {
      color: '#000000',
      fontSize: 25,
      fontWeight: '700',
      marginTop: -3,
    },

    disclaimer: {
      color: '#5f5f69',
      fontSize: 10,
      textAlign: 'center',
      marginTop: 7,
    },
  });

// ============================================================
// MARKDOWN STYLES
// ============================================================

const markdownStyles =
  StyleSheet.create({

    // ==========================================================
    // NORMAL TEXT
    // ==========================================================

    body: {
      color: '#eeeeF2',
      fontSize: 16,
      lineHeight: 25,
    },

    paragraph: {
      color: '#eeeeF2',
      marginTop: 0,
      marginBottom: 10,
    },

    // ==========================================================
    // HEADINGS
    // ==========================================================

    heading1: {
      color: '#ffffff',
      fontSize: 26,
      fontWeight: '800',
      marginTop: 8,
      marginBottom: 10,
    },

    heading2: {
      color: '#ffffff',
      fontSize: 22,
      fontWeight: '800',
      marginTop: 8,
      marginBottom: 8,
    },

    heading3: {
      color: '#ffffff',
      fontSize: 19,
      fontWeight: '700',
      marginTop: 6,
      marginBottom: 7,
    },

    heading4: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '700',
      marginTop: 6,
      marginBottom: 6,
    },

    // ==========================================================
    // BOLD / ITALIC
    // ==========================================================

    strong: {
      color: '#ffffff',
      fontWeight: '800',
    },

    em: {
      color: '#eeeeF2',
      fontStyle: 'italic',
    },

    // ==========================================================
    // LISTS
    // ==========================================================

    bullet_list: {
      marginBottom: 8,
    },

    ordered_list: {
      marginBottom: 8,
    },

    list_item: {
      marginBottom: 5,
    },

    // ==========================================================
    // BLOCKQUOTE
    // ==========================================================

    blockquote: {
      backgroundColor: '#1d1d25',
      borderLeftWidth: 4,
      borderLeftColor: '#666675',
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },

    // ==========================================================
    // INLINE CODE
    // ==========================================================

    code_inline: {
      backgroundColor: '#25252d',
      color: '#ffffff',
      borderRadius: 5,
      paddingHorizontal: 5,
      paddingVertical: 2,
      fontSize: 14,
    },

    // ==========================================================
    // CODE BLOCK
    // ==========================================================

    code_block: {
      backgroundColor: '#0d0d12',
      color: '#eeeeF2',
      borderWidth: 1,
      borderColor: '#2d2d37',
      borderRadius: 10,
      padding: 12,
      marginVertical: 8,
      fontSize: 13,
      lineHeight: 20,
    },

    fence: {
      backgroundColor: '#0d0d12',
      color: '#eeeeF2',
      borderWidth: 1,
      borderColor: '#2d2d37',
      borderRadius: 10,
      padding: 12,
      marginVertical: 8,
      fontSize: 13,
      lineHeight: 20,
    },

    // ==========================================================
    // LINKS
    // ==========================================================

    link: {
      color: '#7db7ff',
      textDecorationLine: 'underline',
    },

    // ==========================================================
    // TABLE
    // ==========================================================

    table: {
      borderWidth: 1,
      borderColor: '#3a3a45',
      borderRadius: 8,
      marginVertical: 10,
      overflow: 'hidden',
      width: '100%',
    },

    thead: {
      backgroundColor: '#25252d',
    },

    tbody: {
      backgroundColor: '#17171d',
    },

    tr: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#3a3a45',
    },

    th: {
      flex: 1,
      paddingHorizontal: 6,
      paddingVertical: 9,
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '800',
      borderRightWidth: 1,
      borderRightColor: '#3a3a45',
      textAlign: 'left',
    },

    td: {
      flex: 1,
      paddingHorizontal: 6,
      paddingVertical: 9,
      color: '#eeeeF2',
      fontSize: 11,
      lineHeight: 17,
      borderRightWidth: 1,
      borderRightColor: '#3a3a45',
    },

    // ==========================================================
    // HORIZONTAL RULE
    // ==========================================================

    hr: {
      backgroundColor: '#30303a',
      height: 1,
      marginVertical: 12,
    },
  });