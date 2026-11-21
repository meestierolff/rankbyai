import { ENGINE_LABEL, type Engine } from "@/lib/pricing-constants";
import { samePlace, type GridPlace } from "./compare";
import { namesMatch, normalizeName } from "./match";
import { domainOf } from "./parse";
import { DEFAULT_PROMPT_TEMPLATE } from "./prompt";

/**
 * "Why it changed": a weekly note on two AI scans of the same business. Pure, over stored rows.
 *
 * Method (the same discipline as a report brief built from tool data): build the data block first,
 * from stored answers only, then words. Changes are stated only where both scans have data; names
 * and cited sources are counted in answers; a "possible reason" appears only next to dated stored
 * evidence (a source that came or went in answers naming the business, a crawler finding from an
 * audit, a Google Maps move). Nothing here says why a model chose what it chose: nobody can know.
 */

export interface NoteScan extends GridPlace {
  id: string;
  created_at: string;
  status: string;
  /** The service asked about (AI scans store it as niche; keyword is the fallback). */
  niche: string | null;
  keyword?: string | null;
  prompt_template: string | null;
  grid_size: number;
  engines: Engine[];
}

export interface NoteSample {
  point_idx: number;
  engine: Engine;
  status: string;
  prompt: string | null;
  mentioned: boolean | null;
  mention_position: number | null;
  named_businesses: { name: string; position?: number; you?: boolean }[] | null;
  sources: { url: string; title?: string | null }[] | null;
}

/** Evidence the note may point to: the latest audit's crawler findings and Google Maps scans around the window. */
export interface NoteExtras {
  /** The latest finished audit up to the later scan, with its failing crawler findings (empty when none failed). Used only when it falls between the two scans. */
  audit?: { created_at: string; crawlerFindings: { title: string; priority: string }[] } | null;
  /** The latest finished Maps scan up to each AI scan (same keyword), when both exist and differ. */
  maps?: { before: MapsPoint; after: MapsPoint } | null;
}
interface MapsPoint { created_at: string; avg_rank: number | null; top3_points: number; points_done: number }

export interface EngineSide { answers: number; named: number; mention_rate: number; avg_position: number | null }
export interface EngineChange {
  engine: Engine;
  label: string;
  before: EngineSide | null;
  after: EngineSide | null;
  /** Percentage points; null unless both scans have answers from this engine. */
  mention_rate_change: number | null;
  /** after − before (a lower position is better); null unless the business was named in both. */
  avg_position_change: number | null;
}

export interface NameChange { name: string; answers_before: number; answers_after: number }
export interface SourceChange {
  domain: string;
  answers_before: number;
  answers_after: number;
  /** Engines that cited it, in the scan where it was cited. */
  engines: string[];
  /** Answers citing it that also named the business, in that scan. */
  with_business: number;
  urls: string[];
  /** The question of one answer that cited it, as asked. */
  example_prompt: string | null;
}

export interface ChangeNote {
  status: "ready" | "not_ready";
  /** Set when not ready: what is missing. */
  message?: string;
  business: string;
  window: { from: string; to: string };
  scans: { before: string; after: string };
  comparable: { same_service: boolean; same_question: boolean; same_grid: boolean; same_engines: boolean; same_place: boolean; notes: string[] };
  points: { before: { named: number; checked: number }; after: { named: number; checked: number } } | null;
  engines: EngineChange[];
  names: { appeared: NameChange[]; disappeared: NameChange[] };
  sources: { added: SourceChange[]; removed: SourceChange[]; cited_before: number; cited_after: number };
  possible_reasons: { text: string; evidence: "source_lost" | "source_new" | "crawler_finding" | "maps_move" }[];
  disclaimer: string;
}

export const CHANGE_NOTE_DISCLAIMER =
  "AI assistants do not explain their choices, so nobody can know exactly why an answer changed. This note lists what changed between two dated checks, with the stored evidence next to it; possible reasons are leads to look at, not causes. AI answers also vary between runs, places and time.";

const MAX_ROWS = 8;
/** Text from outside RankbyAI (names and sources in AI answers): one line, no control or text-direction characters, capped. */
const clean = (v: string | null | undefined, max: number) => (v ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const pct = (x: number) => Math.round(x * 1000) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const done = (xs: NoteSample[]) => xs.filter((s) => s.status === "done");

function engineSide(samples: NoteSample[], engine: Engine): EngineSide | null {
  const d = done(samples).filter((s) => s.engine === engine);
  if (!d.length) return null;
  const named = d.filter((s) => s.mentioned);
  const positions = named.map((s) => s.mention_position).filter((p): p is number => p != null);
  return { answers: d.length, named: named.length, mention_rate: pct(named.length / d.length), avg_position: positions.length ? round2(positions.reduce((a, b) => a + b, 0) / positions.length) : null };
}

/** Answers naming each other business, grouped as the report groups names (one business written several ways is one row). */
function nameCounts(samples: NoteSample[]): Map<string, { name: string; answers: number }> {
  const rows = new Map<string, { name: string; answers: number }>();
  for (const s of done(samples)) {
    const seen = new Set<string>();
    for (const nb of s.named_businesses ?? []) {
      if (nb.you) continue;
      const norm = normalizeName(nb.name);
      if (!norm) continue;
      const key = [...rows.keys()].find((k) => k === norm || namesMatch(rows.get(k)!.name, nb.name)) ?? norm;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = rows.get(key) ?? { name: clean(nb.name, 120), answers: 0 };
      row.answers++;
      rows.set(key, row);
    }
  }
  return rows;
}

interface SourceRow { answers: number; engines: Set<Engine>; withBusiness: number; urls: Set<string>; prompt: string | null }
function sourceCounts(samples: NoteSample[]): Map<string, SourceRow> {
  const rows = new Map<string, SourceRow>();
  for (const s of done(samples)) {
    const seen = new Set<string>();
    for (const src of s.sources ?? []) {
      const d = src?.url ? domainOf(src.url) : null;
      if (!d) continue;
      const row = rows.get(d) ?? { answers: 0, engines: new Set<Engine>(), withBusiness: 0, urls: new Set<string>(), prompt: null };
      if (row.urls.size < 3 && /^https?:\/\//i.test(src.url)) row.urls.add(clean(src.url, 300).replace(/\s/g, "%20"));
      if (!seen.has(d)) {
        seen.add(d);
        row.answers++;
        row.engines.add(s.engine);
        if (s.mentioned) row.withBusiness++;
        row.prompt ??= s.prompt ? clean(s.prompt, 300) : null;
      }
      rows.set(d, row);
    }
  }
  return rows;
}

const sourceChange = (domain: string, a: SourceRow | undefined, b: SourceRow | undefined): SourceChange => {
  const where = (b?.answers ? b : a)!;
  return {
    domain, answers_before: a?.answers ?? 0, answers_after: b?.answers ?? 0,
    engines: [...where.engines].map((e) => ENGINE_LABEL[e]?.short ?? e), with_business: where.withBusiness, urls: [...where.urls], example_prompt: where.prompt,
  };
};

const pointsNamed = (samples: NoteSample[]) => ({
  named: new Set(done(samples).filter((s) => s.mentioned).map((s) => s.point_idx)).size,
  checked: new Set(done(samples).map((s) => s.point_idx)).size,
});

export function changeNote(businessName: string, a: NoteScan, b: NoteScan, samplesA: NoteSample[], samplesB: NoteSample[], extras: NoteExtras = {}): ChangeNote {
  // "before" is always the older scan.
  if (new Date(a.created_at) > new Date(b.created_at)) return changeNote(businessName, b, a, samplesB, samplesA, extras);
  const business = clean(businessName, 120);
  const service = (s: NoteScan) => (s.niche ?? s.keyword ?? "").trim().toLowerCase();
  const comparable = {
    same_service: service(a) === service(b),
    same_question: (a.prompt_template ?? DEFAULT_PROMPT_TEMPLATE) === (b.prompt_template ?? DEFAULT_PROMPT_TEMPLATE),
    same_grid: a.grid_size === b.grid_size,
    same_engines: sameSet(a.engines, b.engines),
    same_place: samePlace(a, b),
    notes: [] as string[],
  };
  if (!comparable.same_service) comparable.notes.push("The two checks asked about different services, so the change mixes two questions.");
  if (!comparable.same_question) comparable.notes.push("The two checks asked the assistants a different question (other wording or another language); part of any change can come from the question itself.");
  if (!comparable.same_grid || !comparable.same_place) comparable.notes.push("The two checks used different grids (size, centre or radius), so they asked from different places.");
  if (!comparable.same_engines) comparable.notes.push("The two checks asked different AI engines; only engines in both are compared.");

  const base = { business, window: { from: a.created_at, to: b.created_at }, scans: { before: a.id, after: b.id }, comparable, disclaimer: CHANGE_NOTE_DISCLAIMER };
  const finished = (s: NoteScan) => s.status === "done" || s.status === "partial";
  const empty = { points: null, engines: [], names: { appeared: [], disappeared: [] }, sources: { added: [], removed: [], cited_before: 0, cited_after: 0 }, possible_reasons: [] };
  if (!finished(a) || !finished(b)) {
    return { ...base, ...empty, status: "not_ready", message: `The ${finished(a) ? "later" : "earlier"} check is ${finished(a) ? b.status : a.status}, so nothing is compared yet. Ask again once both have finished.` };
  }
  if (!done(samplesA).length || !done(samplesB).length) {
    return { ...base, ...empty, status: "not_ready", message: "One of the checks has no completed answers, so nothing is compared." };
  }

  const engines: EngineChange[] = [...new Set([...a.engines, ...b.engines])].map((engine) => {
    const before = engineSide(samplesA, engine);
    const after = engineSide(samplesB, engine);
    return {
      engine, label: ENGINE_LABEL[engine]?.short ?? engine, before, after,
      mention_rate_change: before && after ? Math.round((after.mention_rate - before.mention_rate) * 10) / 10 : null,
      avg_position_change: before?.avg_position != null && after?.avg_position != null ? round2(after.avg_position - before.avg_position) : null,
    };
  });

  const na = nameCounts(samplesA);
  const nb = nameCounts(samplesB);
  const inOther = (name: string, other: Map<string, { name: string; answers: number }>) => [...other.values()].find((r) => normalizeName(r.name) === normalizeName(name) || namesMatch(r.name, name));
  const appeared = [...nb.values()].filter((r) => !inOther(r.name, na)).map((r) => ({ name: r.name, answers_before: 0, answers_after: r.answers })).sort((x, y) => y.answers_after - x.answers_after).slice(0, MAX_ROWS);
  const disappeared = [...na.values()].filter((r) => !inOther(r.name, nb)).map((r) => ({ name: r.name, answers_before: r.answers, answers_after: 0 })).sort((x, y) => y.answers_before - x.answers_before).slice(0, MAX_ROWS);

  const sa = sourceCounts(samplesA);
  const sb = sourceCounts(samplesB);
  const added = [...sb.keys()].filter((d) => !sa.has(d)).map((d) => sourceChange(d, undefined, sb.get(d))).sort((x, y) => y.answers_after - x.answers_after).slice(0, MAX_ROWS);
  const removed = [...sa.keys()].filter((d) => !sb.has(d)).map((d) => sourceChange(d, sa.get(d), undefined)).sort((x, y) => y.answers_before - x.answers_before).slice(0, MAX_ROWS);

  // Possible reasons: each one quotes dated stored evidence.
  const reasons: ChangeNote["possible_reasons"] = [];
  for (const r of removed.filter((x) => x.with_business > 0).slice(0, 3)) {
    reasons.push({ evidence: "source_lost", text: `${r.domain} was cited in ${r.with_business} ${r.with_business === 1 ? "answer" : "answers"} that named ${business} on ${day(a.created_at)}, and in none on ${day(b.created_at)}.` });
  }
  for (const r of added.filter((x) => x.with_business > 0).slice(0, 3)) {
    reasons.push({ evidence: "source_new", text: `${r.domain} was cited in ${r.with_business} ${r.with_business === 1 ? "answer" : "answers"} that named ${business} on ${day(b.created_at)}, and in none on ${day(a.created_at)}.` });
  }
  // Only an audit between the two scans can say something about what changed between them: a block
  // found before the earlier scan was there for both.
  const auditInWindow = !!extras.audit && new Date(extras.audit.created_at) >= new Date(a.created_at) && new Date(extras.audit.created_at) <= new Date(b.created_at);
  for (const f of auditInWindow ? extras.audit!.crawlerFindings : []) {
    reasons.push({ evidence: "crawler_finding", text: `The audit of ${day(extras.audit!.created_at)} found: ${clean(f.title, 200)} (${clean(f.priority, 4)}). A crawler that cannot read the site cannot quote it.` });
  }
  const m = extras.maps;
  if (m && (m.before.avg_rank !== m.after.avg_rank || m.before.top3_points !== m.after.top3_points)) {
    reasons.push({ evidence: "maps_move", text: `On Google Maps, the business was in the top 3 at ${m.before.top3_points} of ${m.before.points_done} points on ${day(m.before.created_at)} and at ${m.after.top3_points} of ${m.after.points_done} on ${day(m.after.created_at)}${m.before.avg_rank != null && m.after.avg_rank != null ? ` (average rank ${m.before.avg_rank} → ${m.after.avg_rank})` : ""}.` });
  }

  return {
    ...base,
    status: "ready",
    points: { before: pointsNamed(samplesA), after: pointsNamed(samplesB) },
    engines,
    names: { appeared, disappeared },
    sources: { added, removed, cited_before: sa.size, cited_after: sb.size },
    possible_reasons: reasons,
  };
}

const signed = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;

/** The note as Markdown, to copy or download. Every figure is a field of the note. */
export function changeNoteMarkdown(n: ChangeNote): string {
  const out: string[] = [`# Why it changed: ${n.business}`, "", `AI visibility check of ${day(n.window.from)} compared with ${day(n.window.to)}.`, ""];
  if (n.status === "not_ready") return [...out, n.message ?? "Nothing to compare yet.", "", `_${n.disclaimer}_`].join("\n");
  for (const note of n.comparable.notes) out.push(`> ${note}`);
  if (n.comparable.notes.length) out.push("");
  if (n.points) out.push(`**Points where an AI assistant named ${n.business}:** ${n.points.before.named} of ${n.points.before.checked} → ${n.points.after.named} of ${n.points.after.checked}.`, "");
  out.push("## Per engine", "");
  for (const e of n.engines) {
    if (!e.before || !e.after) {
      out.push(`- **${e.label}:** ${e.after ? `${e.after.named} of ${e.after.answers} answers named the business (no answers in the earlier check)` : e.before ? `no answers in the later check (${e.before.named} of ${e.before.answers} before)` : "no answers in either check"}.`);
      continue;
    }
    const pos = e.avg_position_change != null ? `; average position ${e.before.avg_position} → ${e.after.avg_position}` : "";
    out.push(`- **${e.label}:** named in ${e.before.named} of ${e.before.answers} answers → ${e.after.named} of ${e.after.answers} (${e.before.mention_rate}% → ${e.after.mention_rate}%, ${signed(e.mention_rate_change!, " pts")})${pos}.`);
  }
  out.push("");
  if (n.names.appeared.length || n.names.disappeared.length) {
    out.push("## Businesses named instead", "");
    for (const x of n.names.appeared) out.push(`- New: **${x.name}**, in ${x.answers_after} ${x.answers_after === 1 ? "answer" : "answers"}.`);
    for (const x of n.names.disappeared) out.push(`- Gone: **${x.name}**, named in ${x.answers_before} ${x.answers_before === 1 ? "answer" : "answers"} before.`);
    out.push("");
  }
  if (n.sources.added.length || n.sources.removed.length) {
    out.push("## Cited sources", "");
    for (const x of n.sources.added) out.push(`- New: **${x.domain}**, cited in ${x.answers_after} ${x.answers_after === 1 ? "answer" : "answers"} (${x.engines.join(", ")})${x.urls[0] ? `, e.g. ${x.urls[0]}` : ""}.`);
    for (const x of n.sources.removed) out.push(`- Gone: **${x.domain}**, cited in ${x.answers_before} ${x.answers_before === 1 ? "answer" : "answers"} before (${x.engines.join(", ")}).`);
    out.push("");
  } else if (!n.sources.cited_before && !n.sources.cited_after) {
    out.push("No cited sources were stored for these answers, so citation changes cannot be shown.", "");
  }
  if (n.possible_reasons.length) {
    out.push("## Possible reasons (leads, from stored evidence)", "");
    for (const r of n.possible_reasons) out.push(`- ${r.text}`);
    out.push("");
  }
  out.push(`_${n.disclaimer}_`);
  return out.join("\n");
}
