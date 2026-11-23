import { classifyPage, DIRECTORY_DOMAINS, normalizeUrl, type ClassifyContext, type Confidence, type PageType } from "@/lib/citations/classify";
import type { CitedUrl } from "@/lib/citations/inventory";
import { DATAFORSEO_BACKLINKS, DATAFORSEO_LABS, type Engine } from "@/lib/pricing-constants";
import type { BacklinkPage } from "@/lib/providers/dataforseo";

/**
 * Citation targets (citation workflow, step 3). Pure: the DataForSEO filter, the estimate, and
 * merging competitors' backlinks, the business's own backlinks and the pages AI answers cited into
 * one list. Every figure is copied from a DataForSEO response or a stored answer; a missing figure
 * stays null. "etv" is DataForSEO's estimated monthly organic traffic for the page, nothing else.
 */

export const TARGET_MAX_COMPETITORS = 3;
export const TARGET_ROWS_DEFAULT = 200;
export const TARGET_TRAFFIC_DEFAULT = 400;
/** Targets kept per list, best first. */
export const TARGET_KEEP = 1000;
/** DataForSEO accepts at most 8 conditions in one filter. */
const MAX_CONDITIONS = 8;

export interface CompetitorRef {
  name: string | null;
  /** Without protocol or www, e.g. localfalcon.com. */
  domain: string;
}

/** A site address as DataForSEO wants a target: lower case, no protocol, no www, no path. Null when it is not a domain. */
export function targetDomain(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  let host = s;
  try {
    host = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** The words a list page's address usually holds, plus the city and "near me" for a local business. */
export function defaultTokens(scope: "local" | "online", city?: string | null): string[] {
  const tokens = ["best", "top-", "review"];
  const slug = (city ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (scope === "local" && slug.length >= 3) tokens.push(slug, "near-me");
  return tokens;
}

/**
 * DataForSEO filter: the address contains any token (case-insensitive), or, for a local business,
 * the page is on a known local directory even when its address has none of them.
 */
export function buildFilters(tokens: readonly string[], opts: { directories?: boolean } = {}): unknown[] {
  const clean = [...new Set(tokens.map((t) => t.trim().toLowerCase().replace(/[%_*]/g, "")).filter((t) => t.length >= 2))];
  const room = MAX_CONDITIONS - (opts.directories ? 1 : 0);
  const conds: unknown[] = clean.slice(0, room).map((t) => ["url_from", "ilike", `%${t}%`]);
  if (opts.directories) conds.push(["domain_from", "in", [...DIRECTORY_DOMAINS]]);
  return conds.flatMap((c, i) => (i ? ["or", c] : [c]));
}

export interface TargetEstimate {
  /** An upper bound: DataForSEO bills the rows it returns, at most the cap. */
  totalUsd: number;
  highUsd: number;
  basis: "published prices";
  upTo: true;
  lines: { provider: string; label: string; usd: number }[];
  calls: number;
  note: string;
}

export function estimateTargets(p: { competitors: CompetitorRef[]; clientDomain: string | null; rows: number; trafficCap: number }): TargetEstimate {
  const B = DATAFORSEO_BACKLINKS;
  const L = DATAFORSEO_LABS;
  const perCall = B.perTask + B.perRow * p.rows;
  const lines = p.competitors.map((c) => ({ provider: "dataforseo", label: `Backlinks of ${c.domain}: list pages, up to ${p.rows} rows`, usd: perCall }));
  if (p.clientDomain) lines.push({ provider: "dataforseo", label: `Backlinks of ${p.clientDomain} (the business): the same list pages, up to ${p.rows} rows`, usd: perCall });
  lines.push({ provider: "dataforseo", label: `Estimated traffic for up to ${p.trafficCap} pages (DataForSEO Labs)`, usd: L.perTask + L.perItem * p.trafficCap });
  const total = lines.reduce((s, l) => s + l.usd, 0);
  return {
    totalUsd: total, highUsd: total, basis: "published prices", upTo: true, lines, calls: lines.length,
    note: `Up to: DataForSEO bills ${B.perTask} USD a call plus ${B.perRow} USD a row returned (Backlinks) and ${L.perTask} USD a call plus ${L.perItem} USD a page (traffic), at its published prices read on ${B.readOn}. Fewer rows cost less; the actual cost each response reports is recorded. Billed to your DataForSEO account.`,
  };
}

export type TargetAction = "pitch" | "directory_claim" | "skip";

export interface TargetRow {
  url: string;
  key: string;
  domain: string;
  title: string | null;
  page_type: PageType;
  type_confidence: Confidence;
  /** Estimated monthly organic traffic for the page (DataForSEO etv); null when it gave none or the page was outside the traffic cap. */
  etv: number | null;
  /** DataForSEO's own page rank (0–1000), not Ahrefs DR. */
  page_rank: number | null;
  /** Competitors this page links to (their name, else their domain). */
  competitors_linked: string[];
  /** The page links to the business's site; null when the business has no website to check. */
  client_linked: boolean | null;
  /** RankbyAI read the page and found the business's name (true) or did not (false); null when not read. */
  client_named_on_page: boolean | null;
  /** How AI answers in the business's prompt packs cited the page, when they did. */
  cited: { answers: number; answers_naming_client: number; engines: Engine[]; first_seen: string; last_seen: string } | null;
  source: "backlinks" | "citations" | "both";
  action: TargetAction;
  action_reason: string;
}

/**
 * What to do with a page. A business can be added to a list or a review page, claim a directory
 * profile, and nothing else here. A page that already links to or names it needs nothing.
 */
export function actionFor(row: Pick<TargetRow, "page_type" | "client_linked" | "client_named_on_page" | "competitors_linked" | "cited">): { action: TargetAction; reason: string } {
  if (row.page_type === "official_site" || row.page_type === "maps_listing" || row.page_type === "social") return { action: "skip", reason: "Not a page the business can be added to." };
  if (row.client_linked || row.client_named_on_page === true) return { action: "skip", reason: "Already links to or names the business." };
  if (row.page_type === "forum") return { action: "skip", reason: "A forum thread: take part in the discussion rather than ask for a listing." };
  if (row.page_type === "directory") return { action: "directory_claim", reason: "A directory: claim or create the business's profile." };
  const linked = row.competitors_linked.length;
  if (linked && row.cited) return { action: "pitch", reason: `AI answers cite it, and it links to ${linked === 1 ? "a competitor" : `${linked} competitors`} but not the business.` };
  if (linked) return { action: "pitch", reason: `It links to ${linked === 1 ? "a competitor" : `${linked} competitors`} but not the business.` };
  return { action: "pitch", reason: "AI answers cite it, and they leave the business out." };
}

export interface MergeInput {
  backlinks: { competitor: CompetitorRef; pages: BacklinkPage[] }[];
  /** Page keys (normalizeUrl) that link to the business; null when it has no website. */
  clientKeys: Set<string> | null;
  /** The business's cited pages from its prompt packs (step 2). Only pages it is missing from are added as targets. */
  citations: CitedUrl[];
  /** etv by page key. */
  etv: ReadonlyMap<string, number | null>;
  ctx: ClassifyContext;
}

/** Candidate pages, best first: cited pages first, then the pages competitors' list backlinks point from, by DataForSEO rank. Used to choose which pages get a traffic estimate. */
export function trafficOrder(input: Omit<MergeInput, "etv">): { key: string; url: string }[] {
  const out: { key: string; url: string; cited: number; rank: number }[] = [];
  const seen = new Set<string>();
  for (const c of input.citations) {
    if (!wantedCitation(c) || seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, url: c.url, cited: c.answers, rank: -1 });
  }
  for (const b of input.backlinks) for (const p of b.pages) {
    const n = normalizeUrl(p.url);
    if (!n || seen.has(n.key)) continue;
    seen.add(n.key);
    out.push({ key: n.key, url: n.url, cited: 0, rank: p.pageRank ?? 0 });
  }
  return out.sort((a, b) => b.cited - a.cited || b.rank - a.rank).map(({ key, url }) => ({ key, url }));
}

/** A cited page worth a place in the target list: the business is missing from it and it is a page one can be added to. */
const wantedCitation = (c: CitedUrl) => c.missing.client_absent && !["maps_listing", "official_site", "social"].includes(c.page_type);

export function mergeTargets(input: MergeInput): TargetRow[] {
  const rows = new Map<string, Omit<TargetRow, "action" | "action_reason" | "page_type" | "type_confidence">>();
  const nameOf = (c: CompetitorRef) => c.name ?? c.domain;
  for (const { competitor, pages } of input.backlinks) {
    for (const p of pages) {
      const n = normalizeUrl(p.url);
      if (!n) continue;
      const row = rows.get(n.key) ?? {
        url: n.url, key: n.key, domain: n.domain, title: p.title, etv: input.etv.get(n.key) ?? null, page_rank: p.pageRank,
        competitors_linked: [], client_linked: input.clientKeys ? input.clientKeys.has(n.key) : null, client_named_on_page: null, cited: null, source: "backlinks" as const,
      };
      if (!row.competitors_linked.includes(nameOf(competitor))) row.competitors_linked.push(nameOf(competitor));
      row.title ??= p.title;
      if (p.pageRank != null && (row.page_rank == null || p.pageRank > row.page_rank)) row.page_rank = p.pageRank;
      rows.set(n.key, row);
    }
  }
  const citedByKey = new Map(input.citations.map((c) => [c.key, c]));
  for (const c of input.citations) {
    const existing = rows.get(c.key);
    if (!existing && !wantedCitation(c)) continue;
    const cited = { answers: c.answers, answers_naming_client: c.answers_naming_client, engines: c.engines, first_seen: c.first_seen, last_seen: c.last_seen };
    if (existing) {
      existing.cited = cited;
      existing.source = "both";
      existing.title ??= c.title;
    } else {
      rows.set(c.key, {
        url: c.url, key: c.key, domain: c.domain, title: c.title, etv: input.etv.get(c.key) ?? null, page_rank: null, competitors_linked: [],
        client_linked: input.clientKeys ? input.clientKeys.has(c.key) : null, client_named_on_page: null, cited, source: "citations",
      });
    }
  }
  const out: TargetRow[] = [...rows.values()].map((r) => {
    const c = citedByKey.get(r.key);
    // A page RankbyAI read itself (step 2): whether it names the business, when the read counted.
    const named = c?.page_check?.status === "ok" && c.missing.basis === "page" ? !c.missing.client_absent : null;
    const cls = classifyPage({ url: r.url, title: r.title }, input.ctx);
    const full = { ...r, client_named_on_page: named, page_type: cls.type, type_confidence: cls.confidence };
    const a = actionFor(full);
    return { ...full, action: a.action, action_reason: a.reason };
  });
  return out
    .sort((a, b) => (b.cited?.answers ?? 0) - (a.cited?.answers ?? 0) || (b.etv ?? -1) - (a.etv ?? -1) || (b.page_rank ?? -1) - (a.page_rank ?? -1) || a.key.localeCompare(b.key))
    .slice(0, TARGET_KEEP);
}

// ───────────────────────── export ─────────────────────────

/** One CSV cell: quoted, with spreadsheet formulas neutralised (page titles come from other people's sites). */
const csvCell = (v: string | number | boolean | null | undefined) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const TARGETS_CSV_HEADER = "url,domain,title,page_type,type_confidence,estimated_traffic_dataforseo_etv,dataforseo_page_rank,competitors_linked,client_linked,client_named_on_page,cited_answers,cited_answers_naming_client,cited_engines,cited_first_seen,cited_last_seen,source,action,action_reason";

export function targetsCsv(rows: TargetRow[]): string {
  const lines = rows.map((r) => [
    r.url, r.domain, r.title, r.page_type, r.type_confidence, r.etv == null ? "" : Math.round(r.etv * 10) / 10, r.page_rank, r.competitors_linked.join("; "),
    r.client_linked, r.client_named_on_page, r.cited?.answers, r.cited?.answers_naming_client, r.cited?.engines.join("; "), r.cited?.first_seen, r.cited?.last_seen,
    r.source, r.action, r.action_reason,
  ].map(csvCell).join(","));
  return [TARGETS_CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}
