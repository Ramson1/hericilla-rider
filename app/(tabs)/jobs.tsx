import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { colors, text } from "../../lib/theme";
import { fmtDateTimeLocal, useOnFocus } from "../../lib/data";
import { BigButton, EmptyState, RowCard, Screen, Title, statusToneFor } from "../../lib/ui";

const ACTIVE = ["assigned", "accepted", "arrived", "loaded", "in_transit"];

interface JobRow {
  id: string;
  ref_no: string;
  pickup_location: string;
  destination: string;
  scheduled_at: string | null;
  status: string;
}

export default function JobsScreen() {
  const { profile } = useAuth();
  const uid = profile?.id ?? "";
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await getSupabase()
      .from("hericilla_transport_jobs")
      .select("id, ref_no, pickup_location, destination, scheduled_at, status")
      .eq("driver_id", uid)
      .order("created_at", { ascending: false })
      .limit(60);
    setJobs((data as JobRow[]) ?? []);
  }, [uid]);

  useOnFocus(() => void load(), [uid]);

  const active = jobs.filter((j) => ACTIVE.includes(j.status));
  const history = jobs.filter((j) => !ACTIVE.includes(j.status));

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Title title="My Jobs" purpose="Every job the office sends you appears here. Open a job to update its stage." />

      {active.length === 0 ? (
        <EmptyState
          title="No jobs to do right now"
          hint="New jobs arrive here automatically. You do not need to refresh — just keep the app open when you are working."
        />
      ) : (
        active.map((j) => (
          <Pressable key={j.id} accessibilityRole="button" onPress={() => router.push(`/job/${j.id}`)}>
            <RowCard
              title={j.ref_no}
              status={j.status}
              tone={statusToneFor(j.status)}
              subtitle={`Pickup: ${j.pickup_location}\nDeliver to: ${j.destination}\n${j.scheduled_at ? `Scheduled: ${fmtDateTimeLocal(j.scheduled_at)}` : "Schedule not set"}`}
            >
              <BigButton label="Open job" onPress={() => router.push(`/job/${j.id}`)} small />
            </RowCard>
          </Pressable>
        ))
      )}

      {history.length > 0 ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <BigButton
            label={showHistory ? "Hide finished jobs" : `Finished jobs (${history.length})`}
            variant="secondary"
            small
            onPress={() => setShowHistory((s) => !s)}
          />
          {showHistory &&
            history.map((j) => (
              <Pressable key={j.id} accessibilityRole="button" onPress={() => router.push(`/job/${j.id}`)}>
                <RowCard title={j.ref_no} status={j.status} tone={statusToneFor(j.status)} subtitle={`${j.pickup_location} → ${j.destination}`} />
              </Pressable>
            ))}
        </View>
      ) : null}

      <Text style={{ fontSize: text.xs, color: colors.gray500, textAlign: "center" }}>
        Jobs update themselves when the office changes something. If a job looks wrong, call the office.
      </Text>
    </Screen>
  );
}
