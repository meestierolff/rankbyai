import "server-only";
import { houseBudgetCheck, logHouseSpend, estimateScan, type HouseFunding } from "@/lib/cost-guard";
import { dbAdmin } from "@/lib/db/clients";
import { resolveCredentials, type Funding } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { CREDIT_COST, DATAFORSEO_BUSINESS_INFO_PER_CALL, DATAFORSEO_MAPS_PER_POINT, ENGINES, LLM_PARSE_BUDGET_USD, type Engine } from "@/lib/pricing-constants";
import { businessInfoLive, mapsLive, type BusinessInfo } from "@/lib/providers/dataforseo";
import { mockAreas, mockBusinessInfo, mockMapsItems, mockSiteHtml } from "@/lib/providers/mock-data";
import type { ProviderCredentials } from "@/lib/providers/types";
import { createScan, processScan, type BusinessRow } from "@/lib/scans/engine";
import { namesMatch, normalizeName } from "@/lib/scans/match";
import { fetchPlaces } from "@/lib/scans/places";
import { CATEGORY_LABEL, runChecks, scoreAudit, type AuditInputs, type CheckResult } from "./checks";
import { crawlSite, extractFacts, fetchPage, type PageFacts, type SiteCrawl } from "./crawl";
import { PROBE_AGENTS, PROBE_AGENTS_QUICK } from "./crawler-fix";
import { languageCodeFor } from "@/lib/countries";
import { heuristicServices, llmServices, missingServices, type ServicePage } from "./services";

/**
 * Local AI Audit (brief 7.4): gather the inputs, run the deterministic checks, store the result.
 *
 * Every number in a finding comes from the inputs gathered here. A check whose input is missing is
 * stored as "not checked" and left out of the score; nothing is estimated or filled in.
 */
export const AUDIT_RADIUS_MILES = 10;
const MAX_COMPETITORS = 3;
const MAX_AREAS = 40;
const SERVICE_LLM_EST_USD = LLM_PARSE_BUDGET_USD * 2;
/** Wall-clock budget. The serverless function is stopped at 300 s; an audit must finish and save well before that. */
const AUDIT_BUDGET_MS = 230_000;
const CRAWL_BUDGET_MS = 75_000;

export interface AuditEstimate {
  totalUsd: number;
  credits: number;
  lines: { label: string; usd: number }[];
  /** What the audit will have to look up because no scan exists yet. */
  runsMapsCheck: boolean;
  runsAiCheck: boolean;
}

type Row = Record<string, unknown>;

async function latestScan(businessId: string, kind: "ai" | "maps"): Promise<{ id: string; created_at: string } | null> {
  const { data } = await dbAdmin()
    .from("scans").select("id, created_at").eq("business_id", businessId).eq("kind", kind).in("status", ["done", "partial"])
    .order("created_at", { ascending: false }).limit(1);
  return ((data ?? []) as { id: string; created_at: string }[])[0] ?? null;
}

export async function estimateAudit(businessId: string, engines: Engine[]): Promise<AuditEstimate> {
  const [maps, ai] = await Promise.all([latestScan(businessId, "maps"), latestScan(businessId, "ai")]);
  const lines = [
    { label: `Google profile details, ${1 + MAX_COMPETITORS} lookups (the business and its top ${MAX_COMPETITORS} competitors)`, usd: (1 + MAX_COMPETITORS) * DATAFORSEO_BUSINESS_INFO_PER_CALL },
    { label: "Reading services from competitor websites (OpenAI, when a key is available)", usd: SERVICE_LLM_EST_USD },
  ];
  if (!maps) lines.push({ label: "Google Maps results at the business location, 1 lookup", usd: DATAFORSEO_MAPS_PER_POINT.live });
  if (!ai && engines.length) {
    const est = await estimateScan({ kind: "ai", grid: 1, engines });
    lines.push({ label: `AI check at the business location, ${engines.length} ${engines.length === 1 ? "engine" : "engines"}`, usd: est.totalUsd });
  }
  return { totalUsd: lines.reduce((s, l) => s + l.usd, 0), credits: CREDIT_COST.audit, lines, runsMapsCheck: !maps, runsAiCheck: !ai && engines.length > 0 };
}

export interface CreateAuditInput {
  workspaceId: string;
  plan: "locked" | "lifetime";
  businessId: string;
  /** The service customers search for, e.g. "dentist". Used for the Maps lookup, the AI prompt and the on-page check. */
  service: string;
  months?: number;
  funding: Extract<Funding, "byok" | "credits">;
  confirm: boolean;
  /** Part of a prospect report: already paid for by the batch, homepage-only, and not counted against the running limit. */
  quick?: boolean;
}

export type CreateAuditResult =
  | { ok: true; auditId: string; estimate: AuditEstimate }
  | { ok: false; status: number; error: string; message: string; estimate?: AuditEstimate };

const fail = (status: number, error: string, message: string, estimate?: AuditEstimate): CreateAuditResult => ({ ok: false, status, error, message, estimate });

const creditRef = (auditId: string) => `audit:${auditId}`;

export async function createAudit(input: CreateAuditInput): Promise<CreateAuditResult> {
  const admin = dbAdmin();
  const service = input.service.trim();
  if (service.length < 2 || service.length > 80) return fail(400, "invalid_service", "Enter the main service (2–80 characters), for example “dentist”.");
  const months = Math.round(input.months ?? 3);
  if (!(months >= 1 && months <= 12)) return fail(400, "invalid_months", "Months must be between 1 and 12.");

  const { data: business } = await admin.from("businesses").select("id, workspace_id, lat, lng").eq("id", input.businessId).maybeSingle();
  if (!business || business.workspace_id !== input.workspaceId) return fail(404, "business_not_found", "That business was not found in this workspace.");

  const creds = await resolveCredentials(input.workspaceId, input.funding);
  const engines = ENGINES.filter((e) => !!creds[e]);
  const estimate = await estimateAudit(input.businessId, [...engines]);
  if (!input.confirm) return fail(409, "confirmation_required", "Review the estimate, then confirm to run.", estimate);

  if (input.plan !== "lifetime") return fail(403, "lifetime_required", "Running an audit needs lifetime access.", estimate);
  if (!creds.dataforseo) {
    return fail(input.funding === "byok" ? 400 : 503, "missing_key",
      input.funding === "byok" ? "The audit reads Google profile details through DataForSEO. Add your DataForSEO login in Settings → API keys, or use an included scan." : "Included scans are not available right now.", estimate);
  }
  const { count: running } = await admin.from("audits").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).in("status", ["queued", "running"]);
  if (!input.quick && (running ?? 0) >= 2) return fail(429, "too_many_running", "Two audits are already running. Wait for one to finish.", estimate);
  if (input.funding === "credits" && !input.quick) {
    const budget = await houseBudgetCheck("credits", estimate.totalUsd);
    if (!budget.ok) return fail(429, "daily_cap", budget.message ?? "Daily capacity reached.", estimate);
  }

  const { data: audit, error } = await admin
    .from("audits")
    .insert({ workspace_id: input.workspaceId, business_id: input.businessId, funding: input.funding, status: "queued", est_cost_usd: estimate.totalUsd, inputs: { service, months, ...(input.quick ? { quick: true } : {}), ...(isMockMode() ? { mock: true } : {}) } })
    .select("id").single<{ id: string }>();
  if (error || !audit) return fail(500, "server_error", "The audit could not be created. Nothing was charged.", estimate);

  if (input.funding === "credits" && !input.quick) {
    const { data: paid, error: creditError } = await admin.rpc("use_credits", { p_workspace_id: input.workspaceId, p_n: CREDIT_COST.audit, p_reason: "audit", p_ref: creditRef(audit.id) });
    if (creditError || paid !== true) {
      await admin.from("audits").delete().eq("id", audit.id);
      return fail(402, "insufficient_credits", "An audit needs 1 scan credit. Buy a pack on the Billing page, or run it on your own keys.", estimate);
    }
  }
  return { ok: true, auditId: audit.id, estimate };
}

/** Give the credit back when an audit fails (once). */
async function refundAuditCredit(workspaceId: string, auditId: string) {
  const admin = dbAdmin();
  const { data } = await admin.from("credit_ledger").select("delta").eq("workspace_id", workspaceId).eq("ref", creditRef(auditId));
  const net = ((data ?? []) as { delta: number }[]).reduce((s, r) => s + r.delta, 0);
  if (net < 0) await admin.from("credit_ledger").insert({ workspace_id: workspaceId, delta: -net, reason: "audit_refund", ref: creditRef(auditId) });
}

// ───────────────────────── gathering inputs ─────────────────────────

interface TopItem { rank: number; name: string; cid: string | null; place_id?: string | null; domain: string | null; reviews?: number | null }

const isBusiness = (item: { name: string; cid: string | null }, b: BusinessRow) => (!!b.cid && item.cid === b.cid) || namesMatch(item.name, b.name);

/** The three competitors that hold the map pack most often around the business. */
function topCompetitors(lists: TopItem[][], business: BusinessRow): TopItem[] {
  const tally = new Map<string, { item: TopItem; score: number }>();
  for (const list of lists) {
    for (const item of list.filter((i) => !isBusiness(i, business)).slice(0, MAX_COMPETITORS)) {
      const key = item.cid ?? normalizeName(item.name);
      const cur = tally.get(key) ?? { item, score: 0 };
      cur.score += 4 - Math.min(3, item.rank); // a first place counts more than a third
      tally.set(key, cur);
    }
  }
  return [...tally.values()].sort((a, b) => b.score - a.score).slice(0, MAX_COMPETITORS).map((t) => t.item);
}

async function gatherMaps(business: BusinessRow, service: string, creds: ProviderCredentials, spend: Record<string, number>): Promise<{ competitors: TopItem[]; scanId: string | null; keyword: string | null }> {
  const scan = await latestScan(business.id, "maps");
  if (scan) {
    const { data } = await dbAdmin().from("scan_points").select("top").eq("scan_id", scan.id).eq("status", "done");
    const lists = ((data ?? []) as { top: TopItem[] | null }[]).map((r) => r.top ?? []).filter((l) => l.length);
    if (lists.length) return { competitors: topCompetitors(lists, business), scanId: scan.id, keyword: null };
  }
  if (business.lat == null || business.lng == null) return { competitors: [], scanId: null, keyword: null };
  try {
    if (isMockMode()) {
      const items = mockMapsItems(business.lat, business.lng, { businessName: business.name, distance: 0 });
      return { competitors: topCompetitors([items.map((i) => ({ ...i, place_id: i.placeId }))], business), scanId: null, keyword: service };
    }
    const r = await mapsLive(creds.dataforseo!, { keyword: service, lat: business.lat, lng: business.lng, country: business.country });
    spend.dataforseo = (spend.dataforseo ?? 0) + r.costUsd;
    return { competitors: topCompetitors([r.items.map((i) => ({ ...i, place_id: i.placeId }))], business), scanId: null, keyword: service };
  } catch {
    return { competitors: [], scanId: null, keyword: null };
  }
}

async function profileOf(ref: { name: string; cid: string | null; placeId?: string | null; city?: string | null; country?: string | null }, creds: ProviderCredentials, spend: Record<string, number>, mock: { isTarget: boolean; index: number }): Promise<BusinessInfo | null> {
  if (isMockMode()) return mockBusinessInfo(ref.name, mock.isTarget, mock.index);
  try {
    const r = await businessInfoLive(creds.dataforseo!, { cid: ref.cid, placeId: ref.placeId, keyword: [ref.name, ref.city].filter(Boolean).join(" "), country: ref.country });
    spend.dataforseo = (spend.dataforseo ?? 0) + r.costUsd;
    return r.info;
  } catch {
    return null;
  }
}

async function homepageFacts(url: string | null, name: string, isTarget: boolean): Promise<PageFacts | null> {
  if (!url) return null;
  if (isMockMode()) return extractFacts(url, mockSiteHtml(name, isTarget));
  const page = await fetchPage(url.startsWith("http") ? url : `https://${url}`).catch(() => null);
  return page?.status === 200 && page.html ? extractFacts(page.url, page.html) : null;
}

type SampleRow = { engine: Engine; status: string; mentioned: boolean | null; named_businesses: { name: string }[] | null; sources: { url: string }[] | null };

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** AI inputs from stored samples: who was named instead, and which sources the engines cite. */
export function aiInputs(samples: SampleRow[], scanDate: string, points: number, businessName: string): NonNullable<AuditInputs["ai"]> {
  const done = samples.filter((s) => s.status === "done");
  const engines = ENGINES.map((engine) => {
    const mine = done.filter((s) => s.engine === engine);
    return { engine, done: mine.length, mentioned: mine.filter((s) => s.mentioned).length };
  });
  const named = new Map<string, { name: string; mentions: number }>();
  const enginesBySource = new Map<string, Set<Engine>>();
  const inMentioning = new Set<string>();
  const inOthers = new Set<string>();
  for (const s of done) {
    if (!s.mentioned) {
      for (const n of s.named_businesses ?? []) {
        if (!n?.name || namesMatch(n.name, businessName)) continue;
        const key = normalizeName(n.name);
        named.set(key, { name: named.get(key)?.name ?? n.name, mentions: (named.get(key)?.mentions ?? 0) + 1 });
      }
    }
    for (const src of s.sources ?? []) {
      const d = src?.url ? domainOf(src.url) : null;
      if (!d) continue;
      (s.mentioned ? inMentioning : inOthers).add(d);
      if (!s.mentioned) enginesBySource.set(d, (enginesBySource.get(d) ?? new Set<Engine>()).add(s.engine));
    }
  }
  return {
    scanDate,
    points,
    engines,
    namedInstead: [...named.values()].sort((a, b) => b.mentions - a.mentions).slice(0, 10),
    sharedSources: [...enginesBySource.entries()].filter(([, e]) => e.size >= 2).map(([domain, e]) => ({ domain, engines: e.size })).sort((a, b) => b.engines - a.engines).slice(0, 15),
    competitorOnlySources: [...inOthers].filter((d) => !inMentioning.has(d)).sort().slice(0, 20),
  };
}

async function gatherAi(audit: AuditRow, business: BusinessRow, service: string, plan: "locked" | "lifetime", creds: ProviderCredentials, spend: Record<string, number>): Promise<{ ai: AuditInputs["ai"]; scanId: string | null }> {
  const admin = dbAdmin();
  let scan = await latestScan(business.id, "ai");
  if (!scan && business.lat != null && business.lng != null) {
    const engines = ENGINES.filter((e) => !!creds[e]);
    if (!engines.length) return { ai: null, scanId: null };
    const created = await createScan({
      workspaceId: audit.workspace_id, plan, businessId: business.id, spec: { kind: "ai", grid: 1, engines: [...engines] },
      keyword: service, radiusMiles: 1, funding: audit.funding, noCharge: true, confirm: true,
    });
    if (!created.ok) return { ai: null, scanId: null };
    await processScan(created.scanId, 90_000);
    const { data } = await admin.from("scans").select("id, created_at, status, actual_cost_usd").eq("id", created.scanId).maybeSingle();
    if (!data || !["done", "partial"].includes(data.status)) return { ai: null, scanId: null };
    if (audit.funding === "byok") spend.ai_check = (spend.ai_check ?? 0) + Number(data.actual_cost_usd ?? 0); // house scans log their own spend
    scan = { id: data.id, created_at: data.created_at };
  }
  if (!scan) return { ai: null, scanId: null };
  const [{ data: samples }, { count: points }] = await Promise.all([
    admin.from("ai_samples").select("engine, status, mentioned, named_businesses, sources").eq("scan_id", scan.id),
    admin.from("scan_points").select("idx", { count: "exact", head: true }).eq("scan_id", scan.id),
  ]);
  return { ai: aiInputs((samples ?? []) as SampleRow[], scan.created_at, points ?? 0, business.name), scanId: scan.id };
}

// ───────────────────────── processing ─────────────────────────

interface AuditRow {
  id: string;
  workspace_id: string;
  business_id: string;
  funding: Extract<Funding, "byok" | "credits">;
  status: string;
  inputs: { service?: string; months?: number; quick?: boolean } & Row;
}

export interface StoredAuditInputs {
  service: string;
  months: number;
  mock?: boolean;
  /** Prospect-report audit: homepage only, no page plan. */
  quick?: boolean;
  /** Every check, including passed and not-checked ones. Findings are the failed ones. */
  checks: CheckResult[];
  competitors: { name: string; website: string | null; reviews: number | null; rating: number | null; category: string | null }[];
  profile: BusinessInfo | null;
  site: {
    url: string | null; pagesRead: number; hasLlmsTxt: boolean | null; pageTitles: { url: string; title: string | null }[];
    /** Text the Fix Kit may draw on: the business's own words only. */
    homeText: string; headings: string[];
  } | null;
  /** Services the business has a page for, with the page. */
  services: ServicePage[];
  ai: AuditInputs["ai"];
  /** Editable lists behind the page plan. */
  pagePlan: { services: string[]; areas: string[]; radiusMiles: number; pagesHave: number } | null;
  serviceMethod: "llm" | "heuristic" | null;
  mapsKeyword: string | null;
}

/** Runs a queued audit. Safe to call twice: only the caller that claims it does the work. */
export async function processAudit(auditId: string): Promise<void> {
  const admin = dbAdmin();
  const { data: audit } = await admin.from("audits").update({ status: "running" }).eq("id", auditId).eq("status", "queued").select("id, workspace_id, business_id, funding, status, inputs").maybeSingle<AuditRow>();
  if (!audit) return;
  const startedAt = Date.now();
  const spend: Record<string, number> = {};
  const failWith = async (message: string) => {
    await admin.from("audits").update({ status: "failed", error: message, finished_at: new Date().toISOString(), cost_usd: Object.values(spend).reduce((s, v) => s + v, 0) }).eq("id", audit.id);
    if (audit.funding === "credits") await refundAuditCredit(audit.workspace_id, audit.id);
  };

  try {
    const [{ data: business }, { data: ws }] = await Promise.all([
      admin.from("businesses").select("*").eq("id", audit.business_id).maybeSingle<BusinessRow & { address: string | null }>(),
      admin.from("workspaces").select("plan").eq("id", audit.workspace_id).maybeSingle(),
    ]);
    if (!business) return void (await failWith("The business was deleted."));
    const service = String(audit.inputs.service ?? business.primary_category ?? "").trim();
    const months = Number(audit.inputs.months ?? 3);
    const quick = audit.inputs.quick === true;
    const creds = await resolveCredentials(audit.workspace_id, audit.funding);
    if (!isMockMode() && !creds.dataforseo) return void (await failWith("No DataForSEO login is available for this audit."));

    // AI answers (latest scan, or one check at the business location). Independent of the rest, so it
    // runs alongside: the slowest parts of an audit never add up.
    const aiPending = gatherAi(audit, business, service, (ws?.plan as "locked" | "lifetime") ?? "locked", creds, spend).catch(() => ({ ai: null, scanId: null }));

    // Named places for the page plan come from public OpenStreetMap servers that are often slow, so
    // the lookup also starts now and gets most of the audit's time.
    const areasPending: Promise<string[]> = quick || business.lat == null || business.lng == null
      ? Promise.resolve([])
      : isMockMode()
        ? Promise.resolve(mockAreas())
        : fetchPlaces({ lat: business.lat, lng: business.lng }, AUDIT_RADIUS_MILES, "city|town|suburb|neighbourhood", 120_000).then((ps) => [...new Set(ps.map((p) => p.name))].slice(0, MAX_AREAS)).catch(() => []);

    // 1. Who holds the map pack here, and the Google profiles of the business and those competitors.
    const maps = await gatherMaps(business, service, creds, spend);
    const [profile, ...rivalProfiles] = await Promise.all([
      profileOf({ name: business.name, cid: business.cid, placeId: business.place_id, city: business.city, country: business.country }, creds, spend, { isTarget: true, index: 0 }),
      ...maps.competitors.map((c, i) => profileOf({ name: c.name, cid: c.cid, placeId: c.place_id, city: business.city, country: business.country }, creds, spend, { isTarget: false, index: i })),
    ]);
    if (!profile && !business.website) return void (await failWith("Neither the Google profile nor a website could be read for this business. Check your DataForSEO balance, then run the audit again."));
    const competitors = maps.competitors.map((c, i) => ({ name: c.name, profile: rivalProfiles[i] ?? null }));

    // 2. The website, and the competitors' homepages for the service comparison.
    const website = business.website ?? profile?.url ?? null;
    let crawl: SiteCrawl | null = null;
    if (website) {
      if (isMockMode()) {
        const home = extractFacts(website, mockSiteHtml(business.name, true));
        crawl = { home, pages: [], hasLlmsTxt: false, fetched: 1, robots: { status: 404, text: "" } };
      } else crawl = await crawlSite(website, quick ? 0 : 20, Math.min(Date.now() + (quick ? 20_000 : CRAWL_BUDGET_MS), startedAt + AUDIT_BUDGET_MS - 90_000), quick ? PROBE_AGENTS_QUICK : PROBE_AGENTS).catch(() => null);
    }
    const rivalSites = await Promise.all(competitors.map(async (c) => ({ name: c.name, facts: await homepageFacts(c.profile?.url ?? null, c.name, false) })));

    // 3. Services: a deterministic pass always; an LLM pass refines it when a key is available and time allows.
    let services: AuditInputs["services"] = null;
    let yourServices: ServicePage[] = [];
    if (crawl?.home && rivalSites.some((r) => r.facts)) {
      yourServices = heuristicServices(crawl.home);
      let rivalServices = rivalSites.map((r) => ({ name: r.name, services: heuristicServices(r.facts) }));
      let method: "llm" | "heuristic" = "heuristic";
      if (!quick && !isMockMode() && creds.openai && Date.now() < startedAt + AUDIT_BUDGET_MS - 60_000) {
        const llm = await llmServices(creds.openai, [{ site: "YOU", facts: crawl.home }, ...rivalSites.map((r) => ({ site: r.name, facts: r.facts }))]);
        if (llm) {
          spend.openai = (spend.openai ?? 0) + llm.costUsd;
          method = "llm";
          yourServices = llm.bySite.get("YOU") ?? yourServices;
          rivalServices = rivalSites.map((r) => ({ name: r.name, services: llm.bySite.get(r.name) ?? heuristicServices(r.facts) }));
        }
      }
      services = { yours: yourServices.map((s) => s.service), missing: missingServices(yourServices, rivalServices), method };
    }

    // 4. Named places around the business, for the page plan (started above).
    const areaNames = await areasPending;
    const areas: AuditInputs["areas"] = areaNames.length ? { names: areaNames, radiusMiles: AUDIT_RADIUS_MILES } : null;

    const ai = await aiPending;

    const inputs: AuditInputs = {
      business: { name: business.name, website, phone: business.phone, address: business.address ?? null, city: business.city, category: business.primary_category, language: business.language ?? languageCodeFor(business.country) },
      service, months, profile, competitors,
      site: crawl ? { home: crawl.home, pages: crawl.pages.map((p) => ({ url: p.url, title: p.title, h1: p.h1, intro: p.intro, h2Sections: p.h2Sections })), hasLlmsTxt: crawl.hasLlmsTxt, knownPages: crawl.fetched, robots: crawl.robots, probes: crawl.probes ?? null } : null,
      ai: ai.ai, services, areas,
    };
    const checks = runChecks(inputs);
    const score = scoreAudit(checks);
    const findings = checks.filter((c) => c.status === "fail");

    const pagePlanCheck = checks.find((c) => c.key === "page_math");
    const stored: StoredAuditInputs = {
      service, months, ...(isMockMode() ? { mock: true } : {}), ...(quick ? { quick: true } : {}),
      checks,
      competitors: competitors.map((c) => ({ name: c.name, website: c.profile?.url ?? null, reviews: c.profile?.reviews ?? null, rating: c.profile?.rating ?? null, category: c.profile?.category ?? null })),
      profile,
      site: crawl ? { url: crawl.home?.url ?? website, pagesRead: crawl.fetched, hasLlmsTxt: crawl.hasLlmsTxt, pageTitles: [crawl.home, ...crawl.pages].filter((p): p is PageFacts => !!p).map((p) => ({ url: p.url, title: p.title })), homeText: (crawl.home?.text ?? "").slice(0, 6000), headings: (crawl.home?.headings ?? []).slice(0, 40) } : null,
      services: yourServices,
      ai: ai.ai,
      pagePlan: pagePlanCheck?.data && areas ? { services: (pagePlanCheck.data.services as string[]) ?? [], areas: areas.names, radiusMiles: areas.radiusMiles, pagesHave: crawl?.fetched ?? 0 } : null,
      serviceMethod: services?.method ?? null,
      mapsKeyword: maps.keyword,
    };

    if (findings.length) {
      const { error: fErr } = await admin.from("audit_findings").insert(findings.map((f) => ({
        audit_id: audit.id, priority: f.priority, category: f.category, title: f.title, evidence: f.evidence, fix: f.fix, impact_note: f.impact, check_key: f.key, data: f.data ?? {},
      })));
      if (fErr) return void (await failWith("The findings could not be saved. Run the audit again."));
    }
    if (audit.funding !== "byok") await logHouseSpend(audit.funding as HouseFunding, null, spend);
    await admin.from("audits").update({
      status: "done", score: score.score, category_scores: score.categoryScores, checks_ran: score.checksRan, checks_total: score.checksTotal,
      inputs: stored, scan_ids: [maps.scanId, ai.scanId].filter((x): x is string => !!x),
      cost_usd: Object.values(spend).reduce((s, v) => s + v, 0), finished_at: new Date().toISOString(), error: null,
    }).eq("id", audit.id);
  } catch (e) {
    console.error("[audit] processing error:", e instanceof Error ? e.name : "unknown");
    await failWith("The audit did not complete. Nothing was charged for it; run it again.");
  }
}

/** Audits left queued or running by a crashed or timed-out worker. Called by cron. */
export async function failStalledAudits(olderThanMinutes = 10): Promise<number> {
  const admin = dbAdmin();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data } = await admin.from("audits").select("id, workspace_id, funding").in("status", ["queued", "running"]).lt("created_at", cutoff).limit(20);
  const rows = (data ?? []) as { id: string; workspace_id: string; funding: string }[];
  for (const r of rows) {
    await admin.from("audits").update({ status: "failed", error: "The audit timed out. Nothing was charged for it; run it again.", finished_at: new Date().toISOString() }).eq("id", r.id).in("status", ["queued", "running"]);
    if (r.funding === "credits") await refundAuditCredit(r.workspace_id, r.id);
  }
  return rows.length;
}

export const categoryLabel = (c: string) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c;
