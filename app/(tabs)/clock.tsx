import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import * as Location from "expo-location";
import { statusLabel } from "@hericilla/types";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { colors, text } from "../../lib/theme";
import { fmtTime, todayStr, useOnFocus } from "../../lib/data";
import { enqueue, uuid, type QueuePayloads } from "../../lib/queue";
import { BigButton, Card, Field, Input, Modal, Notice, OptionRow, Screen, Title } from "../../lib/ui";

interface EventRow {
  id: string;
  event_type: string;
  event_time: string;
  work_order_id: string | null;
}
interface OpenJob {
  id: string;
  ref_no: string;
  work_order_id: string;
  status: string;
}
type ClockType = QueuePayloads["attendance"]["type"];

const KINDS = ["missed_clock_in", "missed_clock_out", "wrong_time", "other"] as const;

/** Best-effort GPS — never blocks a clock event. */
async function readGps(): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return { lat: null, lng: null };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return { lat: null, lng: null };
  }
}

export default function ClockScreen() {
  const { profile } = useAuth();
  const uid = profile?.id ?? "";
  const [events, setEvents] = useState<EventRow[]>([]);
  const [openJobs, setOpenJobs] = useState<OpenJob[]>([]);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [activeJob, setActiveJob] = useState<OpenJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [fixKind, setFixKind] = useState<(typeof KINDS)[number] | null>(null);
  const [fixEventType, setFixEventType] = useState<"clock_in" | "clock_out">("clock_in");
  const [fixDate, setFixDate] = useState(todayStr());
  const [fixTime, setFixTime] = useState("08:00");
  const [fixReason, setFixReason] = useState("");
  const [fixSent, setFixSent] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const sb = getSupabase();
    const dayStart = new Date(`${todayStr()}T00:00:00`).toISOString();
    const [{ data: ev }, { data: jobs }] = await Promise.all([
      sb
        .from("attendance_events")
        .select("id, event_type, event_time, work_order_id")
        .eq("employee_id", uid)
        .gte("event_time", dayStart)
        .order("event_time", { ascending: false })
        .limit(20),
      sb
        .from("transport_jobs")
        .select("id, ref_no, work_order_id, status")
        .eq("driver_id", uid)
        .in("status", ["assigned", "accepted", "arrived", "loaded", "in_transit"])
        .order("scheduled_at", { ascending: true }),
    ]);
    setEvents((ev as EventRow[]) ?? []);
    setOpenJobs((jobs as OpenJob[]) ?? []);
  }, [uid]);

  useOnFocus(() => void load(), [uid]);

  const lastEvent = events[0] ?? null;
  const isOn = lastEvent?.event_type === "clock_in" || lastEvent?.event_type === "break_start";

  const sendClock = async (type: ClockType) => {
    setBusy(true);
    setGpsNote(null);
    const gps = await readGps();
    if (gps.lat === null) setGpsNote("Location could not be read. Your clock-in was still recorded (marked 'unchecked').");
    enqueue(
      "attendance",
      {
        type,
        work_order_id: activeJob?.work_order_id ?? null,
        gps_lat: gps.lat,
        gps_lng: gps.lng,
        event_id: uuid(),
        original_time: new Date().toISOString(),
      },
      uuid(),
    );
    setBusy(false);
    void load();
  };

  const sendCorrection = () => {
    if (!fixKind || fixReason.trim().length < 5 || !/^\d{2}:\d{2}$/.test(fixTime)) return;
    enqueue(
      "correction",
      {
        employee_id: uid,
        work_date: fixDate,
        kind: fixKind,
        requested_event_type: fixEventType,
        requested_time: new Date(`${fixDate}T${fixTime}:00`).toISOString(),
        reason: fixReason.trim(),
      },
      uuid(),
    );
    setFixSent(true);
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Title title="Clock In / Out" purpose="Press the big button when you start work, take a break, or finish. The app adds the time for you." />

      <Notice tone="info">
        GPS: your location is captured only at clock events, to confirm you are at the right place. If GPS fails, the clock event is still recorded.
      </Notice>

      <Card style={{ gap: 10 }}>
        <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Clocking against</Text>
        <Text style={{ fontSize: text.body, color: colors.gray700 }}>
          {activeJob ? `${activeJob.ref_no} — ${statusLabel(activeJob.status)}` : "General duty (no specific job)"}
        </Text>
        <BigButton
          label={openJobs.length === 0 ? "No open jobs today" : "Change job"}
          variant="secondary"
          small
          disabled={openJobs.length === 0}
          onPress={() => setJobPickerOpen(true)}
        />
      </Card>

      {gpsNote ? <Notice tone="warning">{gpsNote}</Notice> : null}

      {lastEvent?.event_type === "clock_in" ? (
        <>
          <BigButton label="Clock Out" variant="danger" busy={busy} onPress={() => void sendClock("clock_out")} />
          <BigButton label="Start Break" variant="secondary" busy={busy} onPress={() => void sendClock("break_start")} />
        </>
      ) : lastEvent?.event_type === "break_start" ? (
        <>
          <BigButton label="End Break" variant="primary" busy={busy} onPress={() => void sendClock("break_end")} />
          <BigButton label="Clock Out" variant="danger" busy={busy} onPress={() => void sendClock("clock_out")} />
        </>
      ) : (
        <BigButton label="Clock In" variant="success" busy={busy} onPress={() => void sendClock("clock_in")} />
      )}

      {isOn ? null : (
        <Text style={{ fontSize: text.xs, color: colors.gray500, textAlign: "center" }}>
          You are not clocked in right now. Press “Clock In” to start.
        </Text>
      )}

      <Card style={{ gap: 10 }}>
        <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Today's events</Text>
        {events.length === 0 ? (
          <Text style={{ fontSize: text.xs, color: colors.gray700, lineHeight: text.xs * 1.6 }}>
            Nothing recorded yet today. Your clock buttons above will list every press here.
          </Text>
        ) : (
          events.map((e) => (
            <View key={e.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <Text style={{ flex: 1, fontSize: text.sm, color: colors.gray900 }}>{statusLabel(e.event_type)}</Text>
              <Text style={{ fontSize: text.sm, fontWeight: "700", color: colors.brand800 }}>{fmtTime(e.event_time)}</Text>
            </View>
          ))
        )}
        <BigButton label="I forgot to clock — request a correction" variant="secondary" small onPress={() => { setFixOpen(true); setFixSent(false); }} />
      </Card>

      <Modal open={jobPickerOpen} title="Which job are you working on?" onClose={() => setJobPickerOpen(false)}>
        <View style={{ gap: 8 }}>
          <OptionRow
            label="General duty (no specific job)"
            selected={activeJob === null}
            onPress={() => { setActiveJob(null); setJobPickerOpen(false); }}
          />
          {openJobs.map((j) => (
            <OptionRow
              key={j.id}
              label={`${j.ref_no} — ${statusLabel(j.status)}`}
              selected={activeJob?.id === j.id}
              onPress={() => { setActiveJob(j); setJobPickerOpen(false); }}
            />
          ))}
          <Text style={{ fontSize: text.xs, color: colors.gray700 }}>You can only clock in to one job at a time — the office prevents overlaps.</Text>
        </View>
      </Modal>

      <Modal open={fixOpen} title="Request a correction" onClose={() => setFixOpen(false)}>
        <View style={{ gap: 12 }}>
          {fixSent ? (
            <>
              <Notice tone="success">Your supervisor has been asked to fix this. It will appear on your timesheet once approved.</Notice>
              <BigButton label="Done" variant="secondary" onPress={() => setFixOpen(false)} />
            </>
          ) : (
            <>
              <Field label="What went wrong?">
                <View style={{ gap: 8 }}>
                  {KINDS.map((k) => (
                    <OptionRow key={k} label={statusLabel(k)} selected={fixKind === k} onPress={() => setFixKind(k)} />
                  ))}
                </View>
              </Field>
              <Field label="Which event?">
                <View style={{ gap: 8 }}>
                  <OptionRow label="Clock In" selected={fixEventType === "clock_in"} onPress={() => setFixEventType("clock_in")} />
                  <OptionRow label="Clock Out" selected={fixEventType === "clock_out"} onPress={() => setFixEventType("clock_out")} />
                </View>
              </Field>
              <Input label="Date (YYYY-MM-DD)" value={fixDate} onChangeText={setFixDate} autoCapitalize="none" placeholder={todayStr()} />
              <Input label="Time (24-hour, HH:MM)" value={fixTime} onChangeText={setFixTime} keyboardType="numbers-and-punctuation" autoCapitalize="none" placeholder="08:00" />
              <Input label="Reason (required)" multiline value={fixReason} onChangeText={setFixReason} placeholder="e.g. Phone battery died at gate, entered manually later" />
              <BigButton
                label="Send correction request"
                onPress={sendCorrection}
                disabled={!fixKind || fixReason.trim().length < 5 || !/^\d{1,2}:\d{2}$/.test(fixTime)}
              />
            </>
          )}
        </View>
      </Modal>
    </Screen>
  );
}
