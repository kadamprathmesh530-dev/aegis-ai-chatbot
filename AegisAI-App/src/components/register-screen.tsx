import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://aegis-ai-chatbot.onrender.com';

type RegisterScreenProps = {
  onRegisterSuccess: (user: any) => void;
  onBackToLogin: () => void;
};

export default function RegisterScreen({
  onRegisterSuccess,
  onBackToLogin,
}: RegisterScreenProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');

    if (
      !username.trim() ||
      !email.trim() ||
      !password ||
      !confirmPassword
    ) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError(
        'Password must be at least 6 characters long.'
      );
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
          }),
        }
      );

      const data = await response.json();

      console.log(
        'REGISTER STATUS:',
        response.status
      );

      console.log(
        'REGISTER RESPONSE:',
        data
      );

      if (!response.ok || !data.token) {
        throw new Error(
          data.error ||
            'Account creation failed.'
        );
      }

      // Save authentication token
      await AsyncStorage.setItem(
        'aegis_auth_token',
        data.token
      );

      // Save user
      if (data.user) {
        await AsyncStorage.setItem(
          'aegis_auth_user',
          JSON.stringify(data.user)
        );
      }

      // Registration successful
      onRegisterSuccess(data.user);
    } catch (err: any) {
      console.error(
        'Registration error:',
        err
      );

      setError(
        err.message ||
          'Unable to create your account.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={
        styles.scrollContent
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>

        {/* AegisAI Logo */}
        <Image
          source={require('../../assets/images/aegisai-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>
          Create your account
        </Text>

        <Text style={styles.subtitle}>
          Join AegisAI today
        </Text>

        <View style={styles.form}>

          {/* Username */}
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor="#777"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={!loading}
          />

          {/* Email */}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="#777"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={!loading}
          />

          {/* Password */}
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#777"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={!loading}
          />

          {/* Confirm Password */}
          <TextInput
            value={confirmPassword}
            onChangeText={
              setConfirmPassword
            }
            placeholder="Confirm password"
            placeholderTextColor="#777"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            editable={!loading}
          />

          {/* Error */}
          {error ? (
            <Text style={styles.error}>
              {error}
            </Text>
          ) : null}

          {/* Create Account */}
          <Pressable
            onPress={handleRegister}
            disabled={loading}
            style={[
              styles.registerButton,
              loading &&
                styles.disabledButton,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.registerText}>
                Create Account
              </Text>
            )}
          </Pressable>

          {/* Back to Login */}
          <View style={styles.loginRow}>
            <Text style={styles.loginHint}>
              Already have an account?
            </Text>

            <Pressable
              onPress={onBackToLogin}
              disabled={loading}
            >
              <Text style={styles.loginLink}>
                Sign In
              </Text>
            </Pressable>
          </View>

        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },

  container: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: '#0b0b0f',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingVertical: 30,
  },

  logo: {
    width: 150,
    height: 150,
    marginBottom: 10,
  },

  title: {
    color: '#ffffff',
    fontSize: 29,
    fontWeight: '800',
    textAlign: 'center',
  },

  subtitle: {
    color: '#9999a3',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 28,
    textAlign: 'center',
  },

  form: {
    width: '100%',
    maxWidth: 420,
  },

  input: {
    height: 56,
    backgroundColor: '#19191f',
    borderWidth: 1,
    borderColor: '#2b2b34',
    borderRadius: 14,
    color: '#ffffff',
    fontSize: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },

  error: {
    color: '#ff7777',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19,
  },

  registerButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },

  disabledButton: {
    opacity: 0.6,
  },

  registerText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },

  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },

  loginHint: {
    color: '#777780',
    fontSize: 14,
  },

  loginLink: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
});