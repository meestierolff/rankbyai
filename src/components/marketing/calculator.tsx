"use client";

import { useMemo, useState } from "react";
import { Band } from "@/components/brand/primitives";
import { Segmented } from "@/components/brand/segmented";
import { track } from "@/lib/analytics";
import { calculateYearlyDataCost, usd0, usd2, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice } from "@/lib/ladder";
import { COMPETITORS, COMPETITOR_PRICES_DATE, ENGINE_LABEL, ENGINES, GEMINI, type AiGridSize, type Engine, type MapsGridSize } from "@/lib/pricing-constants";
import { useOffer } from "./offer-context";

/** 9.13 Calculator. Uses the same constants and maths as the in-app estimate (lib/cost/estimate.ts). */
export function Calculator() {
  const { offer } = useOffer();
  const [prompts, setPrompts] = useState(30);
  const [aiGrid, setAiGrid] = useState<AiGridSize>(3);
  const [engines, setEngines] = useState<Engine[]>([...ENGINES]);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly");
  const [geminiFree, setGeminiFree] = useState(true);
  const [mapsGrid, setMapsGrid] = useState<MapsGridSize | 0>(7);

  const changed = (field: string) => track("calculator_changed", { field });
  const result = useMemo(
    () => calculateYearlyDataCost({ prompts, aiGrid, engines, frequency, geminiFreeAllowance: geminiFree, mapsGrid }),
    [prompts, aiGrid, engines, frequency, geminiFree, mapsGrid],
  );

  const plan = COMPETITORS.brightlocal.yearUsd;
  const ours = (offer?.currentPriceUsd ?? 0) + result.totalUsdPerYear;
  const max = Math.max(plan, ours, 1);

  return (
    <Band>
      <div className="container-page section-y flex flex-col items-center gap-[14px]">
        <h2 className="m-0 text-center text-[clamp(28px,3.2vw,40px)] font-semibold tracking-[-0.03em]">Run your own numbers</h2>
        <p className="m-0 text-center text-[18px] text-muted-foreground">What a year of checks costs on your own keys, next to a monthly plan.</p>
        <div className="mt-9 flex w-full flex-wrap overflow-hidden rounded-[20px] border border-border bg-surface">
          <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-[26px] border-border p-[clamp(22px,3vw,40px)] lg:border-r">
            <span className="text-[17px] font-medium">Your numbers</span>

            <div className="flex flex-col gap-3">
              <label htmlFor="calc-prompts" className="flex justify-between text-[16px] text-muted-foreground">
                <span>Prompts tracked (all clients)</span>
                <span className="font-mono text-[18px] font-semibold text-fg">{prompts}</span>
              </label>
              <input
                id="calc-prompts" type="range" min={1} max={300} value={prompts}
                onChange={(e) => { setPrompts(Number(e.target.value) || 1); changed("prompts"); }}
                className="w-full accent-[var(--rb-fg)]"
              />
            </div>

            <Field label="AI grid">
              <Segmented label="AI grid size" value={aiGrid} onChange={(v) => { setAiGrid(v); changed("ai_grid"); }}
                options={[{ value: 1 as AiGridSize, label: "1×1" }, { value: 3 as AiGridSize, label: "3×3" }, { value: 5 as AiGridSize, label: "5×5" }]} />
            </Field>

            <Field label="AI engines">
              <Segmented label="AI engines" value={engines}
                onChange={(v) => { setEngines((cur) => (cur.includes(v) ? cur.filter((e) => e !== v) : [...cur, v])); changed("engines"); }}
                options={ENGINES.map((e) => ({ value: e, label: ENGINE_LABEL[e].short }))} />
            </Field>

            <Field label="How often">
              <Segmented label="Frequency" value={frequency} onChange={(v) => { setFrequency(v); changed("frequency"); }}
                options={[{ value: "weekly" as const, label: "Weekly" }, { value: "monthly" as const, label: "Monthly" }]} />
            </Field>

            <Field label="Add a Maps grid (scheduled)">
              <Segmented label="Maps grid size" value={mapsGrid} onChange={(v) => { setMapsGrid(v); changed("maps_grid"); }}
                options={[{ value: 0 as const, label: "None" }, { value: 5 as const, label: "5×5" }, { value: 7 as const, label: "7×7" }, { value: 9 as const, label: "9×9" }]} />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-normal text-muted-foreground">
              <input type="checkbox" checked={geminiFree} onChange={(e) => { setGeminiFree(e.target.checked); changed("gemini_free"); }} className="mt-1 size-4 accent-[var(--rb-fg)]" />
              <span>
                Gemini free grounding allowance: the first {GEMINI.freeGroundedRequestsPerMonth.toLocaleString("en-US")} grounded requests per month are
                free on a paid Gemini key
              </span>
            </label>
          </div>

          <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-[22px] p-[clamp(22px,3vw,40px)]" aria-live="polite">
            <div className="flex flex-col gap-2">
              <span className="text-[16px] text-muted-foreground">Data cost on your own keys [estimate]</span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[clamp(40px,5vw,60px)] leading-none font-semibold tracking-[-0.03em]">≈ {usd2(result.totalUsdPerYear)}</span>
                <span className="text-[18px] text-muted-foreground">/ year</span>
              </div>
              <span className="font-mono text-[14px] leading-normal text-dim">{result.formula}</span>
            </div>

            <Bar label={`${COMPETITORS.brightlocal.name} ${COMPETITORS.brightlocal.plan}`} value={usdSmart(plan)} pct={(plan / max) * 100} tone="plan" caption={`every year · price from ${COMPETITOR_PRICES_DATE}`} />
            <Bar
              label={offer ? `RankbyAI: ${fmtPrice(offer.currentPriceUsd)} once + data` : "RankbyAI: data on your keys"}
              value={`≈ ${usd0(ours)}`} pct={Math.max(2, (ours / max) * 100)} tone="ours" caption={offer ? "year one, then data only" : "data only"}
            />

            <span className="text-[14px] leading-[1.55] text-dim">
              Estimate from the vendors&apos; published API prices. {result.geminiBillablePerMonth > 0
                ? `${result.geminiBillablePerMonth.toLocaleString("en-US")} Gemini requests a month fall outside the free allowance. `
                : ""}
              Vendors set the rates, not us, and the app shows the cost before every scan.
            </span>
          </div>
        </div>
      </div>
    </Band>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className="text-[16px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Bar({ label, value, pct, tone, caption }: { label: string; value: string; pct: number; tone: "plan" | "ours"; caption: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-3 text-[16px]"><span>{label}</span><span className="font-mono font-semibold">{value}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-inset">
        <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${tone === "plan" ? "bg-[#4a4a4a]" : "bg-fg"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[13px] text-dim">{caption}</span>
    </div>
  );
}
