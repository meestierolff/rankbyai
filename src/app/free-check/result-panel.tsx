"use client";

import Link from "next/link";
import { useState } from "react";
import { creamClass, outlineClass } from "@/components/marketing/lp";

const card = "flex flex-col items-start gap-4 rounded-[22px] border border-lp-border-2 bg-[linear-gradient(180deg,#121212,#0a0a0a)] p-[clamp(22px,3vw,32px)]";
const field =
  "w-full rounded-[11px] border border-lp-border bg-[#0b0b0b] px-4 py-[13px] text-[16px] text-lp-fg placeholder:text-lp-dim hover:border-lp-border-3 sm:text-[15px]";

export interface OfferLine {
  /** e.g. "Get lifetime access: $29 once" (deal open) or "See pricing". */
  cta: string;
  /** One factual line about the offer, without seat counts. */
  note: string;
}

/**
 * Shown under a free-check result, in place of the report's usual "what happens next" block: what
 * the full product does (buy or create an account), then an optional email of the result. The email
 * box is optional, comes after the result, and the product-news box is a separate, unticked choice.
 */
export function FreeCheckNext({ offer, emailGiven, operator, contactEmail }: { offer: OfferLine; emailGiven: boolean; operator: string; contactEmail: string }) {
  return (
    <section aria-labelledby="next-h" className="flex flex-col gap-6">
      <span className="font-mono text-[12px] leading-none tracking-[0.14em] text-lp-accent-text uppercase">What happens next</span>
      <h2 id="next-h" className="sr-only">What happens next</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={card}>
          <span className="font-mono text-[12px] tracking-[0.1em] text-dim uppercase">The full report</span>
          <h3 className="m-0 text-[clamp(22px,2.4vw,28px)] leading-[1.1] font-semibold tracking-[-0.03em]">This was one point. See the whole map.</h3>
          <p className="m-0 text-[16px] leading-[1.6] text-lp-muted">
            RankbyAI checks a grid of points around a business on ChatGPT, Perplexity, Gemini and Google Maps, audits its profile and website, and builds white-label reports.
          </p>
          <p className="m-0 text-[14px] leading-[1.55] text-lp-dim">{offer.note}</p>
          <div className="mt-auto flex flex-wrap gap-3 pt-2">
            <Link href="/pricing" className={creamClass("md")}><span>{offer.cta}</span><span aria-hidden>→</span></Link>
            <Link href="/signup" className={outlineClass()}><span>Create an account</span></Link>
          </div>
          <p className="m-0 text-[13px] leading-[1.55] text-lp-dim">An account is free and lets you look around the app. Grids, audits and reports need lifetime access.</p>
        </div>
        <EmailResult emailGiven={emailGiven} operator={operator} contactEmail={contactEmail} />
      </div>
    </section>
  );
}

function EmailResult({ emailGiven, operator, contactEmail }: { emailGiven: boolean; operator: string; contactEmail: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">(emailGiven ? "sent" : "idle");
  const [error, setError] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);

  return (
    <div className={card}>
      <span className="font-mono text-[12px] tracking-[0.1em] text-dim uppercase">Optional</span>
      <h3 className="m-0 text-[clamp(22px,2.4vw,28px)] leading-[1.1] font-semibold tracking-[-0.03em]">Email me this result</h3>
      {state === "sent" ? (
        <p role="status" className="m-0 text-[16px] leading-[1.6] text-lp-muted">
          This result has been emailed. If it is not in your inbox, check the spam folder. The email has a link to remove your address.
        </p>
      ) : (
        <form
          className="flex w-full flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("busy");
            setError(null);
            const email = String(new FormData(e.currentTarget).get("email") ?? "");
            try {
              const res = await fetch("/api/free-check/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, marketing }) });
              const json = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
              if (res.ok || json.error === "already_sent") {
                setState("sent");
                return;
              }
              setError(json.message ?? "We could not send it. Try again.");
            } catch {
              setError("We could not send it. Try again.");
            }
            setState("idle");
          }}
        >
          <label className="block">
            <span className="sr-only">Email address</span>
            <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@agency.com" className={field} />
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.5] text-lp-muted">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-[3px] size-4 shrink-0 accent-[#f2f0ec]" />
            <span>Also send me occasional product news from RankbyAI (a few emails at most). Optional; unsubscribe any time.</span>
          </label>
          {error ? <p role="alert" className="m-0 text-[14px] leading-[1.5] text-lp-strike">{error}</p> : null}
          <button type="submit" disabled={state === "busy"} className={creamClass("block", "cursor-pointer rounded-[11px] border-0 px-4 py-[13px] text-[15px]")}>
            <span>{state === "busy" ? "Sending…" : "Email me the result"}</span>
          </button>
          <p className="m-0 text-[12.5px] leading-[1.6] text-lp-dim">
            You do not need to give an address to see or keep this result. If you do, {operator} sends this result to it once and uses it for nothing else,
            unless you tick the box for product news. Remove it any time with the link in the email{contactEmail ? <> or by writing to {contactEmail}</> : null}.
            Details in our <Link href="/privacy" className="text-lp-muted underline underline-offset-2">privacy policy</Link>.
          </p>
        </form>
      )}
    </div>
  );
}
