import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Profile } from "@hericilla/types";
import {
  AuthFunctionError,
  clearAuthToken,
  decodeJwtPayload,
  getSupabase as getSharedSupabase,
  invokeAuthFunction,
  restoreAuthToken,
  setAuthToken,
} from "@hericilla/supabase-clients";
import { getSupabase } from "./supabase";

/**
 * Auth context for the driver app — fully custom (no Supabase Auth).
 * Only accounts whose profile role is `driver` may enter; everyone else sees a
 * plain-English lock-out message. The custom JWT is persisted in SQLite via the
 * storage adapter configured in lib/supabase.ts.
 */

interface AuthState {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  /** Non-null when the signed-in account is not allowed here. */
  lockedReason: string | null;
  /** True when a freshly-created account must set its own password first. */
  mustReset: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  requestReset: (email: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [mustReset, setMustReset] = useState(false);

  const applyProfile = (p: Profile | null) => {
    setProfile(p);
    if (!p) {
      setLockedReason(null);
      return;
    }
    if (p.role !== "driver") {
      setLockedReason(`This app is only for drivers. Your account type is "${p.role}". Please use the staff portal instead.`);
    } else if (p.status !== "active") {
      setLockedReason("Your driver account is not active right now. Please call the office to confirm.");
    } else {
      setLockedReason(null);
    }
  };

  const loadProfile = async (sub: string) => {
    const { data, error } = await getSupabase().from("hericilla_profiles").select("*").eq("id", sub).maybeSingle();
    if (error || !data) {
      applyProfile(null);
      setLockedReason("We could not find your account details. Please call the office.");
      return;
    }
    applyProfile(data as Profile);
  };

  const adoptSession = (token: string) => {
    setAuthToken(token);
    getSharedSupabase().realtime.setAuth(token);
    const payload = decodeJwtPayload(token);
    const sub = typeof payload?.sub === "string" ? payload.sub : null;
    setMustReset(payload?.must_reset === true);
    setUserId(sub);
    if (sub) void loadProfile(sub);
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const token = await restoreAuthToken();
      if (!mounted) return;
      if (token) {
        getSharedSupabase().realtime.setAuth(token);
        const payload = decodeJwtPayload(token);
        const sub = typeof payload?.sub === "string" ? payload.sub : null;
        setMustReset(payload?.must_reset === true);
        setUserId(sub);
        if (sub) await loadProfile(sub);
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      userId,
      profile,
      lockedReason,
      mustReset,
      async signIn(email, password) {
        try {
          const res = await invokeAuthFunction<{ token: string; profile: Profile; must_reset: boolean }>("auth-login", {
            email: email.trim(),
            password,
          });
          adoptSession(res.token);
          return null;
        } catch (err) {
          if (err instanceof AuthFunctionError) return err.message;
          return "No internet connection. Connect and try again.";
        }
      },
      async signOut() {
        clearAuthToken();
        getSharedSupabase().realtime.setAuth("");
        setUserId(null);
        applyProfile(null);
        setMustReset(false);
      },
      async requestReset(email) {
        try {
          await invokeAuthFunction("auth-forgot-password", { email: email.trim() });
          return null; // always ok — no account enumeration
        } catch (err) {
          if (err instanceof AuthFunctionError) return err.message;
          return "Could not send the reset link. Check your connection and try again.";
        }
      },
      async refreshProfile() {
        if (userId) await loadProfile(userId);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, userId, profile, lockedReason, mustReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
