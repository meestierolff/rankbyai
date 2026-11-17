"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AiDisclaimer, PriorityBadge, SampleTag, ScoreRing, WindowBar } from "@/components/brand/primitives";
import { DotGrid, aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { track } from "@/lib/analytics";
import type { Engine } from "@/lib/pricing-constants";
import {
  AI_N, MAPS_N, SAMPLE, SAMPLE_AUDIT, SAMPLE_ENGINES, mentionCount, sampleAiGrid, sampleCompare, sampleMapsGrid, top3Count,
} from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "check", n: "01", label: "Check", caption: "Check AI answers and Maps rank on a grid", url: "rankbyai.live/app/ai-visibility" },
  { key: "compare", n: "02", label: "Compare", caption: "Compare any two scans, point by point", url: "rankbyai.live/app/compare" },
  { key: "audit", n: "03", label: "Audit", caption: "Get fixes ranked P0 to P3, with evidence", url: "rankbyai.live/app/audit" },
  { key: "share", n: "04", label: "Share", caption: "Send a white-label report with a live link", url: "rankbyai.live/app/reports" },
] as const;

const STEP_SECONDS = 6;

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

/** Auto-playing product tour (sample data). Pauses on hover/focus, has a pause button, and is static under reduced motion. */
export function Tour() {
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [engine, setEngine] = useState<Engine>("openai");
  const [copied, setCopied] = useState(false);
  const reduced = usePrefersReducedMotion();
  const running = !paused && !hover && !reduced;

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
    <section id="tour" aria-label="Product tour with sample data" className="container-narrow flex flex-col gap-[22px] pb-[var(--rb-section-y)]">
      <div
        className="relative overflow-hidden rounded-[22px] border border-border bg-inset shadow-frame"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocusCapture={() => setHover(true)}
        onBlurCapture={() => setHover(false)}
      >
        <WindowBar url={cur.url} />
        <div className="min-h-[440px] px-[clamp(18px,3vw,32px)] pt-[clamp(18px,3vw,32px)] pb-24">
          {step === 0 ? <CheckStep engine={engine} setEngine={setEngine} revealKey={reduced ? undefined : cycle} /> : null}
          {step === 1 ? <CompareStep /> : null}
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
        <div className="absolute bottom-[22px] left-1/2 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-full bg-fg py-[7px] pr-5 pl-[7px] text-[15px] font-medium whitespace-nowrap text-bg shadow-pill">
          <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-bg font-mono text-[13px] font-semibold text-fg">{step + 1}</span>
          <span className="truncate">{cur.caption}</span>
        </div>
      </div>

      <div className="flex items-start gap-[clamp(10px,2vw,24px)]">
        <div className="grid flex-1 grid-cols-4 gap-[clamp(10px,2vw,24px)]">
          {STEPS.map((st, i) => (
            <button
              key={st.key}
              type="button"
              onClick={() => go(i)}
              aria-current={i === step ? "step" : undefined}
              className="flex cursor-pointer flex-col gap-3 border-0 bg-transparent p-0 text-left text-fg"
            >
              <span className="relative block h-[2px] w-full overflow-hidden bg-border">
                <span className="absolute inset-y-0 left-0 bg-fg" style={{ width: i < step ? "100%" : "0%" }} />
                {i === step ? (
                  <span
                    key={`${i}-${cycle}`}
                    onAnimationEnd={next}
                    className="absolute inset-y-0 left-0 bg-fg"
                    style={
                      reduced
                        ? { width: "100%" }
                        : { width: 0, animation: `rb-progress ${STEP_SECONDS}s linear forwards`, animationPlayState: running ? "running" : "paused" }
                    }
                  />
                ) : null}
              </span>
              <span className="font-mono text-[12px] font-medium text-dim">{st.n}</span>
              <span className={cn("text-[clamp(14px,1.6vw,18px)] font-semibold", i === step ? "opacity-100" : "opacity-55")}>{st.label}</span>
            </button>
          ))}
        </div>
        {!reduced ? (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? "Play the tour" : "Pause the tour"}
            className="mt-[14px] grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-border-strong bg-transparent text-[13px] text-muted-foreground hover:text-fg"
          >
            {paused ? "▶" : "❚❚"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function StepHeader({ title, sub, children }: { title: string; sub: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1 text-left">
        <span className="text-[20px] font-semibold">{title}</span>
        <span className="flex flex-wrap items-center gap-2 text-[14px] text-dim">{sub}</span>
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
    <div role="tablist" aria-label="AI engine" className={cn("flex flex-wrap border border-border bg-surface-2", compact ? "gap-[3px] rounded-[9px] p-[3px]" : "gap-1 rounded-[10px] p-1")}>
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
            "flex cursor-pointer items-baseline gap-[6px] border-0 font-medium",
            compact ? "rounded-[6px] px-[9px] py-[5px] text-[12px]" : "rounded-[7px] px-[11px] py-[7px] text-[13px]",
            e.key === engine ? "bg-fg text-bg" : "bg-transparent text-muted-foreground hover:text-fg",
          )}
        >
          {e.label}
          {!compact ? <span className="font-mono text-[11px] font-medium">{coverage[e.key]}%</span> : null}
        </button>
      ))}
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
  return (
    <div className="flex flex-col gap-[18px]">
      <StepHeader title={SAMPLE.business} sub={<><SampleTag /> “best {SAMPLE.service} near me” · {SAMPLE.city}</>}>
        <EngineTabs engine={engine} setEngine={setEngine} />
      </StepHeader>
      <div className="mx-auto grid w-full max-w-[840px] grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[18px]">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-[13px] text-muted-foreground">
            <span className="text-fg">{label} names you · AI grid {AI_N}×{AI_N}</span>
            <span className="font-mono">{mentionCount(ai)}/{AI_N * AI_N}</span>
          </div>
          <DotGrid n={AI_N} cells={aiCells} revealKey={revealKey !== undefined ? `${revealKey}-${engine}` : undefined} fontPx={13} gapPx={7} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-[13px] text-muted-foreground">
            <span className="text-fg">Google Maps rank · {MAPS_N}×{MAPS_N}</span>
            <span className="font-mono">top-3 at {top3Count(maps)}/{MAPS_N * MAPS_N}</span>
          </div>
          <DotGrid n={MAPS_N} cells={mapCells} revealKey={revealKey} />
        </div>
      </div>
      <AiDisclaimer className="text-left" />
    </div>
  );
}

function CompareStep() {
  const cmp = useMemo(() => sampleCompare(), []);
  const best = [...cmp.engines].sort((a, b) => b.delta - a.delta)[0];
  const worst = [...cmp.engines].sort((a, b) => a.delta - b.delta)[0];
  const cards = [
    ...cmp.engines.map((e) => ({ label: e.label, delta: e.delta, before: e.before, after: e.after })),
    { label: "Maps top-3", delta: cmp.maps.delta, before: cmp.maps.before, after: cmp.maps.after },
  ];
  return (
    <div className="flex flex-col gap-[22px] text-left">
      <StepHeader
        title="Compare scans"
        sub={<><SampleTag /> {SAMPLE.business} · 14 Oct → 14 Nov 2026 · AI points named out of {cmp.aiPoints}, Maps out of {cmp.mapsPoints}</>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {cards.map((c) => (
          <div key={c.label} className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-5">
            <span className="text-[14px] text-muted-foreground">{c.label}</span>
            <span className={cn("font-mono text-[44px] leading-none font-semibold", c.delta < 0 ? "text-orange" : "text-g1")}>
              {c.delta > 0 ? "+" : c.delta < 0 ? "−" : "±"}{Math.abs(c.delta)}
            </span>
            <span className="font-mono text-[13px] font-medium text-dim">{c.before} → {c.after}</span>
          </div>
        ))}
      </div>
      <div className="rounded-[14px] border border-border bg-surface px-[18px] py-4 text-[15px] leading-[1.55] text-muted-foreground">
        {best.label} gained the most: named at {best.after} of {cmp.aiPoints} points, up from {best.before}.{" "}
        {worst.delta < 0 ? (
          <span className="text-fg">{worst.label} lost {Math.abs(worst.delta)} {Math.abs(worst.delta) === 1 ? "point" : "points"}. That shows up as a P1 in the next audit.</span>
        ) : (
          <span className="text-fg">No engine lost ground between the two scans.</span>
        )}
      </div>
    </div>
  );
}

function AuditStep() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4 text-left">
      <div className="flex flex-wrap items-center gap-[22px] rounded-2xl border border-border bg-surface p-6">
        <ScoreRing score={SAMPLE_AUDIT.score} />
        <div className="flex min-w-0 flex-col gap-[10px]">
          <span className="flex items-center gap-2 text-[12px] font-medium tracking-[0.06em] text-dim uppercase">Local AI Audit <SampleTag /></span>
          <span className="text-[19px] leading-tight font-semibold">{SAMPLE_AUDIT.findings.length} fixes, highest impact first</span>
          <div className="flex flex-wrap gap-[6px]">
            {["Identity", "Profile", "Website", "Reviews", "AI presence"].map((c) => (
              <span key={c} className="rounded-full border border-border-strong px-[11px] py-1 text-[13px] text-muted-foreground">{c}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {SAMPLE_AUDIT.findings.slice(0, 4).map((f) => (
          <div key={f.title} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-[14px] py-[13px]">
            <PriorityBadge priority={f.priority} />
            <span className="text-[15px]">{f.title}</span>
          </div>
        ))}
        <span className="px-1 font-mono text-[12px] text-dim">{SAMPLE_AUDIT.findings[1].evidence}</span>
      </div>
    </div>
  );
}

function ShareStep({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-5 text-left">
      <StepHeader title={SAMPLE.business} sub={<><SampleTag /> AI grid, Maps grid, audit, Fix Kit</>}>
        <div className="flex gap-2" aria-hidden>
          <span className="rounded-[10px] border border-border-strong bg-surface-2 px-[14px] py-[9px] text-[14px] font-medium">Share</span>
          <span className="rounded-[10px] border border-border-strong px-[14px] py-[9px] text-[14px] font-medium">Re-run scan</span>
        </div>
      </StepHeader>
      <div className="flex w-full max-w-[560px] flex-col gap-4 self-center rounded-2xl border border-border-strong bg-surface-2 p-[22px] shadow-popover">
        <div className="flex flex-col gap-1">
          <span className="text-[19px] font-semibold">Client report</span>
          <span className="text-[15px] text-muted-foreground">A live link. It updates after every scan.</span>
        </div>
        <div className="flex flex-wrap gap-[10px]">
          <span className="min-w-0 flex-[1_1_220px] truncate rounded-[10px] border border-border-strong bg-inset px-[14px] py-3 font-mono text-[14px] font-medium">
            {SAMPLE.shareUrl}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className={cn("shrink-0 cursor-pointer rounded-[10px] border-0 px-5 py-3 text-[15px] font-semibold transition-colors", copied ? "bg-copied text-white" : "bg-fg text-bg")}
          >
            {copied ? "✓ Copied" : "Copy link"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-[13px] text-muted-foreground">
          <span className="flex items-center gap-[7px] rounded-full border border-border-strong px-3 py-[6px]">
            <span className="size-2 rounded-full bg-g1" />White-label · your logo
          </span>
          <span className="rounded-full border border-border-strong px-3 py-[6px]">↓ Download PDF</span>
        </div>
      </div>
    </div>
  );
}
