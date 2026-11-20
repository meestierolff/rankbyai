"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { captureLanding, persistAttribution } from "@/lib/attribution-client";
import { setAnalyticsClient } from "@/lib/analytics";
import { allowed, CONSENT_EVENT, CONSENT_OPEN_EVENT, readConsent, saveConsent, type ConsentState } from "@/lib/consent";
import { publicEnv } from "@/lib/env-public";
import { applyGoogleConsent, googleTagsConfigured } from "./google-tags";
import { redactReportSlugs } from "./vercel-analytics";

type PH = { set_config: (c: object) => void; opt_out_capturing: () => void; opt_in_capturing: () => void; has_opted_out_capturing: () => boolean };
const posthogOf = () => (window as unknown as { __rbPosthog?: PH }).__rbPosthog;

/** Whether the banner must ask now: only where consent is required, and only for questions not yet answered. */
function mustAsk(s: ConsentState, askAds: boolean): boolean {
  return s.required && (s.analytics === null || (askAds && s.ads === null));
}

/**
 * The one consent banner (first-party, no third-party CMP) and the analytics it governs: PostHog
 * (EU cloud), the Google tags (GA4 / Google Ads, Consent Mode v2) and campaign attribution.
 * Analytics is asked as before; the advertising question appears only once a Google Ads ID is
 * configured. "Cookie choices" in the footer reopens it anywhere (lib/consent).
 */
export function AnalyticsProvider() {
  const askAds = !!publicEnv.googleAdsId;
  const [ask, setAsk] = useState(false);
  const [draft, setDraft] = useState({ analytics: false, ads: false });

  useEffect(() => {
    captureLanding();
    let posthogLoading = false;

    const loadPosthog = (cookieless: boolean) => {
      if (!publicEnv.posthogKey || posthogLoading) return;
      posthogLoading = true;
      const load = () =>
        import("posthog-js").then(({ default: posthog }) => {
          posthog.init(publicEnv.posthogKey, {
            api_host: publicEnv.posthogHost,
            persistence: cookieless ? "memory" : "localStorage+cookie", // cookieless until consent
            person_profiles: "identified_only",
            capture_pageview: true,
            autocapture: false,
            disable_session_recording: true,
            // A report's slug is its access key, and so is the token in an email-removal link: never
            // send either (URLs, paths and referrers alike).
            before_send: (event) => {
              if (!event) return event;
              for (const bag of [event.properties, event.$set, event.$set_once] as (Record<string, unknown> | undefined)[]) {
                if (!bag) continue;
                for (const [k, v] of Object.entries(bag)) {
                  if (typeof v !== "string") continue;
                  let out = v.includes("/r/") ? redactReportSlugs(v) : v;
                  if (out.includes("/free-check/unsubscribe")) out = out.replace(/([?&]t=)[^&#]*/g, "$1[redacted]");
                  bag[k] = out;
                }
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
    };

    const apply = (initial: boolean) => {
      const s = readConsent();
      const a = allowed(s);
      // PostHog, as before: no analytics at all after "No thanks"; cookieless while undecided where consent is asked.
      if (s.analytics !== "denied") {
        const ph = posthogOf();
        if (!ph) loadPosthog(s.required && s.analytics !== "granted");
        else if (!initial) {
          if (ph.has_opted_out_capturing()) ph.opt_in_capturing();
          if (a.analytics) ph.set_config({ persistence: "localStorage+cookie" });
        }
      } else if (!initial) posthogOf()?.opt_out_capturing();
      // Google tags only when configured, and only within consent (basic Consent Mode).
      if (googleTagsConfigured()) applyGoogleConsent(a);
      persistAttribution(a);
      if (initial && (publicEnv.posthogKey || googleTagsConfigured()) && mustAsk(s, askAds)) {
        // Start from what was already chosen, so "Save choices" never undoes an earlier yes.
        queueMicrotask(() => {
          setDraft({ analytics: s.analytics === "granted", ads: s.ads === "granted" });
          setAsk(true);
        });
      }
    };

    apply(true);
    const onChange = () => apply(false);
    const onOpen = () => {
      const a = allowed(readConsent());
      setDraft({ analytics: a.analytics, ads: a.ads });
      setAsk(true);
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChange);
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    };
  }, [askAds]);

  const decide = (choice: { analytics: boolean; ads: boolean }) => {
    saveConsent({ analytics: choice.analytics ? "granted" : "denied", ...(askAds ? { ads: choice.ads ? "granted" : "denied" } : {}) });
    setAsk(false);
  };

  if (!ask) return null;
  const button = "flex-1 cursor-pointer rounded-[9px] px-3 py-2 text-[14px]";
  return (
    <div role="dialog" aria-label="Cookie choices" className="fixed bottom-20 left-4 z-50 max-w-[360px] rounded-2xl border border-border-strong bg-surface-2 p-4 shadow-popover">
      {askAds ? (
        <>
          <p className="m-0 text-[14px] leading-normal text-muted-foreground">
            We count visits without cookies. May we also use cookies to see which pages help, and to measure our Google ads?{" "}
            <Link href="/privacy" className="text-fg underline underline-offset-2">Privacy</Link>
          </p>
          <fieldset className="mt-3 flex flex-col gap-2 border-0 p-0 text-[14px]">
            <legend className="sr-only">Optional cookies</legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={draft.analytics} onChange={(e) => setDraft({ ...draft, analytics: e.target.checked })} className="size-4" />
              Analytics (PostHog, Google Analytics)
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={draft.ads} onChange={(e) => setDraft({ ...draft, ads: e.target.checked })} className="size-4" />
              Advertising measurement (Google Ads)
            </label>
          </fieldset>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => decide({ analytics: false, ads: false })} className={`${button} border border-border-strong font-medium hover:bg-line`}>No thanks</button>
            <button type="button" onClick={() => decide(draft)} className={`${button} border border-border-strong font-medium hover:bg-line`}>Save choices</button>
            <button type="button" onClick={() => decide({ analytics: true, ads: true })} className={`${button} bg-fg font-semibold text-bg hover:bg-white`}>Allow all</button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[14px] leading-normal text-muted-foreground">
            We count visits without cookies. May we also set an analytics cookie to see which pages help?{" "}
            <Link href="/privacy" className="text-fg underline underline-offset-2">Privacy</Link>
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => decide({ analytics: false, ads: false })} className={`${button} border border-border-strong font-medium hover:bg-line`}>No thanks</button>
            <button type="button" onClick={() => decide({ analytics: true, ads: false })} className={`${button} bg-fg font-semibold text-bg hover:bg-white`}>Allow</button>
          </div>
        </>
      )}
    </div>
  );
}
