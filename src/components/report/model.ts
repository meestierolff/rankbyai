import { aiCellColors, mapsCellColors, pointName, type CellView } from "@/components/brand/grid";
import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import { milesBetween } from "@/lib/scans/grid";
import { normalizeName } from "@/lib/scans/match";
import { domainOf } from "@/lib/scans/parse";
import type { AiSummary, MapsSummary } from "@/lib/scans/summary";
import type { AiPoint, AiPointResult, AiQuote, MapsPoint, PointState, RecommendedBusiness, ReportView } from "./types";

/**
 * Pure builders from stored rows to the public report model. No I/O, so the page, the PDF, the link
 * preview and the tests all count the same way. Rules shared by every count:
 *   - a skipped point (an area the user chose not to track) is never counted, in any denominator;
 *   - a point with no answer at all is "failed": shown as "!" and left out of the denominators;
 *   - an engine that did not answer at a point is "no answer", never "not named".
 */

export interface RawPoint {
  idx: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
  status: string;
  label?: string | null;
  rank?: number | null;
}

export interface RawSample {
  point_idx: number;
  engine: Engine;
  status: string;
  mentioned: boolean | null;
  mention_position: number | null;
  named_businesses: { name: string; position: number; you?: boolean }[] | null;
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/** Only absolute http(s) URLs may become links on a public page (blocks javascript:, data: and friends). */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Longest stored answer the page carries. Longer answers are cut there, and the page says so. */
export const ANSWER_MAX_CHARS = 6000;

// ───────────────────────── AI ─────────────────────────

export function buildAiPoints(points: RawPoint[], samples: RawSample[], engines: Engine[]): AiPoint[] {
  const byPoint = new Map<number, RawSample[]>();
  for (const s of samples) byPoint.set(s.point_idx, [...(byPoint.get(s.point_idx) ?? []), s]);
  return [...points]
    .sort((a, b) => a.idx - b.idx)
    .map((p) => {
      const here = byPoint.get(p.idx) ?? [];
      const results: AiPointResult[] = engines.map((engine) => {
        const s = here.find((x) => x.engine === engine);
        if (!s || s.status !== "done") return { engine, state: "no_answer", position: null };
        return s.mentioned ? { engine, state: "named", position: s.mention_position ?? null } : { engine, state: "not_named", position: null };
      });
      const state: PointState = p.status === "skipped" ? "skipped" : results.some((r) => r.state !== "no_answer") ? "done" : "failed";
      return { idx: p.idx, row: p.row, col: p.col, lat: num(p.lat), lng: num(p.lng), area: p.label ?? null, state, results: state === "skipped" ? [] : results };
    });
}

export function aiCounts(points: AiPoint[]) {
  const checked = points.filter((p) => p.state === "done");
  return {
    pointsChecked: checked.length,
    pointsMentioned: checked.filter((p) => p.results.some((r) => r.state === "named")).length,
    pointsFailed: points.filter((p) => p.state === "failed").length,
    pointsSkipped: points.filter((p) => p.state === "skipped").length,
    answersDone: checked.reduce((a, p) => a + p.results.filter((r) => r.state !== "no_answer").length, 0),
  };
}

/** Colour, label and description of one AI point. Same language as the app: best position colours the dot, the label counts engines. */
export function aiPointLook(p: AiPoint): { bg: string; fg: string; label: string; title: string; dashed: boolean } {
  const name = `Point ${pointName(p.row, p.col)}${p.area ? ` (${p.area})` : ""}`;
  if (p.state === "skipped") return { bg: "transparent", fg: "var(--rb-faint)", label: "", title: `${name}: not checked`, dashed: true };
  if (p.state === "failed") return { bg: "var(--rb-well)", fg: "var(--rb-fg-2)", label: "!", title: `${name}: no answer`, dashed: false };
  const answered = p.results.filter((r) => r.state !== "no_answer");
  const named = answered.filter((r) => r.state === "named");
  const best = named.length ? Math.min(...named.map((r) => r.position ?? 5)) : null;
  const c = aiCellColors(best);
  return { bg: c.bg, fg: c.fg, label: `${named.length}/${answered.length}`, title: `${name}: named by ${named.length} of ${answered.length} AI assistants`, dashed: false };
}

/** Legacy `cells` for callers of the old view model. */
export const aiCellsFrom = (points: AiPoint[]): CellView[] =>
  points.map((p) => {
    const l = aiPointLook(p);
    return { key: String(p.idx), bg: l.bg, fg: l.fg, label: l.label, title: l.title };
  });

/**
 * Businesses AI named, counted by points and by answers over the same done samples, grouped by
 * exact normalised name (as the stored summary does). The business itself is always in the list.
 */
export function recommendedFrom(points: AiPoint[], samples: RawSample[], businessName: string, limit = 5): RecommendedBusiness[] {
  const counted = new Set(points.filter((p) => p.state === "done").map((p) => p.idx));
  const rows = new Map<string, { name: string; you: boolean; points: Set<number>; answers: number }>();
  const you = { name: businessName, you: true, points: new Set<number>(), answers: 0 };
  for (const s of samples) {
    if (s.status !== "done" || !counted.has(s.point_idx)) continue;
    const seen = new Set<string>();
    if (s.mentioned) {
      you.points.add(s.point_idx);
      you.answers++;
    }
    for (const nb of s.named_businesses ?? []) {
      if (nb.you) continue;
      const key = normalizeName(nb.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const row = rows.get(key) ?? { name: nb.name, you: false, points: new Set<number>(), answers: 0 };
      row.points.add(s.point_idx);
      row.answers++;
      rows.set(key, row);
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points.size - a.points.size || b.answers - a.answers || a.name.localeCompare(b.name)).slice(0, limit);
  return [...sorted, you]
    .map((r) => ({ name: r.name, you: r.you, points: r.points.size, answers: r.answers }))
    .sort((a, b) => b.points - a.points || b.answers - a.answers || (a.you ? -1 : b.you ? 1 : 0));
}

// ───────────────────────── Google Maps ─────────────────────────

export function buildMapsPoints(points: RawPoint[]): MapsPoint[] {
  return [...points]
    .sort((a, b) => a.idx - b.idx)
    .map((p) => ({
      idx: p.idx, row: p.row, col: p.col, lat: num(p.lat), lng: num(p.lng),
      state: p.status === "skipped" ? "skipped" : p.status === "done" ? "done" : "failed",
      rank: p.status === "done" ? (p.rank ?? null) : null,
    }));
}

export function mapsCounts(points: MapsPoint[]) {
  const done = points.filter((p) => p.state === "done");
  return {
    pointsDone: done.length,
    top3Points: done.filter((p) => p.rank != null && p.rank <= 3).length,
    pointsFailed: points.filter((p) => p.state === "failed").length,
    pointsSkipped: points.filter((p) => p.state === "skipped").length,
  };
}

export function mapsPointLook(p: MapsPoint): { bg: string; fg: string; label: string; title: string; dashed: boolean } {
  const name = `Point ${pointName(p.row, p.col)}`;
  if (p.state === "skipped") return { bg: "transparent", fg: "var(--rb-faint)", label: "", title: `${name}: not checked`, dashed: true };
  if (p.state === "failed") return { bg: "var(--rb-well)", fg: "var(--rb-fg-2)", label: "!", title: `${name}: no result`, dashed: false };
  const c = mapsCellColors(p.rank);
  return { bg: c.bg, fg: c.fg, label: c.label, title: `${name}: ${p.rank != null && p.rank <= 20 ? `rank #${p.rank}` : "not in the top 20"} on Google Maps`, dashed: false };
}

export const mapsCellsFrom = (points: MapsPoint[]): CellView[] =>
  points.map((p) => {
    const l = mapsPointLook(p);
    return { key: String(p.idx), bg: l.bg, fg: l.fg, label: l.label, title: l.title };
  });

// ───────────────────────── geometry ─────────────────────────

/** The checked point nearest to `target` (the business, else the grid centre); ties go to the lower index. */
export function nearestPoint<T extends { idx: number; row: number; col: number; lat: number; lng: number; state: PointState }>(
  points: T[], target: { lat: number; lng: number } | null, n: number,
): T | null {
  const usable = points.filter((p) => p.state === "done");
  if (!usable.length) return null;
  if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
    return usable.reduce((best, p) => (milesBetween(p, target) < milesBetween(best, target) ? p : best));
  }
  const c = (n - 1) / 2;
  return usable.reduce((best, p) => (Math.hypot(p.row - c, p.col - c) < Math.hypot(best.row - c, best.col - c) ? p : best));
}

export const engineLabel = (e: Engine) => ENGINE_LABEL[e]?.short ?? e;

// ───────────────────────── assembly ─────────────────────────

export interface QuoteRow extends RawSample {
  prompt: string | null;
  answer_text: string | null;
  sources: { url: string; title?: string | null }[] | null;
}

export interface AiScanInput {
  n: number;
  engines: Engine[];
  service: string | null;
  radiusMiles: number | null;
  center: { lat: number; lng: number } | null;
  date: string;
  summary: Partial<AiSummary>;
}

/** The verbatim answers at one point, in the scan's engine order. */
export function buildQuote(near: AiPoint, rows: QuoteRow[], engines: Engine[], n: number): AiQuote {
  const firstDone = rows.find((r) => r.status === "done") ?? rows[0];
  return {
    pointName: pointName(near.row, near.col),
    area: near.area,
    // The grid is centred on the business (scans/grid.ts), so the centre point is "at the business".
    atBusiness: near.row * 2 + 1 === n && near.col * 2 + 1 === n,
    prompt: firstDone?.prompt ?? null,
    answers: engines.map((engine) => {
      const r = rows.find((x) => x.engine === engine);
      const done = r?.status === "done";
      const text = done ? (r?.answer_text ?? "").trim() : "";
      const seen = new Set<string>();
      return {
        engine,
        label: engineLabel(engine),
        state: !done ? "no_answer" : r?.mentioned ? "named" : "not_named",
        position: done && r?.mentioned ? (r.mention_position ?? null) : null,
        names: done ? (r?.named_businesses ?? []).slice(0, 10).map((nb, i) => ({ name: nb.name, position: nb.position ?? i + 1, you: !!nb.you })) : [],
        answer: text ? text.slice(0, ANSWER_MAX_CHARS) : null,
        answerCut: text.length > ANSWER_MAX_CHARS,
        cited: done
          ? (r?.sources ?? []).flatMap((src) => {
              const url = safeHttpUrl(src?.url);
              const domain = url ? domainOf(url) : null;
              if (!url || !domain || seen.has(url)) return [];
              seen.add(url);
              return [{ url, title: String(src.title ?? "").slice(0, 160), domain }];
            }).slice(0, 5)
          : [],
      };
    }),
  };
}

/** The AI part of the view, from the scan's stored rows. `quoteRows` are the samples at `nearestPoint(...)`. */
export function assembleAi(scan: AiScanInput, points: AiPoint[], samples: RawSample[], businessName: string, quote: AiQuote | null): NonNullable<ReportView["ai"]> {
  const sum = scan.summary;
  return {
    date: scan.date,
    service: scan.service,
    n: scan.n,
    radiusMiles: scan.radiusMiles,
    center: scan.center,
    cells: aiCellsFrom(points),
    points,
    engines: scan.engines.map((e) => ({ key: e, label: engineLabel(e), available: sum.engines?.[e]?.available ?? false, mentioned: sum.engines?.[e]?.mentioned ?? 0, done: sum.engines?.[e]?.done ?? 0 })),
    ...aiCounts(points),
    namedInstead: (sum.top_competitors ?? []).slice(0, 6),
    recommended: recommendedFrom(points, samples, businessName),
    sources: (sum.top_sources ?? []).slice(0, 8).map((s) => ({ domain: s.domain, count: s.count, engines: scan.engines.filter((e) => (s.engines ?? []).includes(e)).map(engineLabel) })),
    single: scan.n === 1
      ? scan.engines.map((e) => {
          const s = samples.find((x) => x.engine === e);
          return { engine: engineLabel(e), available: s?.status === "done", mentioned: !!s?.mentioned, position: s?.mention_position ?? null, names: (s?.named_businesses ?? []).slice(0, 5).map((nb) => ({ name: nb.name, you: !!nb.you })) };
        })
      : null,
    quote,
  };
}

export interface MapsScanInput {
  n: number;
  keyword: string | null;
  radiusMiles: number | null;
  center: { lat: number; lng: number } | null;
  date: string;
  summary: Partial<MapsSummary>;
}

/** The Google Maps part of the view. Counts come from the point rows; the stored summary is the fallback. */
export function assembleMaps(scan: MapsScanInput, points: MapsPoint[]): NonNullable<ReportView["maps"]> {
  const sum = scan.summary;
  const counts = points.length ? mapsCounts(points) : { pointsDone: sum.points_done ?? 0, top3Points: sum.top3_points ?? 0, pointsFailed: sum.points_failed ?? 0, pointsSkipped: 0 };
  return {
    date: scan.date,
    keyword: scan.keyword,
    n: scan.n,
    radiusMiles: scan.radiusMiles,
    center: scan.center,
    cells: mapsCellsFrom(points),
    points,
    avgRank: sum.avg_rank ?? null,
    ...counts,
    competitors: (sum.top_competitors ?? []).filter((c) => c.top3_points > 0).slice(0, 6).map((c) => ({ name: c.name, top3Points: c.top3_points })),
    single: null,
  };
}
