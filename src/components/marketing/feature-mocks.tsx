"use client";

import { useId, useMemo, useState } from "react";
import { AiDisclaimer, MockSidebar, PriorityBadge, SampleTag, WindowBar, scoreColor } from "@/components/brand/primitives";
import { DotGrid, aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { track } from "@/lib/analytics";
import type { Engine } from "@/lib/pricing-constants";
import { pitchOpener } from "@/lib/prospects/opener";
import {
  AI_N, MAPS_N, SAMPLE, SAMPLE_AUDIT, SAMPLE_ENGINES, SAMPLE_FIXKIT, SAMPLE_PROSPECTS, describeOffset, mentionCount, sampleAiGrid, sampleAiPosition,
  sampleMapsGrid, sampleMapsRank, sampleNamesAt, top3Count, type SampleAiCell,
} from "@/lib/sample-data";
import { NOT_RANKED } from "@/lib/scans/summary";
import { cn } from "@/lib/utils";
import { PreviewCard, PreviewHead, PreviewLabel, PreviewLegend, PreviewSeg, PreviewStats, RankRow, useFlash } from "./feature-preview-parts";
import { EngineTabs } from "./tour";

/*
 * This file holds two sets of mocks, all fed by sample data:
 *  1. AiGridMock, MapsGridMock and FixKitMock: the older mocks in the app's own look. They are still
 *     used by the app's empty states and by the SEO article pages.
 *  2. The four panels of the landing page's "four tools" preview (further down), in the landing look.
 */

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

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Landing page "four tools" preview (design handoff, section 6): four interactive panels.
 *
 * Everything shown is SAMPLE DATA and the frame is labelled "Sample data". The grids, names,
 * sources, findings, Fix Kit and prospect rows come from lib/sample-data. Where the design shows
 * something that file has no data for, the sample values are defined right here and marked
 * "SAMPLE DATA (local)". Every statistic is computed from the grid on screen.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * SAMPLE DATA (local). Two more invented practices. lib/sample-data has four rivals, and two
 * lists need more names than that: an AI answer that lists five businesses without the sample
 * business, and the top five at a Maps pin where neither the sample business nor the first rival
 * ranks. Like every business in the sample, these are made up.
 */
const SAMPLE_EXTRA_RIVALS = ["Cedar Lantern Dentistry", "Grackle Lane Dental"] as const;

/** Both sample grids cover the same area: this many miles around the business pin. */
const SAMPLE_RADIUS_MI = 2;

/** Every sample AI answer lists this many businesses. */
const NAMES_PER_ANSWER = 5;

/** The businesses one engine named at a point, in order: lib/sample-data's list, topped up to five names. */
function previewNamesAt(i: number, j: number, position: number | null): { name: string; you: boolean }[] {
  const names = sampleNamesAt(i, j, position);
  for (let k = 0; names.length < NAMES_PER_ANSWER && k < SAMPLE_EXTRA_RIVALS.length; k++) names.push({ name: SAMPLE_EXTRA_RIVALS[k], you: false });
  return names;
}

/**
 * The three AI stat cards, computed from the grid shown.
 * Share of AI Voice follows the design handoff: answers that name the business ÷ all names listed
 * (25 points × 5 names = 125). With five names in every answer this equals the app's own
 * definition in lib/scans/summary.ts (your mentions ÷ all business mentions).
 */
function aiStats(grid: SampleAiCell[]) {
  const positions = grid.flatMap((c) => (c.position === null ? [] : [c.position]));
  const named = mentionCount(grid);
  const namesListed = grid.reduce((n, c) => n + previewNamesAt(c.i, c.j, c.position).length, 0);
  return {
    rate: `${Math.round((named / grid.length) * 100)}%`,
    namedOf: `${named}/${grid.length}`,
    avgPosition: positions.length ? (positions.reduce((a, b) => a + b, 0) / positions.length).toFixed(1) : "–",
    shareOfVoice: `${((named / namesListed) * 100).toFixed(1)}%`,
  };
}

/** Tool 01: AI Visibility. Engine switch, three stats, a clickable 5×5 grid and what was found at the selected point. */
export function AiVisibilityPreview() {
  const [engine, setEngine] = useState<Engine>("openai");
  const [sel, setSel] = useState({ i: 2, j: 2 });
  const engineIdx = SAMPLE_ENGINES.findIndex((e) => e.key === engine);
  const label = SAMPLE_ENGINES[engineIdx].label;
  const grid = useMemo(() => sampleAiGrid(engine), [engine]);
  const stats = useMemo(() => aiStats(grid), [grid]);

  const position = grid.find((c) => c.i === sel.i && c.j === sel.j)?.position ?? null;
  const names = previewNamesAt(sel.i, sel.j, position);
  // Two of the sample's cited sources, rotating by point and engine.
  const firstSource = (sel.i * AI_N + sel.j + engineIdx) % SAMPLE.sources.length;
  const sources = [SAMPLE.sources[firstSource], SAMPLE.sources[(firstSource + 1) % SAMPLE.sources.length]];
  // The Maps grid is 7×7 over the same area: read the rank at the nearest Maps point.
  const scale = (MAPS_N - 1) / (AI_N - 1);
  const mapsHere = mapsCellColors(sampleMapsRank(Math.round(sel.i * scale), Math.round(sel.j * scale))).label;

  return (
    <div className="flex flex-col gap-[22px]">
      <PreviewHead title={SAMPLE.business} sub={<>“best {SAMPLE.service} near me” · {SAMPLE.city} · {AI_N}×{AI_N} grid</>}>
        <PreviewSeg
          label="AI engine"
          options={SAMPLE_ENGINES.map((e) => ({ value: e.key, label: e.label }))}
          value={engine}
          onChange={(e) => {
            setEngine(e);
            track("demo_interacted", { engine: e });
          }}
        />
      </PreviewHead>
      <PreviewStats
        items={[
          { label: "Mention rate", value: stats.rate, hint: stats.namedOf },
          { label: "Average position", value: stats.avgPosition },
          { label: "Share of AI Voice", value: stats.shareOfVoice },
        ]}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,290px),1fr))] items-start gap-[22px]">
        <div>
          <div className="grid grid-cols-5 gap-2">
            {grid.map((c) => {
              const col = aiCellColors(c.position);
              const selected = c.i === sel.i && c.j === sel.j;
              return (
                <button
                  key={`${c.i}-${c.j}`}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Point ${pointName(c.i, c.j)}: ${label} ${c.position ? `names the business at position ${c.position}` : "does not name the business"}`}
                  onClick={() => {
                    setSel({ i: c.i, j: c.j });
                    track("demo_interacted", { target: "grid_point" });
                  }}
                  className="grid aspect-square cursor-pointer place-items-center rounded-[9px] border p-0 font-mono text-[15px] font-medium transition-all duration-150"
                  style={{
                    background: col.bg,
                    color: col.fg,
                    borderColor: selected ? "var(--lp-fg)" : "transparent",
                    boxShadow: selected ? "0 0 0 3px rgba(244,242,238,0.14)" : "none",
                  }}
                >
                  {col.label}
                </button>
              );
            })}
          </div>
          <PreviewLegend
            items={[
              { colors: ["var(--rb-g1)", "var(--rb-g2)", "var(--rb-g3)"], label: "Named 1–3" },
              { colors: ["var(--rb-amber)"], label: "Named 4–5" },
              { colors: ["var(--rb-none)"], label: "Not named" },
            ]}
            note="Click any point"
          />
        </div>
        <PreviewCard aria-live="polite">
          <div className="flex items-baseline justify-between gap-[10px]">
            <div className="text-[16px] font-medium">Point {pointName(sel.i, sel.j)}</div>
            <div className="text-[12.5px] text-lp-dim">{describeOffset(AI_N, sel.i, sel.j, SAMPLE_RADIUS_MI)}</div>
          </div>
          <PreviewLabel>{label} names</PreviewLabel>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-0">
            {names.map((n, k) => <RankRow key={n.name} rank={String(k + 1)} name={n.you ? `${n.name} (you)` : n.name} highlight={n.you} />)}
          </ol>
          {position === null ? <div className="mt-[10px] text-[13px] text-[#ff9a52]">You&apos;re not named at this point.</div> : null}
          <PreviewLabel>Cited sources</PreviewLabel>
          <div className="flex flex-wrap gap-[6px]">
            {sources.map((s) => (
              <span key={s} className="rounded-[6px] border border-[#232323] px-2 py-1 font-mono text-[11.5px] break-all text-[#bdbdbd]">{s}</span>
            ))}
          </div>
          <div className="mt-4 flex justify-between gap-3 border-t border-lp-line-2 pt-[14px] text-[14px]">
            <span className="text-[#8a8a8a]">Maps rank here</span>
            <span className="font-semibold">{mapsHere === "20+" ? "Not in top 20" : `#${mapsHere}`}</span>
          </div>
        </PreviewCard>
      </div>
      <AiDisclaimer className="m-0 text-lp-dim" />
    </div>
  );
}

/**
 * SAMPLE DATA (local). The Google Maps rank of the sample's first rival at one Maps point.
 * lib/sample-data has no grid for a rival, so this derives one from the same generator: a somewhat
 * stronger business with a per-point offset. It never equals the sample business's own rank at
 * the same pin, so one result list per pin holds both.
 */
function sampleRivalMapsRank(i: number, j: number): number {
  const rank = Math.max(1, sampleMapsRank(i, j, 1.25) - 2 + ((i + j) % 3));
  return rank === sampleMapsRank(i, j) ? rank + 1 : rank;
}

type MapsView = "you" | "rival";
const MAPS_RIVAL = SAMPLE.rivals[0];

/** Design handoff: a rank in the top 3 counts 1, ranks 4–10 count 0.5, ranks 11–20 count 0.1. */
/**
 * The three Maps stat cards, computed from the grid shown (yours, or the rival's in the overlay).
 * Average rank counts a point outside the top 20 as 21, as the app does. Share of Local Voice is the
 * app's own definition (lib/scans/summary.ts): top-3 placements ÷ all top-3 slots across the grid.
 * The design handoff proposed weighted ranks instead; a preview must show what the product computes.
 */
function mapsStats(cells: { rank: number }[]) {
  const n = cells.length;
  const avg = cells.reduce((a, c) => a + Math.min(c.rank, NOT_RANKED), 0) / n;
  const voice = top3Count(cells) / (3 * n);
  return { avgRank: avg.toFixed(1), top3: `${top3Count(cells)}/${n}`, localVoice: `${(voice * 100).toFixed(1)}%` };
}

/** The top five results at a pin: the sample business and the rival at their own ranks, other sample practices in between. */
function resultsAtPin(i: number, j: number): { rank: number; name: string; who: MapsView | null }[] {
  const you = sampleMapsRank(i, j);
  const rival = sampleRivalMapsRank(i, j);
  const others = [...SAMPLE.rivals.slice(1), ...SAMPLE_EXTRA_RIVALS];
  let next = ((i * MAPS_N + j) * 2) % others.length;
  return [1, 2, 3, 4, 5].map((rank) => {
    if (rank === you) return { rank, name: SAMPLE.business, who: "you" };
    if (rank === rival) return { rank, name: MAPS_RIVAL, who: "rival" };
    return { rank, name: others[next++ % others.length], who: null };
  });
}

/** Whether at least one engine names the sample business at the AI grid point nearest to a Maps pin. */
function aiNamesNear(i: number, j: number): boolean {
  const scale = (AI_N - 1) / (MAPS_N - 1);
  const ai = Math.round(i * scale);
  const aj = Math.round(j * scale);
  return SAMPLE_ENGINES.some((e) => sampleAiPosition(ai, aj, e.seed, e.threshold) !== null);
}

/** Tool 02: Maps Grid. You / competitor overlay, three stats, a clickable 7×7 grid and the results at the selected pin. */
export function MapsGridPreview() {
  const [view, setView] = useState<MapsView>("you");
  const [sel, setSel] = useState({ i: (MAPS_N - 1) / 2, j: (MAPS_N - 1) / 2 });
  const cells = useMemo(() => sampleMapsGrid().map((c) => (view === "you" ? c : { ...c, rank: sampleRivalMapsRank(c.i, c.j) })), [view]);
  const stats = useMemo(() => mapsStats(cells), [cells]);

  const subject = view === "you" ? SAMPLE.business : MAPS_RIVAL;
  const rank = cells.find((c) => c.i === sel.i && c.j === sel.j)?.rank ?? NOT_RANKED;
  const results = resultsAtPin(sel.i, sel.j);
  const pinName = (who: MapsView | null, name: string) => (who === "you" ? `${name} (you)` : name);
  const centre = (MAPS_N - 1) / 2;
  const note =
    view === "rival" ? `Competitor overlay: the grid is recolored by ${MAPS_RIVAL}'s rank at every pin.`
    : rank <= 3 && !aiNamesNear(sel.i, sel.j) ? "Top 3 on Maps here, but no AI engine names you at the nearest AI point. A gap to close."
    : rank <= 3 ? "Top 3 on Maps here, and named by at least one AI engine nearby."
    : "Click any pin to see the top results there, with you highlighted.";

  return (
    <div className="flex flex-col gap-[22px]">
      <PreviewHead title={SAMPLE.business} sub={<>“{SAMPLE.service}” · {MAPS_N}×{MAPS_N} grid · {SAMPLE_RADIUS_MI} mi radius</>}>
        <PreviewSeg
          label="Whose rank colors the grid"
          options={[{ value: "you", label: "You" }, { value: "rival", label: `Competitor: ${MAPS_RIVAL}` }] as const}
          value={view}
          onChange={(v) => {
            setView(v);
            track("demo_interacted", { target: "maps_overlay" });
          }}
        />
      </PreviewHead>
      <PreviewStats
        items={[
          { label: "Average rank", value: stats.avgRank },
          { label: "Top-3 share", value: stats.top3 },
          { label: "Share of Local Voice", value: stats.localVoice },
        ]}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,290px),1fr))] items-start gap-[22px]">
        <div>
          <div className="grid grid-cols-7 gap-[6px]">
            {cells.map((c) => {
              const col = mapsCellColors(c.rank);
              const selected = c.i === sel.i && c.j === sel.j;
              const atPin = c.i === centre && c.j === centre;
              return (
                <button
                  key={`${c.i}-${c.j}`}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Pin ${pointName(c.i, c.j)}${atPin ? " (the business pin)" : ""}: ${subject} ${col.label === "20+" ? "is outside the top 20" : `ranks ${col.label}`} on Google Maps`}
                  onClick={() => {
                    setSel({ i: c.i, j: c.j });
                    track("demo_interacted", { target: "maps_pin" });
                  }}
                  className="grid aspect-square cursor-pointer place-items-center rounded-[7px] border p-0 font-mono text-[12px] font-medium transition-all duration-150"
                  style={{ background: col.bg, color: col.fg, borderColor: selected ? "var(--lp-fg)" : atPin ? "rgba(244,242,238,0.35)" : "transparent" }}
                >
                  {col.label}
                </button>
              );
            })}
          </div>
          <PreviewLegend
            items={[
              { colors: ["var(--rb-g1)"], label: "1–3" },
              { colors: ["var(--rb-amber)"], label: "4–10" },
              { colors: ["var(--rb-orange)"], label: "11–20" },
              { colors: ["var(--rb-red)"], label: "20+" },
            ]}
          />
        </div>
        <PreviewCard aria-live="polite">
          <div className="flex items-baseline justify-between gap-[10px]">
            <div className="text-[16px] font-medium">Pin {pointName(sel.i, sel.j)}</div>
            <div className="text-[12.5px] text-lp-dim">{describeOffset(MAPS_N, sel.i, sel.j, SAMPLE_RADIUS_MI)}</div>
          </div>
          <PreviewLabel>Top results at this pin</PreviewLabel>
          <ol className="m-0 flex list-none flex-col gap-[3px] p-0">
            {results.map((r) => <RankRow key={r.rank} wide rank={`#${r.rank}`} name={pinName(r.who, r.name)} highlight={r.who === view} />)}
            {rank > results.length ? <RankRow wide rank={rank > 20 ? "20+" : `#${rank}`} name={pinName(view, subject)} highlight /> : null}
          </ol>
          <div className="mt-[14px] border-t border-lp-line-2 pt-[14px] text-[13px] leading-[1.55] text-[#8a8a8a]">{note}</div>
        </PreviewCard>
      </div>
      <AiDisclaimer className="m-0 text-lp-dim" />
    </div>
  );
}

/**
 * SAMPLE DATA (local). Category scores for the sample audit; lib/sample-data only has the total.
 * Weighted with the audit's published category weights (identity 20, profile 25, website 20,
 * reviews 15, AI presence 10, competition 10) they give 64, which is SAMPLE_AUDIT.score.
 */
const SAMPLE_AUDIT_CATEGORIES = [
  { label: "Identity", score: 82 },
  { label: "Profile", score: 71 },
  { label: "Website", score: 55 },
  { label: "Reviews", score: 39 },
  { label: "AI presence", score: 60 },
  { label: "Competition", score: 70 },
] as const;

/** SAMPLE DATA (local). The share of the sample audit's checks that could run. */
const SAMPLE_AUDIT_CHECKS_RAN_PCT = 92;

type FixTab = (typeof FIX_TABS)[number]["key"];

/** The text of one Fix Kit asset from the sample: what the panel shows and what Copy puts on the clipboard. */
function fixKitText(tab: FixTab): string {
  if (tab === "profile") return SAMPLE_FIXKIT.profile;
  if (tab === "faq") return SAMPLE_FIXKIT.faqs.map((f) => `${f.q}\n${f.a}`).join("\n\n");
  return tab === "schema" ? SAMPLE_FIXKIT.schema : SAMPLE_FIXKIT.llms;
}

/** The audit score as a ring. The arc is the score's share of the circle, in the product's score colour. */
function ScoreDial({ score, busy }: { score: number; busy: boolean }) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const arc = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <div role="img" aria-label={busy ? "The sample audit is running" : `Score ${score} out of 100`} className="relative size-24 flex-none">
      <svg width="96" height="96" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#1d1d1d" strokeWidth="9" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${arc.toFixed(1)} ${circumference.toFixed(1)}`} transform="rotate(-90 60 60)"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[30px] font-semibold tracking-[-0.03em]">{busy ? "…" : score}</div>
    </div>
  );
}

/** Tool 03: Local AI Audit. Re-run button, score and category bars, findings accordion and the Fix Kit. */
export function AuditPreview() {
  const id = useId();
  const running = useFlash(1400);
  const copied = useFlash(1500);
  const [open, setOpen] = useState<boolean[]>(() => SAMPLE_AUDIT.findings.map((_, k) => k === 0));
  const [fixTab, setFixTab] = useState<FixTab>("profile");
  const fixText = fixKitText(fixTab);
  const fixFile = FIX_TABS.find((t) => t.key === fixTab)?.file;

  return (
    <div className="flex flex-col gap-[22px]">
      <PreviewHead title={SAMPLE.business} sub="Profile, website, reviews, AI answers">
        <button
          type="button"
          aria-disabled={running.on}
          onClick={() => {
            if (running.on) return;
            running.fire();
            track("demo_interacted", { target: "audit_rerun" });
          }}
          className="cursor-pointer rounded-[9px] border border-lp-border-2 bg-[#141414] px-[14px] py-[9px] text-[13.5px] text-[#ece9e4] transition-colors hover:border-[#444444]"
        >
          <span aria-live="polite">{running.on ? "Running audit…" : "↻ Re-run audit"}</span>
        </button>
      </PreviewHead>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] items-start gap-6">
        <PreviewCard className="p-5">
          <div className="flex items-center gap-4">
            <ScoreDial score={SAMPLE_AUDIT.score} busy={running.on} />
            <div className="text-[13px] leading-[1.5] text-[#8a8a8a]">
              Local AI Audit score<br />
              <span className="text-lp-fg-2">{SAMPLE_AUDIT_CHECKS_RAN_PCT}% of checks ran</span>
            </div>
          </div>
          <ul className="m-0 mt-5 flex list-none flex-col gap-[10px] p-0 text-[12.5px]">
            {SAMPLE_AUDIT_CATEGORIES.map((c) => (
              <li key={c.label} className="grid grid-cols-[86px_1fr_26px] items-center gap-[10px] text-[#9a9a9a]">
                <span>{c.label}</span>
                <span aria-hidden className="h-1 overflow-hidden rounded-[2px] bg-[#1c1c1c]">
                  <span className="block h-full" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
                </span>
                <span className="text-right font-mono">{c.score}</span>
              </li>
            ))}
          </ul>
        </PreviewCard>
        <div>
          <div className="mb-[6px] text-[13px] text-[#8a8a8a]">{SAMPLE_AUDIT.findings.length} issues, highest impact first</div>
          {SAMPLE_AUDIT.findings.map((f, k) => (
            <div key={f.title} className="border-t border-lp-line-2">
              <button
                type="button"
                aria-expanded={open[k]}
                aria-controls={`${id}-finding-${k}`}
                onClick={() => setOpen((o) => o.map((v, n) => (n === k ? !v : v)))}
                className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-[2px] py-[13px] text-left text-[14.5px] leading-[1.4] text-lp-fg"
              >
                <PriorityBadge priority={f.priority} className="shrink-0" />
                <span className="flex-1">{f.title}</span>
                <span aria-hidden className="shrink-0 font-mono text-lp-faint">{open[k] ? "−" : "+"}</span>
              </button>
              <div id={`${id}-finding-${k}`} hidden={!open[k]}>
                <div className="flex flex-col gap-[6px] pr-[2px] pb-4 pl-[46px] text-[13.5px] leading-[1.6] text-[#8a8a8a]">
                  <div><span className="text-lp-fg-2">Evidence:</span> {f.evidence}</div>
                  <div><span className="text-lp-accent-soft">Fix:</span> {f.fix}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-[var(--lp-frame-inner-border)]">
        <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-lp-line bg-lp-surface px-3 py-[10px]">
          <div role="group" aria-label="Fix Kit asset" className="flex flex-wrap items-center gap-1">
            <span className="mr-2 ml-1 text-[12.5px] text-lp-dim">Fix Kit</span>
            {FIX_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={t.key === fixTab}
                onClick={() => {
                  setFixTab(t.key);
                  copied.reset();
                }}
                className={cn(
                  "cursor-pointer rounded-[7px] border-0 px-[11px] py-[6px] text-[13px] transition-colors",
                  t.key === fixTab ? "bg-[#242424] text-lp-fg" : "bg-transparent text-[#8a8a8a] hover:text-lp-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-[10px]">
            <span className="font-mono text-[11.5px] text-lp-faint">{fixFile}</span>
            <button
              type="button"
              onClick={() => {
                // Demo control: it copies the sample text shown below, nothing else.
                void navigator.clipboard?.writeText(fixText).catch(() => {});
                copied.fire();
                track("demo_interacted", { target: "fixkit_copy" });
              }}
              className="cursor-pointer rounded-[7px] border border-[#2a2a2a] bg-[#141414] px-[11px] py-[6px] text-[12.5px] text-[#e6e3de] transition-colors hover:border-[#444444]"
            >
              <span aria-live="polite">{copied.on ? "Copied ✓" : "Copy"}</span>
            </button>
          </div>
        </div>
        {fixTab === "profile" ? (
          <div className="px-[18px] pt-4 font-mono text-[11px] tracking-[0.1em] text-lp-faint uppercase">Google Business Profile · description</div>
        ) : null}
        <pre className="m-0 min-h-[150px] px-[18px] py-4 font-mono text-[12.5px] leading-[1.65] break-words whitespace-pre-wrap text-[#bdbdbd]">{fixText}</pre>
      </div>
      <AiDisclaimer className="m-0 text-lp-dim" />
    </div>
  );
}

/** The sample prospect batch: an AI 3×3 grid and a Maps 5×5 grid per business. */
const PROSPECT_AI_N = 3;
const PROSPECT_MAPS_N = 5;
/** SAMPLE DATA (local). The size of the sample batch; the table shows its first rows. */
const SAMPLE_REPORTS_READY = 25;

/**
 * SAMPLE DATA (local). The scan counts behind each sample prospect row. lib/sample-data has the
 * row's percentages but not these counts, and the opener rule (lib/prospects/opener.ts) needs them.
 * They agree with the row: "AI named" is a share of 27 answers (9 points × 3 engines), so the
 * number of points with a mention fits that share, and the Maps average is the row's own.
 * `topCompetitor` is the business AI assistants named most often where this one was missing.
 */
const SAMPLE_PROSPECT_SCANS: Record<string, { aiPointsNamed: number; mapsTop3Points: number; topCompetitor: string; reviews: { you: number; median: number } | null }> = {
  "Smile Dental": { aiPointsNamed: 8, mapsTop3Points: 16, topCompetitor: SAMPLE.business, reviews: null },
  "Northgate Family Dental": {
    aiPointsNamed: 5, mapsTop3Points: 8, topCompetitor: SAMPLE.rivals[0], reviews: { you: SAMPLE.reviews.you, median: SAMPLE.reviews.top3Median },
  },
  "Pecan Row Dentistry": { aiPointsNamed: 4, mapsTop3Points: 5, topCompetitor: SAMPLE.rivals[0], reviews: null },
  "Bluebonnet Dental Co.": { aiPointsNamed: 2, mapsTop3Points: 3, topCompetitor: SAMPLE.rivals[0], reviews: null },
  "Violet Crown Dental": { aiPointsNamed: 1, mapsTop3Points: 0, topCompetitor: SAMPLE.rivals[0], reviews: null },
};

/** The sample rows with their text columns parsed to numbers, for sorting and for the AI bar. */
const PROSPECT_ROWS = SAMPLE_PROSPECTS.map((p) => ({
  ...p,
  aiPct: parseFloat(p.ai),
  mapsAvg: parseFloat(p.maps),
  initials: p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(),
}));
type ProspectRow = (typeof PROSPECT_ROWS)[number];

/** The pitch opener for a sample row, written by the product's own rule from the row's numbers. Null when the rule has nothing to say. */
function sampleOpener(p: ProspectRow): string | null {
  const scan = SAMPLE_PROSPECT_SCANS[p.name] as (typeof SAMPLE_PROSPECT_SCANS)[string] | undefined;
  if (!scan) return null;
  return pitchOpener({
    business: p.name,
    city: SAMPLE.city,
    ai: { points: PROSPECT_AI_N * PROSPECT_AI_N, pointsMentioned: scan.aiPointsNamed, topCompetitor: scan.topCompetitor },
    maps: { points: PROSPECT_MAPS_N * PROSPECT_MAPS_N, top3Points: scan.mapsTop3Points, avgRank: p.mapsAvg },
    reviews: scan.reviews,
  });
}

type SortKey = "name" | "ai" | "maps" | "audit";
const PROSPECT_COLUMNS: { key: SortKey | null; label: string; width: string }[] = [
  { key: "name", label: "Business", width: "30%" },
  { key: "ai", label: "AI named", width: "20%" },
  { key: "maps", label: "Maps avg", width: "14%" },
  { key: "audit", label: "Audit", width: "12%" },
  { key: null, label: "Report", width: "24%" },
];

function compareProspects(a: ProspectRow, b: ProspectRow, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name);
  if (key === "ai") return a.aiPct - b.aiPct;
  return key === "maps" ? a.mapsAvg - b.mapsAvg : a.audit - b.audit;
}

/** Tool 04: Prospect Reports. A sortable table of sample reports, the opener of the selected row, and a demo Export button. */
export function ProspectsPreview() {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "ai", dir: -1 });
  const [selectedName, setSelectedName] = useState<string>(SAMPLE.business);
  const exported = useFlash(1600);

  const rows = useMemo(() => [...PROSPECT_ROWS].sort((a, b) => sort.dir * compareProspects(a, b, sort.key)), [sort]);
  const selected = PROSPECT_ROWS.find((p) => p.name === selectedName) ?? PROSPECT_ROWS[0];
  const opener = sampleOpener(selected);
  // A newly chosen column starts ascending for names and Maps rank (A→Z, rank 1 at the top) and descending for the scores.
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "maps" ? 1 : -1 }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-[6px] font-mono text-[12px]">
          {[`niche: ${SAMPLE.service}s`, `city: ${SAMPLE.city}`, `AI ${PROSPECT_AI_N}×${PROSPECT_AI_N} + Maps ${PROSPECT_MAPS_N}×${PROSPECT_MAPS_N}`].map((c) => (
            <span key={c} className="rounded-[7px] border border-lp-border px-[10px] py-[6px] text-lp-fg-2">{c}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-[7px] text-[13px] text-lp-fg-2">
            <span aria-hidden className="size-[6px] rounded-full bg-[#4ade80]" />
            {SAMPLE_REPORTS_READY} reports ready
          </span>
          <button
            type="button"
            onClick={() => {
              // Demo control: nothing is downloaded. The real export lives in the app.
              exported.fire();
              track("demo_interacted", { target: "prospects_export" });
            }}
            className="cursor-pointer rounded-[9px] border-0 bg-lp-accent px-[14px] py-[9px] text-[13.5px] font-medium text-[#140800] transition-[filter] hover:brightness-110"
          >
            <span aria-live="polite">{exported.on ? "Sample only" : "Export CSV"}</span>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-lp-line-2">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-[14px]">
          <caption className="sr-only">Sample prospect reports. The column headers sort the table; the business names select a report.</caption>
          <colgroup>
            {PROSPECT_COLUMNS.map((c) => <col key={c.label} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr className="bg-lp-surface">
              {PROSPECT_COLUMNS.map((c) => {
                const key = c.key;
                const active = key !== null && key === sort.key;
                return (
                  <th key={c.label} scope="col" aria-sort={key === null ? undefined : active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="p-0 text-[12.5px] font-normal">
                    {key === null ? (
                      <span className="block px-[14px] py-3 text-lp-dim">{c.label}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => sortBy(key)}
                        className={cn("flex w-full cursor-pointer items-center gap-1 border-0 bg-transparent px-[14px] py-3 text-left text-[12.5px]", active ? "text-lp-fg" : "text-lp-dim hover:text-lp-fg")}
                      >
                        {c.label}
                        {active ? <span aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span> : null}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const isSelected = p.name === selected.name;
              return (
                <tr
                  key={p.name}
                  onClick={() => setSelectedName(p.name)}
                  className={cn("cursor-pointer border-t border-lp-line transition-colors", isSelected ? "bg-[#151515]" : "hover:bg-[#101010]")}
                >
                  <td className="px-[14px] py-[13px]">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedName(p.name)}
                      className="flex cursor-pointer items-center gap-[10px] border-0 bg-transparent p-0 text-left text-[14px] text-lp-fg"
                    >
                      <span aria-hidden className="grid size-7 flex-none place-items-center rounded-full bg-[#1a1a1a] font-mono text-[10.5px] text-[#bdbdbd]">{p.initials}</span>
                      {p.name}
                    </button>
                  </td>
                  <td className="px-[14px] py-[13px]">
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="h-1 w-[54px] flex-none overflow-hidden rounded-[2px] bg-[#1c1c1c]">
                        <span className="block h-full bg-lp-accent" style={{ width: `${Math.max(0, Math.min(100, p.aiPct))}%` }} />
                      </span>
                      <span className="font-mono text-[13px]">{p.ai}</span>
                    </div>
                  </td>
                  <td className="px-[14px] py-[13px] font-mono text-[13px] text-lp-fg-2">{p.maps}</td>
                  <td className="px-[14px] py-[13px] font-mono text-[13px] text-lp-fg-2">{p.audit}</td>
                  <td className="px-[14px] py-[13px] font-mono text-[12px] text-[#8a8a8a]">{p.link} · pdf</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div aria-live="polite" className="rounded-xl border border-[rgba(255,122,26,0.28)] bg-[rgba(255,122,26,0.05)] px-[18px] py-4">
        <div className="font-mono text-[11px] tracking-[0.1em] text-[#ff9a52] uppercase">Pitch opener · {selected.name}</div>
        <div className="mt-2 text-[15px] leading-[1.55] text-[#ece9e4]">
          {opener ? `“${opener}”` : "No opener for this report: its numbers hold nothing notable to state."}
        </div>
      </div>
      <p className="m-0 text-[12px] text-lp-dim">Click a row to see its opener. RankbyAI never contacts the businesses in your reports.</p>
      <AiDisclaimer className="m-0 text-lp-dim" />
    </div>
  );
}
