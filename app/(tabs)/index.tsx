import React, { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { statusLabel } from "@hericilla/types";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { colors, radius, text } from "../../lib/theme";
import { fmtDateTimeLocal, useOnFocus } from "../../lib/data";
import { BigButton, Card, EmptyState, RowCard, Screen, StatusChip, Title, statusToneFor } from "../../lib/ui";

const OPERATIONS_PHONE = "+2348034036596";
const OPEN_STATUSES = ["assigned", "accepted", "arrived", "loaded", "in_transit"];

interface JobRow {
  id: string;
  ref_no: string;
  pickup_location: string;
  destination: string;
  scheduled_at: string | null;
  status: string;
}
interface AllocationRow {
  id: string;
  valid_from: string;
  valid_to: string | null;
  vehicles: { reg_no: string; vehicle_type: string } | null;
}
interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export default function HomeScreen() {
  const { profile } = useAuth();
  const uid = profile?.id ?? "";
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [vehicle, setVehicle] = useState<AllocationRow | null>(null);
  const [news, setNews] = useState<AnnouncementRow[]>([]);
  const [callPressed, setCallPressed] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const sb = getSupabase();
    const [{ data: jobData }, { data: allocData }, { data: newsData }] = await Promise.all([
      sb
        .from("hericilla_transport_jobs")
        .select("id, ref_no, pickup_location, destination, scheduled_at, status")
        .eq("driver_id", uid)
        .in("status", OPEN_STATUSES)
        .order("scheduled_at", { ascending: true }),
      sb
        .from("hericilla_vehicle_allocations")
        .select("id, valid_from, valid_to, vehicles:hericilla_vehicles(reg_no, vehicle_type)")
        .eq("driver_id", uid)
        .is("released_at", null)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb
        .from("hericilla_announcements")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    setJobs((jobData as JobRow[]) ?? []);
    setVehicle((allocData as unknown as AllocationRow) ?? null);
    setNews((newsData as AnnouncementRow[]) ?? []);
  }, [uid]);

  useOnFocus(() => void load(), [uid]);

  const today = new Date().toISOString().slice(0, 10);
  const todays = jobs.filter((j) => !j.scheduled_at || j.scheduled_at.slice(0, 10) === today);
  const firstName = profile?.full_name?.split(" ")[0] ?? "Driver";

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Title title={`Good day, ${firstName}`} purpose="This screen shows your trips for today and the vehicle assigned to you." />

      <Card style={{ gap: 10 }}>
        <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>My vehicle</Text>
        {vehicle?.vehicles ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: text.xl, fontWeight: "900", color: colors.brand800 }}>{vehicle.vehicles.reg_no}</Text>
              <Text style={{ fontSize: text.xs, color: colors.gray700 }}>{statusLabel(vehicle.vehicles.vehicle_type)}</Text>
            </View>
            <BigButton label="Vehicle Desk" variant="secondary" small onPress={() => router.push("/vehicle")} />
          </View>
        ) : (
          <Text style={{ fontSize: text.sm, color: colors.gray700, lineHeight: text.sm * 1.6 }}>
            No vehicle is assigned to you right now. When the office assigns one, its number plate will appear here.
          </Text>
        )}
      </Card>

      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: text.lg, fontWeight: "800", color: colors.brand900 }}>
          {todays.length > 0 ? `Today's trips (${todays.length})` : "Today's trips"}
        </Text>
        {todays.length === 0 ? (
          <EmptyState
            title="No jobs for today"
            hint="When the office sends you a job, it will appear here with a blue button. Check the My Jobs tab for ongoing trips."
          />
        ) : (
          todays.map((j) => (
            <Pressable key={j.id} accessibilityRole="button" onPress={() => router.push(`/job/${j.id}`)}>
              <RowCard
                title={j.ref_no}
                status={j.status}
                tone={statusToneFor(j.status)}
                subtitle={`${j.pickup_location} → ${j.destination}\n${j.scheduled_at ? `Scheduled: ${fmtDateTimeLocal(j.scheduled_at)}` : "Time not set — call the office if unsure"}`}
              >
                <BigButton label="Open this job" onPress={() => router.push(`/job/${j.id}`)} small />
              </RowCard>
            </Pressable>
          ))
        )}
      </View>

      {news.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: text.lg, fontWeight: "800", color: colors.brand900 }}>Messages from the office</Text>
          {news.map((n) => (
            <Card key={n.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <Text style={{ flex: 1, fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>{n.title}</Text>
                <StatusChip status="news" tone="brand" />
              </View>
              <Text style={{ fontSize: text.xs, color: colors.gray700, lineHeight: text.xs * 1.6 }}>{n.body}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Need help?</Text>
        <Text style={{ fontSize: text.xs, color: colors.gray700, lineHeight: text.xs * 1.6 }}>
          Press and hold the big button — it calls the Operations office directly.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Press and hold to call Operations"
          onPressIn={() => setCallPressed(true)}
          onPressOut={() => setCallPressed(false)}
          onLongPress={() => void Linking.openURL(`tel:${OPERATIONS_PHONE}`)}
          style={({ pressed }) => [styles.holdButton, { backgroundColor: pressed ? colors.danger800 : colors.danger600 }]}
        >
          <Text style={{ color: colors.white, fontSize: text.lg, fontWeight: "900", textAlign: "center" }}>
            {callPressed ? "Keep holding…" : "Press and hold — Call Operations"}
          </Text>
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  holdButton: {
    borderRadius: radius.button,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
});
