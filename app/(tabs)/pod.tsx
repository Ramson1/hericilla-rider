import React, { useCallback, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { POD_OUTCOMES } from "@hericilla/types";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { colors, radius, text } from "../../lib/theme";
import { useOnFocus } from "../../lib/data";
import { enqueue, uuid } from "../../lib/queue";
import { BigButton, Card, Field, Input, Modal, Notice, OptionRow, Screen, Title } from "../../lib/ui";

const OUTCOME_LABELS: Record<string, string> = {
  delivered: "Delivered OK",
  rejected: "Rejected by receiver",
  damaged: "Damaged",
  missing: "Missing",
  partial: "Partly delivered",
};

interface JobOption {
  id: string;
  ref_no: string;
  destination: string;
  status: string;
}

export default function PodScreen() {
  const { job: jobParam } = useLocalSearchParams<{ job?: string }>();
  const { profile } = useAuth();
  const uid = profile?.id ?? "";
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [selected, setSelected] = useState<JobOption | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [outcome, setOutcome] = useState<string>("delivered");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await getSupabase()
      .from("transport_jobs")
      .select("id, ref_no, destination, status")
      .eq("driver_id", uid)
      .in("status", ["arrived", "loaded", "in_transit"])
      .order("scheduled_at", { ascending: true });
    const rows = (data as JobOption[]) ?? [];
    setJobs(rows);
    const fromParam = jobParam ? rows.find((r) => r.id === jobParam) : undefined;
    setSelected((prev) => fromParam ?? prev ?? null);
  }, [uid, jobParam]);

  useOnFocus(() => void load(), [uid, jobParam]);

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      setError("Camera permission is needed to photograph the delivery.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.4, // compressed for weak networks
    });
    const uri = res.assets?.[0]?.uri;
    if (uri) setPhotos((p) => [...p, uri]);
  };

  const canSubmit = Boolean(selected) && recipient.trim().length >= 2 && photos.length > 0;

  const submit = () => {
    if (!selected || !canSubmit) {
      setError("Choose the job, type the receiver's name and add at least one photo.");
      return;
    }
    setError(null);
    enqueue(
      "pod",
      {
        job_id: selected.id,
        recipient_name: recipient.trim(),
        outcome,
        notes: notes.trim() || null,
        delivered_at: new Date().toISOString(),
        photos,
        signature_svg: signatureSvg,
      },
      uuid(),
    );
    setSent(true);
  };

  const resetForm = () => {
    setSent(false);
    setSelected(null);
    setRecipient("");
    setOutcome("delivered");
    setNotes("");
    setPhotos([]);
    setSignatureSvg(null);
    void load();
  };

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Title title="Proof of Delivery" purpose="Take photos of the delivered cargo, get the receiver's name and signature, then send." />

      {sent ? (
        <Card style={{ gap: 12 }}>
          <Notice tone="success">Delivery proof sent! The office will verify it now. You can go back to your jobs.</Notice>
          <BigButton label="Capture another delivery" variant="secondary" onPress={resetForm} />
          <BigButton label="Back to Home" onPress={() => router.replace("/")} />
        </Card>
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Step 1 — Which delivery?</Text>
            <Text style={{ fontSize: text.body, color: colors.gray700 }}>{selected ? `${selected.ref_no} → ${selected.destination}` : "Nothing chosen yet"}</Text>
            <BigButton
              label={jobs.length === 0 ? "No deliveries ready (finish pickup stages first)" : "Choose delivery"}
              variant="secondary"
              small
              disabled={jobs.length === 0}
              onPress={() => setPickerOpen(true)}
            />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Step 2 — Photos of the cargo at the destination</Text>
            <Text style={{ fontSize: text.xs, color: colors.gray700 }}>At least 1 photo. The app shrinks photos so they send fast on weak networks.</Text>
            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ gap: 8 }}>
                {photos.map((uri, i) => (
                  <View key={uri} style={{ marginRight: 8 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${i + 1}`}
                      onLongPress={() => setPhotos((p) => p.filter((x) => x !== uri))}
                      style={{ backgroundColor: colors.brand100, borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 10 }}
                    >
                      <Text style={{ fontSize: text.xs, color: colors.brand800, fontWeight: "700" }}>Photo {i + 1} (hold to remove)</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <BigButton label="+ Add photo from camera" variant="success" small onPress={() => void addPhoto()} />
          </Card>

          <Card style={{ gap: 12 }}>
            <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Step 3 — Who received it?</Text>
            <Input label="Receiver's name" value={recipient} onChangeText={setRecipient} autoCapitalize="words" placeholder="Full name of the person receiving" />
            <Field label="What is the condition of the delivery?">
              <View style={{ gap: 8 }}>
                {POD_OUTCOMES.map((o) => (
                  <OptionRow key={o} label={OUTCOME_LABELS[o] ?? o} selected={outcome === o} onPress={() => setOutcome(o)} />
                ))}
              </View>
            </Field>
            <Input label="Notes (optional)" multiline value={notes} onChangeText={setNotes} placeholder="e.g. 2 drums slightly dented, receiver accepted with remarks" />
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Step 4 — Receiver signs here (optional)</Text>
            <SignaturePad onChange={setSignatureSvg} />
            <Text style={{ fontSize: text.xs, color: colors.gray500 }}>Ask the receiver to draw their signature with a finger. You can skip this if they prefer.</Text>
          </Card>

          {error ? <Notice tone="danger">{error}</Notice> : null}
          <BigButton label="Send delivery proof" onPress={submit} disabled={!canSubmit} />
        </>
      )}

      <Modal open={pickerOpen} title="Choose the delivery" onClose={() => setPickerOpen(false)}>
        <View style={{ gap: 8 }}>
          {jobs.map((j) => (
            <OptionRow key={j.id} label={`${j.ref_no} → ${j.destination}`} selected={selected?.id === j.id} onPress={() => { setSelected(j); setPickerOpen(false); }} />
          ))}
          {jobs.length === 0 ? <Text style={{ fontSize: text.sm, color: colors.gray700 }}>No deliveries are ready yet. Update your job stages first.</Text> : null}
        </View>
      </Modal>
    </Screen>
  );
}

/** Finger-drawn signature captured as an SVG path string. */
function SignaturePad({ onChange }: { onChange: (svgPath: string | null) => void }) {
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef("");

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          current.current = `M ${evt.nativeEvent.locationX.toFixed(1)} ${evt.nativeEvent.locationY.toFixed(1)}`;
        },
        onPanResponderMove: (evt) => {
          current.current += ` L ${evt.nativeEvent.locationX.toFixed(1)} ${evt.nativeEvent.locationY.toFixed(1)}`;
        },
        onPanResponderRelease: () => {
          const next = [...paths, current.current];
          setPaths(next);
          onChange(next.join(" "));
        },
      }),
    [paths, onChange],
  );

  return (
    <View>
      <View {...panResponder.panHandlers} style={{ height: 180, backgroundColor: colors.white, borderRadius: radius.card, borderWidth: 2, borderColor: colors.brand300, overflow: "hidden" }}>
        <Svg style={{ flex: 1 }}>
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={colors.brand900} strokeWidth={3} fill="none" strokeLinecap="round" />
          ))}
          {current.current ? <Path d={current.current} stroke={colors.brand900} strokeWidth={3} fill="none" strokeLinecap="round" /> : null}
        </Svg>
        {paths.length === 0 && !current.current ? (
          <View pointerEvents="none" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: text.sm, color: colors.gray500 }}>Sign here with your finger</Text>
          </View>
        ) : null}
      </View>
      <BigButton
        label="Clear signature"
        variant="ghost"
        small
        onPress={() => {
          setPaths([]);
          current.current = "";
          onChange(null);
        }}
      />
    </View>
  );
}
