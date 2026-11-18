import type { Engine } from "@/lib/pricing-constants";
import { namesMatch, normalizeName } from "./match";
import { domainOf } from "./parse";

/**
 * Scan metrics (brief 7.2, 7.3). Pure functions over stored rows, so every number can be traced back.
 * Points the user skipped are not part of any metric: `points` counts the active points only and
 * `points_skipped` says how many were left out.
 */

export interface AiSampleRow {
  point_idx: number;
  engine: Engine;
  status: "pending" | "done" | "failed" | "skipped";
  mentioned: boolean | null;
  mention_position: number | null;
  named_businesses: { name: string; position: number; you?: boolean }[];
  sources: { url: string; title: string }[];
  cost_usd: number | null;
}

export interface AiSummary {
  /** Active grid points (skipped points excluded). */
  points: number;
  points_skipped: number;
  samples_total: number;
  samples_done: number;
  samples_failed: number;
  engines: Partial<Record<Engine, { done: number; total: number; mentioned: number; mention_rate: number | null; avg_position: number | null; available: boolean }>>;
  /** Points where at least one engine named the business. */
  points_mentioned: number;
  ai_mention_rate: number | null;
  ai_avg_position: number | null;
  /** The business's mentions ÷ all business mentions across samples. */
  share_of_ai_voice: number | null;
  mentions_yours: number;
  mentions_total: number;
  top_competitors: { name: string; mentions: number }[];
  top_sources: { domain: string; count: number; engines: Engine[] }[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v: number | null, d = 3) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** `gridPoints` is n × n; `skip` the idx of the points the user skipped (they never have samples). */
export function summarizeAi(allSamples: AiSampleRow[], gridPoints: number, skip: readonly number[] = []): AiSummary {
  const skipped = new Set(skip);
  const samples = skipped.size ? allSamples.filter((s) => !skipped.has(s.point_idx)) : allSamples;
  const done = samples.filter((s) => s.status === "done");
  const engines: AiSummary["engines"] = {};
  for (const s of samples) {
    const e = (engines[s.engine] ??= { done: 0, total: 0, mentioned: 0, mention_rate: null, avg_position: null, available: false });
    e.total++;
    if (s.status === "done") {
      e.done++;
      if (s.mentioned) e.mentioned++;
    }
  }
  for (const key of Object.keys(engines) as Engine[]) {
    const e = engines[key]!;
    e.available = e.done > 0;
    e.mention_rate = e.done ? round(e.mentioned / e.done) : null;
    e.avg_position = round(avg(done.filter((s) => s.engine === key && s.mention_position != null).map((s) => s.mention_position as number)), 2);
  }

  const mentionedPoints = new Set(done.filter((s) => s.mentioned).map((s) => s.point_idx));
  let yours = 0;
  let all = 0;
  const competitors: { name: string; mentions: number }[] = [];
  for (const s of done) {
    for (const nb of s.named_businesses ?? []) {
      all++;
      if (nb.you) {
        yours++;
        continue;
      }
      // Competitors are grouped by exact normalised name: fuzzy grouping would merge different businesses.
      const key = normalizeName(nb.name);
      const hit = competitors.find((c) => normalizeName(c.name) === key);
      if (hit) hit.mentions++;
      else competitors.push({ name: nb.name, mentions: 1 });
    }
  }

  const sources = new Map<string, { count: number; engines: Set<Engine> }>();
  for (const s of done) {
    const seen = new Set<string>();
    for (const src of s.sources ?? []) {
      const d = domainOf(src.url);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      const cur = sources.get(d) ?? { count: 0, engines: new Set<Engine>() };
      cur.count++;
      cur.engines.add(s.engine);
      sources.set(d, cur);
    }
  }

  return {
    points: Math.max(0, gridPoints - skipped.size),
    points_skipped: skipped.size,
    samples_total: samples.length,
    samples_done: done.length,
    samples_failed: samples.filter((s) => s.status === "failed" || s.status === "skipped").length,
    engines,
    points_mentioned: mentionedPoints.size,
    ai_mention_rate: done.length ? round(done.filter((s) => s.mentioned).length / done.length) : null,
    ai_avg_position: round(avg(done.filter((s) => s.mention_position != null).map((s) => s.mention_position as number)), 2),
    share_of_ai_voice: all ? round(yours / all) : null,
    mentions_yours: yours,
    mentions_total: all,
    top_competitors: competitors.sort((a, b) => b.mentions - a.mentions).slice(0, 10),
    top_sources: [...sources.entries()]
      .map(([domain, v]) => ({ domain, count: v.count, engines: [...v.engines] }))
      .sort((a, b) => b.engines.length - a.engines.length || b.count - a.count)
      .slice(0, 15),
  };
}

export interface MapsPointRow {
  idx: number;
  status: "pending" | "posted" | "done" | "failed" | "skipped";
  rank: number | null;
  top: { rank: number; name: string; cid?: string | null; rating?: number | null; reviews?: number | null }[] | null;
}

export interface MapsSummary {
  /** Active grid points (skipped points excluded). */
  points: number;
  points_skipped: number;
  points_done: number;
  points_failed: number;
  /** Average rank; a point where the business is outside the top 20 counts as 21. */
  avg_rank: number | null;
  /** Share of points where the business ranks 1–3. */
  top3_share: number | null;
  top3_points: number;
  found_points: number;
  /** Share of Local Voice: the business's top-3 placements ÷ all top-3 slots across the grid. */
  solv: number | null;
  /** `share` = that business's top-3 placements ÷ all top-3 slots (same definition as `solv`). */
  top_competitors: { name: string; cid: string | null; top3_points: number; avg_rank: number; share: number | null; rating: number | null; reviews: number | null }[];
}

export const NOT_RANKED = 21;

export function summarizeMaps(allRows: MapsPointRow[], businessName: string): MapsSummary {
  const pointRows = allRows.filter((p) => p.status !== "skipped");
  const done = pointRows.filter((p) => p.status === "done");
  const ranks = done.map((p) => p.rank ?? NOT_RANKED);
  const top3 = done.filter((p) => p.rank != null && p.rank <= 3).length;
  let slots = 0;
  const rivals = new Map<string, { name: string; cid: string | null; top3: number; ranks: number[]; rating: number | null; reviews: number | null }>();
  for (const p of done) {
    for (const it of p.top ?? []) {
      if (it.rank <= 3) slots++;
      if (namesMatch(it.name, businessName)) continue;
      const key = it.cid ?? it.name.toLowerCase();
      const cur = rivals.get(key) ?? { name: it.name, cid: it.cid ?? null, top3: 0, ranks: [], rating: null, reviews: null };
      if (it.rating != null) cur.rating = it.rating;
      if (it.reviews != null) cur.reviews = it.reviews;
      if (it.rank <= 3) cur.top3++;
      cur.ranks.push(it.rank);
      rivals.set(key, cur);
    }
  }
  return {
    points: pointRows.length,
    points_skipped: allRows.length - pointRows.length,
    points_done: done.length,
    points_failed: pointRows.filter((p) => p.status === "failed").length,
    avg_rank: round(avg(ranks), 1),
    top3_share: done.length ? round(top3 / done.length) : null,
    top3_points: top3,
    found_points: done.filter((p) => p.rank != null).length,
    solv: slots ? round(top3 / slots) : null,
    top_competitors: [...rivals.values()]
      .map((r) => ({
        name: r.name, cid: r.cid, top3_points: r.top3, share: slots ? round(r.top3 / slots) : null, rating: r.rating, reviews: r.reviews,
        // Points where the business is outside the top 20 count as 21, as for the tracked business.
        avg_rank: Math.round(((r.ranks.reduce((a, b) => a + b, 0) + (done.length - r.ranks.length) * NOT_RANKED) / Math.max(1, done.length)) * 10) / 10,
      }))
      .sort((a, b) => b.top3_points - a.top3_points || a.avg_rank - b.avg_rank)
      .slice(0, 10),
  };
}

/** One sentence built from data only (combined view headline). */
export function combinedInsight(maps: MapsSummary | null, ai: AiSummary | null): string | null {
  if (!maps || !ai || !maps.points_done || !ai.samples_done) return null;
  const mentioned = Math.round((ai.ai_mention_rate ?? 0) * ai.samples_done);
  const mapsPart = `Top 3 on Maps at ${maps.top3_points}/${maps.points_done} points`;
  const aiPart = `named by AI engines in ${mentioned}/${ai.samples_done} answers`;
  const strongMaps = (maps.top3_share ?? 0) >= 0.5;
  const strongAi = (ai.ai_mention_rate ?? 0) >= 0.5;
  return strongMaps === strongAi ? `${mapsPart}, and ${aiPart}.` : `${mapsPart}, but ${aiPart}.`;
}
