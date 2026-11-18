"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ctaClass, secondaryClass } from "@/components/brand/primitives";
import { Segmented } from "@/components/brand/segmented";
import { track } from "@/lib/analytics";
import type { BatchRow, Candidate } from "@/lib/prospects/batch";
import { StatusChip, inputClass, labelClass } from "./ui";
import { CREDIT_COST } from "@/lib/pricing-constants";
import { plural } from "./first-run";

const money = (v: number) => "$" + (v < 1 ? v.toFixed(3) : v.toFixed(2));
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const COUNTRIES = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["IE", "Ireland"], ["NZ", "New Zealand"]] as const;
const keyOf = (c: Candidate, i: number) => c.cid ?? c.place_id ?? `${c.name}:${i}`;

interface Estimate { reports: number; perReportUsd: number; totalUsd: number; credits: number; lines: { label: string; usd: number }[] }

/** Find businesses (search or CSV), pick the ones to report on, see the estimate, confirm. */
export function ProspectFinder({ credits, locked, hasDataForSeo }: { credits: number; locked: boolean; hasDataForSeo: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"search" | "csv">("search");
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState<(typeof COUNTRIES)[number][0]>("US");
  const [funding, setFunding] = useState<"byok" | "credits">(hasDataForSeo ? "byok" : "credits");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [unresolved, setUnresolved] = useState<{ name: string; city: string; reason: string }[]>([]);
  const [rowProblems, setRowProblems] = useState<{ row: number; message: string }[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState<"find" | "create" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0);

  const chosen = useMemo(() => (candidates ?? []).filter((c, i) => selected.has(keyOf(c, i))), [candidates, selected]);
  const body = (confirm: boolean) => ({ mode, niche, city: mode === "search" ? city : null, country, candidates: chosen, funding, confirm });
  const chosenKey = chosen.map((c) => c.cid ?? c.name).join("|");

  // Estimate for the current selection (the server computes it; nothing is created without confirm).
  useEffect(() => {
    if (!chosen.length || niche.trim().length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      const res = await post("/api/prospects", body(false));
      const json = (await res.json().catch(() => ({}))) as { estimate?: Estimate; error?: string; message?: string };
      if (my !== seq.current) return;
      setEstimate(json.estimate ?? null);
      setProblem(json.error === "confirmation_required" ? null : (json.message ?? "Could not estimate this batch."));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `body` is derived from the values listed
  }, [chosenKey, niche, funding, mode, city, country]);

  const reset = () => { setCandidates(null); setSelected(new Set()); setUnresolved([]); setRowProblems([]); setEstimate(null); };

  const find = async () => {
    setBusy("find");
    setProblem(null);
    reset();
    const res = mode === "search" ? await post("/api/prospects/discover", { niche, city, country, funding }) : await post("/api/prospects/resolve", { csv, funding });
    const json = (await res.json().catch(() => ({}))) as { candidates?: Candidate[]; resolved?: Candidate[]; unresolved?: typeof unresolved; problems?: typeof rowProblems; message?: string };
    setBusy(null);
    if (!res.ok) {
      setRowProblems(json.problems ?? []);
      return setProblem(json.message ?? "The lookup did not complete.");
    }
    const list = mode === "search" ? (json.candidates ?? []) : (json.resolved ?? []);
    setCandidates(list);
    setUnresolved(json.unresolved ?? []);
    setRowProblems(json.problems ?? []);
    // Search mode: businesses already in the top 3 are the ones least likely to need help, so they start unticked.
    setSelected(new Set(list.map((c, i) => [c, i] as const).filter(([c]) => mode === "csv" || (c.rank ?? 99) > 3).slice(0, 200).map(([c, i]) => keyOf(c, i))));
  };

  const create = async () => {
    setBusy("create");
    setProblem(null);
    const res = await post("/api/prospects", body(true));
    const json = (await res.json().catch(() => ({}))) as { batch_id?: string; message?: string };
    if (res.ok && json.batch_id) return router.push(`/app/prospects/${json.batch_id}`);
    setBusy(null);
    setProblem(json.message ?? "The batch could not start. Nothing was charged.");
  };

  const canFind = mode === "search" ? niche.trim().length >= 2 && city.trim().length >= 2 : csv.trim().length > 0 && niche.trim().length >= 2;
  const toggle = (k: string) => setSelected((cur) => { const next = new Set(cur); if (next.has(k)) next.delete(k); else next.add(k); return next; });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <Segmented label="How to find businesses" value={mode} onChange={(m) => { setMode(m); reset(); setProblem(null); }} options={[{ value: "search" as const, label: "Search a niche and city" }, { value: "csv" as const, label: "Upload a CSV" }]} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_0.9fr]">
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Service</span>
            <input value={niche} onChange={(e) => setNiche(e.target.value)} maxLength={80} placeholder="dentist" className={inputClass} />
          </label>
          {mode === "search" ? (
            <label className="flex flex-col gap-[6px]">
              <span className={labelClass}>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={120} placeholder="Austin, TX" className={inputClass} />
            </label>
          ) : (
            <label className="flex flex-col gap-[6px]">
              <span className={labelClass}>CSV file</span>
              <input
                type="file" accept=".csv,text/csv" className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg`}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 1_000_000) return setProblem("The file is larger than 1 MB.");
                  setFileName(f.name);
                  setCsv(await f.text());
                  reset();
                }}
              />
            </label>
          )}
          <label className="flex flex-col gap-[6px]">
            <span className={labelClass}>Country</span>
            <select value={country} onChange={(e) => setCountry(e.target.value as typeof country)} className={inputClass}>{COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
        </div>
        {mode === "csv" ? (
          <p className="m-0 text-[13px] leading-normal text-dim">
            Columns: <span className="font-mono">name, address, city, region, country, website, phone, place_id</span>. Name and city are required. Up to 200 rows.{fileName ? ` Loaded: ${fileName}.` : ""}
          </p>
        ) : null}
        <div className="flex flex-col gap-[6px]">
          <span className={labelClass}>Paid with</span>
          <Segmented label="Funding" value={funding} onChange={(f) => { setFunding(f); setEstimate(null); }} options={[{ value: "byok" as const, label: "My own keys" }, { value: "credits" as const, label: "Included scans" }]} />
          {funding === "credits" ? <span className="text-[13px] text-dim">Each report uses {plural(CREDIT_COST.prospect_report, "credit")}. You have {credits} left.</span> : null}
          {funding === "byok" && !hasDataForSeo ? <span className="text-[13px] text-amber">Prospect mode needs your DataForSEO login (Settings → API keys), or included scans.</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={find} disabled={!canFind || busy !== null || locked} className={ctaClass("md", "cursor-pointer border-0")}>
            <span>{busy === "find" ? "Looking…" : locked ? "Needs lifetime access" : mode === "search" ? "Find businesses" : "Check the rows"}</span><span aria-hidden>→</span>
          </button>
          <span className="text-[13px] text-dim">
            {mode === "search"
              ? funding === "byok" ? "One Google Maps search, about $0.01 on your DataForSEO key." : "One Google Maps search on our keys. No credit is taken until you create reports."
              : funding === "byok" ? "One Google Maps lookup per row, about $0.002 each on your DataForSEO key." : "One Google Maps lookup per row on our keys. No credit is taken until you create reports."}
          </span>
        </div>
        {problem && !candidates ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
        {rowProblems.length ? (
          <p className="m-0 text-[13px] text-amber">Skipped {rowProblems.length} {rowProblems.length === 1 ? "row" : "rows"}: {rowProblems.slice(0, 8).map((p) => `row ${p.row} (${p.message.replace(/\.$/, "").toLowerCase()})`).join(", ")}{rowProblems.length > 8 ? "…" : ""}.</p>
        ) : null}
      </div>

      {candidates ? (
        candidates.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">No businesses were found. Try a broader service or a nearby city.</p> : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[14px]">
                <span className="text-muted-foreground"><span className="font-mono text-fg">{chosen.length}</span> of {candidates.length} selected</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setSelected(new Set(candidates.slice(0, 200).map(keyOf)))} className={secondaryClass("cursor-pointer py-[5px] text-[13px]")}>Select all</button>
                  <button type="button" onClick={() => setSelected(new Set())} className={secondaryClass("cursor-pointer py-[5px] text-[13px]")}>Select none</button>
                </span>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[620px] border-collapse text-left text-[14px]">
                  <thead className="sticky top-0 bg-surface-2 text-[13px] text-dim">
                    <tr>{["", mode === "search" ? "Rank" : "", "Business", "Rating", "Reviews", "Website", "Phone"].map((h, i) => <th key={i} scope="col" className="border-b border-line px-3 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {candidates.map((c, i) => {
                      const k = keyOf(c, i);
                      return (
                        <tr key={k} className="border-b border-line last:border-0">
                          <td className="px-3 py-2"><input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} aria-label={`Select ${c.name}`} className="size-4 accent-[var(--rb-g1)]" /></td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{c.rank ?? ""}</td>
                          <td className="px-3 py-2"><span className="font-medium">{c.name}</span>{c.city ? <span className="block text-[12px] text-dim">{c.city}</span> : null}</td>
                          <td className="px-3 py-2 font-mono">{c.rating != null ? c.rating.toFixed(1) : "—"}</td>
                          <td className="px-3 py-2 font-mono">{c.reviews ?? "—"}</td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-muted-foreground">{c.website ? c.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{c.phone ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {mode === "search" ? <p className="m-0 text-[13px] text-dim">Rank is the position in this one Google Maps search for “{niche} in {city}”. Businesses in the top 3 start unticked.</p> : null}
              {unresolved.length ? (
                <details className="rounded-xl border border-border bg-inset px-4 py-3">
                  <summary className="text-[14px] font-medium">{unresolved.length} {unresolved.length === 1 ? "row was" : "rows were"} not found on Google Maps</summary>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px] text-muted-foreground">{unresolved.map((r, i) => <li key={i}><span className="text-fg-2">{r.name}</span>, {r.city}: {r.reason}</li>)}</ul>
                </details>
              ) : null}
            </div>

            <aside className="flex h-fit flex-col gap-4 rounded-2xl border border-border bg-inset p-5" aria-live="polite">
              <span className="text-[13px] tracking-[0.05em] text-dim uppercase">Estimate before you run</span>
              {estimate && chosen.length ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[40px] leading-none font-semibold tracking-[-0.03em]">{funding === "credits" ? estimate.credits : `≈ ${money(estimate.totalUsd)}`}</span>
                    <span className="text-[15px] text-muted-foreground">{funding === "credits" ? "credits" : "on your keys"}</span>
                  </div>
                  <span className="text-[14px] text-muted-foreground">{estimate.reports} {estimate.reports === 1 ? "report" : "reports"} · {funding === "credits" ? "2 credits each" : `≈ ${money(estimate.perReportUsd)} each`}</span>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
                    {estimate.lines.map((l) => <li key={l.label} className="flex justify-between gap-3 text-muted-foreground"><span>{l.label}</span><span className="font-mono text-fg">{money(l.usd)}</span></li>)}
                  </ul>
                  <p className="m-0 text-[13px] leading-normal text-dim">
                    Each report: Google Maps 5×5 grid, AI 3×3 grid, a quick audit and a factual opener. {funding === "credits" ? "The API cost is ours; a report that fails gives its credits back." : "Your vendors bill you."} The Maps grid uses the cheaper standard queue, so a batch takes about 5 to 10 minutes.
                  </p>
                </>
              ) : <p className="m-0 text-[15px] text-muted-foreground">Select businesses and enter the service to see the cost.</p>}
              {problem ? <p role="alert" className="m-0 text-[14px] text-danger">{problem}</p> : null}
              <button type="button" onClick={create} disabled={!chosen.length || !estimate || busy !== null || locked} className={ctaClass("block", "cursor-pointer border-0 text-[16px]")}>
                <span>{busy === "create" ? "Starting…" : `Create ${chosen.length} prospect ${chosen.length === 1 ? "report" : "reports"}`}</span><span aria-hidden>→</span>
              </button>
              <p className="m-0 text-[12px] leading-normal text-dim">RankbyAI does not contact these businesses and does not collect email addresses. Your outreach is yours, and must follow the laws that apply to you.</p>
            </aside>
          </div>
        )
      ) : null}
    </div>
  );
}

// ───────────────────────── batch progress ─────────────────────────

export interface BatchView { id: string; mode: string; niche: string | null; city: string | null; funding: string; total: number; done: number; failed: number; status: string; rows: BatchRow[]; created_at: string }

const ROW_LABEL: Record<BatchRow["status"], string> = { queued: "waiting", scanning: "scanning", auditing: "auditing", done: "ready", failed: "failed" };

export function BatchProgress({ initial }: { initial: BatchView }) {
  const [batch, setBatch] = useState(initial);
  const active = batch.status === "queued" || batch.status === "running";

  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const res = await fetch(`/api/prospects/${initial.id}`, { cache: "no-store" }).catch(() => null);
      const json = res?.ok ? ((await res.json().catch(() => null)) as { batch?: BatchView } | null) : null;
      if (json?.batch) setBatch(json.batch);
      if (!stop) setTimeout(tick, 5000);
    };
    const t = setTimeout(tick, 1500);
    return () => { stop = true; clearTimeout(t); };
  }, [active, initial.id]);

  const finished = batch.done + batch.failed;
  const pct = batch.total ? Math.round((finished / batch.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[17px] font-semibold">
            {active ? `Building reports: ${finished} of ${batch.total}` : batch.status === "failed" ? "No report could be built" : `${batch.done} of ${batch.total} reports ready`}
          </span>
          <StatusChip tone={batch.status === "done" ? "good" : batch.status === "failed" ? "bad" : "warn"}>{batch.status}</StatusChip>
        </div>
        <div className="h-[6px] overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Batch progress">
          <div className="h-full rounded-full bg-g1 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="m-0 text-[13px] text-dim">
          {active ? "The Maps grid uses the standard queue, so a batch takes about 5 to 10 minutes. Reports are saved as they finish. Keep this page open, or come back to it, to keep the batch moving." : batch.failed ? `${batch.failed} ${batch.failed === 1 ? "report" : "reports"} failed${batch.funding === "credits" ? " and gave their credits back" : ""}.` : "Every report is ready."}
        </p>
        <div className="flex flex-wrap gap-2">
          {batch.done > 0 ? (
            <>
              <a href={`/api/prospects/${batch.id}/reports.zip`} download onClick={() => track("pdf_downloaded", { kind: "batch_zip" })} className={ctaClass("sm", "no-underline")}><span>Download all PDFs (zip)</span><span aria-hidden>↓</span></a>
              <a href={`/api/prospects/${batch.id}/export.csv`} download onClick={() => track("csv_exported", { kind: "prospect_batch" })} className={secondaryClass("no-underline")}>Export CSV</a>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
          <thead className="text-[13px] text-dim">
            <tr>{["Business", "Maps top 3", "AI mentions", "Named instead", "Opener", "Status", ""].map((h, i) => <th key={i} scope="col" className="border-b border-line px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {batch.rows.map((r) => (
              <tr key={r.idx} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-3"><span className="font-medium">{r.name}</span>{r.phone ? <span className="block text-[12px] text-dim">{r.phone}</span> : null}</td>
                <td className="px-4 py-3 font-mono">{r.maps_top3_share != null ? `${r.maps_top3_share}%` : "—"}</td>
                <td className="px-4 py-3 font-mono">{r.ai_mention_rate != null ? `${r.ai_mention_rate}%` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.top_competitor ?? "—"}</td>
                <td className="max-w-[320px] px-4 py-3 text-[13px] leading-normal text-fg-2">{r.opener ?? (r.status === "done" ? <span className="text-dim">Nothing notable to open with: this business does well on both.</span> : r.error ? <span className="text-danger">{r.error}</span> : "—")}</td>
                <td className="px-4 py-3"><StatusChip tone={r.status === "done" ? "good" : r.status === "failed" ? "bad" : "idle"}>{ROW_LABEL[r.status]}</StatusChip></td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.report_slug ? (
                    <span className="flex gap-3 text-[13px]">
                      <Link href={`/r/${r.report_slug}`} target="_blank" className="text-fg underline underline-offset-2">Report</Link>
                      <a href={`/api/reports/${r.report_slug}/pdf`} download onClick={() => track("pdf_downloaded", { kind: "prospect" })} className="text-muted-foreground underline underline-offset-2 hover:text-fg">PDF</a>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[13px] text-dim">Maps top 3: share of grid points where the business ranks 1 to 3. AI mentions: share of grid points where at least one AI engine named it. AI answers vary between runs, places and time.</p>
    </div>
  );
}
