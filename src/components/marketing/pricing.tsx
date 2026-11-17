"use client";

import Link from "next/link";
import { useRef } from "react";
import { CtaLink, Eyebrow, LiveDot } from "@/components/brand/primitives";
import { usd0, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice, formatClosesAt, heatFor } from "@/lib/ladder";
import { COMPETITORS, COMPETITOR_PRICES_DATE, CREDIT_COST, FAIR_USE, PACKS, REFUND_DAYS } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
import { BUY_HREF, useOffer, useOfferWatch } from "./offer-context";

const INCLUDED = [
  "AI Visibility Tracker: unlimited businesses, prompts and schedules, grids up to 5×5",
  "Maps Grid Tracker up to 9×9",
  "Unlimited scans on your own keys (no caps from us)",
  "Local AI Audit + Fix Kit",
  "Prospect Reports with white-label links and PDFs",
  "REST API + MCP server",
  "Every future update to these features",
];

const heatColor = { calm: "text-muted-foreground", warm: "text-orange", hot: "text-danger" } as const;

/** 9.11 Pricing. All numbers come from the live offer (database), never from this file. */
export function Pricing({ scenarioYearUsd }: { scenarioYearUsd: number }) {
  const ref = useRef<HTMLElement>(null);
  useOfferWatch(ref);
  const { offer } = useOffer();

  return (
    <section id="pricing" ref={ref} className="container-page flex flex-col items-center gap-6 pt-[var(--rb-section-y)] pb-[clamp(56px,7vw,88px)]">
      <Eyebrow>Lifetime deal</Eyebrow>
      {offer ? (
        <h2 className="text-h2 m-0 max-w-[860px] text-center">
          {fmtPrice(offer.currentPriceUsd)} once. The price goes up {fmtPrice(offer.stepUsd)} every {offer.seatsPerStep} sales.
        </h2>
      ) : (
        <h2 className="text-h2 m-0 max-w-[860px] text-center">Pay once. The price goes up with every few sales.</h2>
      )}
      <p className="m-0 max-w-[760px] text-center text-[15px] leading-normal text-muted-foreground">
        {offer
          ? `The lifetime deal closes on ${formatClosesAt(offer.closesAt)}. After that, RankbyAI moves to a monthly plan.`
          : "The live price is unavailable right now. Refresh in a moment."}
      </p>

      <div className="mt-8 flex w-full flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-[22px] rounded-[22px] border-2 border-border-heavy bg-bg-alt p-[clamp(22px,3.5vw,44px)] shadow-price">
          {offer ? <PriceCard /> : <p className="m-0 text-[17px] text-muted-foreground">We could not load the live price. Nothing is charged until you see a price here.</p>}
          <div className="flex flex-col gap-[6px] rounded-[14px] border border-border-strong bg-surface px-5 py-[18px]">
            <span className="text-[16px] font-semibold">{REFUND_DAYS}-day refund, no questions.</span>
            <span className="text-[15px] leading-normal text-muted-foreground">
              Run real scans on real clients. If it isn&apos;t for you, email us within {REFUND_DAYS} days for a full refund. Fees you paid your API
              providers go to them, not us, so we can&apos;t refund those.
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-6">
          <div className="flex flex-col gap-4 rounded-[22px] border border-border bg-bg-alt p-[clamp(22px,3vw,40px)]">
            <span className="text-[20px] font-semibold">Everything included</span>
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {INCLUDED.map((t) => (
                <li key={t} className="flex gap-[14px] text-[16px] leading-normal"><span aria-hidden className="text-muted-foreground">✓</span><span>{t}</span></li>
              ))}
            </ul>
            <span className="text-[13px] leading-normal text-dim">
              Fair-use limits, published and never reduced for buyers: {FAIR_USE.businesses.toLocaleString("en-US")} businesses,{" "}
              {FAIR_USE.scheduledQueries.toLocaleString("en-US")} scheduled queries, {FAIR_USE.apiKeys} API keys.
            </span>
          </div>

          <div className="flex flex-col gap-[14px] rounded-[22px] border border-border bg-bg-alt p-[clamp(22px,3vw,40px)]">
            <span className="text-[20px] font-semibold">The math</span>
            <div className="flex justify-between gap-4 border-b border-border pb-[14px] text-[16px]">
              <span className="text-muted-foreground">
                A typical monthly local SEO plan with AI visibility: {COMPETITORS.brightlocal.name} {COMPETITORS.brightlocal.plan} ({COMPETITOR_PRICES_DATE})
              </span>
              <span className="font-mono font-semibold whitespace-nowrap">{usdSmart(COMPETITORS.brightlocal.yearUsd)} <span className="font-normal text-dim">/yr</span></span>
            </div>
            <div className="flex justify-between gap-4 border-b border-border pb-[14px] text-[16px]">
              <span className="text-muted-foreground">RankbyAI: once, plus data on your own keys for the same scenario [estimate]</span>
              <span className="font-mono font-semibold whitespace-nowrap">
                {offer ? `${fmtPrice(offer.currentPriceUsd)} + ` : ""}≈ {usd0(scenarioYearUsd)} <span className="font-normal text-dim">/yr</span>
              </span>
            </div>
            <span className="text-[14px] leading-[1.55] text-dim">
              Scenario: 10 clients, 3 prompts each, a monthly 3×3 AI grid on 3 engines plus a monthly 7×7 Maps grid.{" "}
              <Link href="#compare" className="text-muted-foreground underline underline-offset-[3px]">See the full comparison</Link>
            </span>
          </div>
        </div>
      </div>

      <div id="packs" className="mt-2 flex w-full flex-col gap-4 rounded-[22px] border border-border bg-bg-alt p-[clamp(22px,3vw,40px)]">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-[20px] font-semibold">Included scans (no keys needed)</span>
          <span className="text-[14px] text-dim">Optional. Requires lifetime access.</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {Object.values(PACKS).map((p) => (
            <div key={p.label} className="flex items-baseline justify-between rounded-2xl border border-border bg-surface px-5 py-4">
              <span className="text-[17px] font-medium">{p.label} <span className="text-dim">· {p.credits} credits</span></span>
              <span className="font-mono text-[20px] font-semibold">${p.priceCents / 100}</span>
            </div>
          ))}
        </div>
        <span className="text-[14px] leading-[1.55] text-muted-foreground">
          1 scan credit = one 3×3 AI grid on 3 engines, one Maps grid up to 9×9, or one audit. A prospect report uses {CREDIT_COST.prospect_report}. A
          5×5 AI grid uses {CREDIT_COST.ai_grid_5}. Credits never expire.
        </span>
      </div>
    </section>
  );
}

function PriceCard() {
  const { offer } = useOffer();
  if (!offer) return null;
  const left = offer.seatsLeftAtCurrentPrice;
  const heat = heatFor(left);
  const price = offer.currentPriceUsd;
  const step = offer.stepUsd;

  if (!offer.open) {
    return (
      <div className="flex flex-col gap-3">
        <span className="text-[28px] font-semibold tracking-[-0.03em]">The lifetime deal has closed.</span>
        <span className="text-[16px] text-muted-foreground">It closed on {formatClosesAt(offer.closesAt)}.</span>
      </div>
    );
  }

  // Ladder: two tiers already gone (if any), now, and the next four.
  const ladder = [-2, -1, 0, 1, 2, 3, 4]
    .map((k) => ({ k, usd: price + k * step }))
    .filter((t) => t.usd >= offer.basePriceUsd);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-[10px]">
          <span className="text-price">{fmtPrice(price)}</span>
          <span className="text-[20px] text-muted-foreground">one-time</span>
        </div>
        <span className="text-[17px] text-muted-foreground">
          Next: <span className={cn("font-semibold", heatColor[heat])}>{fmtPrice(offer.nextPriceUsd)}</span>
        </span>
      </div>

      <div className="flex gap-2" role="img" aria-label={`${left} of ${offer.seatsPerStep} seats left at ${fmtPrice(price)}`}>
        {Array.from({ length: offer.seatsPerStep }, (_, i) => {
          const sold = i < offer.seatsPerStep - left;
          return (
            <span
              key={i}
              className={cn("h-[14px] flex-1 rounded-full border", sold ? "border-[#4a4a4a] bg-border-heavy" : "border-danger bg-danger-fill")}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-[10px] text-[17px]">
        <LiveDot className="size-[9px]" />
        <span>
          <span className="font-mono font-semibold text-danger">{left} of {offer.seatsPerStep}</span> left at{" "}
          <span className="font-semibold">{fmtPrice(price)}</span>
          {left === 1 ? <span className="text-muted-foreground"> · last seat at this price</span> : null}
        </span>
      </div>

      <span className="text-[15px] text-muted-foreground">
        You save {fmtPrice(step)} vs the next tier and {fmtPrice(step * 4)} vs buyers four tiers from now.
      </span>

      <div
        className="grid items-end gap-2 rounded-2xl border border-border bg-inset px-4 pt-5 pb-[14px]"
        style={{ gridTemplateColumns: `repeat(${ladder.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Price ladder: now ${fmtPrice(price)}, then ${ladder.filter((t) => t.k > 0).map((t) => fmtPrice(t.usd)).join(", ")}`}
      >
        {ladder.map(({ k, usd }) => (
          <div key={k} className="flex flex-col items-center gap-2">
            <span className={cn("font-mono text-[13px] font-medium", k === 0 ? "text-fg" : "text-dim", k < 0 && "line-through")}>{fmtPrice(usd)}</span>
            <span
              className={cn(
                "box-border w-full rounded-t-lg border-b-0",
                k < 0 ? "border border-dashed border-border-heavy bg-transparent" : k === 0 ? "border-2 border-fg bg-border-heavy" : "border border-[#2a2a2a] bg-[#1a1a1a]",
              )}
              style={{ height: 36 + (k + 2) * 12 }}
            />
            <span className={cn("text-[11px] font-medium tracking-[0.04em]", k === 0 ? "text-danger" : "text-dim")}>
              {k < 0 ? "GONE" : k === 0 ? "NOW" : k === 1 ? "NEXT" : "LATER"}
            </span>
          </div>
        ))}
      </div>

      <CtaLink href={BUY_HREF} size="block">Lock in {fmtPrice(price)} now</CtaLink>
      <span className="text-center text-[14px] text-dim">
        Price is set by the sales counter, not a timer. When {left === 1 ? "this one goes" : `these ${left} go`}, it&apos;s {fmtPrice(offer.nextPriceUsd)}.
        {offer.paidTotal > 0 ? ` ${offer.paidTotal} sold so far.` : ""}
      </span>
    </>
  );
}
