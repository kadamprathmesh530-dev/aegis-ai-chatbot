import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import React, { useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
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

type AIMode =
  | 'General'
  | 'Study'
  | 'Coding'
  | 'Creative'
  | 'Explain';

const AI_MODES = [
  {
    key: 'General' as AIMode,
    icon: '🤖',
    title: 'General',
    subtitle: 'Balanced assistant',
    instruction: 'Answer normally as a helpful, accurate AI assistant.',
  },
  {
    key: 'Study' as AIMode,
    icon: '📚',
    title: 'Study',
    subtitle: 'Learn step-by-step',
    instruction:
      'Act as a patient study tutor. Explain concepts step-by-step, use simple language, examples, and exam-ready points when useful.',
  },
  {
    key: 'Coding' as AIMode,
    icon: '💻',
    title: 'Coding',
    subtitle: 'Developer mode',
    instruction:
      'Act as an expert programming assistant. Give practical, correct code and explain important parts clearly.',
  },
  {
    key: 'Creative' as AIMode,
    icon: '✨',
    title: 'Creative',
    subtitle: 'Ideas & writing',
    instruction:
      'Act as a creative assistant. Generate original, polished ideas and writing matching the requested tone and format.',
  },
  {
    key: 'Explain' as AIMode,
    icon: '🧠',
    title: 'Explain',
    subtitle: 'Simple explanations',
    instruction:
      'Explain the answer as simply as possible for a beginner, using examples and avoiding unnecessary jargon.',
  },
];

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

  // ============================================================
  // VOICE INPUT
  // ============================================================

  const [isListening, setIsListening] =
    useState(false);

  // ============================================================
  // AEGIS AUTO WAKE / VOICE MODE
  // ============================================================

  const voiceAutoModeRef = useRef(false);
  const wakeWordListeningRef = useRef(false);
  const voiceCommandModeRef = useRef(false);
  const voiceCommandTextRef = useRef('');
  const voiceCommandInProgressRef = useRef(false);
  const waitingForWelcomeRef = useRef(false);
  const wakeRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const [showProfile, setShowProfile] =
    useState(false);

  const [profileData, setProfileData] =
    useState<any>(null);

  const [profileLoading, setProfileLoading] =
    useState(false);

  // ============================================================
  // IMAGE OPTIONS MENU
  // ============================================================

  const [showImageOptionsModal, setShowImageOptionsModal] =
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
  // AI MODES
  // ============================================================

  const [aiMode, setAiMode] = useState<AIMode>('General');
  const [showAIModeModal, setShowAIModeModal] = useState(false);

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
  // LOAD PROFILE
  // ============================================================

  const loadProfile = async () => {
    try {
      setProfileLoading(true);

      const token = await AsyncStorage.getItem(
        'aegis_auth_token'
      );

      if (!token) {
        setLoggedIn(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/api/auth/me`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        await AsyncStorage.removeItem('aegis_auth_token');
        await AsyncStorage.removeItem('aegis_auth_user');
        setLoggedIn(false);
        setShowProfile(false);
        return;
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data?.error || 'Failed to load profile.'
        );
      }

      setProfileData(data.user);
      setUsername(data.user?.username || 'User');
    } catch (error) {
      console.error('Profile loading error:', error);
      Alert.alert(
        'Profile Error',
        'Could not load your profile. Please try again.'
      );
    } finally {
      setProfileLoading(false);
    }
  };

  // ============================================================
  // OPEN PROFILE
  // ============================================================

  const openProfile = async () => {
    setShowProfileMenu(false);
    setShowProfile(true);
    await loadProfile();
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
      clearSelectedImage();

      setShowHistory(false);

      setShowProfileMenu(false);
      setShowProfile(false);
      setProfileData(null);

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
    clearSelectedImage();

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
      clearSelectedImage();

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
  // AEGIS AUTO WAKE / VOICE
  // ============================================================

  const clearWakeRestartTimer = () => {
    if (wakeRestartTimerRef.current) {
      clearTimeout(wakeRestartTimerRef.current);
      wakeRestartTimerRef.current = null;
    }
  };

  const stopAegisVoiceMode = () => {
    clearWakeRestartTimer();
    wakeWordListeningRef.current = false;
    voiceCommandModeRef.current = false;
    voiceCommandTextRef.current = '';
    voiceCommandInProgressRef.current = false;
    waitingForWelcomeRef.current = false;
    voiceAutoModeRef.current = false;

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.error('Aegis voice stop error:', error);
    }
  };

  const startWakeWordListening = async () => {
    try {
      if (!loggedIn || loading || !voiceAutoModeRef.current) return;
      if (voiceCommandModeRef.current) return;

      clearWakeRestartTimer();
      wakeWordListeningRef.current = true;

      ExpoSpeechRecognitionModule.start({
        lang: 'en-IN',
        interimResults: true,
        continuous: false,
      });
    } catch (error) {
      console.error('Aegis wake listening error:', error);
      wakeWordListeningRef.current = false;
      wakeRestartTimerRef.current = setTimeout(() => {
        startWakeWordListening();
      }, 1200);
    }
  };

  const activateAegis = () => {
    if (!voiceAutoModeRef.current || voiceCommandModeRef.current) return;

    clearWakeRestartTimer();
    wakeWordListeningRef.current = false;
    voiceCommandModeRef.current = true;
    voiceCommandTextRef.current = '';
    waitingForWelcomeRef.current = true;

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.error('Wake word stop error:', error);
    }

    Speech.stop();
    Speech.speak('Welcome Back Captain', {
      rate: 0.95,
      pitch: 1.0,
      onDone: () => {
        waitingForWelcomeRef.current = false;
        setTimeout(() => {
          if (!voiceAutoModeRef.current || !loggedIn || loading) return;

          try {
            ExpoSpeechRecognitionModule.start({
              lang: 'en-IN',
              interimResults: true,
              continuous: false,
            });
          } catch (error) {
            console.error('Aegis command listening error:', error);
          }
        }, 250);
      },
    });
  };

  const enableAegisAutoVoice = async () => {
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Microphone Permission',
          'Please allow microphone and speech recognition permission to use Hey Aegis.'
        );
        return;
      }

      voiceAutoModeRef.current = true;
      startWakeWordListening();
    } catch (error) {
      console.error('Aegis auto voice error:', error);
    }
  };

  // Automatically start Hey Aegis mode while the chat screen is open.
  useEffect(() => {
    if (
      !loggedIn ||
      showHistory ||
      showProfile ||
      showChangePassword
    ) {
      stopAegisVoiceMode();
      return;
    }

    // Hey Aegis auto wake is temporarily disabled.
    // Voice can still be started manually with the microphone button.

    return () => {
      stopAegisVoiceMode();
    };
  }, [
    loggedIn,
    showHistory,
    showProfile,
    showChangePassword,
  ]);

  // ============================================================
  // VOICE INPUT EVENTS
  // ============================================================

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);

    // The wake-word recognition is intentionally stopped while
    // Aegis says "Welcome Back Captain". Wait for TTS to finish.
    if (waitingForWelcomeRef.current) {
      return;
    }

    if (
      voiceAutoModeRef.current &&
      wakeWordListeningRef.current &&
      !voiceCommandModeRef.current
    ) {
      wakeWordListeningRef.current = false;
      wakeRestartTimerRef.current = setTimeout(() => {
        startWakeWordListening();
      }, 250);
      return;
    }

    if (
      voiceAutoModeRef.current &&
      voiceCommandModeRef.current &&
      !voiceCommandInProgressRef.current
    ) {
      const command = voiceCommandTextRef.current.trim();

      if (command) {
        voiceCommandInProgressRef.current = true;
        voiceCommandModeRef.current = false;
        voiceCommandTextRef.current = '';
        sendMessage(command, true);
      } else {
        voiceCommandModeRef.current = false;
        startWakeWordListening();
      }
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript || '';
    if (!transcript) return;

    const normalizedTranscript = transcript
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (
      voiceAutoModeRef.current &&
      wakeWordListeningRef.current &&
      !voiceCommandModeRef.current
    ) {
      // Android speech recognition may hear "Hey Aegis" with
      // slightly different spellings, for example:
      // "hey aegis", "hey ages", "hey ajis", or "hey a jesus".
      // Accept these common recognition variants so the wake word
      // still activates.
      const wakeWordVariants = [
        'hey aegis',
        'hey ages',
        'hey ajis',
        'hey a jesus',
        'hey a jes',
        'hey egis',
        'aegis',
        'ages',
        'ajis',
        'egis',
      ];

      const wakeWordDetected = wakeWordVariants.some((variant) =>
        normalizedTranscript === variant ||
        normalizedTranscript.startsWith(`${variant} `) ||
        normalizedTranscript.includes(` ${variant} `) ||
        normalizedTranscript.endsWith(` ${variant}`)
      );

      if (wakeWordDetected) {
        activateAegis();
      }

      return;
    }

    if (
      voiceAutoModeRef.current &&
      voiceCommandModeRef.current
    ) {
      voiceCommandTextRef.current = transcript;
      setMessage(transcript);
      return;
    }

    setMessage(transcript);
  });

  useSpeechRecognitionEvent('error', (event) => {
    // "no-speech" is normal while Hey Aegis standby is waiting.
    // Do not show it as a console error.
    const errorCode = String(event.error || '').toLowerCase();

    if (errorCode !== 'no-speech') {
      console.error(
        'Speech recognition error:',
        event.error,
        event.message
      );
    }

    setIsListening(false);

    if (voiceAutoModeRef.current && loggedIn) {
      voiceCommandModeRef.current = false;
      wakeWordListeningRef.current = false;

      clearWakeRestartTimer();

      wakeRestartTimerRef.current = setTimeout(() => {
        startWakeWordListening();
      }, errorCode === 'no-speech' ? 250 : 800);
    }
  });

  const startVoiceInput = async () => {
    try {
      if (loading) return;

      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Microphone Permission',
          'Please allow microphone and speech recognition permission to use voice input.'
        );
        return;
      }

      // Manual voice button temporarily takes over from wake-word mode.
      wakeWordListeningRef.current = false;
      voiceCommandModeRef.current = false;
      voiceCommandTextRef.current = '';
      voiceAutoModeRef.current = false;

      setIsListening(true);

      ExpoSpeechRecognitionModule.start({
        lang: 'en-IN',
        interimResults: true,
        continuous: false,
      });
    } catch (error) {
      console.error('Voice start error:', error);
      setIsListening(false);
      Alert.alert(
        'Voice Error',
        'Could not start voice input. Please try again.'
      );
    }
  };

  const stopVoiceInput = () => {
    // Completely stop voice mode. Do NOT automatically restart
    // Hey Aegis after the user presses the stop button.
    clearWakeRestartTimer();

    voiceAutoModeRef.current = false;
    wakeWordListeningRef.current = false;
    voiceCommandModeRef.current = false;
    voiceCommandTextRef.current = '';
    voiceCommandInProgressRef.current = false;
    waitingForWelcomeRef.current = false;

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.error('Voice stop error:', error);
    }

    Speech.stop();
    setIsListening(false);
  };

  // ============================================================
  // IMAGE PICKER / CAMERA
  // ============================================================
  const [selectedImageBase64, setSelectedImageBase64] =
    useState<string | null>(null);

  const [selectedImageMimeType, setSelectedImageMimeType] =
    useState<string>('image/jpeg');

  const clearSelectedImage = () => {
    setSelectedImage(null);
    setSelectedImageBase64(null);
    setSelectedImageMimeType('image/jpeg');
  };

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
        setSelectedImageMimeType(
          asset.mimeType?.startsWith('image/')
            ? asset.mimeType
            : 'image/jpeg'
        );
      }
    } catch (error) {
      console.error('Image picker error:', error);

      Alert.alert(
        'Image Error',
        'Could not select the image. Please try again.'
      );
    }
  };

  const takePhoto = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          'Camera Permission Required',
          'Please allow camera access to take a photo.'
        );
        return;
      }

      const result =
        await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
          base64: true,
        });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];

        setSelectedImage(asset.uri);
        setSelectedImageBase64(asset.base64 || null);
        setSelectedImageMimeType(
          asset.mimeType?.startsWith('image/')
            ? asset.mimeType
            : 'image/jpeg'
        );
      }
    } catch (error) {
      console.error('Camera error:', error);

      Alert.alert(
        'Camera Error',
        'Could not take the photo. Please try again.'
      );
    }
  };

  const showImageOptions = () => {
    if (loading) return;

    setShowImageOptionsModal(true);
  };

  const handleCameraPress = () => {
    setShowImageOptionsModal(false);

    setTimeout(() => {
      takePhoto();
    }, 150);
  };

  const handleGalleryPress = () => {
    setShowImageOptionsModal(false);

    setTimeout(() => {
      pickImage();
    }, 150);
  };

  const handleFilesPress = async () => {
    setShowImageOptionsModal(false);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];

        setSelectedImage(asset.uri);

        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const reader = new FileReader();

        reader.onloadend = () => {
          const resultData = reader.result;

          const base64 =
            typeof resultData === 'string'
              ? resultData.split(',')[1] || null
              : null;

          setSelectedImageBase64(base64);
          setSelectedImageMimeType(
            asset.mimeType?.startsWith('image/')
              ? asset.mimeType
              : 'image/jpeg'
          );
        };

        reader.readAsDataURL(blob);
      }
    } catch (error) {
      console.error('File picker error:', error);

      Alert.alert(
        'File Error',
        'Could not select the image file. Please try again.'
      );
    }
  };

  // ============================================================
  // AI MODE HELPERS
  // ============================================================

  const getSelectedMode = () =>
    AI_MODES.find((mode) => mode.key === aiMode) || AI_MODES[0];

  const selectAIMode = (mode: AIMode) => {
    setAiMode(mode);
    setShowAIModeModal(false);
  };

  const usePrompt = (prompt: string) => {
    if (loading) return;
    setMessage(prompt);
  };

  const exportCurrentChat = async () => {
    if (messages.length === 0) {
      Alert.alert('Nothing to Export', 'Start a conversation first.');
      return;
    }

    try {
      const exportText = [
        'AegisAI Conversation',
        `Mode: ${getSelectedMode().title}`,
        '',
        ...messages.map((item) =>
          `${item.role === 'user' ? 'You' : 'AegisAI'}: ${item.content}`
        ),
      ].join('\\n\\n');

      await Clipboard.setStringAsync(exportText);
      Alert.alert(
        'Chat Exported',
        'The complete conversation has been copied to your clipboard.'
      );
    } catch (error) {
      console.error('Export chat error:', error);
      Alert.alert('Export Error', 'Could not export this conversation.');
    }
  };

  // ============================================================
  // SEND MESSAGE
  // ============================================================

 const sendMessage = async (voiceMessage?: string, fromAegisVoice = false) => {
  const cleanMessage = (voiceMessage ?? message).trim();

  if ((!cleanMessage && !selectedImage) || loading) {
    return;
  }

  const selectedMode = getSelectedMode();
  const modeInstruction =
    selectedMode.key === 'General'
      ? ''
      : `\\n\\n[Assistant Mode: ${selectedMode.title}]\\n${selectedMode.instruction}`;

  const requestMessage = cleanMessage
    ? `${cleanMessage}${modeInstruction}`
    : '';

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
            requestMessage ||
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

    const assistantData =
      data.assistantMessage || data.message;

    if (assistantData?.content) {
      const assistantMessage: Message = {
        id:
          assistantData.id ||
          `${Date.now()}-assistant`,

        role: 'assistant',

        content:
          assistantData.content,
      };

      setMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);

      // Speak the answer when the command came through Hey Aegis.
      if (fromAegisVoice) {
        Speech.stop();
        Speech.speak(assistantData.content, {
          rate: 0.95,
          pitch: 1.0,
          onDone: () => {
            if (voiceAutoModeRef.current && loggedIn) {
              wakeRestartTimerRef.current = setTimeout(() => {
                startWakeWordListening();
              }, 300);
            }
          },
        });
      }
    }

    // Clear selected image and its encoded data
    clearSelectedImage();

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

    if (fromAegisVoice) {
      voiceCommandInProgressRef.current = false;
    }
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
  // PROFILE SCREEN
  // ============================================================

  if (showProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.profileScreenHeader}>
          <Pressable
            onPress={() => setShowProfile(false)}
            style={({ pressed }) => [
              styles.profileBackButton,
              pressed && styles.profileBackButtonPressed,
            ]}
            hitSlop={8}
          >
            <Text style={styles.profileBackText}>‹</Text>
          </Pressable>

          <Text style={styles.profileScreenTitle}>
            My Profile
          </Text>
        </View>

        {profileLoading ? (
          <View style={styles.profileLoading}>
            <ActivityIndicator size="large" />
            <Text style={styles.profileLoadingText}>
              Loading profile...
            </Text>
          </View>
        ) : profileData ? (
          <ScrollView
            style={styles.profileScroll}
            contentContainerStyle={styles.profileContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.profileHero}>
              {profileData.avatarUrl ? (
                <Image
                  source={{ uri: profileData.avatarUrl }}
                  style={styles.profileAvatarImage}
                />
              ) : (
                <View style={styles.profileAvatarLarge}>
                  <Text style={styles.profileAvatarLargeText}>
                    {(profileData.username || 'U')
                      .substring(0, 1)
                      .toUpperCase()}
                  </Text>
                </View>
              )}

              <Text style={styles.profileScreenUsername}>
                {profileData.username || 'User'}
              </Text>

              <Text style={styles.profileScreenEmail}>
                {profileData.email || '—'}
              </Text>
            </View>

            <View style={styles.profileInfoCard}>
              <Text style={styles.profileSectionTitle}>
                Account Information
              </Text>

              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoLabel}>
                  Username
                </Text>
                <Text
                  style={styles.profileInfoValue}
                  numberOfLines={1}
                >
                  {profileData.username || '—'}
                </Text>
              </View>

              <View style={styles.profileInfoDivider} />

              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoLabel}>
                  Email
                </Text>
                <Text
                  style={styles.profileInfoValue}
                  numberOfLines={1}
                >
                  {profileData.email || '—'}
                </Text>
              </View>

              <View style={styles.profileInfoDivider} />

              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoLabel}>
                  Login Method
                </Text>
                <View style={styles.profileMethodBadge}>
                  <Text style={styles.profileMethodText}>
                    {profileData.authProvider === 'google'
                      ? 'Google'
                      : 'Email & Password'}
                  </Text>
                </View>
              </View>

              <View style={styles.profileInfoDivider} />

              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoLabel}>
                  Role
                </Text>
                <Text style={styles.profileInfoValue}>
                  {profileData.role === 'admin'
                    ? 'Administrator'
                    : 'User'}
                </Text>
              </View>

              <View style={styles.profileInfoDivider} />

              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoLabel}>
                  Joined
                </Text>
                <Text style={styles.profileInfoValue}>
                  {profileData.createdAt
                    ? new Date(
                        profileData.createdAt
                      ).toLocaleDateString()
                    : '—'}
                </Text>
              </View>

              <View style={styles.profileInfoDivider} />

              <View style={styles.profileInfoRow}>
                <Text style={styles.profileInfoLabel}>
                  Last Login
                </Text>
                <Text
                  style={styles.profileInfoValue}
                  numberOfLines={2}
                >
                  {profileData.lastLoginAt
                    ? new Date(
                        profileData.lastLoginAt
                      ).toLocaleString()
                    : '—'}
                </Text>
              </View>
            </View>

            <View style={styles.profileInfoCard}>
              <Text style={styles.profileSectionTitle}>
                About AegisAI
              </Text>

              <Text style={styles.profileAboutText}>
                AegisAI is your intelligent AI assistant, built
                to help you learn, create, solve problems,
                analyze images, search the web, and get things
                done faster.
              </Text>

              <View style={styles.profileAboutBrand}>
                <Image
                  source={require('../../assets/images/aegisai-logo.png')}
                  style={styles.profileAboutLogo}
                  resizeMode="contain"
                />
                <View>
                  <Text style={styles.profileAboutBrandTitle}>
                    AegisAI
                  </Text>
                  <Text style={styles.profileAboutBrandSubtitle}>
                    Your AI Assistant
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={() => {
                setShowProfile(false);
                setShowChangePassword(true);
              }}
              style={({ pressed }) => [
                styles.profileActionButton,
                pressed && styles.profileActionButtonPressed,
              ]}
            >
              <Text style={styles.profileActionText}>
                🔑  Change Password
              </Text>
              <Text style={styles.profileActionArrow}>
                ›
              </Text>
            </Pressable>

            <View style={styles.profileBottomSpace} />
          </ScrollView>
        ) : (
          <View style={styles.profileLoading}>
            <Text style={styles.profileLoadingText}>
              Could not load profile.
            </Text>
            <Pressable
              onPress={loadProfile}
              style={styles.profileRetryButton}
            >
              <Text style={styles.profileRetryText}>
                Try Again
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
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
          ACTIVE AI MODE BAR
      ====================================================== */}

      <View style={styles.aiModeBar}>
        <Pressable
          onPress={() => setShowAIModeModal(true)}
          disabled={loading}
          style={({ pressed }) => [
            styles.aiModePill,
            pressed && styles.aiModePillPressed,
          ]}
        >
          <Text style={styles.aiModePillIcon}>
            {getSelectedMode().icon}
          </Text>
          <View style={styles.aiModePillTextWrap}>
            <Text style={styles.aiModePillLabel}>
              {getSelectedMode().title} Mode
            </Text>
            <Text style={styles.aiModePillHint}>Tap to change</Text>
          </View>
          <Text style={styles.aiModePillArrow}>⌄</Text>
        </Pressable>

        <Pressable
          onPress={exportCurrentChat}
          disabled={loading || messages.length === 0}
          style={({ pressed }) => [
            styles.exportChatButton,
            (loading || messages.length === 0) &&
              styles.exportChatButtonDisabled,
            pressed && styles.exportChatButtonPressed,
          ]}
        >
          <Text style={styles.exportChatText}>⇧ Export</Text>
        </Pressable>
      </View>

      {/* ======================================================
          AI MODE MENU
      ====================================================== */}

      <Modal
        visible={showAIModeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAIModeModal(false)}
      >
        <View style={styles.aiModeModalContainer}>
          <Pressable
            style={styles.aiModeModalBackdrop}
            onPress={() => setShowAIModeModal(false)}
          />

          <View style={styles.aiModeSheet}>
            <View style={styles.aiModeSheetHandle} />

            <Text style={styles.aiModeSheetTitle}>
              Choose AegisAI Mode
            </Text>

            <Text style={styles.aiModeSheetSubtitle}>
              Change how Aegis responds to your next messages.
            </Text>

            {AI_MODES.map((mode) => (
              <Pressable
                key={mode.key}
                onPress={() => selectAIMode(mode.key)}
                style={({ pressed }) => [
                  styles.aiModeOption,
                  aiMode === mode.key && styles.aiModeOptionSelected,
                  pressed && styles.aiModeOptionPressed,
                ]}
              >
                <View style={styles.aiModeOptionIcon}>
                  <Text style={styles.aiModeOptionEmoji}>
                    {mode.icon}
                  </Text>
                </View>

                <View style={styles.aiModeOptionText}>
                  <Text style={styles.aiModeOptionTitle}>
                    {mode.title}
                  </Text>
                  <Text style={styles.aiModeOptionSubtitle}>
                    {mode.subtitle}
                  </Text>
                </View>

                {aiMode === mode.key && (
                  <Text style={styles.aiModeCheck}>✓</Text>
                )}
              </Pressable>
            ))}

            <Pressable
              onPress={() => setShowAIModeModal(false)}
              style={({ pressed }) => [
                styles.aiModeCancelButton,
                pressed && styles.aiModeCancelPressed,
              ]}
            >
              <Text style={styles.aiModeCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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

          {/* VIEW PROFILE */}

          <Pressable
            onPress={openProfile}
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
              👤  View Profile
            </Text>
          </Pressable>

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

              <View style={styles.promptGrid}>
                {[
                  {
                    icon: '📚',
                    title: 'Study this',
                    prompt: 'Teach me this topic step-by-step with examples.',
                  },
                  {
                    icon: '💻',
                    title: 'Write code',
                    prompt: 'Help me write clean, working code for my idea.',
                  },
                  {
                    icon: '🧠',
                    title: 'Explain simply',
                    prompt: 'Explain a difficult concept in very simple language.',
                  },
                  {
                    icon: '✨',
                    title: 'Give ideas',
                    prompt: 'Give me some creative ideas for my project.',
                  },
                ].map((item) => (
                  <Pressable
                    key={item.title}
                    onPress={() => usePrompt(item.prompt)}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.promptChip,
                      pressed && styles.promptChipPressed,
                    ]}
                  >
                    <Text style={styles.promptChipIcon}>{item.icon}</Text>
                    <Text style={styles.promptChipText}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
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
                onPress={clearSelectedImage}
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
              onPress={showImageOptions}
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

            {/* VOICE INPUT BUTTON */}

            <Pressable
              onPress={
                isListening
                  ? stopVoiceInput
                  : startVoiceInput
              }
              disabled={loading}
              style={[
                styles.voiceButton,
                isListening &&
                  styles.voiceButtonActive,
              ]}
              hitSlop={6}
            >
              <Text style={styles.voiceText}>
                {isListening ? '⏹' : '🎙️'}
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
  onPress={() => sendMessage()}
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
        {/* ======================================================
            IMAGE OPTIONS MODAL
        ====================================================== */}

        <Modal
          visible={showImageOptionsModal}
          transparent
          animationType="slide"
          onRequestClose={() =>
            setShowImageOptionsModal(false)
          }
        >
          <View style={styles.imageModalContainer}>
            <Pressable
              style={styles.imageModalBackdrop}
              onPress={() =>
                setShowImageOptionsModal(false)
              }
            />

            <View style={styles.imageOptionsSheet}>
              <View style={styles.imageSheetHandle} />

              <Text style={styles.imageSheetTitle}>
                Add Image
              </Text>

              <Text style={styles.imageSheetSubtitle}>
                Choose how you want to add an image
              </Text>

              {/* CAMERA */}
              <Pressable
                onPress={handleCameraPress}
                style={({ pressed }) => [
                  styles.imageOption,
                  pressed && styles.imageOptionPressed,
                ]}
              >
                <View style={styles.imageOptionIcon}>
                  <Text style={styles.imageOptionEmoji}>
                    📷
                  </Text>
                </View>

                <View style={styles.imageOptionTextContainer}>
                  <Text style={styles.imageOptionTitle}>
                    Camera
                  </Text>
                  <Text style={styles.imageOptionSubtitle}>
                    Take a new photo
                  </Text>
                </View>

                <Text style={styles.imageOptionArrow}>
                  ›
                </Text>
              </Pressable>

              {/* PHOTOS */}
              <Pressable
                onPress={handleGalleryPress}
                style={({ pressed }) => [
                  styles.imageOption,
                  pressed && styles.imageOptionPressed,
                ]}
              >
                <View style={styles.imageOptionIcon}>
                  <Text style={styles.imageOptionEmoji}>
                    🖼️
                  </Text>
                </View>

                <View style={styles.imageOptionTextContainer}>
                  <Text style={styles.imageOptionTitle}>
                    Photos
                  </Text>
                  <Text style={styles.imageOptionSubtitle}>
                    Choose from your gallery
                  </Text>
                </View>

                <Text style={styles.imageOptionArrow}>
                  ›
                </Text>
              </Pressable>

              {/* FILES */}
              <Pressable
                onPress={handleFilesPress}
                style={({ pressed }) => [
                  styles.imageOption,
                  pressed && styles.imageOptionPressed,
                ]}
              >
                <View style={styles.imageOptionIcon}>
                  <Text style={styles.imageOptionEmoji}>
                    📎
                  </Text>
                </View>

                <View style={styles.imageOptionTextContainer}>
                  <Text style={styles.imageOptionTitle}>
                    Files
                  </Text>
                  <Text style={styles.imageOptionSubtitle}>
                    Select an image file
                  </Text>
                </View>

                <Text style={styles.imageOptionArrow}>
                  ›
                </Text>
              </Pressable>

              {/* CANCEL */}
              <Pressable
                onPress={() =>
                  setShowImageOptionsModal(false)
                }
                style={({ pressed }) => [
                  styles.imageCancelButton,
                  pressed && styles.imageCancelButtonPressed,
                ]}
              >
                <Text style={styles.imageCancelText}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>

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
    // PROFILE SCREEN
    // ==========================================================

    profileScreenHeader: {
      height: 70,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#1e1e25',
    },

    profileBackButton: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: '#19191f',
      borderWidth: 1,
      borderColor: '#292932',
      alignItems: 'center',
      justifyContent: 'center',
    },

    profileBackButtonPressed: {
      opacity: 0.65,
    },

    profileBackText: {
      color: '#ffffff',
      fontSize: 34,
      lineHeight: 36,
      fontWeight: '300',
      marginTop: -3,
    },

    profileScreenTitle: {
      color: '#ffffff',
      fontSize: 21,
      fontWeight: '800',
      marginLeft: 12,
    },

    profileLoading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },

    profileLoadingText: {
      color: '#9999a3',
      fontSize: 14,
      marginTop: 12,
      textAlign: 'center',
    },

    profileScroll: {
      flex: 1,
    },

    profileContent: {
      paddingHorizontal: 18,
      paddingTop: 22,
    },

    profileHero: {
      alignItems: 'center',
      paddingBottom: 6,
    },

    profileAvatarLarge: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: '#25252d',
      borderWidth: 1,
      borderColor: '#3a3a45',
      alignItems: 'center',
      justifyContent: 'center',
    },

    profileAvatarLargeText: {
      color: '#ffffff',
      fontSize: 38,
      fontWeight: '800',
    },

    profileAvatarImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 1,
      borderColor: '#3a3a45',
    },

    profileScreenUsername: {
      color: '#ffffff',
      fontSize: 25,
      fontWeight: '800',
      marginTop: 14,
      textAlign: 'center',
    },

    profileScreenEmail: {
      color: '#858590',
      fontSize: 14,
      marginTop: 5,
      textAlign: 'center',
    },

    profileInfoCard: {
      backgroundColor: '#15151b',
      borderWidth: 1,
      borderColor: '#24242c',
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginTop: 20,
    },

    profileSectionTitle: {
      color: '#ffffff',
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 5,
    },

    profileInfoRow: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },

    profileInfoLabel: {
      color: '#858590',
      fontSize: 13,
      flex: 1,
    },

    profileInfoValue: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'right',
      flex: 1.6,
    },

    profileInfoDivider: {
      height: 1,
      backgroundColor: '#24242c',
    },

    profileMethodBadge: {
      backgroundColor: '#202027',
      borderWidth: 1,
      borderColor: '#30303a',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },

    profileMethodText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },

    profileAboutText: {
      color: '#9999a3',
      fontSize: 14,
      lineHeight: 22,
      marginTop: 8,
    },

    profileAboutBrand: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 18,
      paddingTop: 15,
      borderTopWidth: 1,
      borderTopColor: '#24242c',
    },

    profileAboutLogo: {
      width: 42,
      height: 42,
      marginRight: 10,
    },

    profileAboutBrandTitle: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },

    profileAboutBrandSubtitle: {
      color: '#777780',
      fontSize: 12,
      marginTop: 2,
    },

    profileActionButton: {
      minHeight: 54,
      backgroundColor: '#19191f',
      borderWidth: 1,
      borderColor: '#2b2b34',
      borderRadius: 16,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
    },

    profileActionButtonPressed: {
      backgroundColor: '#25252d',
    },

    profileActionText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },

    profileActionArrow: {
      color: '#777780',
      fontSize: 28,
      fontWeight: '300',
    },

    profileRetryButton: {
      marginTop: 16,
      backgroundColor: '#25252d',
      borderWidth: 1,
      borderColor: '#343440',
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },

    profileRetryText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },

    profileBottomSpace: {
      height: 35,
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
    // IMAGE OPTIONS MODAL
    // ==========================================================

    imageModalContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },

    imageModalBackdrop: {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.68)',
},

    imageOptionsSheet: {
      backgroundColor: '#17171d',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderColor: '#2b2b34',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 28,
    },

    imageSheetHandle: {
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor: '#4a4a55',
      alignSelf: 'center',
      marginBottom: 18,
    },

    imageSheetTitle: {
      color: '#ffffff',
      fontSize: 21,
      fontWeight: '800',
      marginBottom: 5,
    },

    imageSheetSubtitle: {
      color: '#858590',
      fontSize: 13,
      marginBottom: 18,
    },

    imageOption: {
      minHeight: 70,
      backgroundColor: '#202027',
      borderWidth: 1,
      borderColor: '#2d2d36',
      borderRadius: 17,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 13,
      marginBottom: 10,
    },

    imageOptionPressed: {
      backgroundColor: '#2a2a33',
      transform: [{ scale: 0.99 }],
    },

    imageOptionIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: '#2b2b34',
      alignItems: 'center',
      justifyContent: 'center',
    },

    imageOptionEmoji: {
      fontSize: 22,
    },

    imageOptionTextContainer: {
      flex: 1,
      marginLeft: 13,
    },

    imageOptionTitle: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '700',
    },

    imageOptionSubtitle: {
      color: '#858590',
      fontSize: 12,
      marginTop: 3,
    },

    imageOptionArrow: {
      color: '#777780',
      fontSize: 28,
      fontWeight: '300',
      marginLeft: 8,
    },

    imageCancelButton: {
      height: 52,
      borderRadius: 16,
      backgroundColor: '#25252d',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },

    imageCancelButtonPressed: {
      backgroundColor: '#303038',
    },

    imageCancelText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },

    // ==========================================================
    // AI MODE BAR
    // ==========================================================

    aiModeBar: {
      minHeight: 52,
      paddingHorizontal: 14,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#0b0b0f',
    },

    aiModePill: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 42,
      flex: 1,
      marginRight: 8,
      paddingHorizontal: 11,
      backgroundColor: '#17171d',
      borderWidth: 1,
      borderColor: '#2b2b34',
      borderRadius: 14,
    },

    aiModePillPressed: {
      backgroundColor: '#22222a',
    },

    aiModePillIcon: {
      fontSize: 19,
      marginRight: 9,
    },

    aiModePillTextWrap: {
      flex: 1,
    },

    aiModePillLabel: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
    },

    aiModePillHint: {
      color: '#777780',
      fontSize: 10,
      marginTop: 1,
    },

    aiModePillArrow: {
      color: '#9a9aa4',
      fontSize: 18,
      marginLeft: 6,
    },

    exportChatButton: {
      minHeight: 42,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: '#17171d',
      borderWidth: 1,
      borderColor: '#2b2b34',
      alignItems: 'center',
      justifyContent: 'center',
    },

    exportChatButtonPressed: {
      backgroundColor: '#25252d',
    },

    exportChatButtonDisabled: {
      opacity: 0.35,
    },

    exportChatText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },

    // ==========================================================
    // AI MODE MODAL
    // ==========================================================

    aiModeModalContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },

    aiModeModalBackdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.68)',
    },

    aiModeSheet: {
      backgroundColor: '#17171d',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderColor: '#2b2b34',
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 28,
    },

    aiModeSheetHandle: {
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor: '#4a4a55',
      alignSelf: 'center',
      marginBottom: 18,
    },

    aiModeSheetTitle: {
      color: '#ffffff',
      fontSize: 21,
      fontWeight: '800',
      marginBottom: 5,
    },

    aiModeSheetSubtitle: {
      color: '#858590',
      fontSize: 13,
      marginBottom: 18,
    },

    aiModeOption: {
      minHeight: 66,
      backgroundColor: '#202027',
      borderWidth: 1,
      borderColor: '#2d2d36',
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      marginBottom: 9,
    },

    aiModeOptionSelected: {
      borderColor: '#5b5b69',
      backgroundColor: '#25252d',
    },

    aiModeOptionPressed: {
      opacity: 0.82,
    },

    aiModeOptionIcon: {
      width: 44,
      height: 44,
      borderRadius: 13,
      backgroundColor: '#2b2b34',
      alignItems: 'center',
      justifyContent: 'center',
    },

    aiModeOptionEmoji: {
      fontSize: 21,
    },

    aiModeOptionText: {
      flex: 1,
      marginLeft: 12,
    },

    aiModeOptionTitle: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },

    aiModeOptionSubtitle: {
      color: '#858590',
      fontSize: 12,
      marginTop: 3,
    },

    aiModeCheck: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '800',
      marginLeft: 8,
    },

    aiModeCancelButton: {
      height: 52,
      borderRadius: 16,
      backgroundColor: '#25252d',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },

    aiModeCancelPressed: {
      backgroundColor: '#303038',
    },

    aiModeCancelText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
    },

    // ==========================================================
    // EMPTY PROMPT CHIPS
    // ==========================================================

    promptGrid: {
      width: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: 22,
      gap: 9,
    },

    promptChip: {
      minHeight: 42,
      width: '47%',
      backgroundColor: '#17171d',
      borderWidth: 1,
      borderColor: '#2b2b34',
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },

    promptChipPressed: {
      backgroundColor: '#25252d',
      transform: [{ scale: 0.98 }],
    },

    promptChipIcon: {
      fontSize: 16,
      marginRight: 6,
    },

    promptChipText: {
      color: '#d8d8df',
      fontSize: 11,
      fontWeight: '700',
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

    voiceButton: {
      width: 40,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 2,
      marginBottom: 0,
    },

    voiceButtonActive: {
      opacity: 0.6,
    },

    voiceText: {
      fontSize: 21,
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