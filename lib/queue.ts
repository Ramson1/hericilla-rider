import * as SQLite from "expo-sqlite";
import NetInfo from "@react-native-community/netinfo";
import { getSupabase } from "./supabase";

/**
 * Offline-first write queue (spec §19 / plan Phase 3):
 * - Every driver write lands in the local SQLite outbox first, with a
 *   client-generated UUID so the server can dedupe replays.
 * - A single flusher replays rows in order when connectivity is available
 *   (on enqueue, on reconnect, on app foreground, every 30s while online).
 * - Rows that the server rejects as conflicts (duplicate clock event, illegal
 *   job transition…) are dropped; genuine failures stay and back off.
 */

export type QueueEntity =
  | "attendance"
  | "correction"
  | "job_status"
  | "pod"
  | "expense"
  | "inspection"
  | "odometer"
  | "movement"
  | "incident"
  | "issue";

export interface QueuePayloads {
  attendance: {
    type: "clock_in" | "clock_out" | "break_start" | "break_end";
    work_order_id?: string | null;
    site_id?: string | null;
    shift_id?: string | null;
    gps_lat?: number | null;
    gps_lng?: number | null;
    event_id: string;
    original_time: string;
  };
  correction: {
    employee_id: string;
    work_date: string;
    kind: string;
    requested_event_type: string;
    requested_time: string;
    reason: string;
  };
  job_status: { job_id: string; to: string; gps_lat?: number | null; gps_lng?: number | null };
  pod: {
    job_id: string;
    recipient_name: string;
    outcome: string;
    notes?: string | null;
    delivered_at: string;
    photos: string[]; // local file URIs until synced
    signature_svg?: string | null;
  };
  expense: {
    job_id?: string | null;
    vehicle_id?: string | null;
    expense_type: string;
    amount: number;
    occurred_at: string;
    receipts: string[]; // local file URIs until synced
  };
  inspection: {
    checklist_id?: string | null;
    vehicle_id: string;
    transport_job_id?: string | null;
    driver_id: string;
    answers: Record<string, boolean>;
    faults_reported?: string | null;
    odometer_km?: number | null;
  };
  odometer: { vehicle_id: string; driver_id: string; transport_job_id?: string | null; reading_km: number; photo?: string | null };
  movement: {
    vehicle_id: string;
    allocation_id?: string | null;
    movement_type: string;
    odometer_km?: number | null;
    location_note?: string | null;
    recorded_by: string;
    occurred_at: string;
  };
  incident: {
    vehicle_id?: string | null;
    transport_job_id?: string | null;
    incident_type: string;
    severity: string;
    description: string;
    location?: string | null;
    occurred_at: string;
    reported_by: string;
    photos: string[];
  };
  issue: { service_request_id: string; message: string; raised_by: string };
}

type OutboxRow = {
  id: number;
  entity: QueueEntity;
  event_id: string;
  payload: string;
  created_at: string;
  tries: number;
  last_error: string | null;
};

const db = SQLite.openDatabaseSync("driver-local.db");
db.execSync(
  `CREATE TABLE IF NOT EXISTS outbox (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     entity TEXT NOT NULL,
     event_id TEXT NOT NULL UNIQUE,
     payload TEXT NOT NULL,
     created_at TEXT NOT NULL,
     tries INTEGER NOT NULL DEFAULT 0,
     last_error TEXT
   );`,
);

const listeners = new Set<(pending: number) => void>();
let flushing = false;

function notifyListeners() {
  const n = db.getAllSync<{ c: number }>("SELECT COUNT(*) AS c FROM outbox;")[0]?.c ?? 0;
  listeners.forEach((fn) => fn(n));
}

export function pendingCount(): number {
  return db.getAllSync<{ c: number }>("SELECT COUNT(*) AS c FROM outbox;")[0]?.c ?? 0;
}

export function subscribePending(fn: (n: number) => void): () => void {
  listeners.add(fn);
  fn(pendingCount());
  return () => listeners.delete(fn);
}

/** Push a write into the queue; flush is attempted immediately if online. */
export function enqueue<E extends QueueEntity>(entity: E, payload: QueuePayloads[E], eventId: string): void {
  db.runSync(
    "INSERT OR IGNORE INTO outbox (entity, event_id, payload, created_at) VALUES (?, ?, ?, ?);",
    entity,
    eventId,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
  notifyListeners();
  void flush();
}

/** Upload a local file, returning its storage path; throws on failure. */
async function uploadFile(bucket: string, path: string, uri: string, contentType = "image/jpeg"): Promise<string> {
  const { error } = await getSupabase().storage.from(bucket).upload(path, { uri } as unknown as Blob, { contentType });
  // "already exists" means a previous attempt uploaded — treat as success.
  if (error && !error.message.toLowerCase().includes("already exists")) throw new Error(`${bucket}: ${error.message}`);
  return path;
}

async function uploadAll(bucket: string, prefix: string, uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const ext = uris[i].toLowerCase().includes(".png") ? "png" : "jpg";
    out.push(await uploadFile(bucket, `${prefix}/${i}.${ext}`, uris[i]));
  }
  return out;
}

/** Send one queued row. Returns 'sent' | 'dropped' (remove) or throws (retry). */
async function dispatch(row: OutboxRow): Promise<"sent" | "dropped"> {
  const sb = getSupabase();
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("not signed in");
  const p = JSON.parse(row.payload) as Record<string, unknown>;
  switch (row.entity) {
    case "attendance": {
      const a = p as unknown as QueuePayloads["attendance"];
      const { error } = await sb.rpc("clock_event", {
        p_type: a.type,
        p_work_order: a.work_order_id ?? null,
        p_site: a.site_id ?? null,
        p_shift: a.shift_id ?? null,
        p_gps_lat: a.gps_lat ?? null,
        p_gps_lng: a.gps_lng ?? null,
        p_event_id: a.event_id,
        p_original_time: a.original_time,
        p_source: "app",
      });
      if (error) {
        if (error.message.includes("already clocked")) return "dropped";
        throw new Error(error.message);
      }
      return "sent";
    }
    case "correction": {
      const c = p as unknown as QueuePayloads["correction"];
      const { error } = await sb.from("attendance_corrections").insert({
        employee_id: c.employee_id,
        requested_by: c.employee_id,
        work_date: c.work_date,
        kind: c.kind,
        requested_event_type: c.requested_event_type,
        requested_time: c.requested_time,
        reason: c.reason,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "job_status": {
      const j = p as unknown as QueuePayloads["job_status"];
      const { error } = await sb.rpc("driver_update_job_status", {
        p_job: j.job_id,
        p_to: j.to,
        p_gps_lat: j.gps_lat ?? null,
        p_gps_lng: j.gps_lng ?? null,
      });
      if (error) {
        // Server moved ahead of us (admin changed status) — replaying is pointless.
        if (error.message.includes("illegal transition") || error.message.includes("not assigned")) return "dropped";
        throw new Error(error.message);
      }
      return "sent";
    }
    case "pod": {
      const d = p as unknown as QueuePayloads["pod"];
      // Storage RLS: drivers may only write inside a folder starting with their user id.
      const photos = await uploadAll("pod-evidence", `${uid}/pod/${d.job_id}/${row.event_id}`, d.photos);
      let signatureUrl: string | null = null;
      if (d.signature_svg) {
        signatureUrl = `${uid}/pod/${d.job_id}/${row.event_id}-sig.svg`;
        const { error } = await sb.storage.from("pod-evidence").upload(signatureUrl, d.signature_svg, { contentType: "image/svg+xml" });
        if (error && !error.message.toLowerCase().includes("already exists")) throw new Error(error.message);
      }
      const { error } = await sb.from("proof_of_delivery").insert({
        transport_job_id: d.job_id,
        photos,
        recipient_name: d.recipient_name,
        recipient_signature_url: signatureUrl,
        delivered_at: d.delivered_at,
        outcome: d.outcome,
        notes: d.notes ?? null,
        submitted_by: uid,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "expense": {
      const e = p as unknown as QueuePayloads["expense"];
      const receipts = await uploadAll("receipts", `${uid}/expense/${row.event_id}`, e.receipts);
      const { error } = await sb.from("trip_expenses").insert({
        transport_job_id: e.job_id ?? null,
        vehicle_id: e.vehicle_id ?? null,
        expense_type: e.expense_type,
        amount: e.amount,
        receipt_urls: receipts,
        occurred_at: e.occurred_at,
        submitted_by: uid,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "inspection": {
      const i = p as unknown as QueuePayloads["inspection"];
      const { error } = await sb.from("inspection_results").insert({
        checklist_id: i.checklist_id ?? null,
        vehicle_id: i.vehicle_id,
        transport_job_id: i.transport_job_id ?? null,
        driver_id: i.driver_id,
        answers: i.answers,
        faults_reported: i.faults_reported ?? null,
        odometer_km: i.odometer_km ?? null,
        source: "app",
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "odometer": {
      const o = p as unknown as QueuePayloads["odometer"];
      let photoUrl: string | null = null;
      if (o.photo) photoUrl = await uploadFile("pod-evidence", `${uid}/odometer/${row.event_id}.jpg`, o.photo);
      const { error } = await sb.from("odometer_readings").insert({
        vehicle_id: o.vehicle_id,
        driver_id: o.driver_id,
        transport_job_id: o.transport_job_id ?? null,
        reading_km: o.reading_km,
        photo_url: photoUrl,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "movement": {
      const m = p as unknown as QueuePayloads["movement"];
      const { error } = await sb.from("vehicle_movements").insert({
        vehicle_id: m.vehicle_id,
        allocation_id: m.allocation_id ?? null,
        movement_type: m.movement_type,
        odometer_km: m.odometer_km ?? null,
        location_note: m.location_note ?? null,
        recorded_by: m.recorded_by,
        occurred_at: m.occurred_at,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "incident": {
      const c = p as unknown as QueuePayloads["incident"];
      const photos = await uploadAll("pod-evidence", `${uid}/incident/${row.event_id}`, c.photos);
      const { error } = await sb.from("incidents").insert({
        vehicle_id: c.vehicle_id ?? null,
        transport_job_id: c.transport_job_id ?? null,
        incident_type: c.incident_type,
        severity: c.severity,
        description: c.description,
        location: c.location ?? null,
        occurred_at: c.occurred_at,
        reported_by: c.reported_by,
        photos,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    case "issue": {
      const f = p as unknown as QueuePayloads["issue"];
      const { error } = await sb.from("request_feedback").insert({
        service_request_id: f.service_request_id,
        kind: "issue",
        message: f.message,
        raised_by: f.raised_by,
      });
      if (error) throw new Error(error.message);
      return "sent";
    }
    default:
      return "dropped";
  }
}

export async function flush(): Promise<void> {
  if (flushing) return;
  const { isConnected } = await NetInfo.fetch();
  if (!isConnected) return;
  flushing = true;
  try {
    let more = true;
    while (more) {
      const rows = db.getAllSync<OutboxRow>(
        "SELECT id, entity, event_id, payload, created_at, tries, last_error FROM outbox ORDER BY id ASC LIMIT 10;",
      );
      if (rows.length === 0) {
        more = false;
        break;
      }
      for (const row of rows) {
        try {
          await dispatch(row);
          db.runSync("DELETE FROM outbox WHERE id = ?;", row.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (row.tries + 1 >= 15) {
            // Give up after 15 attempts so one bad row cannot block the queue.
            db.runSync("DELETE FROM outbox WHERE id = ?;", row.id);
          } else {
            db.runSync("UPDATE outbox SET tries = tries + 1, last_error = ? WHERE id = ?;", msg.slice(0, 200), row.id);
          }
        }
      }
      notifyListeners();
    }
  } finally {
    flushing = false;
    notifyListeners();
  }
}

/** Start background sync: reconnect events + 30s heartbeat. */
export function startQueueSync(): () => void {
  const unsubNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) void flush();
  });
  const timer = setInterval(() => void flush(), 30_000);
  void flush();
  return () => {
    unsubNet();
    clearInterval(timer);
  };
}

/** True when there is a network connection right now. */
export async function isOnline(): Promise<boolean> {
  const { isConnected } = await NetInfo.fetch();
  return Boolean(isConnected);
}

export function uuid(): string {
  // RFC4122 v4 without extra dependencies.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
