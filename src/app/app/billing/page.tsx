import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState, PageHeader, Panel, StatTile, StatusChip, fmtDate, fmtUsd } from "@/components/app/ui";
import { LiveDot } from "@/components/brand/primitives";
import { checkoutOpen } from "@/lib/availability";
import { requireSession } from "@/lib/auth";
import { fmtPrice, formatClosesAt } from "@/lib/ladder";
import { fetchOfferFresh } from "@/lib/offer";
import { CREDIT_COST, PACKS, REFUND_DAYS } from "@/lib/pricing-constants";
import { getCreditBalance, getOrders } from "@/lib/workspace-data";
import { BuyLifetimeButton, BuyPackButton, RefundButton } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

const PRODUCT_LABEL = { lifetime: "Lifetime access", pack_25: "Pack 25 (25 credits)", pack_100: "Pack 100 (100 credits)" } as const;

export default async function BillingPage() {
  const ctx = await requireSession("/app/billing");
  const ws = ctx.workspace;
  const [offerResult, orders, credits] = await Promise.all([fetchOfferFresh(), getOrders(ws.id), getCreditBalance(ws.id)]);
  const lifetime = ws.plan === "lifetime";
  const offer = offerResult.available ? offerResult.offer : null;

  return (
    <>
      <PageHeader title="Billing" description="One payment for the software. API usage is billed to you by your own vendors, or comes out of included scan credits." />

      {!checkoutOpen() ? (
        <div role="note" className="mb-5 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] text-muted-foreground">
          Checkout is not open yet, so nothing can be bought or charged today. The price shown is the live price.
        </div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <StatTile label="Plan" value={lifetime ? "Lifetime" : "Not purchased"} tone={lifetime ? "good" : undefined} hint={lifetime ? `Seat #${ws.lifetime_seat ?? "—"}` : "Look around with sample data"} />
        <StatTile label="Included scan credits" value={credits} hint="Never expire" />
        <StatTile label="Refund window" value={`${REFUND_DAYS} days`} hint="No questions. From the purchase date." />
      </div>

      {!lifetime ? (
        <Panel title="Lifetime access" className="mt-6">
          {!offer ? (
            <ErrorState title="Live price unavailable" body="We could not load the current price, so checkout is paused. Refresh in a moment. Nothing is charged until you see a price." />
          ) : !offer.open ? (
            <p className="m-0 text-[15px] text-muted-foreground">The lifetime deal closed on {formatClosesAt(offer.closesAt)}.</p>
          ) : (
            <div className="flex flex-wrap items-start gap-8">
              <div className="flex min-w-[260px] flex-1 flex-col gap-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-[56px] leading-none font-semibold tracking-[-0.05em]">{fmtPrice(offer.currentPriceUsd)}</span>
                  <span className="text-[17px] text-muted-foreground">one-time, plus tax where it applies</span>
                </div>
                <div className="flex items-center gap-[10px] text-[15px]">
                  <LiveDot />
                  <span>
                    <span className="font-mono font-semibold text-danger">{offer.seatsLeftAtCurrentPrice} of {offer.seatsPerStep}</span> left at {fmtPrice(offer.currentPriceUsd)}, then {fmtPrice(offer.nextPriceUsd)}
                  </span>
                </div>
                <p className="m-0 text-[14px] leading-normal text-dim">
                  The sales counter sets the price, not a timer. The deal closes on {formatClosesAt(offer.closesAt)}. Your price is the one shown when checkout starts.
                </p>
              </div>
              <div className="flex w-full max-w-[380px] flex-col gap-3">
                <BuyLifetimeButton offer={offer} />
                <p className="m-0 text-[13px] leading-normal text-dim">
                  Secure checkout by Stripe. {REFUND_DAYS}-day refund, no questions. See the <Link href="/refunds" className="underline underline-offset-2">refund policy</Link> and <Link href="/terms" className="underline underline-offset-2">terms</Link>.
                </p>
              </div>
            </div>
          )}
        </Panel>
      ) : null}

      <Panel title="Included scans (no keys needed)" className="mt-6">
        <div className="flex flex-col gap-4">
          {(Object.keys(PACKS) as (keyof typeof PACKS)[]).map((key) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4 last:border-b-0 last:pb-0">
              <span className="flex flex-col">
                <span className="text-[15px] font-medium">{PACKS[key].label} · {PACKS[key].credits} credits</span>
                <span className="text-[13px] text-dim">${PACKS[key].priceCents / 100} one-time, plus tax where it applies</span>
              </span>
              <BuyPackButton productKey={key} label={`Buy for $${PACKS[key].priceCents / 100}`} disabled={!lifetime} />
            </div>
          ))}
          <p className="m-0 text-[13px] leading-normal text-dim">
            1 credit = one 3×3 AI grid on 3 engines, one Maps grid up to 9×9, or one audit. A prospect report uses {CREDIT_COST.prospect_report}; a 5×5 AI grid uses {CREDIT_COST.ai_grid_5}.
            {lifetime ? "" : " Packs require lifetime access."}
          </p>
        </div>
      </Panel>

      <Panel title="Orders" className="mt-6">
        {orders.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {orders.map((o) => {
              const refundable = o.refundable && ctx.role === "owner";
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-medium">{PRODUCT_LABEL[o.product_key]}{o.ladder_seat ? ` · seat #${o.ladder_seat}` : ""}</span>
                    <span className="text-[13px] text-dim">{fmtDate(o.created_at)} · {fmtUsd(o.amount_cents / 100)}{o.tax_cents ? ` + ${fmtUsd(o.tax_cents / 100)} tax` : ""}</span>
                  </span>
                  <span className="flex items-center gap-4">
                    {refundable ? <RefundButton orderId={o.id} /> : null}
                    <StatusChip tone={o.status === "paid" ? "good" : "warn"}>{o.status.replace("_", " ")}</StatusChip>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
