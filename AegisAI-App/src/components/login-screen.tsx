import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL =
  'https://aegis-ai-chatbot.onrender.com';

type LoginScreenProps = {
  onLoginSuccess: (user: any) => void;
  onCreateAccount: () => void;
};

export default function LoginScreen({
  onLoginSuccess,
  onCreateAccount,
}: LoginScreenProps) {
  const [identifier, setIdentifier] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const handleLogin = async () => {
    if (
      !identifier.trim() ||
      !password
    ) {
      setError(
        'Please enter your username/email and password.'
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/auth/login`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            loginIdentifier:
              identifier.trim(),

            password,
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        'LOGIN STATUS:',
        response.status
      );

      console.log(
        'LOGIN RESPONSE:',
        data
      );

      if (
        !response.ok ||
        !data.token
      ) {
        throw new Error(
          data.error ||
            'Login failed. Please check your credentials.'
        );
      }

      // =====================================================
      // SAVE AUTH TOKEN
      // =====================================================

      await AsyncStorage.setItem(
        'aegis_auth_token',
        data.token
      );

      // =====================================================
      // SAVE USER
      // =====================================================

      if (data.user) {
        await AsyncStorage.setItem(
          'aegis_auth_user',
          JSON.stringify(data.user)
        );
      }

      // =====================================================
      // LOGIN SUCCESS
      // =====================================================

      onLoginSuccess(data.user);

    } catch (err: any) {
      console.error(
        'Login error:',
        err
      );

      setError(
        err.message ||
          'Unable to connect to AegisAI.'
      );

    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* =====================================================
          AEGISAI LOGO
      ===================================================== */}

      <Image
        source={require('../../assets/images/aegisai-logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* =====================================================
          TITLE
      ===================================================== */}

      <Text style={styles.title}>
        Welcome to AegisAI
      </Text>

      <Text style={styles.subtitle}>
        Sign in to continue
      </Text>

      {/* =====================================================
          FORM
      ===================================================== */}

      <View style={styles.form}>

        {/* EMAIL / USERNAME */}

        <TextInput
          value={identifier}
          onChangeText={
            setIdentifier
          }
          placeholder="Email or username"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          editable={!loading}
        />

        {/* PASSWORD */}

        <TextInput
          value={password}
          onChangeText={
            setPassword
          }
          placeholder="Password"
          placeholderTextColor="#777"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          editable={!loading}
        />

        {/* ERROR */}

        {error ? (
          <Text style={styles.error}>
            {error}
          </Text>
        ) : null}

        {/* =================================================
            SIGN IN
        ================================================= */}

        <Pressable
          onPress={handleLogin}
          disabled={loading}
          style={[
            styles.loginButton,
            loading &&
              styles.disabledButton,
          ]}
        >
          {loading ? (
            <ActivityIndicator
              color="#000"
            />
          ) : (
            <Text
              style={styles.loginText}
            >
              Sign In
            </Text>
          )}
        </Pressable>

        {/* =================================================
            DIVIDER
        ================================================= */}

        <View
          style={styles.dividerContainer}
        >
          <View
            style={styles.divider}
          />

          <Text
            style={styles.dividerText}
          >
            OR
          </Text>

          <View
            style={styles.divider}
          />
        </View>

        {/* =================================================
            CREATE ACCOUNT
        ================================================= */}

        <Pressable
          onPress={onCreateAccount}
          disabled={loading}
          style={[
            styles.createButton,
            loading &&
              styles.disabledButton,
          ]}
        >
          <Text
            style={styles.createText}
          >
            Create Account
          </Text>
        </Pressable>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  // ==========================================================
  // CONTAINER
  // ==========================================================

  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 25,
  },

  // ==========================================================
  // LOGO
  // ==========================================================

  logo: {
    width: 170,
    height: 170,
    marginBottom: 12,
  },

  // ==========================================================
  // TITLE
  // ==========================================================

  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },

  subtitle: {
    color: '#9999a3',
    fontSize: 16,
    marginTop: 8,
    marginBottom: 32,
    textAlign: 'center',
  },

  // ==========================================================
  // FORM
  // ==========================================================

  form: {
    width: '100%',
    maxWidth: 420,
  },

  // ==========================================================
  // INPUT
  // ==========================================================

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

  // ==========================================================
  // ERROR
  // ==========================================================

  error: {
    color: '#ff7777',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19,
  },

  // ==========================================================
  // SIGN IN BUTTON
  // ==========================================================

  loginButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },

  loginText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },

  // ==========================================================
  // DIVIDER
  // ==========================================================

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#292932',
  },

  dividerText: {
    color: '#666670',
    fontSize: 12,
    marginHorizontal: 12,
    fontWeight: '600',
  },

  // ==========================================================
  // CREATE ACCOUNT
  // ==========================================================

  createButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#19191f',
    borderWidth: 1,
    borderColor: '#3a3a46',
    justifyContent: 'center',
    alignItems: 'center',
  },

  createText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ==========================================================
  // DISABLED
  // ==========================================================

  disabledButton: {
    opacity: 0.6,
  },

});