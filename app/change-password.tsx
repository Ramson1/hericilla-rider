import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { invokeAuthFunction, AuthFunctionError } from "@hericilla/supabase-clients";
import { useAuth } from "../lib/auth";
import { colors, text } from "../lib/theme";
import { BigButton, Notice, Input } from "../lib/ui";

/** Forced password change on first sign-in (freshly-created accounts). */
export default function ChangePasswordScreen() {
  const { profile, signIn } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (next.length < 8) {
      setError("Choose a new password of at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await invokeAuthFunction("auth-change-password", { current, new: next });
      // Re-login to mint a fresh token reflecting must_reset = false.
      if (profile?.email) await signIn(profile.email, next);
    } catch (err) {
      setError(err instanceof AuthFunctionError ? err.message : "Could not change your password. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} style={{ flex: 1, backgroundColor: colors.brand900 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 18 }}>
          <View style={{ gap: 6, marginBottom: 8 }}>
            <Text style={{ color: colors.white, fontSize: text.xxl, fontWeight: "900" }}>Set your password</Text>
            <Text style={{ color: colors.brand300, fontSize: text.sm }}>
              Choose a new password to replace the temporary one.
            </Text>
          </View>

          <Input label="Current (temporary) password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
          <Input label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
          <Input label="Repeat new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" />

          {error ? <Notice tone="danger">{error}</Notice> : null}

          <BigButton label="Save password" onPress={() => void submit()} busy={busy} variant="primary" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
