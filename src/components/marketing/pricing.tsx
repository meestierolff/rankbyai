"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { usd0, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice, formatClosesAt, heatFor } from "@/lib/ladder";
import { COMPETITORS, COMPETITOR_PRICES_DATE, CREDIT_COST, FAIR_USE, PACKS, REFUND_DAYS, SCENARIO } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
import { Bezel, CreamLink } from "./lp";
import { BUY_HREF, useOffer, useOfferWatch, type LiveOffer } from "./offer-context";

const INCLUDED = [
  "AI Visibility Tracker: unlimited businesses, prompts and schedules, grids up to 5×5",
  "Maps Grid Tracker up to 9×9",
  "Unlimited scans on your own keys (no caps from us)",
  "Local AI Audit + Fix Kit",
  "Prospect Reports with white-label links and PDFs",
  "REST API + MCP server",
  "Every future update to these features",
];

/** Colour of the next price: it warms up as the last seats of a tier go (2 left, then 1 left). */
const heatColor = { calm: "text-lp-fg", warm: "text-lp-accent-soft", hot: "text-lp-accent-text" } as const;

const cardPad = "p-[clamp(20px,4vw,32px)]";

/**
 * 9.11 Pricing. All numbers come from the live offer (database), never from this file.
 * Three states everywhere: the offer is unavailable (no price), the deal is closed, the deal is open.
 * `packsOpen` says whether scan packs can be bought in this deployment (lib/availability, server side).
 */
export function Pricing({ scenarioYearUsd, packsOpen = false }: { scenarioYearUsd: number; packsOpen?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useOfferWatch(ref);
  const { offer } = useOffer();
  const live = offer?.open ? offer : null;
  const closed = offer && !offer.open ? offer : null;
  const plan = COMPETITORS.brightlocal;

  return (
    <section id="pricing" ref={ref} className="relative overflow-x-clip py-[140px] text-lp-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[260px] left-1/2 h-[900px] w-[1300px] -translate-x-1/2"
        style={{ background: "radial-gradient(closest-side, rgba(255,110,30,0.11), rgba(255,110,30,0) 100%)" }}
      />

      <div className="container-lp relative text-center">
        {closed ? (
          <h2 className="font-display m-0 text-[clamp(36px,6vw,64px)] leading-none font-extrabold tracking-[-0.03em] text-balance">
            The lifetime deal has closed.
          </h2>
        ) : (
          <h2 className="font-display m-0 text-[clamp(56px,10vw,120px)] leading-[0.95] font-extrabold tracking-[-0.03em]">
            {live ? `${fmtPrice(live.currentPriceUsd)} once.` : "Pay once."}
          </h2>
        )}
        {closed ? null : (
          <p className="mt-[22px] mb-0 text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.03em]">
            {live
              ? `The price goes up ${fmtPrice(live.stepUsd)} every ${live.seatsPerStep} sales.`
              : "The price goes up with every few sales."}
          </p>
        )}
        <p className="mx-auto mt-4 mb-0 max-w-[560px] text-[16.5px] leading-[1.6] text-lp-muted">
          {live
            ? `The lifetime deal closes on ${formatClosesAt(live.closesAt)}. After that, RankbyAI moves to a monthly plan.`
            : closed
              ? `It closed on ${formatClosesAt(closed.closesAt)}. After that date, RankbyAI moves to a monthly plan.`
              : "The live price is unavailable right now. Refresh in a moment."}
        </p>
      </div>

      <div className="container-lp relative mt-14">
        <Bezel warm large innerClassName="grid grid-cols-1 bg-[#0b0b0b] min-[750px]:grid-cols-2">
          <div className={cn("min-w-0", cardPad)}>
            <Kicker>Lifetime access</Kicker>
            {live ? (
              <PriceCard offer={live} />
            ) : closed ? (
              <>
                <p className="mt-[14px] mb-0 text-[22px] leading-[1.2] font-semibold tracking-[-0.03em]">The lifetime deal has closed.</p>
                <p className="mt-2 mb-0 text-[14.5px] leading-[1.6] text-lp-muted">It closed on {formatClosesAt(closed.closesAt)}.</p>
              </>
            ) : (
              <p className="mt-[14px] mb-0 text-[15px] leading-[1.6] text-lp-muted">
                We could not load the live price. Nothing is charged until you see a price here.
              </p>
            )}
          </div>

          <div className={cn("min-w-0 border-t border-lp-line bg-lp-surface min-[750px]:border-t-0 min-[750px]:border-l", cardPad)}>
            <Kicker>Everything included</Kicker>
            <ul className="m-0 mt-[18px] flex list-none flex-col gap-[11px] p-0 text-[14.5px] leading-[1.5] text-lp-fg-2">
              {INCLUDED.map((t) => (
                <li key={t} className="flex gap-[10px]">
                  <span aria-hidden className="text-lp-accent-text">✓</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 mb-0 text-[12.5px] leading-[1.6] text-lp-dim">
              Fair-use limits, published and never reduced for buyers: {FAIR_USE.businesses.toLocaleString("en-US")} businesses,{" "}
              {FAIR_USE.scheduledQueries.toLocaleString("en-US")} scheduled queries, {FAIR_USE.apiKeys} API keys.
            </p>
            <div className="mt-[22px] border-t border-lp-line-2 pt-5">
              <p className="m-0 text-[15px] font-medium">{REFUND_DAYS}-day refund, no questions.</p>
              <p className="mt-[6px] mb-0 text-[13.5px] leading-[1.6] text-lp-muted">
                Run real scans on real clients. If it isn&apos;t for you, email us within {REFUND_DAYS} days for a full refund. Fees you paid your API
                providers go to them, not us, so we can&apos;t refund those.
              </p>
            </div>
          </div>
        </Bezel>
      </div>

      {/* The math: the published comparison scenario, one competitor plan next to us. */}
      <div className="container-lp relative mt-7">
        <div className="rounded-2xl border border-lp-line-2 p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[15px] font-medium">The math</span>
            <Link href="#compare" className="text-[13px] text-lp-muted underline underline-offset-[3px] transition-colors hover:text-lp-fg">
              See the full comparison
            </Link>
          </div>
          <p className="mt-[6px] mb-0 text-[13px] leading-[1.55] text-lp-muted">{SCENARIO.headline}</p>
          <dl className="m-0 mt-4 text-[13.5px] leading-[1.5]">
            <div className="flex justify-between gap-4 border-t border-lp-line py-3">
              <dt className="text-lp-muted">
                {plan.name} {plan.plan} <span className="text-lp-dim">(price from {COMPETITOR_PRICES_DATE})</span>
              </dt>
              <dd className="m-0 font-mono whitespace-nowrap">
                {usdSmart(plan.yearUsd)} <span className="text-lp-dim">/yr</span>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-lp-line pt-3">
              <dt className="text-lp-muted">
                {live ? "RankbyAI: once, plus data on your own keys" : "RankbyAI: data on your own keys"} <span className="text-lp-dim">[estimate]</span>
              </dt>
              <dd className="m-0 font-mono whitespace-nowrap text-lp-accent-text">
                {live ? `${fmtPrice(live.currentPriceUsd)} once + ` : ""}≈ {usd0(scenarioYearUsd)} <span className="text-lp-dim">/yr</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div id="packs" className="container-lp relative mt-3">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
          <div className="rounded-2xl border border-lp-line-2 p-[22px]">
            <p className="m-0 text-[15px] font-medium">Included scans</p>
            <p className="mt-[6px] mb-0 text-[13px] leading-[1.55] text-lp-muted">
              No keys needed. Optional, requires lifetime access. Credits never expire.
            </p>
            {packsOpen ? null : (
              <p role="note" className="mt-[10px] mb-0 text-[13px] leading-[1.55] text-lp-fg-2">
                Scan packs are not open yet. Scans on your own API keys work today.
              </p>
            )}
          </div>
          {Object.values(PACKS).map((p) => (
            <div key={p.label} className="flex items-center justify-between gap-3 rounded-2xl border border-lp-line-2 p-[22px]">
              <div>
                <p className="m-0 text-[15px] font-medium">{p.label}</p>
                <p className="mt-1 mb-0 text-[13px] text-lp-muted">{p.credits} credits</p>
              </div>
              <div className="flex flex-col items-end gap-[6px]">
                <span className={cn("font-display text-[26px] leading-none font-bold", !packsOpen && "text-lp-muted")}>{fmtPrice(p.priceCents / 100)}</span>
                {packsOpen ? null : (
                  <span className="rounded-[5px] border border-lp-border-2 px-[6px] py-[2px] font-mono text-[10.5px] tracking-[0.06em] whitespace-nowrap text-lp-dim uppercase">
                    Not open yet
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 mb-0 text-[12.5px] leading-[1.6] text-lp-dim">
          1 scan credit = one 3×3 AI grid on 3 engines, one Maps grid up to 9×9, or one audit. A prospect report uses {CREDIT_COST.prospect_report}. A
          5×5 AI grid uses {CREDIT_COST.ai_grid_5}.
        </p>
      </div>
    </section>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="m-0 font-mono text-[11px] leading-[1.5] tracking-[0.14em] text-lp-dim uppercase">{children}</p>;
}

/** Left column while the deal is open: price, seat counter, ladder, call to action. */
function PriceCard({ offer }: { offer: LiveOffer }) {
  const left = offer.seatsLeftAtCurrentPrice;
  const seats = offer.seatsPerStep;
  const price = fmtPrice(offer.currentPriceUsd);
  const next = fmtPrice(offer.nextPriceUsd);
  const step = offer.stepUsd;
  const heat = heatFor(left);
  // Ladder: the current tier and the tiers after it, straight from the live offer.
  const tiers = [offer.currentPriceUsd, ...offer.upcoming.map((t) => t.priceUsd)];

  return (
    <>
      <div className="mt-[14px] flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[64px] leading-none font-extrabold tracking-[-0.03em]">{price}</span>
        <span className="text-[15px] text-lp-muted">one-time</span>
        <span className="ml-auto text-[14px] text-lp-muted">
          Next: <span className={heatColor[heat]}>{next}</span>
        </span>
      </div>

      <div className="mt-[26px] flex justify-between gap-3 text-[13px] text-[#bdbdbd]">
        <span>
          {left} of {seats} left at {price}
          {left === 1 ? " · last seat at this price" : ""}
        </span>
        <span className="shrink-0 font-mono text-lp-faint">sales counter</span>
      </div>
      <div
        className="mt-2 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${seats}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`${left} of ${seats} seats left at ${price}`}
      >
        {Array.from({ length: seats }, (_, i) => (
          <span key={i} className={cn("h-[6px] rounded-[3px]", i < seats - left ? "bg-[#232323]" : "bg-lp-accent")} />
        ))}
      </div>

      <div
        className="mt-6 grid gap-[6px]"
        style={{ gridTemplateColumns: `repeat(${tiers.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Price ladder: now ${price}, then ${tiers.slice(1).map(fmtPrice).join(", ")}`}
      >
        {tiers.map((usd, i) => (
          <div
            key={usd}
            className={cn(
              "rounded-[10px] border px-1 py-[10px] text-center",
              i === 0 ? "border-[rgba(255,122,26,0.55)] bg-[rgba(255,122,26,0.1)]" : i === 1 ? "border-[#2a2a2a]" : "border-lp-line-2",
            )}
          >
            <div className={cn("text-[clamp(13px,3.6vw,16px)] font-semibold", i === 0 ? "text-lp-fg" : i === 1 ? "text-lp-fg-2" : "text-lp-dim")}>
              {fmtPrice(usd)}
            </div>
            <div className={cn("mt-[3px] font-mono text-[9.5px] tracking-[0.1em]", i === 0 ? "text-[#ff9a52]" : i === 1 ? "text-lp-dim" : "text-lp-faint")}>
              {i === 0 ? "NOW" : i === 1 ? "NEXT" : "LATER"}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 mb-0 text-[13.5px] leading-[1.55] text-lp-muted">
        You save {fmtPrice(step)} vs the next tier and {fmtPrice(step * 4)} vs buyers four tiers from now.
      </p>

      <CreamLink href={BUY_HREF} size="block" className="mt-6 px-5 py-[15px] text-[16.5px] font-medium">
        Lock in {price} now
      </CreamLink>
      <p className="mt-3 mb-0 text-center text-[12.5px] leading-[1.55] text-lp-dim">
        Price is set by the sales counter, not a timer. When {left === 1 ? "this one goes" : `these ${left} go`}, it&apos;s {next}.
        {offer.paidTotal > 0 ? ` ${offer.paidTotal} sold so far.` : ""}
      </p>
    </>
  );
}
