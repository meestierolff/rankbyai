import type { CellView } from "@/components/brand/grid";
import type { Engine } from "@/lib/pricing-constants";

/**
 * Public view model of a report (/r/{slug}, its PDF and its link preview). Built on the server from
 * stored scan and audit rows only (src/lib/reports.ts), reduced to what the page shows: no workspace
 * ids, no owner identity, no keys, no spend. Nothing in here is estimated: every number is a count
 * over stored rows or a stored summary value.
 */

/** done = has a result · failed = no result ("!") · skipped = an area the user chose not to track. */
export type PointState = "done" | "failed" | "skipped";

/** One engine's answer at one AI grid point. */
export interface AiPointResult {
  engine: Engine;
  /** named = the business is in the answer · not_named = answered without it · no_answer = failed or unavailable. */
  state: "named" | "not_named" | "no_answer";
  /** Position of the business in the answer's list (1 = named first), when named. */
  position: number | null;
}

export interface AiPoint {
  idx: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
  /** Area name used in the prompt at this point (from the scan), if any. */
  area: string | null;
  state: PointState;
  results: AiPointResult[];
}

export interface MapsPoint {
  idx: number;
  row: number;
  col: number;
  lat: number;
  lng: number;
  state: PointState;
  /** Google Maps rank of the business at this point; null = not in the top 20 (only meaningful when state is done). */
  rank: number | null;
}

/** A business AI named across the grid. `points` and `answers` use the same done samples as the business's own row. */
export interface RecommendedBusiness {
  name: string;
  /** The business this report is about. */
  you: boolean;
  /** Grid points where at least one engine named it. */
  points: number;
  /** Answers (engine × point) that named it. */
  answers: number;
}

export interface QuotedAnswer {
  engine: Engine;
  label: string;
  state: AiPointResult["state"];
  position: number | null;
  /** Businesses named in the answer, in order, as the answer wrote them. */
  names: { name: string; position: number; you: boolean }[];
  /** The stored answer, verbatim (capped in length; see `answerCut`). */
  answer: string | null;
  /** True when the stored answer is longer than what is shown. */
  answerCut: boolean;
  /** Sources the answer cited (http(s) links only). */
  cited: { url: string; title: string; domain: string }[];
}

export interface AiQuote {
  pointName: string;
  area: string | null;
  /** True when this is the point at (or nearest to) the business itself. */
  atBusiness: boolean;
  /** The prompt as sent, verbatim. Identical for every engine at a point. */
  prompt: string | null;
  answers: QuotedAnswer[];
}

export interface ReportView {
  kind: "share" | "prospect" | "free_check";
  watermark: boolean;
  business: { name: string; city: string | null; region: string | null; category: string | null; lat: number | null; lng: number | null; website?: string | null };
  brand: { name: string | null; logoUrl: string | null; color: string | null; website: string | null; hideRankbyai: boolean };
  opener: string | null;
  ai: {
    date: string;
    service: string | null;
    n: number;
    radiusMiles: number | null;
    center: { lat: number; lng: number } | null;
    /** Legacy grid cells (kept for existing callers). New surfaces colour `points` themselves. */
    cells: CellView[];
    points: AiPoint[];
    engines: { key: Engine; label: string; available: boolean; mentioned: number; done: number }[];
    /** Points where at least one engine named the business. */
    pointsMentioned: number;
    /** Points with at least one answer (skipped and failed points excluded). */
    pointsChecked: number;
    pointsFailed: number;
    pointsSkipped: number;
    /** Answers received (engine × point) at checked points. */
    answersDone: number;
    /** Competitors from the stored summary, counted in answers. Kept for existing callers. */
    namedInstead: { name: string; mentions: number }[];
    /** Businesses AI named, by points; the business itself is always included. */
    recommended: RecommendedBusiness[];
    /** Most-cited source domains (stored summary): `count` = answers that cited it. */
    sources: { domain: string; count: number; engines: string[] }[];
    /** 1×1 checks: the named businesses per engine, in order. */
    single: { engine: string; available: boolean; mentioned: boolean; position: number | null; names: { name: string; you: boolean }[] }[] | null;
    /** Verbatim answers at the point nearest the business. */
    quote: AiQuote | null;
  } | null;
  maps: {
    date: string;
    keyword: string | null;
    n: number;
    radiusMiles: number | null;
    center: { lat: number; lng: number } | null;
    cells: CellView[];
    points: MapsPoint[];
    avgRank: number | null;
    top3Points: number;
    pointsDone: number;
    pointsFailed: number;
    pointsSkipped: number;
    /** Businesses in the Maps top 3 most often (stored summary). */
    competitors: { name: string; top3Points: number }[];
    /** Free check: one point only. */
    single: { rank: number | null; top: { rank: number; name: string }[] } | null;
  } | null;
  audit: { score: number; date: string; findings: { priority: string; title: string; fix: string }[] } | null;
  updatedAt: string;
}
