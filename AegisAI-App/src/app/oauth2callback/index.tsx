import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const API_BASE_URL = "https://aegis-ai-chatbot.onrender.com";

export default function OAuthCallback() {
  const router = useRouter();

  const { loginCode } = useLocalSearchParams<{
    loginCode?: string | string[];
  }>();

  const [error, setError] = useState("");

  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) {
      return;
    }

    const code = Array.isArray(loginCode) ? loginCode[0] : loginCode;

    if (!code) {
      setError("Google Sign-In callback is missing the login code.");
      return;
    }

    handledRef.current = true;

    const completeGoogleLogin = async () => {
      try {
        setError("");

        console.log("GOOGLE CALLBACK LOGIN CODE:", code);

        await new Promise((resolve) => setTimeout(resolve, 300));

        const maxAttempts = 20;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const response = await fetch(
            `${API_BASE_URL}/api/auth/google/status`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                loginCode: code,
              }),
            },
          );

          const data = await response.json();

          console.log("GOOGLE STATUS:", response.status, data);

          if (response.ok && data.success && data.token) {
            await AsyncStorage.setItem("aegis_auth_token", data.token);

            if (data.user) {
              await AsyncStorage.setItem(
                "aegis_auth_user",
                JSON.stringify(data.user),
              );
            }

            router.replace("/");

            return;
          }

          if (response.status === 202 || data.status === "pending") {
            await new Promise((resolve) => setTimeout(resolve, 500));

            continue;
          }

          throw new Error(
            data?.error || "Google Sign-In could not be completed.",
          );
        }

        throw new Error("Google Sign-In is taking too long. Please try again.");
      } catch (err: any) {
        console.error("Google OAuth callback error:", err);

        setError(err?.message || "Google Sign-In failed. Please try again.");
      }
    };

    void completeGoogleLogin();
  }, [loginCode, router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Google Sign-In Failed</Text>

        <Text style={styles.error}>{error}</Text>

        <Text style={styles.backText} onPress={() => router.replace("/")}>
          Return to AegisAI
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#ffffff" />

      <Text style={styles.title}>Signing you in…</Text>

      <Text style={styles.subtitle}>
        Please wait while AegisAI completes your Google Sign-In.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    backgroundColor: "#0b0b0f",
  },

  title: {
    marginTop: 20,
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },

  subtitle: {
    marginTop: 10,
    color: "#9999a3",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  error: {
    marginTop: 14,
    color: "#ff7777",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },

  backText: {
    marginTop: 24,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
