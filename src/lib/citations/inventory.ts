import type { Engine } from "@/lib/pricing-constants";
import { namesMatch } from "@/lib/scans/match";
import { classifyPage, normalizeUrl, type ClassifyContext, type Confidence, type PageType } from "./classify";

/**
 * Prompt pack results and the cited-page inventory (citation workflow, steps 1 and 2). Pure, over
 * stored rows: every count is a count of stored answers, every name and address was in an answer.
 *
 * "Missing" has two bases and the result always says which one it used:
 * - answers: no stored answer that cited the page named the business;
 * - page: RankbyAI read the page itself and the business's name is not on it.
 * A page that could not be read stays on the answers basis; it is never guessed.
 */

export interface InvRun {
  id: string;
  created_at: string;
  /** done or partial: the run counts for first seen, last seen and disappeared on. */
  finished: boolean;
}

export interface InvSample {
  run_id: string;
  prompt_idx: number;
  engine: Engine;
  status: string;
  mentioned: boolean | null;
  mention_position?: number | null;
  named_businesses: { name: string; you?: boolean }[] | null;
  sources: { url: string; title?: string | null }[] | null;
}

export interface PageCheck {
  url_key: string;
  status: "ok" | "failed";
  fetched_at: string;
  title: string | null;
  client_named: boolean | null;
  competitors_named: string[];
}

export interface Missing {
  basis: "page" | "answers";
  /** The business is not named: on the page (basis page) or in any answer that cited it (basis answers). */
  client_absent: boolean;
  /** Other businesses named on the page, or in the answers that cited it. */
  competitors_present: string[];
  /** Why the page read was not used, or where it disagrees with the answers. */
  note?: string;
}

export const PAGE_DISAGREES = "An answer named the business while citing this page, but RankbyAI did not find the name on the page itself (it may be spelled differently, or load later). Check the page by hand.";
export const PAGE_INCONCLUSIVE = "RankbyAI read the page but found neither the business nor any business the citing answers named, so the list may not have loaded; this is counted from the answers.";

/**
 * "Missing" for one page. A page read only decides it when it is corroborated: the page shows a
 * business the citing answers also named (so the list text was really read). Exact-name matching on
 * a page is stricter than the answer matching, so a read never overrules an answer that named the
 * business: that disagreement is reported, not called missing.
 */
export function missingFor(check: PageCheck | null, citing: { client: number; others: string[] }): Missing {
  const fromAnswers: Missing = { basis: "answers", client_absent: citing.client === 0, competitors_present: citing.others.slice(0, 5) };
  if (!check || check.status !== "ok" || check.client_named == null) return fromAnswers;
  if (check.client_named) return { basis: "page", client_absent: false, competitors_present: check.competitors_named };
  if (citing.client > 0) return { ...fromAnswers, note: PAGE_DISAGREES };
  const corroborated = check.competitors_named.some((n) => citing.others.some((o) => namesMatch(o, n)));
  return corroborated ? { basis: "page", client_absent: true, competitors_present: check.competitors_named } : { ...fromAnswers, note: PAGE_INCONCLUSIVE };
}

export interface CitedUrl {
  url: string;
  key: string;
  domain: string;
  title: string | null;
  page_type: PageType;
  type_confidence: Confidence;
  type_why: string;
  /** For a competitor's own site. */
  competitor?: string;
  /** Answers that cited the page. */
  answers: number;
  /** Of those, answers that named the business. */
  answers_naming_client: number;
  /** Of those, answers that named other businesses but not this one. */
  answers_naming_only_others: number;
  engines: Engine[];
  /** 0-based indexes of the prompts whose answers cited it. */
  prompts: number[];
  first_seen: string;
  last_seen: string;
  /** The first finished run after the last one that cited it, when the latest finished run did not cite it. */
  disappeared_on: string | null;
  runs_cited: number;
  page_check: { status: "ok" | "failed"; fetched_at: string; client_named: boolean | null; competitors_named: string[] } | null;
  missing: Missing;
}

export interface CitedDomain {
  domain: string;
  answers: number;
  answers_naming_client: number;
  urls: number;
  page_types: PageType[];
  engines: Engine[];
  first_seen: string;
  last_seen: string;
  disappeared_on: string | null;
  /** Every cited page on the domain leaves the business out (each on its own basis). */
  client_absent: boolean;
}

export interface Inventory {
  runs: number;
  answers: number;
  answers_with_sources: number;
  urls: CitedUrl[];
  domains: CitedDomain[];
}

export interface InventoryContext extends ClassifyContext {
  clientName: string;
}

/** Group spellings of one business (namesMatch) and count answers per business. */
class NameCounter {
  private rows: { name: string; n: number }[] = [];
  add(name: string) {
    const hit = this.rows.find((r) => namesMatch(r.name, name));
    if (hit) hit.n++;
    else this.rows.push({ name, n: 1 });
  }
  top(k: number) {
    return [...this.rows].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, k);
  }
}

/**
 * A stored "name" that reads as a business name, or null. Free-form buyer prompts get prose and
 * headings back, and the shared list parser then stores lines that are no business (measured on
 * real answers on 23 Nov 2026: "10 Austin dentist options", "shortlist, not a definitive ranking",
 * "South Austin Dental Associates (Dr"). Conservative: only clear headings and sentences are
 * dropped; a cut-off bracket is trimmed. Used for pack results and the inventory only.
 */
export function businessNameOrNull(raw: string): string | null {
  let n = raw.trim().replace(/\s+/g, " ");
  if ((n.match(/\(/g) ?? []).length > (n.match(/\)/g) ?? []).length) n = n.replace(/\s*\([^)]*$/, "").trim();
  if (n.length < 2) return null;
  // A list heading, not a business: a count followed by a generic list word.
  if (/^(top\s+)?\d+\s/i.test(n) && /\b(options?|picks?|choices?|places?|businesses|companies|providers|best|top)\b/i.test(n)) return null;
  // A phrase, not a name: three or more words, most of them lower case.
  const words = n.split(" ");
  if (words.length >= 3 && words.filter((w) => /^[a-z]/.test(w)).length / words.length > 0.5) return null;
  return n;
}

const othersIn = (s: InvSample, clientName: string) =>
  [...new Set((s.named_businesses ?? []).filter((n) => !n.you && !namesMatch(n.name, clientName)).map((n) => businessNameOrNull(n.name)).filter((n): n is string => !!n))];

const usefulTitle = (title: string | null | undefined, url: string) => {
  const t = (title ?? "").trim();
  return t && t !== url && !/^https?:\/\//i.test(t) ? t.slice(0, 300) : null;
};

interface Acc {
  url: string;
  key: string;
  domain: string;
  title: string | null;
  answers: number;
  client: number;
  onlyOthers: number;
  engines: Set<Engine>;
  prompts: Set<number>;
  runs: Set<string>;
  others: NameCounter;
}

/** Seen dates over the finished runs, oldest first: first, last, and when it dropped out. */
function seen(runIds: Set<string>, ordered: InvRun[]): { first: string; last: string; disappeared: string | null } {
  const hits = ordered.filter((r) => runIds.has(r.id));
  const first = hits[0]?.created_at ?? "";
  const last = hits[hits.length - 1]?.created_at ?? "";
  const latest = ordered[ordered.length - 1];
  let disappeared: string | null = null;
  if (latest && hits.length && !runIds.has(latest.id)) {
    const after = ordered.findIndex((r) => r.id === hits[hits.length - 1].id) + 1;
    disappeared = ordered[after]?.created_at ?? null;
  }
  return { first, last, disappeared };
}

export function buildInventory(runs: InvRun[], samples: InvSample[], checks: ReadonlyMap<string, PageCheck>, ctx: InventoryContext): Inventory {
  const ordered = runs.filter((r) => r.finished).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const counted = new Set(ordered.map((r) => r.id));
  const done = samples.filter((s) => s.status === "done" && counted.has(s.run_id));
  const acc = new Map<string, Acc>();
  let withSources = 0;
  for (const s of done) {
    const clientNamed = s.mentioned === true;
    const others = othersIn(s, ctx.clientName);
    const inThis = new Set<string>();
    for (const src of s.sources ?? []) {
      const n = src?.url ? normalizeUrl(src.url) : null;
      if (!n || inThis.has(n.key)) continue;
      inThis.add(n.key);
      let a = acc.get(n.key);
      if (!a) {
        a = { url: n.url, key: n.key, domain: n.domain, title: null, answers: 0, client: 0, onlyOthers: 0, engines: new Set(), prompts: new Set(), runs: new Set(), others: new NameCounter() };
        acc.set(n.key, a);
      }
      a.title ??= usefulTitle(src.title, src.url);
      a.answers++;
      if (clientNamed) a.client++;
      else if (others.length) a.onlyOthers++;
      a.engines.add(s.engine);
      a.prompts.add(s.prompt_idx);
      a.runs.add(s.run_id);
      for (const o of others) a.others.add(o);
    }
    if (inThis.size) withSources++;
  }

  const urls: CitedUrl[] = [...acc.values()].map((a) => {
    const check = checks.get(a.key) ?? null;
    const title = usefulTitle(check?.title, a.url) ?? a.title;
    const cls = classifyPage({ url: a.url, title }, ctx);
    const when = seen(a.runs, ordered);
    const missing = missingFor(check, { client: a.client, others: a.others.top(50).map((r) => r.name) });
    return {
      url: a.url, key: a.key, domain: a.domain, title,
      page_type: cls.type, type_confidence: cls.confidence, type_why: cls.why, ...(cls.competitor ? { competitor: cls.competitor } : {}),
      answers: a.answers, answers_naming_client: a.client, answers_naming_only_others: a.onlyOthers,
      engines: [...a.engines].sort(), prompts: [...a.prompts].sort((x, y) => x - y),
      first_seen: when.first, last_seen: when.last, disappeared_on: when.disappeared, runs_cited: a.runs.size,
      page_check: check ? { status: check.status, fetched_at: check.fetched_at, client_named: check.client_named, competitors_named: check.competitors_named } : null,
      missing,
    };
  }).sort((x, y) => y.answers - x.answers || x.key.localeCompare(y.key));

  const byDomain = new Map<string, CitedUrl[]>();
  for (const u of urls) byDomain.set(u.domain, [...(byDomain.get(u.domain) ?? []), u]);
  const domains: CitedDomain[] = [...byDomain.entries()].map(([domain, list]) => {
    const runIds = new Set(list.flatMap((u) => [...acc.get(u.key)!.runs]));
    const when = seen(runIds, ordered);
    const typeCount = new Map<PageType, number>();
    for (const u of list) typeCount.set(u.page_type, (typeCount.get(u.page_type) ?? 0) + 1);
    return {
      domain,
      answers: list.reduce((s, u) => s + u.answers, 0),
      answers_naming_client: list.reduce((s, u) => s + u.answers_naming_client, 0),
      urls: list.length,
      page_types: [...typeCount.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t),
      engines: [...new Set(list.flatMap((u) => u.engines))].sort(),
      first_seen: when.first, last_seen: when.last, disappeared_on: when.disappeared,
      client_absent: list.every((u) => u.missing.client_absent),
    };
  }).sort((x, y) => y.answers - x.answers || x.domain.localeCompare(y.domain));

  return { runs: ordered.length, answers: done.length, answers_with_sources: withSources, urls, domains };
}

/** One page (or domain) run by run: how many answers cited it, and how many of those named the business. */
export function pageHistory(runs: InvRun[], samples: InvSample[], target: { key?: string; domain?: string }): { run_id: string; date: string; answers: number; answers_naming_client: number }[] {
  const ordered = runs.filter((r) => r.finished).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return ordered.map((r) => {
    let answers = 0;
    let client = 0;
    for (const s of samples) {
      if (s.run_id !== r.id || s.status !== "done") continue;
      const hit = (s.sources ?? []).some((src) => {
        const n = src?.url ? normalizeUrl(src.url) : null;
        return !!n && (target.key ? n.key === target.key : n.domain === target.domain);
      });
      if (!hit) continue;
      answers++;
      if (s.mentioned === true) client++;
    }
    return { run_id: r.id, date: r.created_at, answers, answers_naming_client: client };
  });
}

// ───────────────────────── one run's answers ─────────────────────────

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export interface PromptResult {
  idx: number;
  text: string;
  answers: number;
  named_client: number;
  mention_rate: number | null;
  engines: { engine: Engine; answers: number; named_client: number; mention_rate: number | null; avg_position: number | null }[];
  /** Other businesses the answers named, most often first. */
  top_names: { name: string; answers: number }[];
}

export interface PackResults {
  prompts: PromptResult[];
  answers: number;
  named_client: number;
  mention_rate: number | null;
  engines: { engine: Engine; answers: number; named_client: number; mention_rate: number | null }[];
  /** Per business: answers that named it ÷ answers that named at least one business. */
  share_of_answers: { name: string; you: boolean; answers: number; share: number | null }[];
  share_definition: string;
}

export const SHARE_DEFINITION = "Share of answers: the answers that named a business ÷ the answers that named at least one business. Counted over this run's stored answers only.";

function engineRows(list: InvSample[], engines: readonly Engine[]) {
  return engines.map((engine) => {
    const mine = list.filter((s) => s.engine === engine);
    const named = mine.filter((s) => s.mentioned === true);
    const positions = named.map((s) => s.mention_position).filter((p): p is number => typeof p === "number");
    return {
      engine, answers: mine.length, named_client: named.length, mention_rate: pct(named.length, mine.length),
      avg_position: positions.length ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
    };
  });
}

/** One run: per prompt and engine, how often the answers named the business, and who they named instead. */
export function packResults(promptTexts: readonly string[], samples: InvSample[], engines: readonly Engine[], clientName: string): PackResults {
  const done = samples.filter((s) => s.status === "done");
  const prompts: PromptResult[] = promptTexts.map((text, idx) => {
    const mine = done.filter((s) => s.prompt_idx === idx);
    const names = new NameCounter();
    for (const s of mine) for (const o of othersIn(s, clientName)) names.add(o);
    const named = mine.filter((s) => s.mentioned === true).length;
    return {
      idx, text, answers: mine.length, named_client: named, mention_rate: pct(named, mine.length),
      engines: engineRows(mine, engines), top_names: names.top(5).map((r) => ({ name: r.name, answers: r.n })),
    };
  });
  const all = new NameCounter();
  let withNames = 0;
  let client = 0;
  for (const s of done) {
    const others = othersIn(s, clientName);
    if (s.mentioned === true) client++;
    if (others.length || s.mentioned === true) withNames++;
    for (const o of others) all.add(o);
  }
  const share = [
    { name: clientName, you: true, answers: client, share: pct(client, withNames) },
    ...all.top(9).map((r) => ({ name: r.name, you: false, answers: r.n, share: pct(r.n, withNames) })),
  ].sort((a, b) => b.answers - a.answers || Number(b.you) - Number(a.you));
  return {
    prompts,
    answers: done.length,
    named_client: client,
    mention_rate: pct(client, done.length),
    engines: engineRows(done, engines).map((e) => ({ engine: e.engine, answers: e.answers, named_client: e.named_client, mention_rate: e.mention_rate })),
    share_of_answers: share,
    share_definition: SHARE_DEFINITION,
  };
}

/** The businesses stored answers named most often, the business itself left out (for competitor prompts and step 3). */
export function topCompetitors(samples: InvSample[], clientName: string, k = 5): { name: string; answers: number }[] {
  const names = new NameCounter();
  for (const s of samples) if (s.status === "done") for (const o of othersIn(s, clientName)) names.add(o);
  return names.top(k).map((r) => ({ name: r.name, answers: r.n }));
}
