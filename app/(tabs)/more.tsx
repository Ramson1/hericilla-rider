import React, { useCallback, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { statusLabel } from "@hericilla/types";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { colors, text } from "../../lib/theme";
import { fmtDateTimeLocal, useOnFocus } from "../../lib/data";
import { pendingCount } from "../../lib/queue";
import { BigButton, Card, EmptyState, Notice, RowCard, Screen, Title } from "../../lib/ui";

interface ExpenseRow {
  id: string;
  expense_type: string;
  amount: string | number;
  occurred_at: string;
  status: string;
}

const OPERATIONS_PHONE = "+2348034036596";

export default function MoreScreen() {
  const { profile, signOut } = useAuth();
  const uid = profile?.id ?? "";
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await getSupabase()
      .from("hericilla_trip_expenses")
      .select("id, expense_type, amount, occurred_at, status")
      .eq("submitted_by", uid)
      .order("created_at", { ascending: false })
      .limit(10);
    setExpenses((data as ExpenseRow[]) ?? []);
  }, [uid]);

  useOnFocus(() => void load(), [uid]);

  const licExpiry = profile?.license_expiry ? new Date(profile.license_expiry) : null;
  const licSoon = licExpiry && licExpiry.getTime() - Date.now() < 60 * 24 * 3600 * 1000;

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Title title="More" purpose="Everything else you may need: vehicle desk, your expenses, help and signing out." />

      <Card style={{ gap: 8 }}>
        <Text style={{ fontSize: text.lg, fontWeight: "800", color: colors.gray900 }}>{profile?.full_name ?? "Driver"}</Text>
        <Text style={{ fontSize: text.xs, color: colors.gray700 }}>
          {profile?.email ?? ""}
          {profile?.license_number ? `\nLicence: ${profile.license_number}` : ""}
          {profile?.license_expiry ? `\nLicence expires: ${profile.license_expiry}` : ""}
        </Text>
        {licSoon ? <Notice tone="warning">Your driving licence expires soon. Tell HR so it can be renewed.</Notice> : null}
      </Card>

      <BigButton label="Vehicle Desk — inspections, odometer, gate log, faults" onPress={() => router.push("/vehicle")} />

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: text.lg, fontWeight: "800", color: colors.brand900 }}>My last expenses</Text>
        {expenses.length === 0 ? (
          <EmptyState title="No expenses yet" hint="Fuel and toll money you record on the Vehicle Desk will be listed here." />
        ) : (
          expenses.map((e) => (
            <RowCard
              key={e.id}
              title={`${statusLabel(e.expense_type)} — ₦${Number(e.amount).toLocaleString("en-NG")}`}
              subtitle={`Date: ${e.occurred_at}`}
              status={e.status}
              tone={e.status === "approved" ? "success" : e.status === "rejected" ? "danger" : "warning"}
            />
          ))
        )}
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Sync status</Text>
        <Text style={{ fontSize: text.xs, color: colors.gray700, lineHeight: text.xs * 1.6 }}>
          {pendingCount() === 0
            ? "Everything you recorded has reached the office."
            : `${pendingCount()} item(s) waiting to send. Keep the app open — they send automatically when the network returns.`}
        </Text>
      </Card>

      <BigButton label="Help — how do I use this app?" variant="secondary" onPress={() => setHelpOpen(true)} />

      {helpOpen ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Quick guide</Text>
          <Text style={{ fontSize: text.xs, color: colors.gray700, lineHeight: text.xs * 1.7 }}>
            1. Open a job from Home or My Jobs and press each stage button as you work.{"\n"}
            2. Press Clock In when you start, Clock Out when you finish.{"\n"}
            3. At the destination, take photos, type the receiver's name and sign on the POD screen.{"\n"}
            4. Use the Vehicle Desk for inspections, odometer and fuel receipts.{"\n"}
            5. Stuck? Press and hold “Call Operations” on the Home screen.
          </Text>
          <Text style={{ fontSize: text.xs, color: colors.gray500, lineHeight: text.xs * 1.6 }}>
            GPS privacy: the app only records your position when you press a clock button, to prove you were at the right place. It does not track you between those moments.
          </Text>
          <BigButton label="Call Operations now" variant="success" small onPress={() => void Linking.openURL(`tel:${OPERATIONS_PHONE}`)} />
          <BigButton label="Close help" variant="ghost" small onPress={() => setHelpOpen(false)} />
        </Card>
      ) : null}

      <BigButton label="Sign out" variant="danger" onPress={() => void signOut()} />

      <Text style={{ fontSize: text.xs, color: colors.gray500, textAlign: "center" }}>
        Signed in as {profile?.full_name ?? "…"} · Last sync check {fmtDateTimeLocal(new Date().toISOString())}
      </Text>
    </Screen>
  );
}
