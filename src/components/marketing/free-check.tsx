"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useState } from "react";
import { Band, Eyebrow, ctaClass } from "@/components/brand/primitives";
import { track } from "@/lib/analytics";

const field = "w-full rounded-[10px] border border-border-strong bg-inset px-[14px] py-3 text-[16px] text-fg placeholder:text-faint";

/** Free check lead magnet (brief 10.4): one point, three AI engines + Maps rank, no purchase. */
export function FreeCheck({ turnstileSiteKey, open = true }: { turnstileSiteKey: string; open?: boolean }) {
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <Band id="free-check">
      <div className="container-page section-y grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-[clamp(32px,5vw,64px)]">
        <div className="flex flex-col gap-[22px]">
          <Eyebrow>Free check</Eyebrow>
          <h2 className="text-h2 m-0">Does AI recommend this business? Check one point, free.</h2>
          <p className="text-lead m-0">
            Enter a business and its city. We ask three AI assistants who they recommend at the business&apos;s own location and look up its Google
            Maps rank there. One check per Google account. No card.
          </p>
        </div>
        <form
          className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-[clamp(20px,3vw,32px)]"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("busy");
            setError(null);
            const fd = new FormData(e.currentTarget);
            track("free_check_started");
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
            setError(json.message ?? "Something went wrong. Try again.");
            setState("idle");
          }}
        >
          <label className="flex flex-col gap-2 text-[14px] font-medium">Business name
            <input name="business_name" required minLength={2} maxLength={120} placeholder="Northgate Family Dental" className={field} />
          </label>
          <label className="flex flex-col gap-2 text-[14px] font-medium">City
            <input name="city" required minLength={2} maxLength={120} placeholder="Austin, TX" className={field} />
          </label>
          {turnstileSiteKey ? (
            <>
              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
              <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
            </>
          ) : null}
          {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
          {!open ? <p role="note" className="m-0 rounded-[10px] border border-border-strong bg-surface-2 px-3 py-2 text-[14px] text-muted-foreground">Free checks are not open yet. You can already sign in and look around the app.</p> : null}
          <button type="submit" disabled={state === "busy" || !open} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
            <span>{!open ? "Not open yet" : state === "busy" ? "One moment…" : "Run my free check"}</span>{open ? <span aria-hidden>→</span> : null}
          </button>
          <p className="m-0 text-[13px] leading-normal text-dim">
            Next you sign in with Google, so each person gets one check. Then it runs, in about a minute. AI answers vary between runs, places and time.
          </p>
        </form>
      </div>
    </Band>
  );
}
