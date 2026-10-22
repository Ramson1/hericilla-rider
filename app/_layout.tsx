import React, { useEffect } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { colors, radius, text } from "../lib/theme";
import { startQueueSync } from "../lib/queue";
import { registerForPush, subscribeNotificationDeepLinks } from "../lib/notify";
import { BigButton, Card, Notice, OfflineBanner, SyncBadge, Title } from "../lib/ui";

/** Operations hotline — hold-to-call target (company profile). */
const OPERATIONS_PHONE = "+2348034036596";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

function Shell() {
  const { loading, session, lockedReason } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    const stopSync = startQueueSync();
    const stopLinks = subscribeNotificationDeepLinks();
    return () => {
      stopSync();
      stopLinks();
    };
  }, []);

  useEffect(() => {
    if (session && !lockedReason) void registerForPush();
  }, [session?.user.id, lockedReason]);

  useEffect(() => {
    if (loading) return;
    const onLogin = segments[0] === "login";
    if (!session && !onLogin) router.replace("/login");
    if (session && !lockedReason && onLogin) router.replace("/");
  }, [loading, session, lockedReason, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.brand900, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.white, fontSize: text.xxl, fontWeight: "900" }}>Hericilla</Text>
        <Text style={{ color: colors.brand300, fontSize: text.sm, marginTop: 6 }}>Drivers app</Text>
        <ActivityIndicator color={colors.white} style={{ marginTop: 24 }} />
      </View>
    );
  }

  if (session && lockedReason) return <LockedScreen reason={lockedReason} />;

  const signedIn = Boolean(session) && !lockedReason;
  return (
    <View style={{ flex: 1, backgroundColor: colors.brand50 }}>
      {signedIn ? (
        <SafeAreaView edges={["top"]} style={{ backgroundColor: colors.brand900 }}>
          <View style={styles.headerRow}>
            <Text style={{ color: colors.white, fontSize: text.sm, fontWeight: "800" }}>Hericilla Drivers</Text>
            <SyncBadge />
          </View>
          <OfflineBanner />
        </SafeAreaView>
      ) : null}
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}

function LockedScreen({ reason }: { reason: string }) {
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand50 }} edges={["top", "bottom", "left", "right"]}>
      <View style={{ padding: 20, gap: 16 }}>
        <Title title="This app is for drivers" purpose="Your account cannot be used here." />
        <Notice tone="warning">{reason}</Notice>
        <Card style={{ gap: 12 }}>
          <Text style={{ fontSize: text.sm, color: colors.gray700, lineHeight: text.sm * 1.6 }}>
            If you think this is a mistake, press and hold the button below to call the Operations office.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Press and hold to call Operations"
            onLongPress={() => void Linking.openURL(`tel:${OPERATIONS_PHONE}`)}
            style={({ pressed }) => [styles.holdButton, { backgroundColor: pressed ? colors.brand700 : colors.brand600 }]}
          >
            <Text style={{ color: colors.white, fontSize: text.lg, fontWeight: "900", textAlign: "center" }}>
              Press and hold — Call Operations
            </Text>
          </Pressable>
          <BigButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </Card>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  holdButton: {
    borderRadius: radius.button,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
});
