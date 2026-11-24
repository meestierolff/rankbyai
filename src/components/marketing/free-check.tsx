"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { takeIndexCheckSource } from "@/lib/ai-index/check-source";
import { track } from "@/lib/analytics";
import { COUNTRY_OPTION_GROUPS, countryLanguageNote, DEFAULT_COUNTRY } from "@/lib/countries";
import { creamClass, LpEyebrow } from "./lp";
import { resetTurnstile, TurnstileWidget } from "./turnstile-widget";

// 16px on a phone (a smaller size makes iOS zoom the page on focus), the design's 15px from there up.
const field =
  "w-full rounded-[11px] border border-lp-border bg-[#0b0b0b] px-4 py-[14px] text-[16px] text-lp-fg placeholder:text-lp-dim hover:border-lp-border-3 sm:text-[15px]";

const FAILED = "Something went wrong. Try again.";

/**
 * Free check lead magnet (brief 10.4): one point, three AI engines + Maps rank, no account and no card.
 * Submitting starts the check and opens /free-check, where it runs and the result is shown.
 * `notice` is a message from an earlier attempt (shown on /free-check, e.g. "not found on Google Maps").
 */
export function FreeCheck({ turnstileSiteKey, open = true, headingLevel = 2, notice }: { turnstileSiteKey: string; open?: boolean; headingLevel?: 1 | 2; notice?: string }) {
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(notice ?? null);
  const [existing, setExisting] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const router = useRouter();
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section id="free-check" className="pt-[60px] pb-[130px] text-lp-fg">
      <div className="container-lp">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-9 rounded-[24px] border border-lp-line-2 p-[clamp(24px,4vw,40px)]">
          <div>
            <LpEyebrow className="block">Free check</LpEyebrow>
            <Heading className="mt-4 mb-0 text-[clamp(28px,3.4vw,36px)] leading-[1.08] font-semibold tracking-[-0.04em] text-balance">
              Does AI recommend this business? Check one point, free.
            </Heading>
            <p className="mt-4 mb-0 text-[15.5px] leading-[1.6] text-lp-muted">
              Enter a business, its city and its country. We ask three AI assistants who they recommend at the business&apos;s own location and look up its Google
              Maps rank there. You see the result on the next page. No sign-up, no card.
            </p>
          </div>
          <form
            className="flex min-w-0 flex-col gap-[10px]"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("busy");
              setError(null);
              setExisting(false);
              const form = e.currentTarget;
              const fd = new FormData(form);
              const indexSource = takeIndexCheckSource();
              track("free_check_started", indexSource ? { source_page: indexSource } : undefined);
              try {
                const res = await fetch("/api/free-check", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ business_name: fd.get("business_name"), city: fd.get("city"), country, turnstile_token: fd.get("cf-turnstile-response") ?? undefined }),
                });
                const json = (await res.json().catch(() => ({}))) as { message?: string; next?: string; error?: string };
                if (res.ok && json.next) {
                  // The check runs on the next page, and the result appears there. No sign-in.
                  router.push(json.next);
                  return;
                }
                setError(json.message ?? FAILED);
                setExisting(!!json.next);
              } catch {
                // The request never reached the server (offline, blocked): say so instead of staying busy.
                setError(FAILED);
              }
              // A Turnstile token is single-use: the next attempt needs a fresh one.
              resetTurnstile(form);
              setState("idle");
            }}
          >
            <label className="block">
              <span className="sr-only">Business name</span>
              <input name="business_name" required minLength={2} maxLength={120} placeholder="Business name" autoComplete="organization" className={field} />
            </label>
            <label className="block">
              <span className="sr-only">City</span>
              <input name="city" required minLength={2} maxLength={80} placeholder="City" autoComplete="address-level2" className={field} />
            </label>
            <label className="block">
              <span className="sr-only">Country</span>
              <select name="country" value={country} onChange={(e) => setCountry(e.target.value)} className={`${field} min-w-0 cursor-pointer`}>
                {COUNTRY_OPTION_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            {countryLanguageNote(country) ? <p className="m-0 text-[12.5px] leading-[1.55] text-lp-dim">{countryLanguageNote(country)}</p> : null}
            {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} /> : null}
            {error ? (
              <p role="alert" className="m-0 text-[14px] leading-[1.5] text-lp-strike">
                {error}{" "}
                {existing ? <Link href="/free-check" className="text-lp-fg underline underline-offset-2">See your result</Link> : null}
              </p>
            ) : null}
            {open ? (
              <button type="submit" disabled={state === "busy"} className={creamClass("block", "cursor-pointer rounded-[11px] border-0 px-4 py-[14px] text-[16px]")}>
                <span>{state === "busy" ? "One moment…" : "Run my free check"}</span>
                <span aria-hidden>→</span>
              </button>
            ) : (
              <button type="submit" disabled className="w-full cursor-not-allowed rounded-[11px] border border-lp-border bg-[#141414] px-4 py-[14px] text-[15px] text-lp-dim">
                Not open right now
              </button>
            )}
            {!open ? (
              <p role="note" className="mt-1 mb-0 text-[13px] leading-[1.55] text-lp-muted">
                Free checks are not available right now. You can still sign in and look around the app.
              </p>
            ) : null}
            <p className="m-0 text-[12.5px] leading-[1.55] text-lp-dim">
              One free check per person. It takes about a minute. AI answers vary between runs, places and time.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
