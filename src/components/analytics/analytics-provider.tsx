"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicEnv } from "@/lib/env-public";
import { setAnalyticsClient } from "@/lib/analytics";
import { redactReportSlugs } from "./vercel-analytics";

const CONSENT_KEY = "rb_consent"; // "granted" | "denied"
const EU_LANG_REGIONS = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","IS","LI","NO","GB","CH"]);

/** EU/EEA/UK/CH visitors are asked first: time zone, with browser language region as a fallback. */
function consentRequired(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Europe/") || tz === "Atlantic/Reykjavik" || tz === "Atlantic/Canary" || tz === "Atlantic/Madeira") return true;
    return (navigator.languages || []).some((l) => EU_LANG_REGIONS.has((l.split("-")[1] || "").toUpperCase()));
  } catch {
    return true;
  }
}

export function AnalyticsProvider() {
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!publicEnv.posthogKey) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(CONSENT_KEY);
    } catch {}
    const needsConsent = consentRequired();
    if (stored === "denied") return; // respected: no analytics at all
    const cookieless = needsConsent && stored !== "granted";
    if (needsConsent && !stored) queueMicrotask(() => setAsk(true));

    const load = () =>
      import("posthog-js").then(({ default: posthog }) => {
        posthog.init(publicEnv.posthogKey, {
          api_host: publicEnv.posthogHost,
          persistence: cookieless ? "memory" : "localStorage+cookie", // cookieless until consent
          person_profiles: "identified_only",
          capture_pageview: true,
          autocapture: false,
          disable_session_recording: true,
          // A report's slug is its access key: never send it (URLs, paths and referrers alike).
          before_send: (event) => {
            if (!event) return event;
            for (const bag of [event.properties, event.$set, event.$set_once] as (Record<string, unknown> | undefined)[]) {
              if (!bag) continue;
              for (const [k, v] of Object.entries(bag)) if (typeof v === "string" && v.includes("/r/")) bag[k] = redactReportSlugs(v);
            }
            return event;
          },
        });
        (window as unknown as { __rbPosthog?: typeof posthog }).__rbPosthog = posthog;
        setAnalyticsClient(posthog);
      });
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(load, { timeout: 4000 });
    else setTimeout(load, 2500);
  }, []);

  const decide = (granted: boolean) => {
    try {
      localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
    } catch {}
    setAsk(false);
    const ph = (window as unknown as { __rbPosthog?: { set_config: (c: object) => void; opt_out_capturing: () => void } }).__rbPosthog;
    if (!ph) return;
    if (granted) ph.set_config({ persistence: "localStorage+cookie" });
    else ph.opt_out_capturing();
  };

  if (!ask) return null;
  return (
    <div
      role="dialog"
      aria-label="Analytics cookies"
      className="fixed bottom-20 left-4 z-50 max-w-[340px] rounded-2xl border border-border-strong bg-surface-2 p-4 shadow-popover"
    >
      <p className="text-[14px] leading-normal text-muted-foreground">
        We count visits without cookies. May we also set an analytics cookie to see which pages help?{" "}
        <Link href="/privacy" className="text-fg underline underline-offset-2">Privacy</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => decide(false)} className="flex-1 cursor-pointer rounded-[9px] border border-border-strong px-3 py-2 text-[14px] font-medium hover:bg-line">
          No thanks
        </button>
        <button type="button" onClick={() => decide(true)} className="flex-1 cursor-pointer rounded-[9px] bg-fg px-3 py-2 text-[14px] font-semibold text-bg hover:bg-white">
          Allow
        </button>
      </div>
    </div>
  );
}
