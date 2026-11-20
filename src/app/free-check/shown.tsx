"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";
import { reportConversion } from "@/lib/conversions";

/**
 * Rendered only together with a result. Asks the server whether this is the first time this check's
 * result is shown; only then free_check_completed goes to PostHog, GA4 and Google Ads. Reloads, other
 * tabs and a login redirect never count. Properties are counts only, never the business.
 */
export function CheckShown() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    fetch("/api/free-check/shown", { method: "POST", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { first?: boolean; mentionedBy?: number; engines?: number; mapsRank?: number | null } | null) => {
        if (!s?.first) return;
        track("free_check_completed", { mentioned_by: s.mentionedBy ?? 0, engines: s.engines ?? 0, maps_ranked: s.mapsRank != null, flow: "public" });
        reportConversion("free_check_completed");
      })
      .catch(() => undefined);
  }, []);
  return null;
}
