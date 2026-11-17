"use client";

import { useMemo, useState } from "react";
import { AiDisclaimer, MockSidebar, SampleTag, WindowBar } from "@/components/brand/primitives";
import { DotGrid, aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { track } from "@/lib/analytics";
import type { Engine } from "@/lib/pricing-constants";
import {
  AI_N, MAPS_N, SAMPLE, SAMPLE_ENGINES, SAMPLE_FIXKIT, describeOffset, sampleAiGrid, sampleMapsGrid, sampleMapsRank, sampleNamesAt,
} from "@/lib/sample-data";
import { cn } from "@/lib/utils";
import { EngineTabs } from "./tour";

/** Feature 01 mock: interactive AI grid with a point side panel (sample data). */
export function AiGridMock() {
  const [engine, setEngine] = useState<Engine>("openai");
  const [sel, setSel] = useState({ i: 2, j: 2 });
  const label = SAMPLE_ENGINES.find((e) => e.key === engine)!.label;
  const grid = useMemo(() => sampleAiGrid(engine), [engine]);
  const cells: CellView[] = grid.map((c) => ({
    key: `${c.i}-${c.j}`,
    ...aiCellColors(c.position),
    selected: c.i === sel.i && c.j === sel.j,
    title: `Point ${pointName(c.i, c.j)}, ${label} ${c.position ? `names the business at position ${c.position}` : "does not name the business"}`,
  }));
  const selected = grid.find((c) => c.i === sel.i && c.j === sel.j)!;
  const names = sampleNamesAt(sel.i, sel.j, selected.position);
  // The Maps grid is 7×7 over the same area: read the rank at the nearest Maps point.
  const scale = (MAPS_N - 1) / (AI_N - 1);
  const maps = mapsCellColors(sampleMapsRank(Math.round(sel.i * scale), Math.round(sel.j * scale)));

  return (
    <div className="overflow-hidden rounded-t-xl border border-b-0 border-border bg-inset">
      <WindowBar url="rankbyai.live/app/ai-visibility" compact />
      <div className="flex">
        <MockSidebar active="AI Visibility" />
        <div className="flex min-w-0 flex-1 flex-col gap-[14px] p-[18px]">
          <div className="flex flex-wrap items-end justify-between gap-[10px]">
            <div className="flex flex-col gap-[3px]">
              <span className="text-[17px] font-semibold">{SAMPLE.business}</span>
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-dim"><SampleTag /> “best {SAMPLE.service} near me” · {AI_N}×{AI_N}</span>
            </div>
            <EngineTabs engine={engine} setEngine={setEngine} compact />
          </div>
          <div className="flex flex-wrap gap-[14px]">
            <DotGrid
              n={AI_N}
              cells={cells}
              onSelect={(idx) => {
                setSel({ i: Math.floor(idx / AI_N), j: idx % AI_N });
                track("demo_interacted", { target: "grid_point" });
              }}
              className="min-w-0 flex-[1_1_230px] self-start rounded-[10px]"
              fontPx={12}
              gapPx={6}
              padPx={10}
            />
            <div className="flex min-w-0 flex-[1_1_190px] flex-col gap-[10px] rounded-[10px] border border-border bg-surface p-[14px]">
              <div className="flex flex-col gap-[2px]">
                <span className="font-mono text-[13px] font-semibold">Point {pointName(sel.i, sel.j)}</span>
                <span className="text-[12px] text-dim">{describeOffset(AI_N, sel.i, sel.j)}</span>
              </div>
              <span className="text-[12px] tracking-[0.05em] text-dim uppercase">{label} names</span>
              <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
                {names.map((r, k) => (
                  <li key={r.name} className={cn("flex items-center gap-[10px] rounded-[7px] px-2 py-[6px] text-[13px]", r.you && "bg-you-tint")}>
                    <span className="font-mono text-[12px] font-semibold text-dim">{k + 1}</span>
                    <span className={cn("flex-1", r.you ? "text-g1" : "text-fg")}>{r.name}{r.you ? " (you)" : ""}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-col gap-1 border-t border-border pt-[10px] text-[12px] text-dim">
                <span className="tracking-[0.05em] uppercase">Cited sources</span>
                {SAMPLE.sources.slice(0, 2).map((s) => <span key={s} className="truncate font-mono text-muted-foreground">{s}</span>)}
              </div>
              <div className="flex justify-between border-t border-border pt-[10px] text-[13px]">
                <span className="text-dim">Maps rank here</span>
                <span className="font-mono">{maps.label === "20+" ? "Not in top 20" : `#${maps.label}`}</span>
              </div>
            </div>
          </div>
          <AiDisclaimer />
        </div>
      </div>
    </div>
  );
}

/** Feature 02 mock: Maps heatmap with competitor overlay toggle (sample data). */
export function MapsGridMock() {
  const [who, setWho] = useState<"you" | "rival">("you");
  const cells: CellView[] = useMemo(
    () =>
      sampleMapsGrid(who === "you" ? 1 : 1.25).map((c) => {
        const rank = who === "you" ? c.rank : Math.max(1, c.rank - 2 + ((c.i + c.j) % 3));
        const col = mapsCellColors(rank);
        return { key: `${c.i}-${c.j}`, ...col, title: `Point ${pointName(c.i, c.j)}, Google Maps rank ${col.label}` };
      }),
    [who],
  );
  const top3 = cells.filter((c) => Number(c.label) <= 3).length;
  return (
    <div className="overflow-hidden rounded-t-xl border border-b-0 border-border bg-inset">
      <WindowBar url="rankbyai.live/app/maps-grid" compact />
      <div className="flex">
        <MockSidebar active="Maps Grid" />
        <div className="flex min-w-0 flex-1 flex-col gap-[14px] p-[18px]">
          <div className="flex flex-wrap items-end justify-between gap-[10px]">
            <div className="flex flex-col gap-[3px]">
              <span className="text-[17px] font-semibold">{who === "you" ? SAMPLE.business : SAMPLE.rivals[0]}</span>
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-dim"><SampleTag /> “{SAMPLE.service}” · {MAPS_N}×{MAPS_N} · top-3 at {top3}/{MAPS_N * MAPS_N}</span>
            </div>
            <div role="tablist" aria-label="Whose rank" className="flex gap-[3px] rounded-[9px] border border-border bg-surface-2 p-[3px]">
              {([["you", "You"], ["rival", "Competitor"]] as const).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={who === k}
                  onClick={() => setWho(k)}
                  className={cn("cursor-pointer rounded-[6px] border-0 px-[9px] py-[5px] text-[12px] font-medium", who === k ? "bg-fg text-bg" : "bg-transparent text-muted-foreground")}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <DotGrid n={MAPS_N} cells={cells} className="mx-auto w-full max-w-[420px] rounded-[10px]" fontPx={11} gapPx={5} padPx={10} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 pb-4 text-[12px] text-dim">
            {[["var(--rb-g1)", "1–3"], ["var(--rb-amber)", "4–10"], ["var(--rb-orange)", "11–20"], ["var(--rb-red)", "20+"]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-[6px]"><span className="size-[9px] rounded-full" style={{ background: c }} />{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const FIX_TABS = [
  { key: "profile", label: "AI-ready profile", file: "profile.txt" },
  { key: "faq", label: "FAQ", file: "faq.md" },
  { key: "schema", label: "Schema", file: "localbusiness.jsonld" },
  { key: "llms", label: "llms.txt", file: "llms.txt" },
] as const;

/** Fix Kit mock inside the audit feature block (sample data). */
export function FixKitMock() {
  const [tab, setTab] = useState<(typeof FIX_TABS)[number]["key"]>("profile");
  const [copied, setCopied] = useState(false);
  const file = FIX_TABS.find((t) => t.key === tab)!.file;
  const text =
    tab === "profile" ? SAMPLE_FIXKIT.profile
    : tab === "faq" ? SAMPLE_FIXKIT.faqs.map((f) => `${f.q}\n${f.a}`).join("\n\n")
    : tab === "schema" ? SAMPLE_FIXKIT.schema
    : SAMPLE_FIXKIT.llms;
  return (
    <div className="flex flex-col gap-[14px]">
      <div role="tablist" aria-label="Fix Kit asset" className="flex flex-wrap gap-[6px]">
        {FIX_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("cursor-pointer rounded-full border border-border-strong px-[14px] py-2 text-[14px] font-medium", tab === t.key ? "bg-fg text-bg" : "bg-transparent text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-[300px] overflow-hidden rounded-xl border border-border bg-inset">
        <div className="flex items-center justify-between border-b border-line px-4 py-[11px] font-mono text-[12px] font-medium text-dim">
          <span className="flex items-center gap-2">{file} <SampleTag /></span>
          <button
            type="button"
            className={cn("cursor-pointer border-0 bg-transparent font-mono text-[12px]", copied ? "text-g1" : "text-dim hover:text-fg")}
            onClick={() => {
              void navigator.clipboard?.writeText(text).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        {tab === "profile" ? (
          <div className="flex flex-col gap-3 p-5">
            <span className="font-mono text-[11px] font-medium tracking-[0.06em] text-dim uppercase">Google Business Profile · description</span>
            <p className="m-0 text-[16px] leading-[1.65] text-pretty text-fg-2">{SAMPLE_FIXKIT.profile}</p>
          </div>
        ) : tab === "faq" ? (
          <div className="flex flex-col gap-4 p-5 text-[15px] leading-[1.55] text-fg-2">
            {SAMPLE_FIXKIT.faqs.map((f) => (
              <div key={f.q} className="flex flex-col gap-1"><span className="font-semibold text-fg">{f.q}</span><span>{f.a}</span></div>
            ))}
          </div>
        ) : (
          <pre className="m-0 overflow-x-auto p-5 font-mono text-[13px] leading-[1.65] whitespace-pre text-fg-2">{text}</pre>
        )}
      </div>
    </div>
  );
}
