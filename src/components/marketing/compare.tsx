"use client";

import { Eyebrow } from "@/components/brand/primitives";
import { usd0 } from "@/lib/cost/estimate";
import { fmtPrice } from "@/lib/ladder";
import { COMPETITOR_PRICES_DATE, SCENARIO } from "@/lib/pricing-constants";
import { useOffer } from "./offer-context";

/** 9.12 Compare. ONLY the verified figures from the brief, with the date. Never claim to be first or only. */
export function Compare({ scenarioYearUsd }: { scenarioYearUsd: number }) {
  const { offer } = useOffer();
  const price = offer ? fmtPrice(offer.currentPriceUsd) : "the lifetime price";
  const data = usd0(scenarioYearUsd);
  const rows: { label: string; cells: [string, string, string, string, string] }[] = [
    {
      label: "Plan used",
      cells: [`Lifetime (${price}) + your keys`, "Starter, billed yearly", "Track, 6–10 locations, billed yearly", "Local Ranking Grids", "Map Rank Tracker"],
    },
    {
      label: "Year 1",
      cells: [`${offer ? price + " + " : ""}≈ ${data} data [estimate]`, "$299.88 (90,000 credits/yr)", "$747", "from $10/mo (grids only)", "€112/mo (see note)"],
    },
    { label: "Monthly equivalent", cells: ["none", "$24.99/mo", "$62/mo billed yearly ($83 monthly)", "from $10/mo", "€112/mo"] },
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
        "Expire at the end of each billing cycle; extra credits $0.05 each",
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
    { name: "Local Falcon", sub: "Geo-grid with AI scans" },
    { name: "BrightLocal", sub: "Track plan" },
    { name: "Whitespark", sub: "Local Ranking Grids" },
    { name: "Semrush", sub: "Map Rank Tracker" },
  ];
  return (
    <section id="compare" className="container-page flex flex-col items-center gap-5 pt-[clamp(40px,6vw,72px)] pb-[var(--rb-section-y)]">
      <Eyebrow>Compare</Eyebrow>
      <h2 className="text-h2 m-0 text-center">The same kind of grid, without the subscription.</h2>
      <p className="text-lead m-0 max-w-[780px] text-center">
        We&apos;re not the only AI visibility tracker, and won&apos;t pretend to be. Local Falcon and BrightLocal already offer AI visibility on a grid.
        The difference is how you pay.
      </p>
      <p className="m-0 max-w-[780px] text-center text-[14px] leading-normal text-dim">Scenario: {SCENARIO.description}</p>
      <div className="mt-7 w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Comparison table">
        <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 overflow-hidden rounded-[18px] border border-border text-left text-[15px] leading-normal">
          <thead>
            <tr>
              <td className="w-[13%] border-b border-border" />
              {heads.map((h, i) => (
                <th key={h.name} scope="col" className={`border-b border-border p-5 align-top font-normal ${i === 0 ? "bg-surface-2" : ""}`}>
                  <span className="block text-[17px] font-semibold">{h.name}</span>
                  <span className="block text-[14px] text-muted-foreground">{h.sub}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.label}>
                <th scope="row" className={`p-5 align-top font-normal text-muted-foreground ${ri < rows.length - 1 ? "border-b border-border" : ""}`}>{r.label}</th>
                {r.cells.map((c, i) => (
                  <td key={i} className={`p-5 align-top ${ri < rows.length - 1 ? "border-b border-border" : ""} ${i === 0 ? "bg-surface-2 font-medium" : "text-fg-2"}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 max-w-[980px] text-center text-[13px] leading-[1.6] text-dim">
        Competitor prices are from their public pricing pages on {COMPETITOR_PRICES_DATE} (localfalcon.com/pricing, brightlocal.com/pricing,
        whitespark.ca/pricing) and may change. Semrush Map Rank Tracker is listed at €112/mo as verified by the operator on {COMPETITOR_PRICES_DATE}{" "}
        (currency as given); other Semrush cells are marked not recorded because only that monthly price was verified. Their plans include features
        we don&apos;t (e.g. citation building, Apple Maps, reputation tools). RankbyAI data costs are our estimate from the vendors&apos; published API
        prices on the same date. Trademarks belong to their owners; we&apos;re not affiliated.
      </p>
    </section>
  );
}
