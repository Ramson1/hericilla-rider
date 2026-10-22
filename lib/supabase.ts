import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SQLite from "expo-sqlite";
import { supabaseAnonKey as pkgKey, supabaseUrl as pkgUrl } from "@hericilla/supabase-clients";

/**
 * Supabase client for React Native.
 * - Env vars are read as static literals so Metro inlines EXPO_PUBLIC_* values;
 *   the shared package exports are the fallback.
 * - Session is persisted in a local SQLite key-value table (survives app restarts,
 *   no AsyncStorage dependency).
 */

// Static references — required for Expo's env inlining.
const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const url = envUrl || pkgUrl;
const anonKey = envKey || pkgKey;

const db = SQLite.openDatabaseSync("driver-local.db");
db.execSync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);");

const kvStorage = {
  async getItem(key: string): Promise<string | null> {
    const row = db.getFirstSync<{ value: string }>("SELECT value FROM kv WHERE key = ?;", key);
    return row?.value ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    db.runSync("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;", key, value);
  },
  async removeItem(key: string): Promise<void> {
    db.runSync("DELETE FROM kv WHERE key = ?;", key);
  },
};

export function hasSupabaseEnv(): boolean {
  return Boolean(url && anonKey);
}

let singleton: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!singleton) {
    if (!url || !anonKey) {
      throw new Error(
        "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/driver-app/.env.local (see .env.example).",
      );
    }
    singleton = createClient(url, anonKey, {
      auth: {
        storage: kvStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return singleton;
}
