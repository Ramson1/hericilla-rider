import React, { useCallback, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { colors, text } from "../../lib/theme";
import { fmtDateTimeLocal, useOnFocus } from "../../lib/data";
import { enqueue, uuid } from "../../lib/queue";
import { BigButton, Card, Field, Input, Modal, Notice, OptionRow, RowCard, Screen, StatusChip, Title, statusToneFor } from "../../lib/ui";

interface JobDetail {
  id: string;
  ref_no: string;
  pickup_location: string;
  destination: string;
  delivery_instructions: string | null;
  client_contact_name: string | null;
  client_contact_phone: string | null;
  scheduled_at: string | null;
  status: string;
  work_orders: { id: string; wo_number: string; service_request_id: string | null } | null;
  vehicles: { id: string; reg_no: string; vehicle_type: string } | null;
}

/** Driver-allowed forward moves (server enforces the same order). */
const NEXT_STEP: Record<string, { to: string; label: string } | null> = {
  assigned: { to: "accepted", label: "Accept this job" },
  accepted: { to: "arrived", label: "I have arrived at pickup" },
  arrived: { to: "loaded", label: "Cargo is loaded" },
  loaded: { to: "in_transit", label: "Start the trip (in transit)" },
  in_transit: { to: "delivered", label: "I have delivered (go to POD)" },
  delivered: null,
  verified: null,
  closed: null,
};

const PROBLEM_KINDS = ["Delay", "Breakdown", "Route problem", "Request assistance"];

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [problemKind, setProblemKind] = useState<string | null>(null);
  const [problemNote, setProblemNote] = useState("");
  const [problemSent, setProblemSent] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await getSupabase()
      .from("hericilla_transport_jobs")
      .select("*, work_orders:hericilla_work_orders(id, wo_number, service_request_id), vehicles:hericilla_vehicles(id, reg_no, vehicle_type)")
      .eq("id", id)
      .maybeSingle();
    setJob((data as unknown as JobDetail) ?? null);
    if (!data) setNotFound(true);
  }, [id]);

  useOnFocus(() => void load(), [id]);

  const moveStage = (to: string) => {
    if (!job) return;
    if (to === "delivered") {
      // Delivery always comes with a POD — send the driver straight there.
      router.push(`/pod?job=${job.id}`);
      return;
    }
    enqueue("job_status", { job_id: job.id, to }, uuid());
    void load();
  };

  const sendProblem = () => {
    if (!job || !profile || !problemKind || problemNote.trim().length < 5) return;
    const srId = job.work_orders?.service_request_id;
    if (!srId) {
      setProblemSent(true); // nothing to attach to — still confirm to the driver honestly
      return;
    }
    enqueue(
      "issue",
      {
        service_request_id: srId,
        message: `${problemKind} on ${job.ref_no}: ${problemNote.trim()}`,
        raised_by: `${profile.full_name} (driver)`,
      },
      uuid(),
    );
    setProblemSent(true);
  };

  const openMaps = async (app: "google" | "waze" | "apple") => {
    if (!job) return;
    const q = encodeURIComponent(job.destination);
    const urls = {
      google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
      waze: `https://waze.com/ul?q=${q}`,
      apple: `https://maps.apple.com/?daddr=${q}`,
    };
    setMapsOpen(false);
    try {
      await Linking.openURL(urls[app]);
    } catch {
      // ignore — user chose an app that is not installed
    }
  };

  if (notFound) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Notice tone="danger">This job was not found or has been taken back by the office. Go to My Jobs to pick another one.</Notice>
        <BigButton label="Back to My Jobs" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!job) {
    return (
      <Screen edges={["left", "right", "bottom"]}>
        <Title title="Loading job…" purpose="One moment please." />
      </Screen>
    );
  }

  const next = NEXT_STEP[job.status] ?? null;

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <Title title={job.ref_no} purpose="Follow the steps below as you work. Each button tells the office where you are." />
        <StatusChip status={job.status} tone={statusToneFor(job.status)} />
      </View>

      <Card style={{ gap: 8 }}>
        <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Work order</Text>
        <Text style={{ fontSize: text.body, color: colors.gray700 }}>
          {job.work_orders?.wo_number ?? "—"}
          {job.scheduled_at ? `\nScheduled: ${fmtDateTimeLocal(job.scheduled_at)}` : "\nSchedule not set — call the office if unsure"}
        </Text>
      </Card>

      <RowCard title="Pickup" subtitle={job.pickup_location}>
        <BigButton label="Show route to pickup" variant="secondary" small onPress={() => setMapsOpen(true)} />
      </RowCard>

      <RowCard title="Deliver to" subtitle={job.destination}>
        <BigButton label="Open in Maps" variant="secondary" small onPress={() => setMapsOpen(true)} />
      </RowCard>

      {job.delivery_instructions ? <Notice tone="info">Instructions: {job.delivery_instructions}</Notice> : null}

      {job.client_contact_name || job.client_contact_phone ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>At the destination, contact</Text>
          <Text style={{ fontSize: text.body, color: colors.gray700 }}>{job.client_contact_name ?? "Contact name not given"}</Text>
          {job.client_contact_phone ? (
            <BigButton
              label={`Call ${job.client_contact_phone}`}
              variant="success"
              small
              onPress={() => void Linking.openURL(`tel:${job.client_contact_phone}`)}
            />
          ) : null}
        </Card>
      ) : null}

      {job.vehicles ? (
        <Card style={{ gap: 4 }}>
          <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Your vehicle for this job</Text>
          <Text style={{ fontSize: text.xl, fontWeight: "900", color: colors.brand800 }}>{job.vehicles.reg_no}</Text>
        </Card>
      ) : null}

      {next ? <BigButton label={next.label} onPress={() => moveStage(next.to)} /> : <Notice tone="success">This job is finished. The office will verify it now.</Notice>}

      {job.status === "in_transit" || job.status === "arrived" || job.status === "loaded" ? (
        <BigButton label="Capture delivery proof (POD)" variant="success" onPress={() => router.push(`/pod?job=${job.id}`)} />
      ) : null}

      <BigButton label="Report a problem" variant="danger" onPress={() => { setProblemOpen(true); setProblemSent(false); setProblemKind(null); setProblemNote(""); }} />

      <BigButton label="Back to My Jobs" variant="ghost" onPress={() => router.back()} />

      <Modal open={mapsOpen} title="Open directions in…" onClose={() => setMapsOpen(false)}>
        <View style={{ gap: 10 }}>
          <OptionRow label="Google Maps" selected={false} onPress={() => void openMaps("google")} />
          <OptionRow label="Waze" selected={false} onPress={() => void openMaps("waze")} />
          <OptionRow label="Apple Maps" selected={false} onPress={() => void openMaps("apple")} />
          <Text style={{ fontSize: text.xs, color: colors.gray700 }}>Choose the map app you use every day.</Text>
        </View>
      </Modal>

      <Modal open={problemOpen} title="Report a problem" onClose={() => setProblemOpen(false)}>
        <View style={{ gap: 12 }}>
          {problemSent ? (
            <>
              <Notice tone="success">
                {job.work_orders?.service_request_id
                  ? "Your problem report has been sent to the office. If it is urgent, call Operations too."
                  : "This job has no service request to attach the report to. Please call the Operations office."}
              </Notice>
              <BigButton label="Done" variant="secondary" onPress={() => setProblemOpen(false)} />
            </>
          ) : (
            <>
              <Field label="What is the problem?">
                <View style={{ gap: 8 }}>
                  {PROBLEM_KINDS.map((k) => (
                    <OptionRow key={k} label={k} selected={problemKind === k} onPress={() => setProblemKind(k)} />
                  ))}
                </View>
              </Field>
              <Input label="Explain briefly" multiline value={problemNote} onChangeText={setProblemNote} placeholder="e.g. Road closed at Igboera, expect 1 hour delay" />
              <BigButton
                label="Send problem report"
                onPress={sendProblem}
                disabled={!problemKind || problemNote.trim().length < 5}
              />
            </>
          )}
        </View>
      </Modal>
    </Screen>
  );
}
