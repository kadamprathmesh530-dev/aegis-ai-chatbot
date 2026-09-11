import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import * as Linking from "expo-linking";

const API_BASE_URL = "https://aegis-ai-chatbot.onrender.com";

type LoginScreenProps = {
  onLoginSuccess: (user: any) => void;
  onCreateAccount: () => void;
};

export default function LoginScreen({
  onLoginSuccess,
  onCreateAccount,
}: LoginScreenProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ==========================================================
  // NORMAL EMAIL / PASSWORD LOGIN
  // ==========================================================

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError("Please enter your username/email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginIdentifier: identifier.trim(),
          password,
        }),
      });

      const data = await response.json();

      console.log("LOGIN STATUS:", response.status);
      console.log("LOGIN RESPONSE:", data);

      if (!response.ok || !data.token) {
        throw new Error(
          data.error || "Login failed. Please check your credentials.",
        );
      }

      // =====================================================
      // SAVE AUTH TOKEN
      // =====================================================

      await AsyncStorage.setItem("aegis_auth_token", data.token);

      // =====================================================
      // SAVE USER
      // =====================================================

      if (data.user) {
        await AsyncStorage.setItem(
          "aegis_auth_user",
          JSON.stringify(data.user),
        );
      }

      // =====================================================
      // LOGIN SUCCESS
      // =====================================================

      onLoginSuccess(data.user);
    } catch (err: any) {
      console.error("Login error:", err);

      setError(err.message || "Unable to connect to AegisAI.");
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================
  // GOOGLE LOGIN STATE
  // ==========================================================

  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");

  // Prevent duplicate Google-login requests
  const isGoogleFlowActive = googleLoading;

  // ==========================================================
  // GOOGLE LOGIN
  // ==========================================================

  const handleGoogleLogin = async () => {
    if (isGoogleFlowActive) {
      return;
    }

    setGoogleLoading(true);
    setGoogleError("");

    try {
      // =====================================================
      // STEP 1: START GOOGLE OAUTH FLOW
      // =====================================================

      const startResponse = await fetch(
        `${API_BASE_URL}/api/auth/google/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      const startData = await startResponse.json();

      console.log("GOOGLE START STATUS:", startResponse.status);
      console.log("GOOGLE START RESPONSE:", startData);

      if (!startResponse.ok || !startData.loginCode || !startData.authUrl) {
        throw new Error(
          startData.error ||
            "Failed to start Google Sign-In. Please try again.",
        );
      }

      const currentGoogleCode = startData.loginCode;

      console.log("GOOGLE LOGIN CODE:", currentGoogleCode);

      // =====================================================
      // STEP 2: OPEN GOOGLE AUTHENTICATION
      //
      // The OAuth callback route will receive:
      //
      // aegisaiapp:///oauth2callback?loginCode=XXXX
      //
      // oauth2callback/index.tsx will then complete the
      // login and save the token.
      // =====================================================

      const redirectUri = Linking.createURL("/oauth2callback");

      console.log("GOOGLE REDIRECT URI:", redirectUri);

      const browserResult = await WebBrowser.openAuthSessionAsync(
        startData.authUrl,
        redirectUri,
      );

      console.log("GOOGLE BROWSER RESULT:", browserResult);

      // =====================================================
      // STEP 3
      //
      // oauth2callback/index.tsx handles the loginCode
      // and calls /api/auth/google/status.
      //
      // Do NOT poll here.
      // =====================================================

      if (browserResult.type === "cancel" || browserResult.type === "dismiss") {
        setGoogleError("Google Sign-In was cancelled.");
        return;
      }

      if (browserResult.type === "success") {
        console.log("Google OAuth callback returned successfully.");

        // The callback screen is responsible for:
        // 1. Reading loginCode
        // 2. Calling /api/auth/google/status
        // 3. Saving token
        // 4. Saving user
        // 5. Returning to the home screen
        //
        // So we intentionally do not call status here.
        return;
      }

      // Unexpected browser result
      console.log("Unexpected Google browser result:", browserResult);
    } catch (err: any) {
      console.error("Google Login error:", err);

      setGoogleError(
        err?.message || "Unable to complete Google Sign-In. Please try again.",
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <View style={styles.container}>
      {/* =====================================================
          AEGISAI LOGO
      ===================================================== */}

      <Image
        source={require("../../assets/images/aegisai-logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      {/* =====================================================
          TITLE
      ===================================================== */}

      <Text style={styles.title}>Welcome to AegisAI</Text>

      <Text style={styles.subtitle}>Sign in to continue</Text>

      {/* =====================================================
          FORM
      ===================================================== */}

      <View style={styles.form}>
        {/* EMAIL / USERNAME */}

        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Email or username"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          editable={!loading && !googleLoading}
        />

        {/* PASSWORD */}

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#777"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          editable={!loading && !googleLoading}
        />

        {/* NORMAL LOGIN ERROR */}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* GOOGLE LOGIN ERROR */}

        {googleError ? <Text style={styles.error}>{googleError}</Text> : null}

        {/* =================================================
            SIGN IN
        ================================================= */}

        <Pressable
          onPress={handleLogin}
          disabled={loading || googleLoading}
          style={[
            styles.loginButton,
            (loading || googleLoading) && styles.disabledButton,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.loginText}>Sign In</Text>
          )}
        </Pressable>

        {/* =================================================
            DIVIDER
        ================================================= */}

        <View style={styles.dividerContainer}>
          <View style={styles.divider} />

          <Text style={styles.dividerText}>OR</Text>

          <View style={styles.divider} />
        </View>

        {/* =================================================
            GOOGLE SIGN-IN BUTTON
        ================================================= */}

        <Pressable
          onPress={handleGoogleLogin}
          disabled={googleLoading || loading}
          style={[
            styles.googleButtonContainer,
            (googleLoading || loading) && styles.disabledButton,
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator color="#4285F4" size="small" />
          ) : (
            <Text style={styles.googleText}>Continue with Google</Text>
          )}
        </Pressable>

        {/* =================================================
            CREATE ACCOUNT
        ================================================= */}

        <Pressable
          onPress={onCreateAccount}
          disabled={loading || googleLoading}
          style={[
            styles.createButton,
            (loading || googleLoading) && styles.disabledButton,
          ]}
        >
          <Text style={styles.createText}>Create Account</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ==========================================================
// STYLES
// ==========================================================

const styles = StyleSheet.create({
  // ==========================================================
  // CONTAINER
  // ==========================================================

  container: {
    flex: 1,
    backgroundColor: "#0b0b0f",
    justifyContent: "center",
    alignItems: "center",
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
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },

  subtitle: {
    color: "#9999a3",
    fontSize: 16,
    marginTop: 8,
    marginBottom: 32,
    textAlign: "center",
  },

  // ==========================================================
  // FORM
  // ==========================================================

  form: {
    width: "100%",
    maxWidth: 420,
  },

  // ==========================================================
  // INPUT
  // ==========================================================

  input: {
    height: 56,
    backgroundColor: "#19191f",
    borderWidth: 1,
    borderColor: "#2b2b34",
    borderRadius: 14,
    color: "#ffffff",
    fontSize: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },

  // ==========================================================
  // ERROR
  // ==========================================================

  error: {
    color: "#ff7777",
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
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },

  loginText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
  },

  // ==========================================================
  // DIVIDER
  // ==========================================================

  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 22,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#292932",
  },

  dividerText: {
    color: "#666670",
    fontSize: 12,
    marginHorizontal: 12,
    fontWeight: "600",
  },

  // ==========================================================
  // CREATE ACCOUNT
  // ==========================================================

  createButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: "#19191f",
    borderWidth: 1,
    borderColor: "#3a3a46",
    justifyContent: "center",
    alignItems: "center",
  },

  createText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  // ==========================================================
  // GOOGLE SIGN-IN BUTTON
  // ==========================================================

  googleButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    marginTop: 4,
  },

  googleText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "700",
  },

  // ==========================================================
  // DISABLED
  // ==========================================================

  disabledButton: {
    opacity: 0.6,
  },
});
