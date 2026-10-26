import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors, text } from "../lib/theme";
import { BigButton, Notice, Input } from "../lib/ui";

export default function LoginScreen() {
  const { signIn, requestReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const doSignIn = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    const err = await signIn(email, password);
    setBusy(false);
    setError(err);
  };

  const doReset = async () => {
    setError(null);
    setResetSent(false);
    if (!email.trim()) {
      setError("Type your email first, then press 'Forgot password'.");
      return;
    }
    setBusy(true);
    const err = await requestReset(email);
    setBusy(false);
    if (err) setError(err);
    else setResetSent(true);
  };

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: colors.brand900 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 18 }}>
          <View style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
            <View
              style={{
                width: 138,
                height: 138,
                borderRadius: 34,
                backgroundColor: colors.white,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image source={require("../assets/logo.png")} style={{ width: 110, height: 110 }} resizeMode="contain" />
            </View>
            <Text style={{ color: colors.white, fontSize: text.xxl, fontWeight: "900" }}>Hericilla Drivers</Text>
            <Text style={{ color: colors.brand300, fontSize: text.sm, textAlign: "center" }}>
              Sign in with the email and password the office gave you.
            </Text>
          </View>

          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="driver@example.com" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Your password" />

          {error ? <Notice tone="danger">{error}</Notice> : null}
          {resetSent ? <Notice tone="success">A password-reset email is on its way. Check your inbox.</Notice> : null}

          <BigButton label="Sign in" onPress={() => void doSignIn()} busy={busy} variant="primary" />
          <BigButton label="Forgot password" onPress={() => void doReset()} busy={busy} variant="secondary" />

          <Text style={{ color: colors.brand300, fontSize: text.xs, textAlign: "center", marginTop: 8 }}>
            Your GPS location is only captured when you clock in, and only used to confirm you are at the right place.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
