"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ctaClass } from "@/components/brand/primitives";

export function RedeemForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const code = new FormData(event.currentTarget).get("code");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/appsumo/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      setMessage(result.message ?? "We could not redeem your code. Please try again.");
      setDone(response.ok && result.ok === true);
    } catch {
      setMessage("We could not reach the server. Please try again; submitting the same code again is safe.");
    } finally {
      setBusy(false);
    }
  }
  if (done) return <div className="flex flex-col gap-4"><p role="status" className="m-0">{message}</p><Link href="/app" className={ctaClass("block")}>Open RankbyAI</Link></div>;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label htmlFor="appsumo-code" className="text-[14px]">AppSumo redemption code</label>
      <input id="appsumo-code" name="code" type="text" required maxLength={100} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="RBAI-…" disabled={busy} className="w-full rounded-lg border border-border-strong bg-bg px-3 py-3 font-mono text-[14px] text-fg" />
      <button type="submit" disabled={busy} aria-busy={busy} className={ctaClass("block", "cursor-pointer border-0 disabled:opacity-60")}>{busy ? "Redeeming…" : "Activate lifetime access"}</button>
      {message ? <p role="alert" className="m-0 text-[14px] text-danger">{message}</p> : null}
    </form>
  );
}
