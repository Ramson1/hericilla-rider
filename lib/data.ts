import { useEffect, useRef } from "react";
import { useNavigation } from "expo-router";

/** Run `load` on mount and every time the screen regains focus. */
export function useOnFocus(load: () => void, deps: React.DependencyList): void {
  const nav = useNavigation();
  const cb = useRef(load);
  cb.current = load;
  useEffect(() => {
    void cb.current();
    const unsub = nav.addListener("focus", () => void cb.current());
    return () =>
      typeof unsub === "function" ? unsub() : (unsub as { remove(): void }).remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, ...deps]);
}

/** Local-date string (YYYY-MM-DD) for day filters. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Start/end ISO bounds for "today" in the device's timezone. */
export function dayBounds(): [string, string] {
  const t = todayStr();
  return [`${t}T00:00:00`, `${t}T23:59:59.999`];
}

export function money(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  return `₦${v.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${fmtTime(iso)}`;
}
