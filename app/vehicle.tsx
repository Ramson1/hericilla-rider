import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { EXPENSE_TYPES, INCIDENT_SEVERITIES, INCIDENT_TYPES, MOVEMENT_TYPES, statusLabel } from "@hericilla/types";
import { getSupabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { colors, text } from "../lib/theme";
import { money, todayStr, useOnFocus } from "../lib/data";
import { enqueue, uuid } from "../lib/queue";
import { BigButton, Card, Field, Input, Notice, OptionRow, Screen, Title } from "../lib/ui";

interface Allocation {
  id: string;
  vehicles: { id: string; reg_no: string; odometer_km: string | number } | null;
}
interface Checklist {
  id: string;
  name: string;
  trip_phase: string;
  items: string[];
}

type Section = "inspection" | "odometer" | "movement" | "incident" | "expense" | null;

export default function VehicleScreen() {
  const { profile } = useAuth();
  const uid = profile?.id ?? "";
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [section, setSection] = useState<Section>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    const sb = getSupabase();
    const [{ data: alloc }, { data: lists }] = await Promise.all([
      sb
        .from("hericilla_vehicle_allocations")
        .select("id, vehicles:hericilla_vehicles(id, reg_no, odometer_km)")
        .eq("driver_id", uid)
        .is("released_at", null)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from("hericilla_inspection_checklists").select("id, name, trip_phase, items").eq("is_active", true).order("name"),
    ]);
    setAllocation((alloc as unknown as Allocation) ?? null);
    setChecklists((lists as unknown as Checklist[]) ?? []);
  }, [uid]);

  useOnFocus(() => void load(), [uid]);

  const vehicle = allocation?.vehicles ?? null;
  const toggle = (s: Exclude<Section, null>) => setSection((cur) => (cur === s ? null : s));

  return (
    <Screen edges={["left", "right", "bottom"]}>
      <Title title="Vehicle Desk" purpose="Everything about your truck: checks, mileage, gate movements, faults and fuel money." />

      {vehicle ? (
        <Card style={{ gap: 4 }}>
          <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>Your assigned vehicle</Text>
          <Text style={{ fontSize: text.xxl, fontWeight: "900", color: colors.brand800 }}>{vehicle.reg_no}</Text>
          <Text style={{ fontSize: text.xs, color: colors.gray700 }}>Odometer on record: {Number(vehicle.odometer_km || 0).toLocaleString()} km</Text>
        </Card>
      ) : (
        <Notice tone="warning">
          No vehicle is allocated to you right now. Inspections and movements need a vehicle — ask the office to allocate one first.
        </Notice>
      )}

      <BigButton label="Trip inspection" variant={section === "inspection" ? "primary" : "secondary"} onPress={() => toggle("inspection")} />
      {section === "inspection" && vehicle ? <InspectionForm checklists={checklists} vehicleId={vehicle.id} driverId={uid} /> : null}

      <BigButton label="Odometer reading" variant={section === "odometer" ? "primary" : "secondary"} onPress={() => toggle("odometer")} />
      {section === "odometer" && vehicle ? <OdometerForm vehicleId={vehicle.id} driverId={uid} maxHint={Number(vehicle.odometer_km || 0)} /> : null}

      <BigButton label="Gate in / Gate out log" variant={section === "movement" ? "primary" : "secondary"} onPress={() => toggle("movement")} />
      {section === "movement" && vehicle ? <MovementForm vehicleId={vehicle.id} allocationId={allocation?.id ?? null} recordedBy={uid} /> : null}

      <BigButton label="Report a fault or incident" variant={section === "incident" ? "danger" : "secondary"} onPress={() => toggle("incident")} />
      {section === "incident" ? <IncidentForm vehicleId={vehicle?.id ?? null} driverId={uid} /> : null}

      <BigButton label="Record fuel / toll expense" variant={section === "expense" ? "primary" : "secondary"} onPress={() => toggle("expense")} />
      {section === "expense" ? <ExpenseForm vehicleId={vehicle?.id ?? null} /> : null}
    </Screen>
  );
}

/* ---------- Inspection ---------- */

function InspectionForm({ checklists, vehicleId, driverId }: { checklists: Checklist[]; vehicleId: string; driverId: string }) {
  const [list, setList] = useState<Checklist | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [faults, setFaults] = useState("");
  const [done, setDone] = useState(false);

  if (checklists.length === 0) {
    return <Notice tone="info">No inspection checklists have been set up by the office yet.</Notice>;
  }
  if (done) {
    return (
      <Card style={{ gap: 10 }}>
        <Notice tone="success">Inspection saved{list ? ` (${list.name})` : ""}. If you reported faults, the fleet officer has been notified.</Notice>
        <BigButton
          label="Do another inspection"
          variant="secondary"
          small
          onPress={() => {
            setDone(false);
            setList(null);
            setAnswers({});
            setFaults("");
          }}
        />
      </Card>
    );
  }
  if (!list) {
    return (
      <View style={{ gap: 8 }}>
        {checklists.map((c) => (
          <OptionRow
            key={c.id}
            label={`${c.name} (${c.trip_phase === "pre" ? "before the trip" : "after the trip"})`}
            selected={false}
            onPress={() => {
              setList(c);
              setAnswers(Object.fromEntries((c.items ?? []).map((i) => [i, true])));
            }}
          />
        ))}
      </View>
    );
  }
  const anyFault = Object.values(answers).some((v) => !v);
  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ fontSize: text.sm, fontWeight: "800", color: colors.gray900 }}>{list.name}</Text>
      <Text style={{ fontSize: text.xs, color: colors.gray700 }}>Tap an item if it is NOT okay — it turns red and counts as a fault.</Text>
      {(list.items ?? []).map((item) => (
        <PressableToggle key={item} label={item} ok={answers[item] !== false} onToggle={() => setAnswers((a) => ({ ...a, [item]: !(a[item] !== false) }))} />
      ))}
      {anyFault ? <Input label="Describe the faults" multiline value={faults} onChangeText={setFaults} placeholder="e.g. left rear tyre low, brake light not working" /> : null}
      <BigButton
        label="Save inspection"
        disabled={anyFault && faults.trim().length < 5}
        onPress={() => {
          enqueue(
            "inspection",
            {
              checklist_id: list.id,
              vehicle_id: vehicleId,
              driver_id: driverId,
              answers,
              faults_reported: anyFault ? faults.trim() : null,
            },
            uuid(),
          );
          setDone(true);
        }}
      />
    </Card>
  );
}

function PressableToggle({ label, ok, onToggle }: { label: string; ok: boolean; onToggle: () => void }) {
  return (
    <BigButton
      label={`${label} — ${ok ? "OK ✓" : "FAULT ✗"}`}
      variant={ok ? "secondary" : "danger"}
      small
      onPress={onToggle}
    />
  );
}

/* ---------- Odometer ---------- */

function OdometerForm({ vehicleId, driverId, maxHint }: { vehicleId: string; driverId: string; maxHint: number }) {
  const [km, setKm] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <Notice tone="success">Odometer reading saved ({km} km). Thank you!</Notice>;
  }
  return (
    <Card style={{ gap: 10 }}>
      <Input label="Odometer (whole km from the dashboard)" value={km} onChangeText={(t) => setKm(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder={String(maxHint)} />
      {photo ? <Text style={{ fontSize: text.xs, color: colors.brand800 }}>Photo attached ✓ (hold the button below to remove)</Text> : null}
      <BigButton
        label={photo ? "Retake dashboard photo" : "Take dashboard photo (optional)"}
        variant="secondary"
        small
        onPress={async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== "granted") return;
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.4 });
          const uri = res.assets?.[0]?.uri;
          if (uri) setPhoto(uri);
        }}
      />
      {photo ? (
        <BigButton
          label="Remove photo"
          variant="ghost"
          small
          onPress={() => {
            setPhoto(null);
          }}
        />
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <BigButton
        label="Save odometer"
        disabled={!km || Number(km) < 1}
        onPress={() => {
          const v = Number(km);
          if (!Number.isFinite(v) || v <= 0) {
            setError("Enter the kilometres shown on the dashboard.");
            return;
          }
          enqueue("odometer", { vehicle_id: vehicleId, driver_id: driverId, reading_km: v, photo }, uuid());
          setDone(true);
        }}
      />
    </Card>
  );
}

/* ---------- Movement ---------- */

function MovementForm({ vehicleId, allocationId, recordedBy }: { vehicleId: string; allocationId: string | null; recordedBy: string }) {
  const [type, setType] = useState<string | null>(null);
  const [km, setKm] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card style={{ gap: 10 }}>
        <Notice tone="success">Movement logged. The office can now see where your vehicle is.</Notice>
        <BigButton label="Log another movement" variant="secondary" small onPress={() => { setDone(false); setType(null); setKm(""); setNote(""); }} />
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Field label="What happened?">
        <View style={{ gap: 8 }}>
          {MOVEMENT_TYPES.map((t) => (
            <OptionRow key={t} label={movementLabel(t)} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </Field>
      <Input label="Odometer now (optional)" value={km} onChangeText={(t) => setKm(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="leave blank if unknown" />
      <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Gate B, security saw the load" />
      <BigButton
        label="Log movement"
        disabled={!type}
        onPress={() => {
          enqueue(
            "movement",
            {
              vehicle_id: vehicleId,
              allocation_id: allocationId,
              movement_type: type!,
              odometer_km: km ? Number(km) : null,
              location_note: note.trim() || null,
              recorded_by: recordedBy,
              occurred_at: new Date().toISOString(),
            },
            uuid(),
          );
          setDone(true);
        }}
      />
    </Card>
  );
}

function movementLabel(t: string): string {
  switch (t) {
    case "out_gate": return "Vehicle went OUT of the gate";
    case "in_gate": return "Vehicle came IN to the gate";
    case "fuel_stop": return "Fuel stop";
    case "site_stop": return "Stop at a site";
    default: return statusLabel(t);
  }
}

/* ---------- Incident ---------- */

function IncidentForm({ vehicleId, driverId }: { vehicleId: string | null; driverId: string }) {
  const [type, setType] = useState<string | null>(null);
  const [severity, setSeverity] = useState<string>("minor");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card style={{ gap: 10 }}>
        <Notice tone="success">Incident report sent to the fleet officer. If someone is hurt or the road is blocked, call Operations now.</Notice>
        <BigButton label="Report another" variant="secondary" small onPress={() => { setDone(false); setType(null); setDescription(""); setLocation(""); setPhotos([]); }} />
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      {!vehicleId ? <Notice tone="info">No vehicle is allocated to you — the report will be saved without a vehicle.</Notice> : null}
      <Field label="What type of incident?">
        <View style={{ gap: 8 }}>
          {INCIDENT_TYPES.map((t) => (
            <OptionRow key={t} label={incidentTypeLabel(t)} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </Field>
      <Field label="How serious?">
        <View style={{ gap: 8 }}>
          {INCIDENT_SEVERITIES.map((s) => (
            <OptionRow key={s} label={severityLabel(s)} selected={severity === s} onPress={() => setSeverity(s)} />
          ))}
        </View>
      </Field>
      <Input label="What happened? (required)" multiline value={description} onChangeText={setDescription} placeholder="Explain in your own words, e.g. tyre burst at roundabout, no injuries" />
      <Input label="Where?" value={location} onChangeText={setLocation} placeholder="e.g. Aba Road, near Eluwa junction" />
      <BigButton
        label={photos.length > 0 ? `Add photo (${photos.length} added)` : "Add photos (optional)"}
        variant="secondary"
        small
        onPress={async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== "granted") return;
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.4 });
          const uri = res.assets?.[0]?.uri;
          if (uri) setPhotos((p) => [...p, uri]);
        }}
      />
      <BigButton
        label="Send incident report"
        variant="danger"
        disabled={!type || description.trim().length < 10}
        onPress={() => {
          enqueue(
            "incident",
            {
              vehicle_id: vehicleId,
              incident_type: type!,
              severity,
              description: description.trim(),
              location: location.trim() || null,
              occurred_at: new Date().toISOString(),
              reported_by: driverId,
              photos,
            },
            uuid(),
          );
          setDone(true);
        }}
      />
    </Card>
  );
}

function incidentTypeLabel(t: string): string {
  switch (t) {
    case "accident": return "Accident";
    case "breakdown": return "Vehicle breakdown";
    case "near_miss": return "Near miss (almost happened)";
    case "safety": return "Safety issue";
    default: return "Something else";
  }
}
function severityLabel(s: string): string {
  switch (s) {
    case "minor": return "Minor — small, everyone safe";
    case "moderate": return "Moderate — needs attention";
    case "severe": return "Severe — injury or heavy damage";
    default: return s;
  }
}

/* ---------- Expense ---------- */

function ExpenseForm({ vehicleId }: { vehicleId: string | null }) {
  const [type, setType] = useState<string>("fuel");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <Card style={{ gap: 10 }}>
        <Notice tone="success">Expense saved as {money(Number(amount || 0))}. Finance will approve it.</Notice>
        <BigButton label="Record another" variant="secondary" small onPress={() => { setDone(false); setAmount(""); setReceipt(null); }} />
      </Card>
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Field label="What did you spend on?">
        <View style={{ gap: 8 }}>
          {EXPENSE_TYPES.map((t) => (
            <OptionRow key={t} label={statusLabel(t)} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </Field>
      <Input label="Amount (₦)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="e.g. 15000" />
      <Input label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" />
      <BigButton
        label={receipt ? "Receipt photo attached ✓ — retake" : "Take receipt photo"}
        variant="secondary"
        small
        onPress={async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== "granted") return;
          const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.4 });
          const uri = res.assets?.[0]?.uri;
          if (uri) setReceipt(uri);
        }}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <BigButton
        label="Save expense"
        disabled={!amount || !date}
        onPress={() => {
          const v = Number(amount);
          if (!Number.isFinite(v) || v <= 0) {
            setError("Enter the amount in naira, e.g. 15000.");
            return;
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            setError("Date must look like 2026-02-14.");
            return;
          }
          enqueue(
            "expense",
            {
              vehicle_id: vehicleId,
              expense_type: type,
              amount: v,
              occurred_at: date,
              receipts: receipt ? [receipt] : [],
            },
            uuid(),
          );
          setDone(true);
        }}
      />
    </Card>
  );
}
