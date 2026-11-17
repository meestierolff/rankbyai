import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "../db/helpers";
import { createAudit, processAudit, type StoredAuditInputs } from "@/lib/audit/run";
import { resolveCredentials } from "@/lib/keys";
import { discover } from "@/lib/prospects/batch";
import { validateDataForSeo } from "@/lib/providers/dataforseo";
import { createScan, processScan } from "@/lib/scans/engine";

/**
 * REAL vendor calls (DataForSEO house login from .env.local). Skipped unless LIVE_DFS=1.
 * Expected spend for the whole file: about $0.06 (1 search, 9 Maps lookups, 4 profile lookups).
 */
const live = process.env.LIVE_DFS === "1";
let u: TestUser;
let businessId = "";
let picked: { name: string; rank: number | null; website: string | null } | null = null;

describe.skipIf(!live)("DataForSEO, real calls", () => {
  beforeAll(async () => {
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    await resetData();
    u = await createTestUser("live");
    await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 5, 'pack')", [u.workspaceId]);
  });
  afterAll(async () => {
    await resetData();
    await deleteTestUsers();
    await closePool();
  });

  it("the login is valid", async () => {
    const creds = await resolveCredentials(null, "credits");
    expect(creds.dataforseo).toBeTruthy();
    const v = await validateDataForSeo(creds.dataforseo!);
    console.log("[live] login valid:", v.ok, "| balance reported:", v.balanceUsd != null ? `$${v.balanceUsd}` : "n/a");
    expect(v.ok).toBe(true);
  });

  it("“dentist / Austin, TX” lists at least 20 businesses (M5 acceptance)", async () => {
    const r = await discover({ workspaceId: u.workspaceId, funding: "credits", niche: "dentist", city: "Austin, TX", country: "US" });
    console.log(`[live] search: ${r.candidates.length} businesses, cost $${r.costUsd}`);
    console.log("[live] first 5:", r.candidates.slice(0, 5).map((c) => `#${c.rank} ${c.name} (${c.reviews ?? "?"} reviews)`).join(" | "));
    expect(r.candidates.length).toBeGreaterThanOrEqual(20);
    expect(r.costUsd).toBeLessThan(0.05);
    const c = r.candidates.find((x) => (x.rank ?? 0) >= 8 && x.website && x.cid) ?? r.candidates[7];
    picked = { name: c.name, rank: c.rank, website: c.website };
    const { data, error } = await admin.from("businesses").insert({
      workspace_id: u.workspaceId, name: c.name, cid: c.cid, place_id: c.place_id, address: c.address, city: c.city ?? "Austin", region: c.region, country: c.country ?? "US",
      lat: c.lat, lng: c.lng, website: c.website, phone: c.phone, primary_category: c.category, rating: c.rating, reviews_count: c.reviews, source: "search",
    }).select("id").single();
    if (error) throw error;
    businessId = data.id;
  }, 120_000);

  it("a 3×3 Maps grid stores 9 ranks and its real cost (M2 acceptance b, small grid)", async () => {
    const r = await createScan({ workspaceId: u.workspaceId, plan: "lifetime", businessId, spec: { kind: "maps", grid: 3, mode: "live" }, keyword: "dentist", radiusMiles: 2, funding: "credits", confirm: true });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await processScan(r.scanId, 150_000);
    const [scan] = await sql<{ status: string; est_cost_usd: string; actual_cost_usd: string }>("select status, est_cost_usd, actual_cost_usd from public.scans where id = $1", [r.scanId]);
    const points = await sql<{ rank: number | null; status: string; n: number }>("select rank, status, jsonb_array_length(coalesce(top, '[]')) as n from public.scan_points where scan_id = $1 order by idx", [r.scanId]);
    console.log(`[live] maps grid for “${picked?.name}” (search rank #${picked?.rank}): status ${scan.status}, ranks ${points.map((p) => p.rank ?? "20+").join(",")}, estimate $${scan.est_cost_usd}, actual $${scan.actual_cost_usd}`);
    expect(scan.status).toBe("done");
    expect(points).toHaveLength(9);
    expect(points.every((p) => p.status === "done" && p.n > 0)).toBe(true);
    const est = Number(scan.est_cost_usd);
    expect(Number(scan.actual_cost_usd)).toBeGreaterThan(est * 0.5);
    expect(Number(scan.actual_cost_usd)).toBeLessThan(est * 1.5);
  }, 200_000);

  it("an audit of a real business returns a score with evidence (M4 acceptance)", async () => {
    const r = await createAudit({ workspaceId: u.workspaceId, plan: "lifetime", businessId, service: "dentist", months: 3, funding: "credits", confirm: true });
    if (!r.ok) throw new Error(JSON.stringify(r));
    await processAudit(r.auditId);
    const [audit] = await sql<{ status: string; score: number; checks_ran: number; checks_total: number; cost_usd: string; est_cost_usd: string; error: string | null; inputs: StoredAuditInputs; category_scores: Record<string, { score: number | null }> }>("select * from public.audits where id = $1", [r.auditId]);
    const findings = await sql<{ priority: string; title: string; check_key: string }>("select priority, title, check_key from public.audit_findings where audit_id = $1 order by priority", [r.auditId]);
    console.log(`[live] audit: status ${audit.status}${audit.error ? ` (${audit.error})` : ""}, score ${audit.score}, ${audit.checks_ran} of ${audit.checks_total} checks ran, estimate $${audit.est_cost_usd}, actual $${audit.cost_usd}`);
    console.log("[live] categories:", Object.entries(audit.category_scores).map(([k, v]) => `${k}=${v.score ?? "not checked"}`).join(", "));
    console.log("[live] competitors:", audit.inputs.competitors.map((c) => `${c.name} (${c.reviews ?? "?"} reviews)`).join(" | "));
    console.log("[live] site pages read:", audit.inputs.site?.pagesRead ?? 0, "| services method:", audit.inputs.serviceMethod, "| areas:", audit.inputs.pagePlan?.areas.length ?? 0);
    for (const f of findings) console.log(`[live]   ${f.priority} ${f.title}`);
    console.log("[live] not checked:", audit.inputs.checks.filter((c) => c.status === "not_checked").map((c) => c.key).join(", "));
    expect(audit.status).toBe("done");
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.checks_ran).toBeGreaterThan(5);
    expect(audit.inputs.competitors.length).toBe(3);
    expect(Number(audit.cost_usd)).toBeLessThan(0.1);
  }, 280_000);
});
