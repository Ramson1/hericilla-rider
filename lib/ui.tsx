import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import NetInfo from "@react-native-community/netinfo";
import { statusLabel } from "@hericilla/types";
import { colors, radius, text } from "./theme";
import { subscribePending } from "./queue";

/* ---------- Screen shell ---------- */

export function Screen({
  children,
  scroll = true,
  edges = ["left", "right"],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
}) {
  const inner = <View style={{ padding: 16, gap: 14 }}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.brand50 }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

/** Title + plain-English purpose line, like the web PageHeader. */
export function Title({ title, purpose }: { title: string; purpose?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: text.xl, fontWeight: "800", color: colors.brand900 }}>{title}</Text>
      {purpose ? <Text style={{ fontSize: text.sm, lineHeight: text.sm * 1.5, color: colors.gray700 }}>{purpose}</Text> : null}
    </View>
  );
}

/* ---------- Buttons ---------- */

type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "ghost";

const buttonStyles: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.brand600, fg: colors.white },
  secondary: { bg: colors.white, fg: colors.brand700, border: colors.brand300 },
  danger: { bg: colors.danger600, fg: colors.white },
  success: { bg: colors.success600, fg: colors.white },
  ghost: { bg: "transparent", fg: colors.brand700 },
};

export function BigButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  small = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const s = buttonStyles[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: s.bg,
          borderColor: s.border ?? "transparent",
          borderWidth: s.border ? 2 : 0,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          minHeight: small ? 52 : 64,
          paddingVertical: small ? 10 : 16,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={s.fg} />
      ) : (
        <Text style={{ fontSize: small ? text.sm : text.lg, fontWeight: "800", color: s.fg, textAlign: "center" }}>{label}</Text>
      )}
    </Pressable>
  );
}

/* ---------- Cards ---------- */

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Card with a bold title line, an optional subtitle and status chip. */
export function RowCard({
  title,
  subtitle,
  status,
  tone = "info",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  status?: string;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <Text style={{ flex: 1, fontSize: text.lg, fontWeight: "800", color: colors.gray900 }}>{title}</Text>
        {status ? <StatusChip status={status} tone={tone} /> : null}
      </View>
      {subtitle ? <View style={{ marginTop: 6 }}>{typeof subtitle === "string" ? <Text style={{ fontSize: text.sm, color: colors.gray700, lineHeight: text.sm * 1.5 }}>{subtitle}</Text> : subtitle}</View> : null}
      {children ? <View style={{ marginTop: 12, gap: 10 }}>{children}</View> : null}
    </Card>
  );
}

const chipTones = {
  brand: { bg: colors.brand100, fg: colors.brand800 },
  success: { bg: colors.success100, fg: colors.success800 },
  warning: { bg: colors.warning100, fg: colors.warning800 },
  danger: { bg: colors.danger100, fg: colors.danger800 },
  info: { bg: colors.info100, fg: colors.info800 },
} as const;

export function StatusChip({ status, tone = "info" }: { status: string; tone?: keyof typeof chipTones }) {
  const c = chipTones[tone];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7, alignSelf: "flex-start" }}>
      <Text style={{ fontSize: text.xs, fontWeight: "800", color: c.fg }}>{statusLabel(status)}</Text>
    </View>
  );
}

/* ---------- Forms ---------- */

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: text.sm, fontWeight: "700", color: colors.gray900 }}>{label}</Text>
      {children}
    </View>
  );
}

export function Input({ label, error, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  const input = (
    <TextInput
      {...props}
      style={[
        styles.input,
        { borderColor: error ? colors.danger600 : colors.gray200 },
        props.multiline ? { minHeight: 110, textAlignVertical: "top" } : null,
      ]}
      placeholderTextColor={colors.gray500}
    />
  );
  if (!label) return input;
  return (
    <Field label={label}>
      {input}
      {error ? <Text style={{ fontSize: text.xs, color: colors.danger600, fontWeight: "700" }}>{error}</Text> : null}
    </Field>
  );
}

/** Big tap-to-pick option row (used instead of tiny dropdowns on driver screens). */
export function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.input,
        {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: selected ? colors.brand100 : pressed ? colors.gray100 : colors.white,
          borderColor: selected ? colors.brand500 : colors.gray200,
          borderWidth: selected ? 2.5 : 1.5,
        },
      ]}
    >
      <Text style={{ flex: 1, fontSize: text.sm, color: colors.gray900, fontWeight: selected ? "800" : "500" }}>{label}</Text>
      {selected ? <Text style={{ fontSize: text.lg, color: colors.brand700, fontWeight: "900" }}>✓</Text> : <Text style={{ fontSize: text.lg, color: colors.gray500 }}>›</Text>}
    </Pressable>
  );
}

/* ---------- Feedback ---------- */

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <Card style={{ paddingVertical: 28, alignItems: "center" }}>
      <Text style={{ fontSize: text.lg, fontWeight: "800", color: colors.brand900, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontSize: text.sm, color: colors.gray700, textAlign: "center", marginTop: 8, lineHeight: text.sm * 1.6 }}>{hint}</Text>
    </Card>
  );
}

export function Notice({ tone, children }: { tone: "success" | "warning" | "danger" | "info"; children: React.ReactNode }) {
  const c = chipTones[tone];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.card, padding: 14 }}>
      <Text style={{ fontSize: text.sm, color: c.fg, fontWeight: "600", lineHeight: text.sm * 1.5 }}>{children}</Text>
    </View>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <RNModal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(8,32,48,0.5)", justifyContent: "flex-end" }}>
        <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: "85%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: text.xl, fontWeight: "800", color: colors.gray900 }}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12} style={{ padding: 8 }}>
              <Text style={{ fontSize: text.xl, fontWeight: "900", color: colors.gray500 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </SafeAreaView>
      </View>
    </RNModal>
  );
}

/* ---------- Connectivity & sync indicators ---------- */

export function statusToneFor(status: string): keyof typeof chipTones {
  switch (status) {
    case "assigned":
    case "accepted":
      return "info";
    case "arrived":
    case "loaded":
    case "in_transit":
      return "warning";
    case "delivered":
    case "verified":
    case "closed":
    case "completed":
      return "success";
    case "rejected":
    case "cancelled":
      return "danger";
    default:
      return "brand";
  }
}

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(Boolean(s.isConnected))), []);
  if (online) return null;
  return (
    <View style={{ backgroundColor: colors.warning600, paddingVertical: 10, paddingHorizontal: 16 }}>
      <Text style={{ color: colors.white, fontSize: text.sm, fontWeight: "800", textAlign: "center" }}>
        You are offline. Keep working — everything will send when the network returns.
      </Text>
    </View>
  );
}

export function SyncBadge() {
  const [pending, setPending] = useState(0);
  useEffect(() => subscribePending(setPending), []);
  if (pending === 0) return null;
  return (
    <View style={{ backgroundColor: colors.warning100, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={{ color: colors.warning800, fontSize: text.xs, fontWeight: "800" }}>Waiting to sync {pending}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.brand950,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderRadius: radius.button,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: text.sm,
    color: colors.gray900,
    minHeight: 56,
  },
});
