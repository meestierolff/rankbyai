"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AiDisclaimer } from "@/components/brand/primitives";
import { DotGrid, EngineDots, aiCellColors, dotGridScale, mapsCellColors, pointName, skippedCell, type CellView } from "@/components/brand/grid";
import { Segmented } from "@/components/brand/segmented";
import { track } from "@/lib/analytics";
import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import { skippedLine } from "@/lib/scans/skip";
import { cn } from "@/lib/utils";
import { markerSizeFor, type MapPoint } from "./grid-map";
import { ErrorState, StatTile, StatusChip, fmtUsd } from "./ui";
import { LocalTime } from "./local-time";

const GridMap = dynamic(() => import("./grid-map").then((m) => m.GridMap), {
  ssr: false,
  loading: () => <div className="h-[460px] animate-pulse rounded-xl bg-surface" aria-label="Loading map" />,
});

export interface ScanData {
  scan: {
    id: string; kind: "ai" | "maps"; keyword: string | null; niche: string | null; engines: Engine[]; grid_size: number; radius_miles: number;
    center_lat: number; center_lng: number; mode: string; funding: string; status: "queued" | "running" | "done" | "partial" | "failed";
    est_cost_usd: number | null; actual_cost_usd: number | null; credits_used: number; error: string | null; created_at: string; finished_at: string | null;
    summary: Record<string, unknown> & { mock?: boolean };
  };
  points: { idx: number; row: number; col: number; lat: number; lng: number; label: string | null; rank: number | null; status: string; error: string | null; top: { rank: number; name: string; cid?: string | null; rating?: number | null; reviews?: number | null }[] | null }[];
  samples: {
    point_idx: number; engine: Engine; engine_variant: string | null; prompt: string; answer_text: string | null; mentioned: boolean | null; mention_position: number | null;
    named_businesses: { name: string; position: number; you?: boolean }[]; sources: { url: string; title: string }[]; cost_usd: number | null; status: string; error: string | null;
  }[];
}

const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");
const statusTone = (s: string) => (s === "done" ? "good" : s === "failed" ? "bad" : s === "partial" ? "warn" : "idle");

/** Live scan result. Polls while the scan runs so the grid fills in point by point. */
export function ScanResult({ scanId, businessName, initial }: { scanId: string; businessName: string; initial?: ScanData | null }) {
  const [data, setData] = useState<ScanData | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "map">("grid");
  const [selected, setSelected] = useState<number | null>(null);
  const reported = useRef(false);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/scans/${scanId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? "This scan does not exist in your workspace." : "The scan could not be loaded.");
        const json = (await res.json()) as ScanData;
        if (stop) return;
        setData(json);
        setLoadError(null);
        const active = json.scan.status === "queued" || json.scan.status === "running";
        if (active) timer = setTimeout(tick, 2500);
        else if (!reported.current) {
          reported.current = true;
          const secs = json.scan.finished_at ? Math.round((new Date(json.scan.finished_at).getTime() - new Date(json.scan.created_at).getTime()) / 1000) : 0;
          track("scan_completed", { kind: json.scan.kind, actual_usd: json.scan.actual_cost_usd ?? 0, duration_s: secs });
        }
      } catch (e) {
        if (!stop) {
          setLoadError(e instanceof Error ? e.message : "The scan could not be loaded.");
          timer = setTimeout(tick, 6000);
        }
      }
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [scanId]);

  if (!data) {
    return loadError ? <ErrorState body={loadError} /> : <div className="h-64 animate-pulse rounded-2xl bg-surface" aria-busy="true" aria-label="Loading scan" />;
  }
  const { scan } = data;
  const active = scan.status === "queued" || scan.status === "running";
  const center = Math.floor((scan.grid_size * scan.grid_size) / 2);
  const skippedCount = data.points.filter((p) => p.status === "skipped").length;
  // Open on the business's own point, or on the first checked point when the user skipped that one.
  const centreSkipped = data.points.find((p) => p.idx === center)?.status === "skipped";
  const sel = selected ?? (centreSkipped ? (data.points.find((p) => p.status !== "skipped")?.idx ?? center) : center);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-[14px] text-muted-foreground">
        <StatusChip tone={statusTone(scan.status)}>{active ? "running" : scan.status}</StatusChip>
        <span>{scan.kind === "ai" ? "AI grid" : "Maps grid"} {scan.grid_size}×{scan.grid_size}{skippedCount ? ` (${skippedLine(scan.grid_size, skippedCount)})` : ""} · {Number(scan.radius_miles)} mi radius · “{scan.niche ?? scan.keyword}”</span>
        <span>· <LocalTime iso={scan.created_at} /></span>
        <span className="font-mono">
          · estimate {fmtUsd(scan.est_cost_usd, 3)} → actual {active ? "…" : fmtUsd(scan.actual_cost_usd, 3)}
          {scan.funding === "credits" ? ` (included scans, ${scan.credits_used} ${scan.credits_used === 1 ? "credit" : "credits"})` : scan.funding === "byok" ? " on your keys" : ""}
        </span>
      </div>
      {scan.summary?.mock ? (
        <div role="note" className="rounded-xl border border-amber/50 bg-surface-2 px-4 py-3 text-[14px] text-amber">Mock data: this scan ran in development mode with simulated vendor responses.</div>
      ) : null}
      {scan.error ? <ErrorState title="This scan did not complete" body={scan.error} /> : null}
      {!active && (scan.status === "partial" || scan.status === "failed") && scan.funding === "byok" ? <RetryFailed scanId={scan.id} /> : null}
      {loadError ? <p role="alert" className="m-0 text-[14px] text-danger">{loadError} Retrying…</p> : null}

      {scan.kind === "ai" ? (
        <AiResult data={data} businessName={businessName} view={view} setView={setView} sel={sel} setSel={setSelected} />
      ) : (
        <MapsResult data={data} businessName={businessName} view={view} setView={setView} sel={sel} setSel={setSelected} />
      )}
    </div>
  );
}

/** Re-runs only the failed parts of a scan (never repeats work that already succeeded and was paid for). */
function RetryFailed({ scanId }: { scanId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-3 text-[14px] text-muted-foreground">
      <span>Some parts of this scan failed. Retrying runs only those parts on your keys.</span>
      <button
        type="button"
        disabled={busy}
        className="cursor-pointer rounded-[9px] border border-border-strong bg-transparent px-3 py-[7px] text-[14px] font-medium text-fg hover:bg-line disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/scans/${scanId}/retry`, { method: "POST" });
          const json = (await res.json().catch(() => ({}))) as { message?: string };
          if (res.ok) return window.location.reload();
          setBusy(false);
          setError(json.message ?? "The retry could not start.");
        }}
      >
        {busy ? "Starting…" : "Retry failed parts"}
      </button>
      {error ? <span role="alert" className="text-danger">{error}</span> : null}
    </div>
  );
}

interface ViewProps {
  data: ScanData;
  businessName: string;
  view: "grid" | "map";
  setView: (v: "grid" | "map") => void;
  sel: number;
  setSel: (i: number) => void;
}

function ViewToggle({ view, setView }: Pick<ViewProps, "view" | "setView">) {
  return <Segmented label="View" size="sm" value={view} onChange={setView} options={[{ value: "grid" as const, label: "Grid" }, { value: "map" as const, label: "Map" }]} className="w-[150px]" />;
}

function AiResult({ data, businessName, view, setView, sel, setSel }: ViewProps) {
  const { scan, points, samples } = data;
  const [engine, setEngine] = useState<Engine | "all">("all");
  const n = scan.grid_size;
  const summary = scan.summary as { engines?: Record<string, { done: number; total: number; mentioned: number; mention_rate: number | null; avg_position: number | null; available: boolean }>; points_mentioned?: number; share_of_ai_voice?: number | null; ai_avg_position?: number | null; mentions_yours?: number; mentions_total?: number; top_competitors?: { name: string; mentions: number }[]; top_sources?: { domain: string; count: number; engines: Engine[] }[]; samples_done?: number; samples_total?: number };

  const byPoint = useMemo(() => {
    const m = new Map<number, ScanData["samples"]>();
    for (const s of samples) m.set(s.point_idx, [...(m.get(s.point_idx) ?? []), s]);
    return m;
  }, [samples]);

  const cellFor = (idx: number): { bg: string; fg: string; label: string; title: string; skipped?: boolean } => {
    const list = byPoint.get(idx) ?? [];
    const p = points.find((x) => x.idx === idx);
    const where = p ? pointName(p.row, p.col) : `#${idx}`;
    if (p?.status === "skipped") return skippedCell(where);
    if (engine !== "all") {
      const s = list.find((x) => x.engine === engine);
      if (!s || s.status === "pending") return { bg: "var(--rb-well)", fg: "var(--rb-faint)", label: "·", title: `Point ${where}: waiting` };
      if (s.status !== "done") return { bg: "transparent", fg: "var(--rb-faint)", label: "!", title: `Point ${where}: ${ENGINE_LABEL[engine].short} unavailable` };
      const pos = s.mentioned ? (s.mention_position ?? 5) : null;
      const c = aiCellColors(pos);
      return { ...c, label: s.mentioned && s.mention_position == null ? "✓" : c.label, title: `Point ${where}: ${ENGINE_LABEL[engine].short} ${s.mentioned ? `names ${businessName}${s.mention_position ? ` at position ${s.mention_position}` : ""}` : `does not name ${businessName}`}` };
    }
    const done = list.filter((s) => s.status === "done");
    if (!done.length) return { bg: "var(--rb-well)", fg: "var(--rb-faint)", label: list.some((s) => s.status === "pending") ? "·" : "!", title: `Point ${where}: ${list.some((s) => s.status === "pending") ? "waiting" : "no engine available"}` };
    const hits = done.filter((s) => s.mentioned);
    const best = hits.length ? Math.min(...hits.map((s) => s.mention_position ?? 5)) : null;
    const c = aiCellColors(best);
    return { ...c, label: `${hits.length}/${done.length}`, title: `Point ${where}: named by ${hits.length} of ${done.length} engines` };
  };

  const cells: CellView[] = points.map((p) => ({ key: String(p.idx), ...cellFor(p.idx), selected: p.idx === sel }));
  const mapPoints: MapPoint[] = points.map((p) => ({ key: String(p.idx), lat: p.lat, lng: p.lng, ...cellFor(p.idx), selected: p.idx === sel }));
  const selPoint = points.find((p) => p.idx === sel);
  const selSkipped = selPoint?.status === "skipped";
  const selSamples = (byPoint.get(sel) ?? []).filter((s) => engine === "all" || s.engine === engine);
  const engines = scan.engines;
  const checked = points.filter((p) => p.status !== "skipped").length || n * n;
  const anySkipped = checked < points.length;

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <StatTile label="Points where AI names the business" value={`${summary.points_mentioned ?? 0}/${checked}`} hint={anySkipped ? `At least one engine · ${n * n - checked} skipped points not counted` : "At least one engine"} tone={(summary.points_mentioned ?? 0) > 0 ? "good" : undefined} />
        {engines.map((e) => {
          const s = summary.engines?.[e];
          return <StatTile key={e} label={`${ENGINE_LABEL[e].short} mention rate`} value={s?.available ? pct(s.mention_rate) : s ? "unavailable" : "…"} hint={s?.available ? `${s.mentioned}/${s.done} points${s.avg_position ? ` · avg position ${s.avg_position}` : ""}` : s ? "Engine unavailable for this scan" : "Running"} tone={s && !s.available ? "bad" : undefined} />;
        })}
        <StatTile label="Share of AI Voice" value={pct(summary.share_of_ai_voice)} hint="Your mentions ÷ all business mentions" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" aria-label="AI grid">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Engine" size="sm" value={engine} onChange={setEngine}
              options={[{ value: "all" as const, label: "All engines" }, ...engines.map((e) => ({ value: e as Engine | "all", label: ENGINE_LABEL[e].short }))]}
              className="min-w-[320px]"
            />
            <ViewToggle view={view} setView={setView} />
          </div>
          {view === "grid" ? (
            <DotGrid n={n} cells={cells} onSelect={(i) => setSel(points[i].idx)} className="mx-auto w-full max-w-[520px]" fontPx={n >= 5 ? 12 : 15} gapPx={n >= 5 ? 7 : 12} padPx={16} />
          ) : (
            <GridMap center={{ lat: scan.center_lat, lng: scan.center_lng }} radiusMiles={Number(scan.radius_miles)} points={mapPoints} onSelect={(k) => setSel(Number(k))} className="h-[460px]" />
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim">
            {[["var(--rb-g1)", "Named, top 3"], ["var(--rb-amber)", "Named, 4–5"], ["var(--rb-none)", "Not named"]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-[6px]"><span className="size-[9px] rounded-full" style={{ background: c }} />{l}</span>
            ))}
            {anySkipped ? <span className="flex items-center gap-[6px]"><span className="size-[9px] rounded-full border border-dashed border-faint" />Not checked (skipped)</span> : null}
            <span>! = engine unavailable</span>
            {engine === "all" ? <span>Label = engines naming the business</span> : null}
          </div>
          <AiDisclaimer />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" aria-label="Selected point" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-[2px]">
              <span className="font-mono text-[14px] font-semibold">Point {selPoint ? pointName(selPoint.row, selPoint.col) : "—"}</span>
              <span className="text-[13px] text-dim">{selPoint?.label ?? (selPoint ? `${selPoint.lat.toFixed(4)}, ${selPoint.lng.toFixed(4)}` : "")}</span>
            </div>
            {selSkipped ? null : <EngineDots positions={engines.map((e) => { const s = (byPoint.get(sel) ?? []).find((x) => x.engine === e); return !s || s.status !== "done" ? "unavailable" : s.mentioned ? (s.mention_position ?? 5) : null; })} size={10} />}
          </div>
          {selSkipped ? (
            <p className="m-0 text-[14px] text-muted-foreground">This point was skipped when the check was set up: no engine was asked here, and it is not part of any number on this page.</p>
          ) : selSamples.length === 0 ? <p className="m-0 text-[14px] text-muted-foreground">Waiting for answers at this point.</p> : null}
          {selSamples.map((s) => (
            <details key={s.engine} open={selSamples.length === 1 || s.mentioned === true} className="rounded-xl border border-border bg-inset px-4 py-3">
              <summary className="flex items-center justify-between gap-3 text-[15px] font-medium">
                <span>{ENGINE_LABEL[s.engine].short}{s.engine_variant === "search" ? " (Search grounding)" : ""}</span>
                <span className={cn("font-mono text-[12px]", s.status !== "done" ? "text-dim" : s.mentioned ? "text-g1" : "text-muted-foreground")}>
                  {s.status === "pending" ? "running…" : s.status !== "done" ? "unavailable" : s.mentioned ? (s.mention_position ? `named #${s.mention_position}` : "named") : "not named"}
                </span>
              </summary>
              {s.status === "done" ? (
                <div className="mt-3 flex flex-col gap-3">
                  <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
                    {s.named_businesses.map((nb) => (
                      <li key={nb.position + nb.name} className={cn("flex items-center gap-[10px] rounded-[7px] px-2 py-[6px] text-[14px]", nb.you && "bg-you-tint")}>
                        <span className="font-mono text-[12px] font-semibold text-dim">{nb.position}</span>
                        <span className={nb.you ? "text-g1" : "text-fg"}>{nb.name}{nb.you ? " (you)" : ""}</span>
                      </li>
                    ))}
                  </ol>
                  <details>
                    <summary className="text-[13px] text-muted-foreground">Full answer and prompt</summary>
                    <p className="mt-2 mb-0 font-mono text-[12px] leading-normal text-dim">Prompt: {s.prompt}</p>
                    <p className="mt-2 mb-0 text-[14px] leading-[1.55] whitespace-pre-wrap text-fg-2">{s.answer_text}</p>
                  </details>
                  {s.sources.length ? (
                    <div className="flex flex-col gap-1 text-[13px]">
                      <span className="text-[12px] tracking-[0.05em] text-dim uppercase">Cited sources</span>
                      {s.sources.slice(0, 6).map((src) => (
                        <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-muted-foreground underline underline-offset-2 hover:text-fg">{src.title || src.url}</a>
                      ))}
                    </div>
                  ) : null}
                  <span className="font-mono text-[12px] text-dim">Cost {fmtUsd(s.cost_usd, 4)}</span>
                </div>
              ) : s.error ? <p className="mt-2 mb-0 text-[13px] text-dim">{s.error}</p> : null}
            </details>
          ))}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <VoiceBars
          title="Share of AI Voice"
          note="Each business's mentions ÷ all business mentions in this scan's answers."
          empty="No business was named yet."
          rows={[
            { label: businessName, you: true, share: summary.share_of_ai_voice ?? null, detail: `${summary.mentions_yours ?? 0} mentions` },
            ...(summary.top_competitors ?? []).map((c) => ({ label: c.name, share: summary.mentions_total ? c.mentions / summary.mentions_total : null, detail: `${c.mentions} ${c.mentions === 1 ? "mention" : "mentions"}` })),
          ]}
        />
        <RankList title="Most-cited sources (where to get listed)" empty="No sources were cited." rows={(summary.top_sources ?? []).map((s) => ({ label: s.domain, value: `${s.count} · ${s.engines.map((e) => ENGINE_LABEL[e].short).join(", ")}` }))} />
      </div>
    </>
  );
}

/** Share-of-voice list: the tracked business is pinned on top, competitors follow, each with a bar. */
function VoiceBars({ title, note, rows, empty }: { title: string; note: string; rows: { label: string; share: number | null; detail: string; you?: boolean }[]; empty: string }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.share ?? 0));
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 mb-3 text-[13px] text-dim">{note}</p>
      {rows.length <= 1 && !rows[0]?.share ? <p className="m-0 text-[14px] text-muted-foreground">{empty}</p> : (
        <ol className="m-0 flex list-none flex-col gap-[2px] p-0">
          {rows.map((r, i) => (
            <li key={r.label + i} className={cn("grid grid-cols-[minmax(0,1.3fr)_minmax(80px,1fr)_auto] items-center gap-3 rounded-[7px] px-2 py-[7px] text-[14px]", r.you && "bg-you-tint")}>
              <span className={cn("truncate", r.you ? "text-g1" : "text-fg")}>{r.label}{r.you ? " (you)" : ""}</span>
              <span className="h-[8px] overflow-hidden rounded-full bg-inset" aria-hidden>
                <span className={cn("block h-full rounded-full", r.you ? "bg-g1" : "bg-[#4a4a4a]")} style={{ width: `${Math.max(2, ((r.share ?? 0) / max) * 100)}%` }} />
              </span>
              <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">{r.share != null ? `${(r.share * 100).toFixed(1)}%` : "—"} · {r.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RankList({ title, rows, empty }: { title: string; rows: { label: string; value: string }[]; empty: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="m-0 mb-3 text-[15px] font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="m-0 text-[14px] text-muted-foreground">{empty}</p> : (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((r, i) => (
            <li key={r.label} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] last:border-b-0">
              <span className="flex min-w-0 items-center gap-3"><span className="font-mono text-[12px] text-dim">{i + 1}</span><span className="truncate">{r.label}</span></span>
              <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MapsResult({ data, businessName, view, setView, sel, setSel }: ViewProps) {
  const { scan, points } = data;
  const n = scan.grid_size;
  const [overlay, setOverlay] = useState<string>("");
  const summary = scan.summary as { avg_rank?: number | null; top3_share?: number | null; top3_points?: number; solv?: number | null; points_done?: number; found_points?: number; top_competitors?: { name: string; cid: string | null; top3_points: number; avg_rank: number; share?: number | null; rating?: number | null; reviews?: number | null }[] };
  const rivals = summary.top_competitors ?? [];

  const rankAt = (p: ScanData["points"][number]): number | null => {
    if (!overlay) return p.rank;
    return (p.top ?? []).find((t) => (t.cid ?? t.name) === overlay)?.rank ?? null;
  };
  const who = overlay ? (rivals.find((r) => (r.cid ?? r.name) === overlay)?.name ?? "Competitor") : businessName;
  const cellFor = (p: ScanData["points"][number]): { bg: string; fg: string; label: string; title: string; skipped?: boolean } => {
    const where = pointName(p.row, p.col);
    if (p.status === "skipped") return skippedCell(where);
    if (p.status === "pending" || p.status === "posted") return { bg: "var(--rb-well)", fg: "var(--rb-faint)", label: "·", title: `Point ${where}: waiting for Google Maps results` };
    if (p.status === "failed") return { bg: "transparent", fg: "var(--rb-faint)", label: "!", title: `Point ${where}: lookup failed` };
    const r = rankAt(p);
    return { ...mapsCellColors(r), title: `Point ${where}: ${who} ${r ? `ranks #${r}` : "is not in the top 20"}` };
  };
  const cells: CellView[] = points.map((p) => ({ key: String(p.idx), ...cellFor(p), selected: p.idx === sel }));
  const mapPoints: MapPoint[] = points.map((p) => ({ key: String(p.idx), lat: p.lat, lng: p.lng, ...cellFor(p), selected: p.idx === sel, small: n >= 9, size: markerSizeFor(n) }));
  const selPoint = points.find((p) => p.idx === sel);
  const anySkipped = points.some((p) => p.status === "skipped");
  const scale = dotGridScale(n);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
        <StatTile label="Average rank" value={summary.avg_rank ?? "…"} hint="Not in the top 20 counts as 21" />
        <StatTile label="Top-3 share" value={pct(summary.top3_share)} hint={summary.points_done ? `${summary.top3_points ?? 0}/${summary.points_done} points` : "Running"} tone={(summary.top3_share ?? 0) >= 0.5 ? "good" : undefined} />
        <StatTile label="Share of Local Voice" value={pct(summary.solv)} hint="Your top-3 placements ÷ all top-3 slots" />
        <StatTile label="Found in top 20" value={summary.points_done ? `${summary.found_points ?? 0}/${summary.points_done}` : "…"} hint="Points where the listing appears" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" aria-label="Maps grid">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Show rank of
              <select value={overlay} onChange={(e) => setOverlay(e.target.value)} className="rounded-[9px] border border-border-strong bg-inset px-3 py-[7px] text-[13px] text-fg">
                <option value="">{businessName} (you)</option>
                {rivals.map((r) => <option key={r.cid ?? r.name} value={r.cid ?? r.name}>{r.name}</option>)}
              </select>
            </label>
            <ViewToggle view={view} setView={setView} />
          </div>
          {view === "grid" ? (
            <div className="overflow-x-auto">
              <DotGrid n={n} cells={cells} onSelect={(i) => setSel(points[i].idx)} className="mx-auto w-full max-w-[560px]" fontPx={scale.fontPx} gapPx={scale.gapPx} minCellPx={scale.minCellPx} padPx={n >= 13 ? 10 : 14} />
            </div>
          ) : (
            <GridMap center={{ lat: scan.center_lat, lng: scan.center_lng }} radiusMiles={Number(scan.radius_miles)} points={mapPoints} onSelect={(k) => setSel(Number(k))} className="h-[480px]" />
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim">
            {[["var(--rb-g1)", "1–3"], ["var(--rb-amber)", "4–10"], ["var(--rb-orange)", "11–20"], ["var(--rb-red)", "20+"]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-[6px]"><span className="size-[9px] rounded-full" style={{ background: c }} />{l}</span>
            ))}
            {anySkipped ? <span className="flex items-center gap-[6px]"><span className="size-[9px] rounded-full border border-dashed border-faint" />Not checked (skipped)</span> : null}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" aria-label="Selected point" aria-live="polite">
          <div className="flex flex-col gap-[2px]">
            <span className="font-mono text-[14px] font-semibold">Point {selPoint ? pointName(selPoint.row, selPoint.col) : "—"} · {selPoint?.status === "skipped" ? "not checked" : "top 20 on Google Maps"}</span>
            <span className="text-[13px] text-dim">{selPoint ? `${selPoint.lat.toFixed(4)}, ${selPoint.lng.toFixed(4)}` : ""}</span>
          </div>
          {selPoint?.status === "skipped" ? (
            <p className="m-0 text-[14px] text-muted-foreground">This point was skipped when the grid was set up: it was not looked up, cost nothing, and is not part of any number on this page.</p>
          ) : !selPoint?.top ? (
            <p className="m-0 text-[14px] text-muted-foreground">{selPoint?.status === "failed" ? (selPoint.error ?? "This lookup failed.") : "Waiting for results at this point."}</p>
          ) : selPoint.top.length === 0 ? (
            <p className="m-0 text-[14px] text-muted-foreground">Google Maps returned no results here.</p>
          ) : (
            <ol className="m-0 flex max-h-[520px] list-none flex-col overflow-y-auto p-0">
              {selPoint.top.map((t) => {
                const you = selPoint.rank === t.rank;
                return (
                  <li key={t.rank} className={cn("flex items-center justify-between gap-3 rounded-[7px] px-2 py-[7px] text-[14px]", you && "bg-you-tint")}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="w-5 shrink-0 font-mono text-[12px] font-semibold text-dim">{t.rank}</span>
                      <span className={cn("truncate", you ? "text-g1" : "text-fg")}>{t.name}{you ? " (you)" : ""}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{t.rating != null ? `${Number(t.rating).toFixed(1)}★ ${t.reviews ?? 0}` : ""}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      <VoiceBars
        title="Share of Local Voice"
        note="Each business's top-3 placements ÷ all top-3 slots across the grid. Reuses this scan's results; switching the map to a competitor costs nothing."
        empty="No results yet."
        rows={[
          { label: businessName, you: true, share: summary.solv ?? null, detail: `avg rank ${summary.avg_rank ?? "—"}` },
          ...rivals.map((r) => ({ label: r.name, share: r.share ?? null, detail: `avg rank ${r.avg_rank}${r.rating != null ? ` · ${Number(r.rating).toFixed(1)}★ ${r.reviews ?? 0}` : ""}` })),
        ]}
      />
    </>
  );
}
