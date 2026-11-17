"use client";

import Script from "next/script";
import { useState } from "react";
import { ctaClass } from "@/components/brand/primitives";

const field = "w-full rounded-[10px] border border-border-strong bg-inset px-[14px] py-3 text-[16px] text-fg placeholder:text-faint";

export function RemovalForm({ turnstileSiteKey }: { turnstileSiteKey: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "done") {
    return (
      <div role="status" className="rounded-2xl border border-border bg-surface p-6 text-[15px] leading-normal text-muted-foreground">
        <span className="block text-[18px] font-semibold text-fg">Request received.</span>
        We handle removal and correction requests within 7 days and will reply to the email you gave.
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/api/removal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_name: fd.get("business_name"), url: fd.get("url"), email: fd.get("email"), reason: fd.get("reason"),
            turnstile_token: fd.get("cf-turnstile-response") ?? undefined,
          }),
        });
        if (res.ok) return setState("done");
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        setError(json.message ?? "Something went wrong. Please email us instead.");
        setState("idle");
      }}
    >
      <label className="flex flex-col gap-2 text-[14px] font-medium text-fg">Business name
        <input name="business_name" required minLength={2} maxLength={200} className={field} />
      </label>
      <label className="flex flex-col gap-2 text-[14px] font-medium text-fg">Page URL on rankbyai.live (if you have it)
        <input name="url" type="text" maxLength={500} placeholder="https://rankbyai.live/ai/…" className={field} />
      </label>
      <label className="flex flex-col gap-2 text-[14px] font-medium text-fg">Your email
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="flex flex-col gap-2 text-[14px] font-medium text-fg">What should we remove or correct?
        <textarea name="reason" rows={4} maxLength={2000} className={field} />
      </label>
      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
        </>
      ) : null}
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
      <button type="submit" disabled={state === "busy"} className={ctaClass("md", "cursor-pointer self-start border-0")}>
        <span>{state === "busy" ? "Sending…" : "Send request"}</span><span aria-hidden>→</span>
      </button>
    </form>
  );
}
