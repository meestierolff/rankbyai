import type { Engine } from "@/lib/pricing-constants";
import { NOT_RANKED } from "./summary";

/**
 * Compare two scans of the same business (brief 7.2, 7.3). Pure functions over stored rows.
 * "a" is the earlier scan, "b" the later one. Per-point deltas need the same grid size; when the
 * grids differ only the headline metrics are compared.
 */
export interface AiCompareSample {
  point_idx: number;
  engine: Engine;
  status: string;
  mentioned: boolean | null;
  mention_position: number | null;
}

export interface AiPointDelta {
  idx: number;
  before: number; // engines naming the business
  after: number;
  beforeDone: number;
  afterDone: number;
  /** after − before; null when either side has no completed answer at this point. */
  delta: number | null;
}

export interface AiComparison {
  samePoints: boolean;
  points: AiPointDelta[];
  pointsMentioned: { before: number; after: number; total: number; delta: number };
  engines: { engine: Engine; before: number | null; after: number | null; beforeDone: number; afterDone: number; delta: number | null }[];
  improved: number;
  declined: number;
}

const namedAt = (samples: AiCompareSample[], idx: number) => {
  const done = samples.filter((s) => s.point_idx === idx && s.status === "done");
  return { done: done.length, named: done.filter((s) => s.mentioned).length };
};

export function compareAi(a: AiCompareSample[], b: AiCompareSample[], gridA: number, gridB: number): AiComparison {
  const samePoints = gridA === gridB;
  // Skipped points have no samples: the later scan's total is the points it actually checked.
  const total = new Set(b.map((s) => s.point_idx)).size || gridB * gridB;
  const points: AiPointDelta[] = [];
  if (samePoints) {
    for (let idx = 0; idx < gridB * gridB; idx++) {
      const x = namedAt(a, idx);
      const y = namedAt(b, idx);
      points.push({ idx, before: x.named, after: y.named, beforeDone: x.done, afterDone: y.done, delta: x.done && y.done ? y.named - x.named : null });
    }
  }
  const mentionedPoints = (samples: AiCompareSample[]) => new Set(samples.filter((s) => s.status === "done" && s.mentioned).map((s) => s.point_idx)).size;
  const before = mentionedPoints(a);
  const after = mentionedPoints(b);
  const engines = [...new Set([...a, ...b].map((s) => s.engine))].map((engine) => {
    const x = a.filter((s) => s.engine === engine && s.status === "done");
    const y = b.filter((s) => s.engine === engine && s.status === "done");
    const xb = x.length ? x.filter((s) => s.mentioned).length : null;
    const yb = y.length ? y.filter((s) => s.mentioned).length : null;
    return { engine, before: xb, after: yb, beforeDone: x.length, afterDone: y.length, delta: xb != null && yb != null ? yb - xb : null };
  });
  return {
    samePoints,
    points,
    pointsMentioned: { before, after, total, delta: after - before },
    engines,
    improved: points.filter((p) => (p.delta ?? 0) > 0).length,
    declined: points.filter((p) => (p.delta ?? 0) < 0).length,
  };
}

export interface MapsComparePoint {
  idx: number;
  status: string;
  rank: number | null;
}

export interface MapsPointDelta {
  idx: number;
  before: number | null;
  after: number | null;
  /** Positive = moved up (better). Not-in-top-20 counts as 21. Null when either side has no result (failed or skipped). */
  delta: number | null;
}

export interface MapsComparison {
  samePoints: boolean;
  points: MapsPointDelta[];
  avgRank: { before: number | null; after: number | null; delta: number | null };
  top3: { before: number; after: number; delta: number };
  improved: number;
  declined: number;
  unchanged: number;
}

const avgRank = (pts: MapsComparePoint[]) => {
  const done = pts.filter((p) => p.status === "done");
  return done.length ? Math.round((done.reduce((s, p) => s + (p.rank ?? NOT_RANKED), 0) / done.length) * 10) / 10 : null;
};

export function compareMaps(a: MapsComparePoint[], b: MapsComparePoint[]): MapsComparison {
  const samePoints = a.length === b.length;
  const points: MapsPointDelta[] = [];
  if (samePoints) {
    const byIdx = new Map(a.map((p) => [p.idx, p]));
    for (const p of [...b].sort((x, y) => x.idx - y.idx)) {
      const prev = byIdx.get(p.idx);
      const ok = prev?.status === "done" && p.status === "done";
      points.push({ idx: p.idx, before: prev?.rank ?? null, after: p.rank, delta: ok ? (prev!.rank ?? NOT_RANKED) - (p.rank ?? NOT_RANKED) : null });
    }
  }
  const top3 = (pts: MapsComparePoint[]) => pts.filter((p) => p.status === "done" && p.rank != null && p.rank <= 3).length;
  const ar = { before: avgRank(a), after: avgRank(b) };
  return {
    samePoints,
    points,
    // A lower average rank is better, so the delta is before − after (positive = improved).
    avgRank: { ...ar, delta: ar.before != null && ar.after != null ? Math.round((ar.before - ar.after) * 10) / 10 : null },
    top3: { before: top3(a), after: top3(b), delta: top3(b) - top3(a) },
    improved: points.filter((p) => (p.delta ?? 0) > 0).length,
    declined: points.filter((p) => (p.delta ?? 0) < 0).length,
    unchanged: points.filter((p) => p.delta === 0).length,
  };
}

/** One sentence from the comparison numbers only. */
export function compareHeadline(kind: "ai" | "maps", c: AiComparison | MapsComparison): string {
  if (kind === "ai") {
    const x = c as AiComparison;
    return `Named by AI at ${x.pointsMentioned.before}/${x.pointsMentioned.total} → ${x.pointsMentioned.after}/${x.pointsMentioned.total} points.`;
  }
  const m = c as MapsComparison;
  const parts = [`Average rank ${m.avgRank.before ?? "—"} → ${m.avgRank.after ?? "—"}`];
  if (m.samePoints) parts.push(`${m.improved} points improved, ${m.declined} declined`);
  return parts.join(". ") + ".";
}
