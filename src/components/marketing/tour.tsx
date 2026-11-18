"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AiDisclaimer, MOCK_NAV, PriorityBadge, ScoreRing } from "@/components/brand/primitives";
import { DotGrid, aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { track } from "@/lib/analytics";
import type { Engine } from "@/lib/pricing-constants";
import {
  AI_N, MAPS_N, SAMPLE, SAMPLE_AUDIT, SAMPLE_ENGINES, mentionCount, sampleAiGrid, sampleCompare, sampleMapsGrid, top3Count,
} from "@/lib/sample-data";
import { cn } from "@/lib/utils";
import { Bezel, DotMark, LpSampleTag } from "./lp";
import { useOnScreen } from "./lp-motion";
import styles from "./tour-demo.module.css";

type NavItem = (typeof MOCK_NAV)[number];

const STEPS = [
  { key: "check", n: "01", label: "Check", caption: "Check AI answers and Maps rank on a grid", url: "rankbyai.live/app/ai-visibility", nav: "AI Visibility" },
  { key: "compare", n: "02", label: "Compare", caption: "Compare any two scans, point by point", url: "rankbyai.live/app/compare", nav: "Maps Grid" },
  { key: "audit", n: "03", label: "Audit", caption: "Get fixes ranked P0 to P3, with evidence", url: "rankbyai.live/app/audit", nav: "Local AI Audit" },
  { key: "share", n: "04", label: "Share", caption: "Send a white-label report with a live link", url: "rankbyai.live/app/reports", nav: "Businesses" },
] as const satisfies readonly { key: string; n: string; label: string; caption: string; url: string; nav: NavItem }[];

const STEP_SECONDS = 6;

/** The two sample scans the Compare step puts side by side. */
const SCAN_DATES = { before: "14 Oct", after: "14 Nov", year: 2026 } as const;

const RM_QUERY = "(prefers-reduced-motion: reduce)";
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(RM_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  );
}

/** Class list of a dot-grid well; `animated` adds the pop-in timing. */
const wellClass = (animated: boolean) => cn(styles.well, animated && styles.pop);

/** Card on the demo surface. */
const CARD = "border border-[#1e1e1e] bg-lp-surface";

/**
 * Auto-playing dashboard demo (sample data). It runs only while on screen, pauses on hover and
 * focus, has a pause button, and is static under reduced motion.
 */
export function Tour() {
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [engine, setEngine] = useState<Engine>("openai");
  const [copied, setCopied] = useState(false);
  const reduced = usePrefersReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(frameRef);
  // The reveal waits for the first time the demo is on screen, so it is not spent below the fold.
  const [seen, setSeen] = useState(false);
  if (onScreen && !seen) setSeen(true);
  const running = !paused && !hover && !reduced && onScreen;
  const animated = seen && !reduced;
  const revealKey = animated ? cycle : undefined;

  // The steps differ in height. The frame keeps the tallest height it has shown, so the page below
  // does not jump every time the demo advances. A change of window width starts the measure again.
  const stepRef = useRef<HTMLDivElement>(null);
  const [minBody, setMinBody] = useState(0);
  useLayoutEffect(() => {
    const el = stepRef.current;
    const column = el?.parentElement;
    if (!el || !column) return;
    const pad = getComputedStyle(column);
    const natural = Math.ceil(el.offsetHeight + parseFloat(pad.paddingTop) + parseFloat(pad.paddingBottom));
    setMinBody((prev) => (natural > prev ? natural : prev));
  }, [step, engine, cycle]);
  useEffect(() => {
    let width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      setMinBody(0);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const next = useCallback(() => {
    setStep((s) => (s + 1) % STEPS.length);
    setCycle((c) => c + 1);
  }, []);
  const go = (i: number) => {
    setStep(i);
    setCycle((c) => c + 1);
    track("demo_interacted", { step: STEPS[i].key });
  };

  const cur = STEPS[step];
  return (
    <section id="tour" aria-label="Product tour with sample data" className="relative px-6 pt-6 pb-10 text-lp-fg">
      <div className="mx-auto w-full max-w-(--lp-container-wide)">
        <Bezel
          ref={frameRef}
          warm
          innerClassName="relative"
          style={{ boxShadow: "var(--lp-shadow-bezel-lg)" }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocusCapture={() => setHover(true)}
          onBlurCapture={() => setHover(false)}
        >
          <TourWindowBar url={cur.url} />
          <div className="flex min-h-[560px]" style={minBody ? { minHeight: minBody } : undefined}>
            <TourSidebar active={cur.nav} />
            <div className="min-w-0 flex-1 px-[clamp(16px,2.6vw,28px)] pt-[clamp(16px,2.6vw,28px)] pb-24 text-left">
              <div key={cycle} ref={stepRef} className={animated ? styles.enter : undefined}>
                {step === 0 ? <CheckStep engine={engine} setEngine={setEngine} revealKey={revealKey} /> : null}
                {step === 1 ? <CompareStep revealKey={revealKey} /> : null}
                {step === 2 ? <AuditStep /> : null}
                {step === 3 ? (
                  <ShareStep
                    copied={copied}
                    onCopy={() => {
                      void navigator.clipboard?.writeText(`https://${SAMPLE.shareUrl}`).catch(() => {});
                      setCopied(true);
                      track("demo_interacted", { step: "copy_link" });
                      setTimeout(() => setCopied(false), 1800);
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
          <div className="absolute bottom-[22px] left-1/2 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-full bg-lp-fg py-[7px] pr-5 pl-[7px] text-[15px] font-medium whitespace-nowrap text-[#0b0b0b] shadow-pill">
            <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#0b0b0b] font-mono text-[13px] font-semibold text-lp-fg">{step + 1}</span>
            <span className="truncate">{cur.caption}</span>
          </div>
        </Bezel>

        <div className="mt-[22px] flex items-start gap-[clamp(10px,2vw,24px)]">
          <div className="grid flex-1 grid-cols-4 gap-[clamp(10px,2vw,24px)]">
            {STEPS.map((st, i) => (
              <button
                key={st.key}
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? "step" : undefined}
                className="flex min-w-0 cursor-pointer flex-col gap-3 border-0 bg-transparent p-0 text-left text-lp-fg"
              >
                <span className="relative block h-[2px] w-full overflow-hidden bg-lp-border">
                  <span className="absolute inset-y-0 left-0 bg-lp-accent" style={{ width: i < step ? "100%" : "0%" }} />
                  {i === step ? (
                    <span
                      key={`${i}-${cycle}`}
                      onAnimationEnd={next}
                      className={cn("absolute inset-y-0 left-0 bg-lp-accent", !reduced && styles.progress)}
                      style={
                        reduced
                          ? { width: "100%" }
                          : { width: 0, animationDuration: `${STEP_SECONDS}s`, animationPlayState: running ? "running" : "paused" }
                      }
                    />
                  ) : null}
                </span>
                <span className="font-mono text-[12px] text-lp-faint">{st.n}</span>
                <span className={cn("text-[clamp(14px,1.6vw,18px)] font-semibold transition-opacity duration-200", i === step ? "opacity-100" : "opacity-50")}>{st.label}</span>
              </button>
            ))}
          </div>
          {!reduced ? (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-label={paused ? "Play the tour" : "Pause the tour"}
              className="mt-[14px] grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-lp-border-3 bg-transparent text-[12px] text-[#9a9a9a] transition-colors hover:text-lp-fg"
            >
              {paused ? "▶" : "❚❚"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Window chrome of the demo: traffic lights, a centred URL pill, and a spacer that keeps the pill centred. */
function TourWindowBar({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-[14px] border-b border-lp-line px-4 py-3">
      <div className="flex shrink-0 gap-[7px]" aria-hidden>
        <span className="size-[11px] rounded-full bg-[#ff5f57]" />
        <span className="size-[11px] rounded-full bg-[#febc2e]" />
        <span className="size-[11px] rounded-full bg-[#28c840]" />
      </div>
      <div className="flex min-w-0 flex-1 justify-center">
        <span className="w-full max-w-[420px] truncate rounded-full bg-[#161616] px-4 py-[6px] text-center font-mono text-[12.5px] text-[#9a9a9a]">{url}</span>
      </div>
      <div className="w-[47px] shrink-0" aria-hidden />
    </div>
  );
}

/** The app sidebar inside the demo. Decorative; hidden below 820px viewport width (a media query, so it is right on first paint). */
function TourSidebar({ active }: { active: NavItem }) {
  return (
    <div aria-hidden className="hidden w-[176px] shrink-0 flex-col gap-[2px] border-r border-lp-line px-[10px] py-4 min-[820px]:flex">
      <span className="flex items-center gap-2 px-[10px] pt-[2px] pb-[14px] text-[14.5px] font-semibold">
        <DotMark size={16} />
        <span>rankbyai<span className="text-lp-faint">.live</span></span>
      </span>
      {MOCK_NAV.map((l) => (
        <span key={l} className={cn("rounded-[8px] px-[10px] py-2 text-[13.5px] transition-colors duration-200", l === active ? "bg-lp-line-2 text-lp-fg" : "text-[#9a9a9a]")}>
          {l}
        </span>
      ))}
      <span className="px-[10px] pt-[14px] pb-1 text-[11.5px] text-[#5a5a5a]">Developers</span>
      <span className="px-[10px] py-2 text-[13.5px] text-[#9a9a9a]">API &amp; MCP</span>
    </div>
  );
}

function StepHeader({ title, sub, children }: { title: string; sub: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[20px] font-semibold">{title}</div>
        <div className="mt-[5px] flex flex-wrap items-center gap-2 text-[13.5px] text-lp-dim">{sub}</div>
      </div>
      {children}
    </div>
  );
}

export function EngineTabs({ engine, setEngine, compact }: { engine: Engine; setEngine: (e: Engine) => void; compact?: boolean }) {
  const coverage = useMemo(
    () => Object.fromEntries(SAMPLE_ENGINES.map((e) => [e.key, Math.round((mentionCount(sampleAiGrid(e.key)) / (AI_N * AI_N)) * 100)])),
    [],
  );
  return (
    <div role="tablist" aria-label="AI engine" className={cn("flex flex-wrap border border-[#1f1f1f] bg-lp-well", compact ? "gap-[3px] rounded-[9px] p-[3px]" : "gap-1 rounded-[10px] p-1")}>
      {SAMPLE_ENGINES.map((e) => (
        <button
          key={e.key}
          type="button"
          role="tab"
          aria-selected={e.key === engine}
          onClick={() => {
            setEngine(e.key);
            track("demo_interacted", { engine: e.key });
          }}
          className={cn(
            "flex cursor-pointer items-baseline gap-[6px] border-0 font-medium transition-colors",
            compact ? "rounded-[6px] px-[9px] py-[5px] text-[12px]" : "rounded-[7px] px-[11px] py-[7px] text-[13px]",
            e.key === engine ? "bg-lp-fg text-[#0b0b0b]" : "bg-transparent text-lp-muted hover:text-lp-fg",
          )}
        >
          {e.label}
          {!compact ? <span className="font-mono text-[11px]">{coverage[e.key]}%</span> : null}
        </button>
      ))}
    </div>
  );
}

function GridLabel({ title, value }: { title: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-[13px] text-[#8a8a8a]">
      <span className="text-lp-fg">{title}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function CheckStep({ engine, setEngine, revealKey }: { engine: Engine; setEngine: (e: Engine) => void; revealKey?: number }) {
  const label = SAMPLE_ENGINES.find((e) => e.key === engine)!.label;
  const ai = useMemo(() => sampleAiGrid(engine), [engine]);
  const maps = useMemo(() => sampleMapsGrid(), []);
  const aiCells: CellView[] = ai.map((c) => {
    const col = aiCellColors(c.position);
    return {
      key: `a${c.i}-${c.j}`, ...col, delayMs: (c.i + c.j) * 40,
      title: `Point ${pointName(c.i, c.j)}, ${label} ${c.position ? `names the business at position ${c.position}` : "does not name the business"}`,
    };
  });
  const mapCells: CellView[] = maps.map((c) => {
    const col = mapsCellColors(c.rank);
    return { key: `m${c.i}-${c.j}`, ...col, delayMs: (c.i + c.j) * 28, title: `Point ${pointName(c.i, c.j)}, Google Maps rank ${col.label}` };
  });
  // Both grids replay their reveal on every step change and every engine change.
  const reveal = revealKey !== undefined ? `${revealKey}-${engine}` : undefined;
  const animated = reveal !== undefined;
  return (
    <div className="flex flex-col gap-[18px]">
      <StepHeader title={SAMPLE.business} sub={<><LpSampleTag /> “best {SAMPLE.service} near me” · {SAMPLE.city}</>}>
        <EngineTabs engine={engine} setEngine={setEngine} />
      </StepHeader>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-[18px]">
        <div className="flex flex-col gap-2">
          <GridLabel title={<>{label} names you · AI grid {AI_N}×{AI_N}</>} value={<>{mentionCount(ai)}/{AI_N * AI_N}</>} />
          <DotGrid n={AI_N} cells={aiCells} revealKey={reveal} fontPx={13} gapPx={7} className={wellClass(animated)} />
        </div>
        <div className="flex flex-col gap-2">
          <GridLabel title={<>Google Maps rank · {MAPS_N}×{MAPS_N}</>} value={<>top-3 at {top3Count(maps)}/{MAPS_N * MAPS_N}</>} />
          <DotGrid n={MAPS_N} cells={mapCells} revealKey={reveal} className={wellClass(animated)} />
        </div>
      </div>
      <AiDisclaimer />
    </div>
  );
}

/** Maps ranks of 21 and worse all read "20+", so the average counts them as 21. */
const RANK_CAP = 21;
const round1 = (x: number) => Math.round(x * 10) / 10;
const averageRank = (cells: { rank: number }[]) => round1(cells.reduce((sum, c) => sum + Math.min(c.rank, RANK_CAP), 0) / cells.length);
const top3Share = (cells: { rank: number }[]) => Math.round((top3Count(cells) / cells.length) * 100);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}`;

/** Small delta chip on a stat card. `good` picks green; a worse result is orange. */
function DeltaChip({ good, children }: { good: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-[3px] font-mono text-[12px]", good ? "bg-lp-ours/14 text-lp-ours" : "bg-orange/14 text-orange")}>{children}</span>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cn(CARD, "rounded-[14px] px-[18px] py-4")}>
      <div className="font-mono text-[11px] tracking-[0.08em] text-lp-dim uppercase">{label}</div>
      {children}
    </div>
  );
}

const STAT_VALUE = "font-mono text-[30px] leading-none font-semibold";

function CompareStep({ revealKey }: { revealKey?: number }) {
  const cmp = useMemo(() => sampleCompare(), []);
  const maps = useMemo(() => {
    const before = sampleMapsGrid(0.8);
    const after = sampleMapsGrid(1);
    return {
      before, after,
      beforeAvg: averageRank(before), afterAvg: averageRank(after),
      beforeShare: top3Share(before), afterShare: top3Share(after),
      improved: after.filter((c, k) => c.rank < before[k].rank).length,
    };
  }, []);
  const cells = (grid: { i: number; j: number; rank: number }[], date: string, delayStep?: number): CellView[] =>
    grid.map((c) => {
      const col = mapsCellColors(c.rank);
      return {
        key: `${c.i}-${c.j}`, ...col, delayMs: delayStep ? (c.i + c.j) * delayStep : undefined,
        title: `Point ${pointName(c.i, c.j)}, Google Maps rank ${col.label} on ${date}`,
      };
    });
  // A lower average rank is the better one.
  const avgGain = round1(maps.beforeAvg - maps.afterAvg);
  const shareGain = maps.afterShare - maps.beforeShare;
  const animated = revealKey !== undefined;
  return (
    <div className="flex flex-col gap-[18px]">
      <StepHeader
        title="Compare scans"
        sub={<><LpSampleTag /> {SAMPLE.business} · {SCAN_DATES.before} → {SCAN_DATES.after} {SCAN_DATES.year} · Maps {MAPS_N}×{MAPS_N}</>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] items-start gap-4">
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px] text-[13.5px] text-[#8a8a8a]">
            <span className="rounded-full border border-lp-border-3 px-[11px] py-1 text-lp-fg">Before</span>
            {SCAN_DATES.before} · avg {maps.beforeAvg.toFixed(1)}
          </div>
          <DotGrid n={MAPS_N} cells={cells(maps.before, SCAN_DATES.before)} fontPx={10.5} className={wellClass(false)} />
        </div>
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px] text-[13.5px] text-[#8a8a8a]">
            <span className="rounded-full border border-lp-fg bg-lp-fg px-[11px] py-1 font-medium text-[#0b0b0b]">After</span>
            {SCAN_DATES.after} · avg {maps.afterAvg.toFixed(1)}
          </div>
          <DotGrid n={MAPS_N} cells={cells(maps.after, SCAN_DATES.after, 30)} revealKey={revealKey} fontPx={10.5} className={wellClass(animated)} />
        </div>
        <div className="flex flex-col gap-[10px]">
          <StatCard label="Avg rank">
            <div className="mt-2 flex items-center gap-[10px]">
              <span className={STAT_VALUE}>{maps.afterAvg.toFixed(1)}</span>
              <DeltaChip good={avgGain >= 0}>
                <span aria-hidden>{avgGain > 0 ? "▲" : avgGain < 0 ? "▼" : "±"}</span>
                <span className="sr-only">{avgGain > 0 ? "better by " : avgGain < 0 ? "worse by " : "changed by "}</span>
                {Math.abs(avgGain).toFixed(1)}
              </DeltaChip>
            </div>
          </StatCard>
          <StatCard label="Top-3 share">
            <div className="mt-2 flex items-center gap-[10px]">
              <span className={STAT_VALUE}>{maps.afterShare}%</span>
              <DeltaChip good={shareGain >= 0}>{signed(shareGain)}pts</DeltaChip>
            </div>
          </StatCard>
          <StatCard label="Points improved">
            <div className="mt-2 flex items-baseline gap-2">
              <span className={STAT_VALUE}>{maps.improved}</span>
              <span className="text-[13.5px] text-lp-dim">of {cmp.mapsPoints}</span>
            </div>
          </StatCard>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[10px]">
        {cmp.engines.map((e) => (
          <div key={e.key} className="flex items-baseline justify-between gap-2 rounded-[12px] border border-lp-line-2 px-[14px] py-3 text-[13px] text-[#9a9a9a]">
            <span>{e.label} named</span>
            <span className="font-mono">
              <span className="text-lp-faint">{e.before} → {e.after}</span>
              <span className="sr-only"> of {cmp.aiPoints} points,</span>{" "}
              <span className={cn("font-semibold", e.delta < 0 ? "text-orange" : "text-lp-ours")}>{signed(e.delta)}</span>
            </span>
          </div>
        ))}
      </div>
      <AiDisclaimer />
    </div>
  );
}

const AUDIT_CATEGORIES = ["Identity", "Profile", "Website", "Reviews", "AI presence"];

function AuditStep() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
      <div className={cn(CARD, "flex flex-wrap items-center gap-[22px] rounded-[16px] p-6")}>
        <div className={styles.ring}>
          <ScoreRing score={SAMPLE_AUDIT.score} />
        </div>
        <div className="flex min-w-0 flex-col gap-[10px]">
          <span className="flex items-center gap-2 text-[12px] tracking-[0.06em] text-lp-dim uppercase">Local AI Audit <LpSampleTag /></span>
          <span className="text-[19px] leading-[1.2] font-semibold">{SAMPLE_AUDIT.findings.length} fixes, highest impact first</span>
          <div className="flex flex-wrap gap-[6px]">
            {AUDIT_CATEGORIES.map((c) => (
              <span key={c} className="rounded-full border border-lp-border-2 px-[11px] py-1 text-[13px] text-[#9a9a9a]">{c}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {SAMPLE_AUDIT.findings.slice(0, 4).map((f) => (
          <div key={f.title} className={cn(CARD, "flex items-center gap-3 rounded-[12px] px-[14px] py-[13px]")}>
            <PriorityBadge priority={f.priority} className="shrink-0" />
            <span className="text-[15px] leading-[1.35]">{f.title}</span>
          </div>
        ))}
        <span className="px-1 font-mono text-[12px] leading-normal text-lp-faint">{SAMPLE_AUDIT.findings[1].evidence}</span>
      </div>
    </div>
  );
}

function ShareStep({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-[22px]">
      <StepHeader title={SAMPLE.business} sub={<><LpSampleTag /> AI grid, Maps grid, audit, Fix Kit</>}>
        <div className="flex gap-2" aria-hidden>
          <span className="rounded-[10px] border border-lp-border-3 bg-[#161616] px-[14px] py-[9px] text-[14px] font-medium">Share</span>
          <span className="rounded-[10px] border border-lp-border-3 px-[14px] py-[9px] text-[14px] font-medium text-[#bdbdbd]">Re-run scan</span>
        </div>
      </StepHeader>
      <div className="flex w-full max-w-[560px] flex-col gap-4 self-center rounded-[16px] border border-lp-border-2 bg-[#141414] p-[22px] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div>
          <div className="text-[19px] font-semibold">Client report</div>
          <div className="mt-1 text-[15px] text-lp-muted">A live link. It updates after every scan.</div>
        </div>
        <div className="flex flex-wrap gap-[10px]">
          <span className="min-w-0 flex-[1_1_220px] truncate rounded-[10px] border border-lp-border-2 bg-[#0b0b0b] px-[14px] py-3 font-mono text-[14px]">
            {SAMPLE.shareUrl}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className={cn("shrink-0 cursor-pointer rounded-[10px] border-0 px-5 py-3 text-[15px] font-semibold text-[#0b0b0b] transition-colors duration-200", copied ? "bg-lp-ours" : "bg-lp-fg")}
          >
            {copied ? "✓ Copied" : "Copy link"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px] text-[#9a9a9a]">
          <span className="flex items-center gap-[7px] rounded-full border border-lp-border-2 px-3 py-[6px]">
            <span className="size-2 rounded-full bg-lp-ours" />White-label · your logo
          </span>
          <span className="rounded-full border border-lp-border-2 px-3 py-[6px]">↓ Download PDF</span>
        </div>
      </div>
    </div>
  );
}
