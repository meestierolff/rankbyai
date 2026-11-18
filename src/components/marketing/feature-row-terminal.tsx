"use client";

import { useRef } from "react";
import { AiDisclaimer } from "@/components/brand/primitives";
import { tick, type Clock } from "@/components/marketing/feature-row-shared";
import { Bezel, BezelHeader, LpSampleTag } from "@/components/marketing/lp";
import { useAnimationFrame, useOnScreen, useReducedMotion } from "@/components/marketing/lp-motion";
import { estimateAiGrid, usd2 } from "@/lib/cost/estimate";
import { ENGINES, ENGINE_LABEL, type AiGridSize } from "@/lib/pricing-constants";
import { SAMPLE_AUDIT, SAMPLE_ENGINES, mentionCount, sampleAiGrid } from "@/lib/sample-data";

/*
 * Feature row C: an MCP session, typed out. The server renders the finished transcript; the loop
 * then replays it by writing to the same nodes. Every figure comes from lib/cost/estimate and
 * lib/sample-data.
 */

const GRID: AiGridSize = 3;
const POINTS = GRID * GRID;
const ESTIMATE = usd2(estimateAiGrid(GRID, ENGINES).totalUsd);

const engineGrids = SAMPLE_ENGINES.map((e) => {
  const cells = sampleAiGrid(e.key, 1, GRID);
  return { label: ENGINE_LABEL[e.key].short, cells, named: mentionCount(cells) };
});
/** Per grid point: did at least one engine name the business there? */
const NAMED_AT = Array.from({ length: POINTS }, (_, k) => engineGrids.some((g) => g.cells[k].position !== null));
const NAMED = NAMED_AT.filter(Boolean).length;
const most = Math.max(...engineGrids.map((g) => g.named));
const naming = engineGrids.filter((g) => g.named > 0);
const leaders = engineGrids.filter((g) => g.named === most);
const BY = NAMED === 0 ? "" : naming.length === 1 ? `, only by ${naming[0].label}` : leaders.length === 1 ? `, most often by ${leaders[0].label}` : "";

const FINDINGS = SAMPLE_AUDIT.findings;
const GRID_RESULT = `${NAMED}/${POINTS} named`;
const AUDIT_RESULT = `score ${SAMPLE_AUDIT.score} · ${FINDINGS.length} issues`;

const YOU = "Check whether AI recommends my dentist client in Austin and tell me what to fix first.";
const YES = "yes";
const AGENT = `Named at ${NAMED} of ${POINTS} spots${BY}. Fix the P0 first: the phone on the site doesn't match the profile. Then get listed on the two directories all three engines cite.`;
const SUMMARY =
  `Sample MCP session. You: ${YOU} The agent shows the estimate for a ${GRID}×${GRID} AI grid on ${ENGINES.length} engines, about ${ESTIMATE}, ` +
  `and asks to confirm the paid action. You: ${YES}. It runs the AI grid on your keys (${GRID_RESULT}) and a Local AI Audit (${AUDIT_RESULT}). Agent: ${AGENT}`;

const PENDING = "#1e1e1e";
const HIT = "#ff7a1a";
const DONE = "#4a4a4a";
const gridColour = (k: number) => (NAMED_AT[k] ? HIT : DONE);
const auditColour = (k: number) => (FINDINGS[k].priority === "P0" ? HIT : DONE);

/** The script, in ms from the start of one loop. */
const T = (() => {
  const TYPE_YOU = 16;
  const TYPE_YES = 90;
  const TYPE_AGENT = 13;
  const SQUARE = 130;
  let t = 0;
  const you = t;
  t += YOU.length * TYPE_YOU + 450;
  const estimate = t;
  t += 450;
  const confirm = t;
  t += 350;
  const yes = t;
  t += YES.length * TYPE_YES + 300;
  const grid = t;
  t += POINTS * SQUARE;
  const audit = t;
  t += FINDINGS.length * SQUARE;
  const auditDone = t;
  t += 400;
  const agent = t;
  t += AGENT.length * TYPE_AGENT + 4200;
  const fade = t;
  t += 420;
  return { TYPE_YOU, TYPE_YES, TYPE_AGENT, SQUARE, you, estimate, confirm, yes, grid, audit, auditDone, agent, fade, loop: t };
})();
const FADE_MS = 400;
const BLINK_MS = 900;

interface View {
  you: number;
  yes: number;
  agent: number;
  estimate: boolean;
  confirm: boolean;
  grid: boolean;
  gridSquares: number;
  gridResult: boolean;
  audit: boolean;
  auditSquares: number;
  auditResult: boolean;
  agentLine: boolean;
  caret: number;
  caretOn: boolean;
  opacity: number;
}

const FINAL: View = {
  you: YOU.length, yes: YES.length, agent: AGENT.length, estimate: true, confirm: true, grid: true, gridSquares: POINTS, gridResult: true,
  audit: true, auditSquares: FINDINGS.length, auditResult: true, agentLine: true, caret: 2, caretOn: true, opacity: 1,
};

const typed = (t: number, start: number, per: number, length: number) => (t < start ? 0 : Math.min(length, Math.floor((t - start) / per) + 1));
const filled = (t: number, start: number, count: number) => Math.max(0, Math.min(count, Math.floor((t - start) / T.SQUARE)));

/** What the terminal shows `elapsedMs` into the animation. */
function viewAt(elapsedMs: number): View {
  const t = elapsedMs % T.loop;
  return {
    you: typed(t, T.you, T.TYPE_YOU, YOU.length),
    yes: typed(t, T.yes, T.TYPE_YES, YES.length),
    agent: typed(t, T.agent, T.TYPE_AGENT, AGENT.length),
    estimate: t >= T.estimate,
    confirm: t >= T.confirm,
    grid: t >= T.grid,
    gridSquares: filled(t, T.grid, POINTS),
    gridResult: t >= T.audit,
    audit: t >= T.audit,
    auditSquares: filled(t, T.audit, FINDINGS.length),
    auditResult: t >= T.auditDone,
    agentLine: t >= T.agent,
    caret: t < T.yes ? 0 : t < T.agent ? 1 : 2,
    caretOn: t % BLINK_MS < BLINK_MS / 2,
    opacity: t < T.fade ? 1 : Math.max(0, 1 - (t - T.fade) / FADE_MS),
  };
}

const TEXT = { you: YOU, yes: YES, agent: AGENT } as const;

/** Writes the difference between two views to the DOM. `prev` null writes everything. */
function render(host: HTMLElement, view: View, prev: View | null) {
  const changed = <K extends keyof View>(k: K) => !prev || prev[k] !== view[k];
  const one = (selector: string) => host.querySelector<HTMLElement>(selector);
  const all = (selector: string) => host.querySelectorAll<HTMLElement>(selector);

  for (const name of ["you", "yes", "agent"] as const) {
    if (!changed(name)) continue;
    const shown = one(`[data-typed="${name}"]`);
    const rest = one(`[data-rest="${name}"]`);
    if (shown) shown.textContent = TEXT[name].slice(0, view[name]);
    if (rest) rest.textContent = TEXT[name].slice(view[name]);
  }
  const lines: [keyof View, string][] = [
    ["estimate", "estimate"], ["confirm", "confirm"], ["grid", "grid"], ["gridResult", "grid-result"],
    ["audit", "audit"], ["auditResult", "audit-result"], ["agentLine", "agent"],
  ];
  for (const [key, name] of lines) {
    if (!changed(key)) continue;
    all(`[data-line="${name}"]`).forEach((el) => {
      el.style.visibility = view[key] ? "" : "hidden";
    });
  }
  if (changed("gridSquares")) all('[data-squares="grid"] > span').forEach((el, k) => (el.style.background = k < view.gridSquares ? gridColour(k) : PENDING));
  if (changed("auditSquares")) all('[data-squares="audit"] > span').forEach((el, k) => (el.style.background = k < view.auditSquares ? auditColour(k) : PENDING));
  if (changed("caret") || changed("caretOn")) {
    all("[data-caret]").forEach((el, i) => {
      el.style.display = i === view.caret ? "inline-block" : "none";
      el.style.opacity = view.caretOn ? "1" : "0";
    });
  }
  if (changed("opacity")) host.style.opacity = String(view.opacity);
}

const caretClass = "ml-[2px] h-[13px] w-[7px] bg-lp-accent align-[-2px]";
const squareClass = "size-[9px] rounded-[2px] transition-colors duration-200";

function Arrow() {
  return <span className="text-lp-accent-text">→ </span>;
}

export function TerminalVisual() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const state = useRef<{ clock: Clock; view: View | null }>({ clock: { last: 0, elapsed: 0 }, view: null });
  const reduced = useReducedMotion();
  const visible = useOnScreen(hostRef);

  const paint = (view: View) => {
    const host = hostRef.current;
    if (!host) return;
    render(host, view, state.current.view);
    state.current.view = view;
  };
  useAnimationFrame(
    (now) => paint(viewAt(tick(state.current.clock, now))),
    visible && !reduced,
    () => {
      state.current.clock.last = 0;
      paint(FINAL);
    },
  );

  return (
    <Bezel>
      <BezelHeader title="MCP · rankbyai.live" status={<LpSampleTag />} />
      <div
        ref={hostRef}
        role="img"
        aria-label={SUMMARY}
        className="flex min-h-[340px] flex-col gap-[7px] p-[18px] font-mono text-[12px] leading-[1.6] text-[#9a9a9a]"
      >
        <div className="text-lp-fg">
          <span className="text-lp-faint">you › </span>
          <span data-typed="you">{YOU}</span>
          <span data-caret className={caretClass} style={{ display: "none" }} />
          <span data-rest="you" className="invisible" />
        </div>
        <div data-line="estimate">
          <Arrow />
          estimate · {GRID}×{GRID} AI grid · {ENGINES.length} engines · <span className="text-lp-fg">≈ {ESTIMATE}</span>
        </div>
        <div data-line="confirm">
          <Arrow />
          confirm paid action?{" "}
          <span data-typed="yes" className="text-lp-fg">
            {YES}
          </span>
          <span data-caret className={caretClass} style={{ display: "none" }} />
          <span data-rest="yes" className="invisible" />
        </div>
        <div data-line="grid">
          <Arrow />
          runs a {GRID}×{GRID} AI grid on your keys
        </div>
        <div data-line="grid" className="flex items-center gap-1 pl-4">
          <span data-squares="grid" className="flex items-center gap-1">
            {NAMED_AT.map((_, k) => (
              <span key={k} className={squareClass} style={{ background: gridColour(k) }} />
            ))}
          </span>
          <span data-line="grid-result" className="ml-2 text-[#ff9a52]">
            {GRID_RESULT}
          </span>
        </div>
        <div data-line="audit">
          <Arrow />
          runs a Local AI Audit
        </div>
        <div data-line="audit" className="flex items-center gap-1 pl-4">
          <span data-squares="audit" className="flex items-center gap-1">
            {FINDINGS.map((f, k) => (
              <span key={f.title} className={squareClass} style={{ background: auditColour(k) }} />
            ))}
          </span>
          <span data-line="audit-result" className="ml-2 text-[#ff9a52]">
            {AUDIT_RESULT}
          </span>
        </div>
        <div data-line="agent" className="text-[#e9e6e1]">
          <span className="text-lp-faint">agent › </span>
          <span data-typed="agent">{AGENT}</span>
          <span data-caret className={caretClass} style={{ display: "inline-block" }} />
          <span data-rest="agent" className="invisible" />
        </div>
      </div>
      <AiDisclaimer className="m-0 border-t border-lp-line px-[18px] py-3 text-lp-dim" />
    </Bezel>
  );
}
