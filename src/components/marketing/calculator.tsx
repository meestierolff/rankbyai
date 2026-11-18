"use client";

import { useMemo, useState, type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { calculateYearlyDataCost, usd0, usd2, usdSmart } from "@/lib/cost/estimate";
import { fmtPrice } from "@/lib/ladder";
import { COMPETITORS, COMPETITOR_PRICES_DATE, ENGINE_LABEL, ENGINES, GEMINI, MAPS_GRID_SIZES, type AiGridSize, type Engine, type MapsGridSize } from "@/lib/pricing-constants";
import { cn } from "@/lib/utils";
import { Bezel } from "./lp";
import { useOffer } from "./offer-context";

/** 9.13 Calculator. Uses the same constants and maths as the in-app estimate (lib/cost/estimate.ts). */
export function Calculator() {
  const { offer } = useOffer();
  const live = offer?.open ? offer : null;
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

  /** At least one engine stays on: the estimate is about AI checks. */
  const toggleEngine = (engine: Engine) => {
    const on = engines.includes(engine);
    if (on && engines.length === 1) return;
    setEngines(on ? engines.filter((e) => e !== engine) : [...engines, engine]);
    changed("engines");
  };

  const plan = COMPETITORS.brightlocal.yearUsd;
  const ours = (live?.currentPriceUsd ?? 0) + result.totalUsdPerYear;
  const max = Math.max(plan, ours, 1);

  return (
    <section id="calc" className="container-lp py-[130px] text-lp-fg">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="m-0 text-[clamp(32px,4vw,44px)] leading-[1.04] font-semibold tracking-[-0.045em]">Run your own numbers</h2>
        <p className="m-0 max-w-[360px] text-[16px] leading-[1.5] text-lp-muted">What a year of checks costs on your own keys, next to a monthly plan.</p>
      </div>

      <Bezel className="mt-8" innerClassName="grid grid-cols-1 min-[708px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-[22px] p-[26px]">
          <div>
            <label htmlFor="calc-prompts" className="flex justify-between gap-3 text-[14px] text-[#bdbdbd]">
              <span>Prompts tracked (all clients)</span>
              <span className="font-mono text-lp-fg">{prompts}</span>
            </label>
            <input
              id="calc-prompts" type="range" min={1} max={300} step={1} value={prompts}
              onChange={(e) => { setPrompts(Number(e.target.value) || 1); changed("prompts"); }}
              className="mt-3 block w-full cursor-pointer accent-lp-accent"
            />
          </div>

          <Field label="AI grid">
            <Segmented label="AI grid size" value={aiGrid} onChange={(v) => { setAiGrid(v); changed("ai_grid"); }}
              options={[{ value: 1 as AiGridSize, label: "1×1" }, { value: 3 as AiGridSize, label: "3×3" }, { value: 5 as AiGridSize, label: "5×5" }]} />
          </Field>

          <Field label="AI engines">
            <div role="group" aria-label="AI engines" className="flex flex-wrap gap-[6px]">
              {ENGINES.map((e) => {
                const on = engines.includes(e);
                const last = on && engines.length === 1;
                return (
                  <button
                    key={e} type="button" role="checkbox" aria-checked={on} aria-disabled={last || undefined}
                    title={last ? "At least one engine stays on" : undefined}
                    onClick={() => toggleEngine(e)}
                    className={cn(
                      "rounded-lg border px-[13px] py-[7px] text-[13.5px] transition-colors",
                      last ? "cursor-default" : "cursor-pointer",
                      on ? "border-[rgba(255,122,26,0.5)] bg-[rgba(255,122,26,0.12)] text-[#ffd2b0]" : "border-lp-border bg-transparent text-[#8a8a8a] hover:text-lp-fg",
                    )}
                  >
                    {ENGINE_LABEL[e].short}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="How often">
            <Segmented label="Frequency" value={frequency} onChange={(v) => { setFrequency(v); changed("frequency"); }}
              options={[{ value: "weekly" as const, label: "Weekly" }, { value: "monthly" as const, label: "Monthly" }]} />
          </Field>

          <Field label="Add a Maps grid (scheduled)">
            <Segmented label="Maps grid size" value={mapsGrid} onChange={(v) => { setMapsGrid(v); changed("maps_grid"); }}
              options={[{ value: 0 as MapsGridSize | 0, label: "None" }, ...MAPS_GRID_SIZES.filter((n) => n >= 5).map((n) => ({ value: n as MapsGridSize | 0, label: `${n}×${n}` }))]} />
          </Field>

          <label className="flex cursor-pointer items-start gap-[10px] text-[12.5px] leading-[1.55] text-lp-dim">
            <input
              type="checkbox" checked={geminiFree}
              onChange={(e) => { setGeminiFree(e.target.checked); changed("gemini_free"); }}
              className="mt-[2px] size-[14px] shrink-0 cursor-pointer accent-lp-accent"
            />
            <span>
              Gemini free grounding allowance: the first {GEMINI.freeGroundedRequestsPerMonth.toLocaleString("en-US")} grounded requests per month are
              free on a paid Gemini key.
            </span>
          </label>
        </div>

        <div className="flex min-w-0 flex-col border-t border-lp-line bg-lp-surface p-[26px] min-[708px]:border-t-0 min-[708px]:border-l" aria-live="polite">
          <p className="m-0 text-[13px] text-lp-muted">
            Data cost on your own keys <span className="text-lp-dim">[estimate]</span>
          </p>
          {/* The figure scales with the column (container units), so a five-figure total never wraps or overflows. */}
          <div className="mt-2 [container-type:inline-size]">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display leading-[1.15] font-extrabold tracking-[-0.03em] whitespace-nowrap" style={{ fontSize: "clamp(24px, 13.5cqw, 46px)" }}>
                ≈ {usd2(result.totalUsdPerYear)}
              </span>
              <span className="text-[15px] text-lp-muted">/ year</span>
            </div>
          </div>
          <p className="mt-2 mb-0 font-mono text-[11.5px] leading-[1.6] text-lp-faint">{result.formula}</p>

          <div className="mt-7 flex flex-col gap-[18px]">
            <Bar
              label={`${COMPETITORS.brightlocal.name} ${COMPETITORS.brightlocal.plan}`}
              value={usdSmart(plan)} pct={(plan / max) * 100} tone="plan" caption={`every year · price from ${COMPETITOR_PRICES_DATE}`}
            />
            <Bar
              label={live ? `RankbyAI: ${fmtPrice(live.currentPriceUsd)} once + data` : "RankbyAI: data on your keys"}
              value={`≈ ${usd0(ours)}`} pct={Math.max(2, (ours / max) * 100)} tone="ours" caption={live ? "year one, then data only" : "data only"}
            />
          </div>

          <p className="mt-auto mb-0 pt-6 text-[12px] leading-[1.55] text-lp-dim">
            Estimate from the vendors&apos; published API prices. {result.geminiBillablePerMonth > 0
              ? `${result.geminiBillablePerMonth.toLocaleString("en-US")} Gemini requests a month fall outside the free allowance. `
              : ""}
            Vendors set the rates, not us, and the app shows the cost before every scan.
          </p>
        </div>
      </Bezel>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[14px] text-[#bdbdbd]">{label}</div>
      {children}
    </div>
  );
}

/** Single-select segmented well in the landing-page style (the app keeps its own in components/brand). */
function Segmented<T extends string | number>({
  label, value, options, onChange,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-fit max-w-full flex-wrap gap-1 rounded-[11px] border border-[#1f1f1f] bg-lp-surface p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer rounded-lg border-0 px-[13px] py-[7px] text-[13.5px] transition-colors",
              on ? "bg-[#242424] text-lp-fg" : "bg-transparent text-[#8a8a8a] hover:text-lp-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Bar({ label, value, pct, tone, caption }: { label: string; value: string; pct: number; tone: "plan" | "ours"; caption: string }) {
  const ours = tone === "ours";
  return (
    <div>
      <div className="flex justify-between gap-[10px] text-[13.5px]">
        <span className={ours ? "text-lp-fg" : "text-[#bdbdbd]"}>{label}</span>
        <span className={cn("font-mono whitespace-nowrap", ours && "text-lp-accent-text")}>{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-[4px] bg-[#161616]">
        <div className={cn("h-full rounded-[4px] transition-[width] duration-300 ease-out", ours ? "bg-lp-accent" : "bg-[#4a4a4a]")} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-[6px] text-[12px] text-lp-dim">{caption}</div>
    </div>
  );
}
