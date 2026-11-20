"use client";

import { useState, type FormEvent } from "react";
import { inputClass, labelClass } from "@/components/app/ui";
import { ctaClass } from "@/components/brand/primitives";
import { authClient } from "@/lib/auth-neon/client";
import { safeNextPath } from "@/lib/safe-next";

/** Email and password for a listed app-directory reviewer; then on to where they were going. */
export function ReviewerForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = safeNextPath(new URLSearchParams(window.location.search).get("next"), "/app");
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.signIn.email({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") });
      if (res?.error) {
        setBusy(false);
        setError(res.error.status === 429 ? "Too many attempts. Wait 15 minutes and try again." : "That email and password do not match a reviewer account.");
        return;
      }
      window.location.assign(next);
    } catch {
      setBusy(false);
      setError("Sign-in could not start. Try again in a moment.");
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Email</span>
        <input name="email" type="email" autoComplete="username" required maxLength={254} className={inputClass} />
      </label>
      <label className="flex flex-col gap-2">
        <span className={labelClass}>Password</span>
        <input name="password" type="password" autoComplete="current-password" required maxLength={256} className={inputClass} />
      </label>
      <button type="submit" disabled={busy} aria-busy={busy} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
    </form>
  );
}
