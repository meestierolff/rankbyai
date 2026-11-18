"use client";

import type { ReactNode } from "react";
import { usd0, usd2, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice } from "@/lib/ladder";
import { COMPETITOR_PRICES_DATE, COMPETITORS, LOCAL_FALCON_STARTER_CREDITS_PER_YEAR, SCENARIO } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
import { Bezel } from "./lp";
import { useOffer } from "./offer-context";

/** "from $10/mo (grids only)" → "from $10/mo": the price part of a label in COMPETITORS. */
const priceOnly = (label: string) => label.split(" (")[0];

const OURS = "bg-[rgba(255,122,26,0.07)]";

/**
 * 9.12 Compare. ONLY the verified figures from the brief, with the date: every competitor price
 * is read from COMPETITORS. Never claim to be first or only.
 */
export function Compare({ scenarioYearUsd }: { scenarioYearUsd: number }) {
  const { offer } = useOffer();
  const live = offer?.open ? offer : null;
  const price = live ? fmtPrice(live.currentPriceUsd) : "the lifetime price";
  const data = usd0(scenarioYearUsd);
  const { localfalcon: lf, brightlocal: bl, whitespark: ws, semrush: sr } = COMPETITORS;

  const rows: { label: string; cells: [ReactNode, ReactNode, ReactNode, ReactNode, ReactNode] }[] = [
    { label: "Plan used", cells: [`Lifetime (${price}) + your keys`, lf.plan, bl.plan, ws.plan, sr.plan] },
    {
      label: "Year 1",
      cells: [
        <span key="ours" className="font-semibold">
          {live ? `${price} + ` : ""}≈ {data} data <span className="font-normal text-lp-muted">[estimate]</span>
        </span>,
        `${usdSmart(lf.yearUsd)} (${LOCAL_FALCON_STARTER_CREDITS_PER_YEAR.toLocaleString("en-US")} credits/yr)`,
        usdSmart(bl.yearUsd),
        ws.yearLabel,
        `${priceOnly(sr.yearLabel)} (see note)`,
      ],
    },
    { label: "Monthly equivalent", cells: ["none", lf.monthlyEquivalent, bl.monthlyEquivalent, priceOnly(ws.yearLabel), priceOnly(sr.yearLabel)] },
    {
      label: "AI visibility",
      cells: [
        "3 engines per grid point, on your keys",
        "Yes. AI scans use the same credits (per-point AI credit rate not shown on its pricing page)",
        "“Local AI Visibility Tracker” included in Track",
        "Not listed on its pricing page",
        "Not recorded (price only)",
      ],
    },
    {
      label: "Credits",
      cells: [
        "None. You pay API cost",
        `Expire at the end of each billing cycle; extra credits ${usd2(COMPETITORS.localfalcon.extraCreditUsd)} each`,
        "Plan allowance (geo-grid up to 5 keywords in Track)",
        "Plan-based",
        "Not recorded (price only)",
      ],
    },
    {
      label: "Prospect reports in bulk",
      cells: ["Included", "“Sales Enablement” tool (1 credit per lead lookup)", "—", "—", "Not recorded (price only)"],
    },
  ];
  const heads = [
    { name: "RankbyAI", sub: "Pay once + your API keys" },
    { name: lf.name, sub: "Geo-grid with AI scans" },
    { name: bl.name, sub: "Track plan" },
    { name: ws.name, sub: ws.plan },
    { name: sr.name, sub: sr.plan },
  ];

  return (
    <section id="compare" className="pt-[130px] text-lp-fg">
      <div className="container-lp text-center">
        <h2 className="m-0 text-[clamp(36px,5vw,60px)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">
          The same kind of grid, without the subscription.
        </h2>
        <p className="mx-auto mt-[22px] mb-0 max-w-[620px] text-[17px] leading-[1.6] text-lp-muted">
          We&apos;re not the only AI visibility tracker, and won&apos;t pretend to be. Local Falcon and BrightLocal already offer AI visibility on a
          grid. The difference is how you pay.
        </p>
      </div>

      <div className="container-lp-wide mt-12">
        <Bezel className="rounded-[22px] p-2" innerClassName="rounded-[15px]">
          {/* The table scrolls sideways inside its frame on a narrow screen; the page never does. */}
          <div className="overflow-x-auto focus-visible:-outline-offset-2" tabIndex={0} role="region" aria-label="Comparison table">
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-[13.5px] leading-[1.5] text-lp-muted">
              <caption className="caption-top border-b border-lp-line px-4 py-[14px] text-left text-[13px] text-lp-muted">
                <span className="text-lp-fg-2">Scenario:</span> {SCENARIO.description}
              </caption>
              <colgroup>
                <col className="w-[150px]" />
                {heads.map((h) => (
                  <col key={h.name} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <td className="p-4" />
                  {heads.map((h, i) => (
                    <th key={h.name} scope="col" className={cn("p-4 align-top font-normal", i === 0 && OURS)}>
                      <span className={cn("block text-[15px]", i === 0 ? "font-semibold text-lp-fg" : "font-medium text-lp-fg-2")}>{h.name}</span>
                      <span className={cn("mt-[2px] block text-[12px]", i === 0 && "text-lp-accent-soft")}>{h.sub}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-lp-line">
                    <th scope="row" className="px-4 py-[14px] align-top font-normal text-lp-fg-2">
                      {r.label}
                    </th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={cn("px-4 py-[14px] align-top", i === 0 && `${OURS} text-lp-fg`)}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bezel>
      </div>

      <div className="container-lp-wide mt-4">
        <p className="m-0 text-[12px] leading-[1.65] text-lp-dim">
          Competitor prices are from their public pricing pages on {COMPETITOR_PRICES_DATE} ({lf.source}, {bl.source}, {ws.source}) and may change.{" "}
          {sr.name} {sr.plan} is listed at {priceOnly(sr.yearLabel)} as verified by the operator on {COMPETITOR_PRICES_DATE} (currency as given);
          other {sr.name} cells are marked not recorded because only that monthly price was verified. Their plans include features we don&apos;t
          (e.g. citation building, Apple Maps, reputation tools). RankbyAI data costs are our estimate from the vendors&apos; published API prices
          on the same date. {SCENARIO.coverage} Trademarks belong to their owners; we&apos;re not affiliated.
        </p>
      </div>
    </section>
  );
}
