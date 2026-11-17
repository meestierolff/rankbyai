"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ctaClass } from "@/components/brand/primitives";
import { track } from "@/lib/analytics";

interface Order { product_key: string; ladder_seat: number | null; amount_cents: number }

/** Polls until the Stripe webhook has written the order. Access is granted by the webhook only. */
export function ThanksClient() {
  const [order, setOrder] = useState<Order | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      const t = setTimeout(() => setSlow(true), 0);
      return () => clearTimeout(t);
    }
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      tries++;
      try {
        const res = await fetch(`/api/orders/status?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const json = (await res.json()) as { ready: boolean; order?: Order };
        if (json.ready && json.order) {
          setOrder(json.order);
          track("purchase_completed", { product_key: json.order.product_key, amount_cents: json.order.amount_cents, seat: json.order.ladder_seat });
          return;
        }
      } catch {}
      if (tries > 20) setSlow(true);
      if (tries < 90) setTimeout(tick, 2000);
    };
    void tick();
    return () => { stop = true; };
  }, []);

  if (order) {
    const lifetime = order.product_key === "lifetime";
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-start gap-5 pt-10">
        <span className="font-mono text-[13px] text-g1">Payment confirmed</span>
        <h1 className="m-0 text-[40px] leading-[1.05] font-semibold tracking-[-0.04em]">
          {lifetime ? `You're in. Lifetime seat #${order.ladder_seat}.` : "Your scan credits are ready."}
        </h1>
        <p className="m-0 text-[16px] leading-normal text-muted-foreground">
          {lifetime ? "Next: add your API keys, add a business, and run your first AI check. A receipt is on its way by email." : "Credits never expire. Use them for AI grids, Maps grids, audits and prospect reports."}
        </p>
        <a href={lifetime ? "/app/settings/keys" : "/app"} className={ctaClass("md")}><span>{lifetime ? "Add your API keys" : "Open the dashboard"}</span><span aria-hidden>→</span></a>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-[560px] flex-col items-start gap-4 pt-10" aria-live="polite">
      <h1 className="m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.03em]">Confirming your payment…</h1>
      <p className="m-0 text-[16px] leading-normal text-muted-foreground">This usually takes a few seconds. Keep this page open.</p>
      {slow ? (
        <p className="m-0 text-[14px] leading-normal text-dim">
          Taking longer than usual. If you paid, your access will appear on the <Link href="/app/billing" className="underline underline-offset-2">Billing page</Link> shortly; if it does not, email us and we will sort it out.
        </p>
      ) : null}
    </div>
  );
}
