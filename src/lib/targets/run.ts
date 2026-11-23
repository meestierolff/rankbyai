import "server-only";
import { normalizeUrl } from "@/lib/citations/classify";
import { topCompetitors } from "@/lib/citations/inventory";
import { dbAdmin } from "@/lib/db/clients";
import { resolveCredentials } from "@/lib/keys";
import { isMockMode } from "@/lib/mock";
import { adminRead, loadInventory } from "@/lib/packs/run";
import { backlinksLive, bulkTrafficLive, type BacklinkPage } from "@/lib/providers/dataforseo";
import { ProviderError } from "@/lib/providers/types";
import type { Read } from "@/lib/scans/change-note-data";
import { namesMatch } from "@/lib/scans/match";
import { NOT_PACK_RUN } from "@/lib/packs/label";
import { mockBacklinks, mockTraffic } from "./mock";
import {
  buildFilters, defaultTokens, estimateTargets, mergeTargets, targetDomain, trafficOrder,
  TARGET_MAX_COMPETITORS, TARGET_ROWS_DEFAULT, TARGET_TRAFFIC_DEFAULT, type CompetitorRef, type TargetEstimate, type TargetRow,
} from "./plan";

/**
 * Citation targets (citation workflow, step 3): find, run, read. Money rules: an estimate (an upper
 * bound from DataForSEO's published per-call and per-row prices) before anything runs; the user's
 * own DataForSEO login only; the cost each response reports is recorded per call.
 */

export interface StartTargetsInput {
  workspaceId: string;
  plan: "locked" | "lifetime";
  businessId: string;
  /** A prompt pack of the business: its cited pages join the list, its scope sets the filter. */
  packId?: string | null;
  competitors?: { name?: string | null; domain: string }[] | null;
  rows?: number;
  trafficCap?: number;
  /** Words the linking page's address contains; default best, top-, review (and the city and near-me for a local business). */
  tokens?: string[] | null;
  scope?: "local" | "online";
  confirm: boolean;
}

export type TargetsStart =
  | { ok: true; listId: string; estimate: TargetEstimate; competitors: CompetitorRef[]; clientDomain: string | null; tokens: string[] }
  | { ok: false; status: number; error: string; message: string; estimate?: TargetEstimate; competitors?: CompetitorRef[]; clientDomain?: string | null; tokens?: string[]; named?: string[] };

interface BusinessLite { id: string; workspace_id: string; name: string; website: string | null; city: string | null; country: string | null }
const clamp = (v: number | undefined, lo: number, hi: number, d: number) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v!)) : d);

/**
 * Competitors from stored data only: the businesses the pack's answers named most often, with a
 * website taken from the business's latest Google Maps scan (same name), then the Maps pack's own
 * leaders. Never a guessed domain.
 */
export async function suggestCompetitors(read: Read, workspaceId: string, business: BusinessLite, packId?: string | null): Promise<{ resolved: CompetitorRef[]; named: string[] }> {
  const inv = await loadInventory({ ws: read, rows: read }, workspaceId, packId ? { packId } : { businessId: business.id });
  const named = inv.ok ? topCompetitors(inv.samples, business.name, 8).map((c) => c.name) : [];
  const scans = (await read<{ id: string }[]>("Maps scans", (db) => db.from("scans").select("id").eq("workspace_id", workspaceId).eq("business_id", business.id).eq("kind", "maps").in("status", ["done", "partial"]).or(NOT_PACK_RUN).order("created_at", { ascending: false }).limit(1))) ?? [];
  const tops = scans.length
    ? ((await read<{ top: { rank: number; name: string; domain: string | null }[] | null }[]>("Maps results", (db) => db.from("scan_points").select("top").eq("scan_id", scans[0].id).limit(400))) ?? []).flatMap((p) => p.top ?? [])
    : [];
  const client = targetDomain(business.website);
  const resolved: CompetitorRef[] = [];
  const add = (name: string, domain: string | null) => {
    const d = targetDomain(domain);
    if (!d || d === client || namesMatch(name, business.name) || resolved.some((r) => r.domain === d)) return;
    if (resolved.length < TARGET_MAX_COMPETITORS) resolved.push({ name, domain: d });
  };
  for (const n of named) add(n, tops.find((t) => t.domain && namesMatch(t.name, n))?.domain ?? null);
  // The Maps pack leaders (best average rank across the grid) when the answers gave too few.
  const byName = new Map<string, { name: string; domain: string | null; ranks: number[] }>();
  for (const t of tops) {
    const row = byName.get(t.name) ?? { name: t.name, domain: t.domain, ranks: [] };
    row.ranks.push(t.rank);
    byName.set(t.name, row);
  }
  [...byName.values()].sort((a, b) => b.ranks.length - a.ranks.length || a.ranks.reduce((s, r) => s + r, 0) / a.ranks.length - b.ranks.reduce((s, r) => s + r, 0) / b.ranks.length)
    .forEach((t) => add(t.name, t.domain));
  return { resolved, named };
}

export async function startTargets(input: StartTargetsInput): Promise<TargetsStart> {
  const admin = dbAdmin();
  const { data: business } = await admin.from("businesses").select("id, workspace_id, name, website, city, country").eq("id", input.businessId).maybeSingle<BusinessLite>();
  if (!business || business.workspace_id !== input.workspaceId) return { ok: false, status: 404, error: "business_not_found", message: "That business was not found in this workspace." };
  let scope = input.scope ?? "local";
  if (input.packId) {
    const { data: pack } = await admin.from("prompt_packs").select("id, business_id, scope").eq("id", input.packId).eq("workspace_id", input.workspaceId).maybeSingle<{ id: string; business_id: string; scope: "local" | "online" }>();
    if (!pack || pack.business_id !== business.id) return { ok: false, status: 404, error: "not_found", message: "Unknown prompt pack for this business." };
    scope = input.scope ?? pack.scope;
  }
  const clientDomain = targetDomain(business.website);
  let competitors: CompetitorRef[];
  if (input.competitors?.length) {
    competitors = [];
    for (const c of input.competitors.slice(0, TARGET_MAX_COMPETITORS)) {
      const d = targetDomain(c.domain);
      if (!d) return { ok: false, status: 400, error: "invalid_request", message: `competitors: "${String(c.domain).slice(0, 80)}" is not a website domain (e.g. localfalcon.com).` };
      if (d === clientDomain) return { ok: false, status: 400, error: "invalid_request", message: `competitors: ${d} is the business's own website.` };
      if (!competitors.some((x) => x.domain === d)) competitors.push({ name: c.name?.trim() || null, domain: d });
    }
  } else {
    const s = await suggestCompetitors(adminRead, input.workspaceId, business, input.packId);
    competitors = s.resolved;
    if (!competitors.length) {
      return {
        ok: false, status: 400, error: "competitors_required",
        message: `Send competitors: up to three websites, e.g. [{"name": "Local Falcon", "domain": "localfalcon.com"}]. No stored scan gives their websites.${s.named.length ? ` The answers named most often: ${s.named.slice(0, 5).join(", ")}.` : ""}`,
        named: s.named,
      };
    }
  }
  const tokens = input.tokens?.length ? input.tokens.map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2).slice(0, 7) : defaultTokens(scope, business.city);
  const rows = clamp(input.rows, 1, 1000, TARGET_ROWS_DEFAULT);
  const trafficCap = clamp(input.trafficCap, 0, 1000, TARGET_TRAFFIC_DEFAULT);
  const estimate = estimateTargets({ competitors, clientDomain, rows, trafficCap });
  const shown = { estimate, competitors, clientDomain, tokens };
  if (!input.confirm) return { ok: false, status: 409, error: "confirmation_required", message: "Review the estimate, then confirm to run.", ...shown };
  if (input.plan !== "lifetime") return { ok: false, status: 403, error: "lifetime_required", message: "Finding citation targets needs lifetime access.", ...shown };
  const creds = await resolveCredentials(input.workspaceId, "byok");
  if (!creds.dataforseo) {
    return { ok: false, status: 400, error: "missing_key", message: "Step 3 (find citation targets) needs your own DataForSEO login. Add it in Settings → API keys. Citation targets run on your own DataForSEO account only.", ...shown };
  }
  const { data: row, error } = await admin.from("citation_target_lists").insert({
    workspace_id: input.workspaceId, business_id: business.id, pack_id: input.packId ?? null, status: "queued", competitors, client_domain: clientDomain,
    scope, tokens, rows_per_site: rows, traffic_cap: trafficCap, est_cost_usd: estimate.totalUsd,
  }).select("id").single<{ id: string }>();
  if (error || !row) return { ok: false, status: 500, error: "server_error", message: "The search could not be saved. Nothing was charged.", ...shown };
  return { ok: true, listId: row.id, ...shown };
}

interface ListRow {
  id: string; workspace_id: string; business_id: string; pack_id: string | null; status: string; competitors: CompetitorRef[]; client_domain: string | null;
  scope: "local" | "online"; tokens: string[]; rows_per_site: number; traffic_cap: number; est_cost_usd: number | string | null; actual_cost_usd: number | string | null;
  calls: CallRecord[]; targets: TargetRow[]; error: string | null; lease_until: string | null; created_at: string; finished_at: string | null;
}
interface CallRecord { call: "backlinks" | "traffic"; target: string; rows: number | null; total: number | null; cost_usd: number; error: string | null }

const LEASE_MS = 240_000;

/** Runs a queued search once (a lease keeps a second worker out): DataForSEO calls, merge, store. */
export async function processTargets(listId: string): Promise<void> {
  const admin = dbAdmin();
  const lease = { status: "running", lease_until: new Date(Date.now() + LEASE_MS).toISOString() };
  let { data: list } = await admin.from("citation_target_lists").update(lease).eq("id", listId).eq("status", "queued").select("*").maybeSingle<ListRow>();
  if (!list) ({ data: list } = await admin.from("citation_target_lists").update(lease).eq("id", listId).eq("status", "running").lt("lease_until", new Date().toISOString()).select("*").maybeSingle<ListRow>());
  if (!list) return;
  const { data: business } = await admin.from("businesses").select("id, workspace_id, name, website, city, country").eq("id", list.business_id).maybeSingle<BusinessLite>();
  if (!business) {
    await admin.from("citation_target_lists").update({ status: "failed", error: "The business was deleted.", lease_until: null, finished_at: new Date().toISOString() }).eq("id", listId);
    return;
  }
  const mock = isMockMode();
  const creds = (await resolveCredentials(list.workspace_id, "byok")).dataforseo;
  const calls: CallRecord[] = [];
  const filters = buildFilters(list.tokens, { directories: list.scope === "local" });
  const fetchPages = async (target: string, isClient: boolean): Promise<BacklinkPage[] | null> => {
    try {
      if (mock) {
        const items = mockBacklinks(target, list!.rows_per_site, isClient);
        calls.push({ call: "backlinks", target, rows: items.length, total: items.length, cost_usd: 0.024 + 0.000036 * Math.max(1, items.length), error: null });
        return items;
      }
      if (!creds) throw new ProviderError("dataforseo", "auth", "No DataForSEO login.");
      const r = await backlinksLive(creds, { target, limit: list!.rows_per_site, filters });
      calls.push({ call: "backlinks", target, rows: r.items.length, total: r.total, cost_usd: r.costUsd, error: null });
      return r.items;
    } catch (e) {
      calls.push({ call: "backlinks", target, rows: null, total: null, cost_usd: 0, error: (e instanceof Error ? e.message : "The call failed.").slice(0, 300) });
      return null;
    }
  };
  const backlinks: { competitor: CompetitorRef; pages: BacklinkPage[] }[] = [];
  for (const c of list.competitors) {
    const pages = await fetchPages(c.domain, false);
    if (pages) backlinks.push({ competitor: c, pages });
  }
  let clientKeys: Set<string> | null = null;
  if (list.client_domain && backlinks.length) {
    const pages = await fetchPages(list.client_domain, true);
    clientKeys = pages ? new Set(pages.map((p) => normalizeUrl(p.url)?.key).filter((k): k is string => !!k)) : null;
  }
  const inv = await loadInventory({ ws: adminRead, rows: adminRead }, list.workspace_id, list.pack_id ? { packId: list.pack_id } : { businessId: business.id });
  const citations = inv.ok ? inv.inventory.urls : [];
  const ctx = { clientDomain: list.client_domain, competitorDomains: Object.fromEntries(list.competitors.map((c) => [c.domain, c.name ?? c.domain])) };
  const etv = new Map<string, number | null>();
  const order = trafficOrder({ backlinks, clientKeys, citations, ctx }).slice(0, list.traffic_cap);
  if (order.length && backlinks.length) {
    try {
      const urls = order.map((o) => o.url);
      const r = mock ? { etv: mockTraffic(urls), costUsd: 0.012 + 0.00012 * urls.length } : creds ? await bulkTrafficLive(creds, urls, business.country) : null;
      if (r) {
        for (const [target, value] of r.etv) {
          const key = normalizeUrl(target)?.key;
          if (key) etv.set(key, value);
        }
        calls.push({ call: "traffic", target: `${urls.length} pages`, rows: r.etv.size, total: null, cost_usd: r.costUsd, error: null });
      }
    } catch (e) {
      calls.push({ call: "traffic", target: `${order.length} pages`, rows: null, total: null, cost_usd: 0, error: (e instanceof Error ? e.message : "The call failed.").slice(0, 300) });
    }
  }
  const targets = backlinks.length ? mergeTargets({ backlinks, clientKeys, citations, etv, ctx }) : [];
  const failed = calls.filter((c) => c.error);
  const status = !backlinks.length ? "failed" : failed.length ? "partial" : "done";
  await admin.from("citation_target_lists").update({
    status, calls, targets, actual_cost_usd: calls.reduce((s, c) => s + c.cost_usd, 0), lease_until: null, finished_at: new Date().toISOString(),
    error: !backlinks.length ? (failed[0]?.error ?? "No DataForSEO call succeeded.") : failed.length ? `${failed.length} of ${calls.length} calls failed.` : null,
  }).eq("id", listId);
}

// ───────────────────────── reading ─────────────────────────

const LIST_COLS = "id, business_id, pack_id, status, competitors, client_domain, scope, tokens, rows_per_site, traffic_cap, est_cost_usd, actual_cost_usd, calls, error, lease_until, created_at, finished_at";
const listOut = (l: Omit<ListRow, "targets" | "workspace_id">) => ({
  id: l.id, business_id: l.business_id, pack_id: l.pack_id, status: l.status, competitors: l.competitors, client_domain: l.client_domain, scope: l.scope,
  url_contains: l.tokens, rows_per_site: l.rows_per_site, traffic_cap: l.traffic_cap,
  est_cost_usd: l.est_cost_usd == null ? null : Number(l.est_cost_usd), actual_cost_usd: l.actual_cost_usd == null ? null : Number(l.actual_cost_usd),
  calls: l.calls, error: l.error, created_at: l.created_at, finished_at: l.finished_at,
});

export const TARGETS_NOTE = "etv is DataForSEO's estimated monthly organic traffic for the page (null: no figure, or outside the traffic cap); page_rank is DataForSEO's own rank (0–1000), not Ahrefs DR. client_linked comes from DataForSEO's backlink index; client_named_on_page from RankbyAI reading the page. Sorted: pages AI answers cited first, then by estimated traffic. RankbyAI contacts no one.";

export type TargetsResult = { ok: true; list: ReturnType<typeof listOut>; targets: TargetRow[]; total: number; continueList: boolean } | { ok: false; status: number; error: string; message: string };

export async function loadTargets(read: Read, workspaceId: string, q: { listId?: string; businessId?: string; action?: string; citedOnly?: boolean; limit: number; offset: number }): Promise<TargetsResult> {
  const rows = (await read<Omit<ListRow, "workspace_id">[]>("Citation targets", (db) => {
    let query = db.from("citation_target_lists").select(`${LIST_COLS}, targets`).eq("workspace_id", workspaceId);
    query = q.listId ? query.eq("id", q.listId) : query.eq("business_id", q.businessId!);
    return query.order("created_at", { ascending: false }).limit(1);
  })) ?? [];
  const l = rows[0];
  if (!l) return { ok: false, status: 404, error: "not_found", message: q.listId ? "Unknown citation target search." : "This business has no citation target search yet. Run find_citation_targets first." };
  let targets = l.targets ?? [];
  if (q.action) targets = targets.filter((t) => t.action === q.action);
  if (q.citedOnly) targets = targets.filter((t) => !!t.cited);
  const open = l.status === "queued" || (l.status === "running" && (!l.lease_until || new Date(l.lease_until).getTime() < Date.now()));
  return { ok: true, list: listOut(l), targets: targets.slice(q.offset, q.offset + q.limit), total: targets.length, continueList: open };
}

export async function listTargetSearches(read: Read, workspaceId: string, q: { businessId?: string; limit: number; offset: number }) {
  const rows = (await read<Omit<ListRow, "targets" | "workspace_id">[]>("Citation target searches", (db) => {
    let query = db.from("citation_target_lists").select(LIST_COLS).eq("workspace_id", workspaceId);
    if (q.businessId) query = query.eq("business_id", q.businessId);
    return query.order("created_at", { ascending: false }).range(q.offset, q.offset + q.limit - 1);
  })) ?? [];
  return rows.map(listOut);
}
