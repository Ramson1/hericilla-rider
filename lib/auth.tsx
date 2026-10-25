import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Profile } from "@hericilla/types";
import { getSupabase } from "./supabase";

/**
 * Auth context for the driver app.
 * Only accounts whose profile role is `driver` may enter; everyone else sees
 * a plain-English lock-out message.
 */

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Non-null when the signed-in account is not allowed here. */
  lockedReason: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  requestReset: (email: string) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lockedReason, setLockedReason] = useState<string | null>(null);

  const loadProfile = async (userId: string) => {
    const { data, error } = await getSupabase().from("hericilla_profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !data) {
      setProfile(null);
      setLockedReason("We could not find your account details. Please call the office.");
      return;
    }
    const p = data as Profile;
    setProfile(p);
    if (p.role !== "driver") {
      setLockedReason(`This app is only for drivers. Your account type is "${p.role}". Please use the staff portal instead.`);
    } else if (p.status !== "active") {
      setLockedReason("Your driver account is not active right now. Please call the office to confirm.");
    } else {
      setLockedReason(null);
    }
  };

  useEffect(() => {
    const sb = getSupabase();
    let mounted = true;
    void (async () => {
      const { data } = await sb.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      setLoading(false);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setLockedReason(null);
      } else {
        void loadProfile(s.user.id);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      lockedReason,
      async signIn(email, password) {
        const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
        return error ? friendlyAuthError(error.message) : null;
      },
      async signOut() {
        await getSupabase().auth.signOut();
      },
      async requestReset(email) {
        const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim());
        return error ? friendlyAuthError(error.message) : null;
      },
      async refreshProfile() {
        if (session) await loadProfile(session.user.id);
      },
    }),
    [loading, session, profile, lockedReason],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "The email or password is not correct. Try again, or press 'Forgot password'.";
  if (m.includes("email not confirmed")) return "Your email is not confirmed yet. Please call the office.";
  if (m.includes("rate")) return "Too many tries. Wait a minute, then try again.";
  if (m.includes("network") || m.includes("failed to fetch")) return "No internet connection. Connect and try again.";
  return message;
}
