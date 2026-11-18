"use client";

import { useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { authClient } from "@/lib/auth-neon/client";
import { safeNextPath } from "@/lib/safe-next";

/** Sign in with Google (Neon Auth). New Google accounts get a workspace on first sign-in. */
export function AuthForm({ mode, configured }: { mode: "login" | "signup"; configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"), "/app");
    try {
      const res = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login?error=google" });
      if (res?.error) throw new Error(res.error.message ?? "sign-in failed");
    } catch {
      setBusy(false);
      setError("Google sign-in could not start. Try again in a moment.");
    }
  };

  if (!configured) {
    return <p role="alert" className="m-0 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] text-muted-foreground">Sign-in is not configured on this deployment yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={go} disabled={busy} aria-busy={busy} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/></svg>
        <span>{busy ? "Opening Google…" : mode === "signup" ? "Sign up with Google" : "Continue with Google"}</span>
      </button>
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
      <p className="m-0 text-[13px] leading-normal text-dim">No password to remember. We receive your name and email address from Google, nothing else.</p>
    </div>
  );
}
