"use client";

import { useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { fmtPrice, type Offer } from "@/lib/ladder";
import { track } from "@/lib/analytics";

type ProductKey = "lifetime" | "pack_25" | "pack_100";

async function startCheckout(productKey: ProductKey, expectedPriceCents?: number) {
  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_key: productKey, expected_price_cents: expectedPriceCents }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string; current_price_cents?: number };
  return { status: res.status, ...json };
}

/** "Lock in $X now": sends the price the buyer was shown; a 409 asks them to confirm the new one. */
export function BuyLifetimeButton({ offer }: { offer: Offer }) {
  const [priceUsd, setPriceUsd] = useState(offer.currentPriceUsd);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (usd: number) => {
    setBusy(true);
    setError(null);
    track("checkout_started", { product_key: "lifetime", price_cents: usd * 100 });
    const r = await startCheckout("lifetime", Math.round(usd * 100));
    if (r.status === 200 && r.url) {
      window.location.assign(r.url);
      return;
    }
    setBusy(false);
    if (r.status === 409 && r.error === "price_changed" && r.current_price_cents) {
      setChanged(r.current_price_cents / 100);
      track("price_changed_shown", { from_cents: usd * 100, to_cents: r.current_price_cents });
      return;
    }
    setError(r.message ?? "Checkout could not start. You were not charged.");
  };

  if (changed !== null) {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-[14px] border border-border-strong bg-surface-2 p-4">
        <span className="text-[15px]">
          The price just moved to <span className="font-semibold">{fmtPrice(changed)}</span> (someone bought the last {fmtPrice(priceUsd)} seat).
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ctaClass("md", "cursor-pointer border-0")} disabled={busy} onClick={() => { setPriceUsd(changed); setChanged(null); void go(changed); }}>
            <span>Continue at {fmtPrice(changed)}</span><span aria-hidden>→</span>
          </button>
          <button type="button" className={secondaryClass("cursor-pointer bg-transparent")} onClick={() => setChanged(null)}>Not now</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className={ctaClass("block", "cursor-pointer border-0")} disabled={busy} onClick={() => go(priceUsd)}>
        <span>{busy ? "Opening checkout…" : `Lock in ${fmtPrice(priceUsd)} now`}</span><span aria-hidden>→</span>
      </button>
      {error ? <p role="alert" className="m-0 text-[14px] text-danger">{error}</p> : null}
    </div>
  );
}

export function BuyPackButton({ productKey, label, disabled }: { productKey: "pack_25" | "pack_100"; label: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={disabled || busy}
        className={secondaryClass("cursor-pointer bg-transparent")}
        onClick={async () => {
          setBusy(true);
          setError(null);
          track("checkout_started", { product_key: productKey });
          const r = await startCheckout(productKey);
          if (r.status === 200 && r.url) return window.location.assign(r.url);
          setBusy(false);
          setError(r.message ?? "Checkout could not start.");
        }}
      >
        {busy ? "Opening…" : label}
      </button>
      {error ? <span role="alert" className="max-w-[260px] text-right text-[13px] text-danger">{error}</span> : null}
    </div>
  );
}

export function RefundButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  if (state === "done") return <span className="text-[13px] text-g1">{message}</span>;
  if (state === "idle") {
    return <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-[13px] text-muted-foreground underline underline-offset-2 hover:text-fg" onClick={() => setState("confirm")}>Request refund</button>;
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">Refund this order?</span>
      <button
        type="button"
        disabled={state === "busy"}
        className="cursor-pointer rounded-md border border-danger/60 bg-transparent px-2 py-1 text-danger"
        onClick={async () => {
          setState("busy");
          const res = await fetch("/api/billing/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId }) });
          const json = (await res.json().catch(() => ({}))) as { message?: string };
          setMessage(json.message ?? (res.ok ? "Refund requested." : "Could not start the refund. Email us."));
          setState(res.ok ? "done" : "confirm");
        }}
      >
        {state === "busy" ? "Requesting…" : "Yes, refund"}
      </button>
      <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground" onClick={() => setState("idle")}>Cancel</button>
      {message && state !== "busy" ? <span role="alert" className="text-danger">{message}</span> : null}
    </span>
  );
}
