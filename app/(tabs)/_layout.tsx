import React from "react";
import { Text, View } from "react-native";
import { Tabs } from "expo-router";
import { colors, text } from "../../lib/theme";

/** 5-tab bottom bar per the elderly-first driver spec: Home · Jobs · Clock In · POD · More. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.gray500,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line, height: 72, paddingBottom: 18, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: text.xs, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <TabIcon glyph="🏠" color={color} /> }} />
      <Tabs.Screen name="jobs" options={{ title: "My Jobs", tabBarIcon: ({ color }) => <TabIcon glyph="📦" color={color} /> }} />
      <Tabs.Screen name="clock" options={{ title: "Clock In", tabBarIcon: ({ color }) => <TabIcon glyph="🕐" color={color} /> }} />
      <Tabs.Screen name="pod" options={{ title: "POD", tabBarIcon: ({ color }) => <TabIcon glyph="📷" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 26, color }}>{glyph}</Text>
    </View>
  );
}
