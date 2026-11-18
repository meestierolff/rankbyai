"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { creamClass, LpEyebrow } from "./lp";

// 16px on a phone (a smaller size makes iOS zoom the page on focus), the design's 15px from there up.
const field =
  "w-full rounded-[11px] border border-lp-border bg-[#0b0b0b] px-4 py-[14px] text-[16px] text-lp-fg placeholder:text-lp-dim hover:border-lp-border-3 sm:text-[15px]";

const FAILED = "Something went wrong. Try again.";

/** Free check lead magnet (brief 10.4): one point, three AI engines + Maps rank, no purchase. */
export function FreeCheck({ turnstileSiteKey, open = true }: { turnstileSiteKey: string; open?: boolean }) {
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <section id="free-check" className="pt-[60px] pb-[130px] text-lp-fg">
      <div className="container-lp">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-9 rounded-[24px] border border-lp-line-2 p-[clamp(24px,4vw,40px)]">
          <div>
            <LpEyebrow className="block">Free check</LpEyebrow>
            <h2 className="mt-4 mb-0 text-[clamp(28px,3.4vw,36px)] leading-[1.08] font-semibold tracking-[-0.04em] text-balance">
              Does AI recommend this business? Check one point, free.
            </h2>
            <p className="mt-4 mb-0 text-[15.5px] leading-[1.6] text-lp-muted">
              Enter a business and its city. We ask three AI assistants who they recommend at the business&apos;s own location and look up its Google
              Maps rank there. One check per Google account. No card.
            </p>
          </div>
          <form
            className="flex min-w-0 flex-col gap-[10px]"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("busy");
              setError(null);
              const fd = new FormData(e.currentTarget);
              track("free_check_started");
              try {
                const res = await fetch("/api/free-check", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ business_name: fd.get("business_name"), city: fd.get("city"), turnstile_token: fd.get("cf-turnstile-response") ?? undefined }),
                });
                const json = (await res.json().catch(() => ({}))) as { message?: string; next?: string };
                if (res.ok && json.next) {
                  // Sign in with Google (verifies the email), then the check runs.
                  router.push(`/login?next=${encodeURIComponent(json.next)}`);
                  return;
                }
                setError(json.message ?? FAILED);
              } catch {
                // The request never reached the server (offline, blocked): say so instead of staying busy.
                setError(FAILED);
              }
              setState("idle");
            }}
          >
            <label className="block">
              <span className="sr-only">Business name</span>
              <input name="business_name" required minLength={2} maxLength={120} placeholder="Business name" className={field} />
            </label>
            <label className="block">
              <span className="sr-only">City</span>
              <input name="city" required minLength={2} maxLength={120} placeholder="City" className={field} />
            </label>
            {turnstileSiteKey ? (
              <>
                <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
                <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
              </>
            ) : null}
            {error ? <p role="alert" className="m-0 text-[14px] leading-[1.5] text-lp-strike">{error}</p> : null}
            {open ? (
              <button type="submit" disabled={state === "busy"} className={creamClass("block", "cursor-pointer rounded-[11px] border-0 px-4 py-[14px] text-[16px]")}>
                <span>{state === "busy" ? "One moment…" : "Run my free check"}</span>
                <span aria-hidden>→</span>
              </button>
            ) : (
              <button type="submit" disabled className="w-full cursor-not-allowed rounded-[11px] border border-lp-border bg-[#141414] px-4 py-[14px] text-[15px] text-lp-dim">
                Not open yet
              </button>
            )}
            {!open ? (
              <p role="note" className="mt-1 mb-0 text-[13px] leading-[1.55] text-lp-muted">
                Free checks are not open yet. You can already sign in and look around the app.
              </p>
            ) : null}
            <p className="m-0 text-[12.5px] leading-[1.55] text-lp-dim">
              Next you sign in with Google, so each person gets one check. Then it runs, in about a minute. AI answers vary between runs, places and time.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
