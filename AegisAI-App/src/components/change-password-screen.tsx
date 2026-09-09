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

type ChangePasswordScreenProps = {
  onBack: () => void;
};

export default function ChangePasswordScreen({
  onBack,
}: ChangePasswordScreenProps) {
  const [currentPassword, setCurrentPassword] =
    useState('');

  const [newPassword, setNewPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    // =====================================================
    // VALIDATION
    // =====================================================

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setError(
        'Please fill in all password fields.'
      );
      return;
    }

    if (newPassword.length < 6) {
      setError(
        'New password must be at least 6 characters long.'
      );
      return;
    }

    if (
      newPassword !== confirmPassword
    ) {
      setError(
        'New password and confirm password do not match.'
      );
      return;
    }

    if (
      currentPassword === newPassword
    ) {
      setError(
        'New password must be different from your current password.'
      );
      return;
    }

    setLoading(true);

    try {
      // ===================================================
      // GET TOKEN
      // ===================================================

      const token =
        await AsyncStorage.getItem(
          'aegis_auth_token'
        );

      if (!token) {
        setError(
          'Your session has expired. Please log in again.'
        );

        setLoading(false);
        return;
      }

      // ===================================================
      // API REQUEST
      // ===================================================

      const response = await fetch(
        `${API_BASE_URL}/api/auth/change-password`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        'CHANGE PASSWORD STATUS:',
        response.status
      );

      console.log(
        'CHANGE PASSWORD RESPONSE:',
        data
      );

      // ===================================================
      // SESSION EXPIRED
      // ===================================================

      if (response.status === 401) {
        await AsyncStorage.removeItem(
          'aegis_auth_token'
        );

        await AsyncStorage.removeItem(
          'aegis_auth_user'
        );

        setError(
          'Your session has expired. Please log in again.'
        );

        setLoading(false);
        return;
      }

      // ===================================================
      // API ERROR
      // ===================================================

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Failed to change password.'
        );
      }

      // ===================================================
      // SUCCESS
      // ===================================================

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setSuccess(
        data.message ||
          'Password updated successfully.'
      );

    } catch (err: any) {
      console.error(
        'Change password error:',
        err
      );

      setError(
        err.message ||
          'Unable to change password.'
      );

    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* =====================================================
          BACK BUTTON
      ===================================================== */}

      <Pressable
        onPress={onBack}
        disabled={loading}
        style={styles.backButton}
      >
        <Text style={styles.backText}>
          ← Back
        </Text>
      </Pressable>

      {/* =====================================================
          LOGO
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
        Change Password
      </Text>

      <Text style={styles.subtitle}>
        Keep your AegisAI account secure
      </Text>

      {/* =====================================================
          FORM
      ===================================================== */}

      <View style={styles.form}>

        {/* CURRENT PASSWORD */}

        <TextInput
          value={currentPassword}
          onChangeText={
            setCurrentPassword
          }
          placeholder="Current password"
          placeholderTextColor="#777"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          editable={!loading}
        />

        {/* NEW PASSWORD */}

        <TextInput
          value={newPassword}
          onChangeText={
            setNewPassword
          }
          placeholder="New password"
          placeholderTextColor="#777"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          editable={!loading}
        />

        {/* CONFIRM PASSWORD */}

        <TextInput
          value={confirmPassword}
          onChangeText={
            setConfirmPassword
          }
          placeholder="Confirm new password"
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

        {/* SUCCESS */}

        {success ? (
          <Text style={styles.success}>
            {success}
          </Text>
        ) : null}

        {/* =================================================
            CHANGE PASSWORD BUTTON
        ================================================= */}

        <Pressable
          onPress={
            handleChangePassword
          }
          disabled={loading}
          style={[
            styles.changeButton,
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
              style={styles.changeText}
            >
              Change Password
            </Text>
          )}
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
  // BACK BUTTON
  // ==========================================================

  backButton: {
    position: 'absolute',
    top: 55,
    left: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  backText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // ==========================================================
  // LOGO
  // ==========================================================

  logo: {
    width: 120,
    height: 120,
    marginBottom: 10,
  },

  // ==========================================================
  // TITLE
  // ==========================================================

  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },

  subtitle: {
    color: '#9999a3',
    fontSize: 15,
    marginTop: 8,
    marginBottom: 28,
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
  // SUCCESS
  // ==========================================================

  success: {
    color: '#67e8a5',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 19,
  },

  // ==========================================================
  // BUTTON
  // ==========================================================

  changeButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },

  changeText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },

  disabledButton: {
    opacity: 0.6,
  },

});