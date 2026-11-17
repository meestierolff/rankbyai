"use client";

import Script from "next/script";
import { useState } from "react";
import { Band, Eyebrow, ctaClass } from "@/components/brand/primitives";
import { track } from "@/lib/analytics";

const field = "w-full rounded-[10px] border border-border-strong bg-inset px-[14px] py-3 text-[16px] text-fg placeholder:text-faint";

/** Free check lead magnet (brief 10.4): one point, three AI engines + Maps rank, no purchase. */
export function FreeCheck({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  return (
    <Band id="free-check">
      <div className="container-page section-y grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-[clamp(32px,5vw,64px)]">
        <div className="flex flex-col gap-[22px]">
          <Eyebrow>Free check</Eyebrow>
          <h2 className="text-h2 m-0">Does AI recommend this business? Check one point, free.</h2>
          <p className="text-lead m-0">
            Enter a business and its city. We ask three AI assistants who they recommend at the business&apos;s own location and look up its Google
            Maps rank there. One check per email. No card.
          </p>
        </div>
        {state === "sent" ? (
          <div role="status" className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-8">
            <span className="text-[21px] font-semibold">Check your email</span>
            <p className="m-0 text-[16px] leading-normal text-muted-foreground">
              We sent a link to <span className="text-fg">{email}</span>. Open it and your check starts. The link works once and expires in an hour.
            </p>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-[clamp(20px,3vw,32px)]"
            onSubmit={async (e) => {
              e.preventDefault();
              setState("busy");
              setError(null);
              const fd = new FormData(e.currentTarget);
              const mail = String(fd.get("email") ?? "");
              setEmail(mail);
              track("free_check_started");
              const res = await fetch("/api/free-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ business_name: fd.get("business_name"), city: fd.get("city"), email: mail, turnstile_token: fd.get("cf-turnstile-response") ?? undefined }),
              });
              if (res.ok) return setState("sent");
              const json = (await res.json().catch(() => ({}))) as { message?: string };
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
            <label className="flex flex-col gap-2 text-[14px] font-medium">Work email
              <input name="email" type="email" required autoComplete="email" placeholder="you@agency.com" className={field} />
            </label>
            {turnstileSiteKey ? (
              <>
                <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
                <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
              </>
            ) : null}
            {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
            <button type="submit" disabled={state === "busy"} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
              <span>{state === "busy" ? "Sending…" : "Email me the check link"}</span><span aria-hidden>→</span>
            </button>
            <p className="m-0 text-[13px] leading-normal text-dim">
              We email you a one-time link to confirm the address, then run the check. AI answers vary between runs, places and time.
            </p>
          </form>
        )}
      </div>
    </Band>
  );
}
