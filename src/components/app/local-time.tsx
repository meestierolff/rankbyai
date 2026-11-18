"use client";

import { useSyncExternalStore } from "react";

/*
 * ONE way to show a moment in time inside /app: in the viewer's own time zone, formatted in the
 * browser. The server cannot know that zone, so the server-rendered HTML carries the UTC time,
 * labelled "UTC"; after hydration the text becomes local. Before this, server pages printed UTC
 * and client components printed local time, so the same scan showed two different hours.
 */

export type TimeMode = "date" | "datetime" | "day";

const FORMAT: Record<TimeMode, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short", year: "numeric" },
  datetime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  day: { day: "numeric", month: "short" },
};
const FULL: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
/** A calendar date with no time ("2026-11-17") is the same day everywhere; never shift it by a zone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `local` false: UTC, and a date with a time says so. `local` true: the browser's zone. Pure. */
export function formatTime(iso: string | null | undefined, mode: TimeMode, local: boolean, zone = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (DATE_ONLY.test(iso)) return d.toLocaleDateString("en-US", { ...FORMAT[mode === "datetime" ? "date" : mode], timeZone: "UTC" });
  if (!local) return d.toLocaleString("en-US", { ...FORMAT[mode], timeZone: "UTC" }) + (mode === "datetime" ? " UTC" : "");
  return d.toLocaleString("en-US", { ...FORMAT[mode], ...(zone && mode === "datetime" ? { timeZoneName: "short" } : {}) });
}

const subscribe = () => () => {};
/** False on the server and while hydrating, true afterwards: no hydration mismatch, no effect. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * A timestamp in the viewer's local time. The tooltip always names the zone; `zone` also prints
 * it, for places where a reader may compare the time with something outside the app.
 */
export function LocalTime({ iso, mode = "datetime", zone = false, className }: { iso: string | null | undefined; mode?: TimeMode; zone?: boolean; className?: string }) {
  const local = useHydrated();
  if (!iso) return <span className={className}>—</span>;
  const dateOnly = DATE_ONLY.test(iso);
  return (
    <time dateTime={iso} title={local && !dateOnly ? new Date(iso).toLocaleString("en-US", FULL) : undefined} className={className}>
      {formatTime(iso, mode, local, zone)}
    </time>
  );
}
