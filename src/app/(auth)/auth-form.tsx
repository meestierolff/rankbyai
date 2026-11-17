"use client";

import Script from "next/script";
import { useActionState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { sendMagicLink, type MagicLinkState } from "./actions";

const initial: MagicLinkState = { status: "idle" };

export function AuthForm({ mode, turnstileSiteKey }: { mode: "login" | "signup"; turnstileSiteKey: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
        <span className="text-[19px] font-semibold">Check your email</span>
        <p className="m-0 text-[15px] leading-normal text-muted-foreground">
          We sent a sign-in link to <span className="text-fg">{state.email}</span>. It works once and expires in an hour. You can open it on any device.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input
        type="hidden"
        name="next"
        defaultValue="/app"
        ref={(el) => {
          const n = el ? new URLSearchParams(window.location.search).get("next") : null;
          if (el && n) el.value = n;
        }}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-[14px] font-medium">Work email</label>
        <input
          id="email" name="email" type="email" required autoComplete="email" autoFocus placeholder="you@agency.com"
          aria-describedby={state.status === "error" ? "auth-error" : undefined}
          className="rounded-[10px] border border-border-strong bg-inset px-[14px] py-3 text-[16px] text-fg placeholder:text-faint"
        />
      </div>
      {turnstileSiteKey ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="dark" />
        </>
      ) : null}
      {state.status === "error" ? <p id="auth-error" role="alert" className="m-0 text-[14px] text-danger">{state.message}</p> : null}
      <button type="submit" disabled={pending} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
        <span>{pending ? "Sending…" : mode === "signup" ? "Create account" : "Email me a sign-in link"}</span>
        <span aria-hidden>→</span>
      </button>
      <p className="m-0 text-[13px] leading-normal text-dim">No password. We email you a one-time link.</p>
    </form>
  );
}
