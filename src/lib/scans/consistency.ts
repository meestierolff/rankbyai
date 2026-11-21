import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import { namesMatch, normalizeName } from "./match";

/**
 * Consistency runs: the same AI grid asked twice (and optionally in a second language), so a
 * difference between two runs can be told apart from normal variation. Pure, over stored rows.
 *
 * The runs of one group are ordinary scans tagged in `scans.label` as "consistency:<group>:<role>":
 *   A1 the question as asked, A2 the same again, B1 the second-language question, B2 that again.
 * A1 is a normal scan. A2, B1 and B2 are side runs: they never count as a business's latest scan
 * (share reports, audits, regional pages and default comparisons skip them), because a repeat or
 * another language would otherwise replace the real latest result.
 */

export type RunRole = "A1" | "A2" | "B1" | "B2";
export const RUN_ROLES: RunRole[] = ["A1", "A2", "B1", "B2"];

const LABEL = /^consistency:([0-9a-f-]{36}):(A1|A2|B1|B2)$/;

export const runLabel = (group: string, role: RunRole) => `consistency:${group}:${role}`;

export function parseRunLabel(label: string | null | undefined): { group: string; role: RunRole } | null {
  const m = (label ?? "").match(LABEL);
  return m ? { group: m[1], role: m[2] as RunRole } : null;
}

/** A repeat or a second-language run: never a business's "latest scan". */
export const isSideRun = (label: string | null | undefined) => {
  const r = parseRunLabel(label);
  return !!r && r.role !== "A1";
};

/** Drop side runs from rows that are read to find a latest scan. */
export const withoutSideRuns = <T extends { label?: string | null }>(rows: T[]): T[] => rows.filter((r) => !isSideRun(r.label));

export interface RunSample {
  point_idx: number;
  engine: Engine;
  status: string;
  mentioned: boolean | null;
  named_businesses: { name: string; you?: boolean }[] | null;
}

export interface NameRow { name: string; answers_a: number; answers_b: number }

export interface RunComparison {
  /** Mention decisions (point × engine) that both runs answered, and how many agreed (named in both, or in neither). */
  decisions: { compared: number; agreed: number; stability_rate: number | null };
  engines: { engine: Engine; label: string; compared: number; agreed: number; stability_rate: number | null; named_a: number; named_b: number }[];
  /** Other businesses named, over answers both runs gave: in both runs, only in A, only in B. */
  names: { stable: NameRow[]; only_a: NameRow[]; only_b: NameRow[]; overlap_rate: number | null };
  points: { idx: number; engines: { engine: Engine; a: boolean | null; b: boolean | null; stable: string[]; only_a: string[]; only_b: string[] }[] }[];
}

const rate = (agreed: number, compared: number) => (compared ? Math.round((agreed / compared) * 1000) / 10 : null);
const key = (s: { point_idx: number; engine: Engine }) => `${s.point_idx}:${s.engine}`;

/** Names in one answer, the business itself left out, one entry per business. */
function namesOf(s: RunSample): string[] {
  const out: string[] = [];
  for (const nb of s.named_businesses ?? []) {
    if (nb.you || !normalizeName(nb.name)) continue;
    if (!out.some((n) => namesMatch(n, nb.name) || normalizeName(n) === normalizeName(nb.name))) out.push(nb.name);
  }
  return out;
}
const sameName = (a: string, b: string) => normalizeName(a) === normalizeName(b) || namesMatch(a, b);

/**
 * Two runs of the same grid, point by point. Only answers both runs gave are compared: an engine
 * that did not answer in one run is left out, never counted as a change.
 */
export function compareRuns(a: RunSample[], b: RunSample[]): RunComparison {
  const byKey = (xs: RunSample[]) => new Map(xs.filter((s) => s.status === "done").map((s) => [key(s), s]));
  const ma = byKey(a);
  const mb = byKey(b);
  const both = [...ma.keys()].filter((k) => mb.has(k)).sort((x, y) => Number(x.split(":")[0]) - Number(y.split(":")[0]) || x.localeCompare(y));

  const engines = new Map<Engine, { compared: number; agreed: number; named_a: number; named_b: number }>();
  const nameRows: NameRow[] = [];
  const bump = (name: string, side: "a" | "b") => {
    const row = nameRows.find((r) => sameName(r.name, name)) ?? (nameRows.push({ name, answers_a: 0, answers_b: 0 }), nameRows[nameRows.length - 1]);
    if (side === "a") row.answers_a++;
    else row.answers_b++;
  };
  const points = new Map<number, RunComparison["points"][number]>();
  let agreed = 0;
  for (const k of both) {
    const x = ma.get(k)!;
    const y = mb.get(k)!;
    const same = !!x.mentioned === !!y.mentioned;
    if (same) agreed++;
    const e = engines.get(x.engine) ?? { compared: 0, agreed: 0, named_a: 0, named_b: 0 };
    e.compared++;
    if (same) e.agreed++;
    if (x.mentioned) e.named_a++;
    if (y.mentioned) e.named_b++;
    engines.set(x.engine, e);
    const na = namesOf(x);
    const nb = namesOf(y);
    na.forEach((n) => bump(n, "a"));
    nb.forEach((n) => bump(n, "b"));
    const p = points.get(x.point_idx) ?? { idx: x.point_idx, engines: [] };
    p.engines.push({
      engine: x.engine, a: !!x.mentioned, b: !!y.mentioned,
      stable: na.filter((n) => nb.some((m) => sameName(n, m))),
      only_a: na.filter((n) => !nb.some((m) => sameName(n, m))),
      only_b: nb.filter((n) => !na.some((m) => sameName(n, m))),
    });
    points.set(x.point_idx, p);
  }
  const sortRows = (rows: NameRow[]) => rows.sort((x, y) => y.answers_a + y.answers_b - (x.answers_a + x.answers_b) || x.name.localeCompare(y.name));
  const stable = sortRows(nameRows.filter((r) => r.answers_a > 0 && r.answers_b > 0));
  return {
    decisions: { compared: both.length, agreed, stability_rate: rate(agreed, both.length) },
    engines: [...engines.entries()].map(([engine, e]) => ({ engine, label: ENGINE_LABEL[engine]?.short ?? engine, ...e, stability_rate: rate(e.agreed, e.compared) })),
    names: {
      stable,
      only_a: sortRows(nameRows.filter((r) => r.answers_b === 0)),
      only_b: sortRows(nameRows.filter((r) => r.answers_a === 0)),
      overlap_rate: nameRows.length ? Math.round((stable.length / nameRows.length) * 1000) / 10 : null,
    },
    points: [...points.values()].sort((x, y) => x.idx - y.idx),
  };
}

export const CONSISTENCY_DISCLAIMER =
  "One run is not a stable ranking: AI answers vary between runs, places and time. Two runs of the same question show how much of a difference is normal variation; a difference between languages only means something when it is larger than the difference between two runs in the same language.";
