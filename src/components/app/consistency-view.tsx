"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { pointName } from "@/components/brand/grid";
import type { RunComparison } from "@/lib/scans/consistency";
import { Panel, StatTile, StatusChip } from "./ui";

interface Report {
  group_id: string | null;
  business: string;
  grid_size: number;
  status: "running" | "done";
  runs: { role: "A1" | "A2" | "B1" | "B2"; scan_id: string; status: string; service: string | null; question: string; created_at: string }[];
  same_question: RunComparison | null;
  second_question_repeat: RunComparison | null;
  across_questions: RunComparison | null;
  disclaimer: string;
}

const ROLE: Record<Report["runs"][number]["role"], string> = { A1: "Run 1", A2: "Run 2 (same question)", B1: "Second question", B2: "Second question again" };
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

function Comparison({ title, c, a, b, n }: { title: string; c: RunComparison; a: string; b: string; n: number }) {
  const flips = c.points.flatMap((p) => p.engines.filter((e) => e.a !== e.b).map((e) => ({ idx: p.idx, engine: e.engine, a: e.a, b: e.b })));
  const where = (idx: number) => pointName(Math.floor(idx / n), idx % n);
  const engineLabel = (e: string) => c.engines.find((x) => x.engine === e)?.label ?? e;
  return (
    <Panel title={title}>
      <div className="flex flex-col gap-5 text-[14px]">
        <p className="m-0">
          <span className="font-mono text-[28px] font-semibold tracking-[-0.02em]">{pct(c.decisions.stability_rate)}</span>{" "}
          <span className="text-muted-foreground">of mention decisions agreed ({c.decisions.agreed} of {c.decisions.compared} answers both runs gave: named in both, or in neither).</span>
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead className="text-[13px] text-dim"><tr>{["Engine", "Agreed", "Named in " + a, "Named in " + b].map((h) => <th key={h} className="border-b border-line py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {c.engines.map((e) => (
                <tr key={e.engine} className="border-b border-line last:border-0">
                  <td className="py-2 pr-4">{e.label}</td>
                  <td className="py-2 pr-4 font-mono">{e.agreed}/{e.compared} ({pct(e.stability_rate)})</td>
                  <td className="py-2 pr-4 font-mono">{e.named_a}/{e.compared}</td>
                  <td className="py-2 pr-4 font-mono">{e.named_b}/{e.compared}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([["Named in both", c.names.stable, (r: RunComparison["names"]["stable"][number]) => `${r.answers_a} / ${r.answers_b} answers`], [`Only in ${a}`, c.names.only_a, (r: RunComparison["names"]["stable"][number]) => `${r.answers_a} answers`], [`Only in ${b}`, c.names.only_b, (r: RunComparison["names"]["stable"][number]) => `${r.answers_b} answers`]] as const).map(([label, rows, count]) => (
            <div key={label} className="flex flex-col gap-1">
              <span className="text-[13px] font-medium tracking-[0.05em] text-dim uppercase">{label}</span>
              {rows.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">{rows.slice(0, 10).map((r) => <li key={r.name}>{r.name} <span className="text-dim">· {count(r)}</span></li>)}</ul>
              ) : <span className="text-dim">none</span>}
            </div>
          ))}
        </div>
        {c.names.overlap_rate != null ? <p className="m-0 text-[13px] text-dim">{pct(c.names.overlap_rate)} of the other businesses named were named in both runs.</p> : null}
        {flips.length ? (
          <details>
            <summary className="cursor-pointer text-[14px]">Where the business&apos;s own mention flipped ({flips.length})</summary>
            <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
              {flips.map((f) => <li key={`${f.idx}-${f.engine}`}>Point {where(f.idx)} · {engineLabel(f.engine)}: {f.a ? "named" : "not named"} in {a}, {f.b ? "named" : "not named"} in {b}</li>)}
            </ul>
          </details>
        ) : <p className="m-0 text-[13px] text-dim">The business&apos;s own mention did not flip at any point.</p>}
      </div>
    </Panel>
  );
}

/** A consistency check: its runs while they work, then how stable the answers were. Polls while runs are going (polling also moves the next run along). */
export function ConsistencyView({ query, base }: { query: { group_id?: string; a?: string; b?: string }; base: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => !!v) as [string, string][]).toString();

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const res = await fetch(`/api/scans/consistency?${qs}`, { cache: "no-store" }).catch(() => null);
      const json = res ? ((await res.json().catch(() => null)) as { consistency?: Report; message?: string } | null) : null;
      if (stop) return;
      if (json?.consistency) {
        setReport(json.consistency);
        setProblem(null);
        if (json.consistency.status === "running") timer = setTimeout(tick, 8000);
      } else setProblem(json?.message ?? "The check could not be loaded. Reload the page to try again.");
    };
    void tick();
    return () => { stop = true; if (timer) clearTimeout(timer); };
  }, [qs]);

  if (problem) return <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p>;
  if (!report) return <p className="m-0 text-[14px] text-muted-foreground">Loading the check…</p>;
  const label = (role: Report["runs"][number]["role"]) => {
    const r = report.runs.find((x) => x.role === role);
    return role[0] === "B" && r ? `${ROLE[role]} (${r.question})` : ROLE[role];
  };
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Runs">
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]" aria-live="polite">
          {report.runs.map((r) => (
            <li key={r.scan_id} className="flex flex-wrap items-center gap-3">
              <StatusChip tone={r.status === "done" ? "good" : r.status === "failed" ? "bad" : r.status === "partial" ? "warn" : "idle"}>{r.status}</StatusChip>
              <span>{label(r.role)}: “{r.service}”, {r.question} question</span>
              <Link href={`${base}/${r.scan_id}`} className="text-muted-foreground underline underline-offset-2 hover:text-fg">answers</Link>
            </li>
          ))}
        </ul>
        {report.status === "running" ? <p className="mt-3 mb-0 text-[13px] text-dim">The runs go one after another so they do not compete for the same engines. Keep this page open, or come back to it.</p> : null}
      </Panel>
      {report.same_question || report.across_questions ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {report.same_question ? <StatTile label="Same question, two runs" value={pct(report.same_question.decisions.stability_rate)} hint="mention decisions that agreed" /> : null}
          {report.second_question_repeat ? <StatTile label="Second question, two runs" value={pct(report.second_question_repeat.decisions.stability_rate)} hint="mention decisions that agreed" /> : null}
          {report.across_questions ? <StatTile label="Across the two questions" value={pct(report.across_questions.decisions.stability_rate)} hint="mention decisions that agreed" /> : null}
        </div>
      ) : null}
      {report.same_question ? <Comparison title="The same question, asked twice" c={report.same_question} a="run 1" b="run 2" n={report.grid_size} /> : null}
      {report.second_question_repeat ? <Comparison title={`The second question (${report.runs.find((r) => r.role === "B1")?.question}), asked twice`} c={report.second_question_repeat} a="its run 1" b="its run 2" n={report.grid_size} /> : null}
      {report.across_questions ? <Comparison title={`Across questions: ${report.runs.find((r) => r.role === "A1")?.question} vs ${report.runs.find((r) => r.role === "B1")?.question}`} c={report.across_questions} a="the first" b="the second" n={report.grid_size} /> : null}
      <p className="m-0 text-[13px] leading-normal text-dim">{report.disclaimer}</p>
    </div>
  );
}
