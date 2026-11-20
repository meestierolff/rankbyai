"use client";

import { useState } from "react";
import { ctaClass } from "@/components/brand/primitives";

/** Allow / Cancel. The server checks the signed ticket and the session again, then says where to go. */
export function ConsentButtons({ ticket, clientName }: { ticket: string; clientName: string }) {
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (accept: boolean) => {
    setBusy(accept ? "allow" : "deny");
    setError(null);
    try {
      const res = await fetch("/oauth/authorize/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, accept }),
      });
      const body = (await res.json().catch(() => null)) as { redirect?: string; message?: string } | null;
      if (!res.ok || !body?.redirect) throw new Error(body?.message ?? "The answer could not be saved.");
      window.location.assign(body.redirect);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : "The answer could not be saved.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button type="button" onClick={() => answer(true)} disabled={busy !== null} aria-busy={busy === "allow"} className={ctaClass("block", "flex-1 cursor-pointer border-0 text-[16px]")}>
          {busy === "allow" ? "Connecting…" : `Allow ${clientName}`}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={busy !== null}
          aria-busy={busy === "deny"}
          className="flex-1 cursor-pointer rounded-full border border-border-strong bg-transparent px-5 py-3 text-[15px] text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
    </div>
  );
}
