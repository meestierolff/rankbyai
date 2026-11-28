"use client";

import { useEffect, useRef } from "react";
import { PriorityBadge, ScoreRing } from "@/components/brand/primitives";
import { SAMPLE, SAMPLE_AUDIT } from "@/lib/sample-data";
import { useOnScreen } from "./lp-motion";
import styles from "./audit-sample.module.css";

/** The homepage's fictional audit, presented as a short, one-shot diagnostic sequence. */
export function AuditSample() {
  const frame = useRef<HTMLElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(frame);
  const played = useRef(false);
  useEffect(() => {
    if (!onScreen || played.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    played.current = true;
    const number = score.current;
    const start = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 900);
      if (number) number.textContent = String(Math.round(SAMPLE_AUDIT.score * (1 - (1 - progress) ** 3)));
      if (progress < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      if (number) number.textContent = String(SAMPLE_AUDIT.score);
    };
  }, [onScreen]);
  const findings = SAMPLE_AUDIT.findings.filter((_, i) => i !== 2);
  return (
    <figure ref={frame} className="m-0 w-full overflow-hidden rounded-2xl border border-border bg-lp-surface">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 text-[13px] text-lp-muted">
        <span>{SAMPLE.business} · Local AI Audit</span>
        <span className="rounded-full border border-border px-2 py-1 font-mono text-[11px]">Sample data</span>
      </figcaption>
      <div className="grid items-center gap-5 p-5 sm:grid-cols-[200px_1fr] sm:p-6">
        <div className="flex items-center gap-4 sm:flex-col sm:items-start">
          <div className="relative">
            <div aria-hidden><ScoreRing score={SAMPLE_AUDIT.score} /></div>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-lp-surface" style={{ margin: 12 }}>
              <span ref={score} aria-hidden className="font-mono text-[36px] leading-none font-semibold">{SAMPLE_AUDIT.score}</span>
              <span aria-hidden className="font-mono text-[13px] text-dim">/100</span>
            </span>
            <span className="sr-only">Sample score: {SAMPLE_AUDIT.score} out of 100</span>
          </div>
          <div className="text-[14px] leading-relaxed text-lp-muted">Fix the gaps.<br /><span className="text-lp-fg">Start with P0.</span></div>
        </div>
        <ol className="m-0 grid list-none gap-2 p-0" aria-label="Sample findings in priority order">
          {findings.map((f, i) => (
            <li key={f.title} className={`${onScreen ? styles.finding : ""} flex items-start gap-3 rounded-xl border border-border px-3 py-3 text-[13px] leading-normal text-lp-fg`} style={{ animationDelay: `${i * 120}ms` }}>
              <PriorityBadge priority={f.priority} className="mt-0.5 shrink-0" />
              <span>{f.title}</span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
