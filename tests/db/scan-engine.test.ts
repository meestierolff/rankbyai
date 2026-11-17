import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { saveCredential, resolveCredentials } from "@/lib/keys";
import { createScan, processScan } from "@/lib/scans/engine";
import type { ScanSpec } from "@/lib/cost-guard";

/**
 * M2 acceptance (a), (b), (c), (d) against the real local database with SIMULATED vendors
 * (RANKBYAI_MOCK_PROVIDERS=1). The same pipeline runs with real keys; only the HTTP calls differ.
 * Real-key verification of cost accuracy stays open until the operator adds keys.
 */
let u: TestUser;
let businessId: string;

const AI_3: ScanSpec = { kind: "ai", grid: 3, engines: ["openai", "perplexity", "gemini"] };
const MAPS_7: ScanSpec = { kind: "maps", grid: 7, mode: "priority" };

const base = (spec: ScanSpec, over: Record<string, unknown> = {}) => ({
  workspaceId: u.workspaceId, plan: "lifetime" as const, businessId, spec, keyword: "dentists", radiusMiles: 2, funding: "byok" as const, confirm: true, ...over,
});

async function seedBusiness() {
  const { data, error } = await admin.from("businesses").insert({
    workspace_id: u.workspaceId, name: "Northgate Family Dental", city: "Austin", region: "Texas", country: "US",
    lat: 30.3172, lng: -97.7231, cid: "mock-cid-target", website: "https://northgate.example", phone: "+1 512 555 0174", primary_category: "Dentist",
  }).select("id").single();
  if (error) throw error;
  businessId = data.id;
}

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("scanner");
});
beforeEach(async () => {
  delete process.env.RANKBYAI_MOCK_FAIL_ENGINE;
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  await seedBusiness();
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("estimate before, actual after", () => {
  it("returns the estimate and creates nothing until confirmed", async () => {
    const r = await createScan(base(AI_3, { confirm: false }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("confirmation_required");
    expect(r.estimate?.lines).toHaveLength(3);
    expect(r.estimate?.totalUsd).toBeCloseTo(9 * (0.0112 + 0.0025 + 0.0016), 4);
    expect(await sql("select 1 from public.scans")).toEqual([]);
  });

  it("refuses a locked workspace, a foreign business and oversized grids", async () => {
    expect(await createScan(base(AI_3, { plan: "locked" }))).toMatchObject({ ok: false, error: "lifetime_required" });
    const other = await createTestUser("other");
    expect(await createScan(base(AI_3, { workspaceId: other.workspaceId }))).toMatchObject({ ok: false, error: "business_not_found" });
    expect(await createScan(base({ kind: "ai", grid: 7, engines: ["openai"] } as unknown as ScanSpec))).toMatchObject({ ok: false, error: "invalid_spec" });
    expect(await createScan(base({ kind: "maps", grid: 11, mode: "live" } as unknown as ScanSpec))).toMatchObject({ ok: false, error: "invalid_spec" });
  });
});

describe("AI grid (acceptance a)", () => {
  it("3×3 on 3 engines stores 27 samples with mention, position, names and sources; cost is within ±50% of the estimate", async () => {
    const r = await createScan(base(AI_3));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await processScan(r.scanId);

    const samples = await sql<{ engine: string; status: string; mentioned: boolean; mention_position: number | null; named_businesses: unknown[]; sources: unknown[]; prompt: string; cost_usd: string; answer_text: string }>(
      "select engine, status, mentioned, mention_position, named_businesses, sources, prompt, cost_usd, answer_text from public.ai_samples where scan_id = $1", [r.scanId]);
    expect(samples).toHaveLength(27);
    expect(samples.every((s) => s.status === "done")).toBe(true);
    expect(samples.every((s) => typeof s.mentioned === "boolean" && s.named_businesses.length > 0 && s.sources.length > 0 && s.answer_text.length > 0)).toBe(true);
    expect(samples.every((s) => s.prompt.includes("Who are the best dentists near me?") && s.prompt.includes("Austin"))).toBe(true);
    expect(samples.filter((s) => s.mentioned).every((s) => s.mention_position !== null)).toBe(true);
    expect(new Set(samples.map((s) => s.engine))).toEqual(new Set(["openai", "perplexity", "gemini"]));

    const [scan] = await sql<{ status: string; est_cost_usd: string; actual_cost_usd: string; summary: { samples_done: number; engines: Record<string, { done: number }>; mock: boolean }; finished_at: string | null; lease_until: string | null }>(
      "select status, est_cost_usd, actual_cost_usd, summary, finished_at, lease_until from public.scans where id = $1", [r.scanId]);
    expect(scan.status).toBe("done");
    expect(scan.finished_at).not.toBeNull();
    expect(scan.lease_until).toBeNull();
    expect(scan.summary.samples_done).toBe(27);
    expect(scan.summary.mock).toBe(true);
    const est = Number(scan.est_cost_usd);
    const actual = Number(scan.actual_cost_usd);
    expect(actual).toBeGreaterThan(est * 0.5);
    expect(actual).toBeLessThan(est * 1.5);
    expect(actual).toBeCloseTo(samples.reduce((s, x) => s + Number(x.cost_usd), 0), 5);
    expect((await sql("select 1 from public.scan_points where scan_id = $1", [r.scanId])).length).toBe(9);
  });

  it("is idempotent: processing again changes nothing, and two workers cannot run the same scan", async () => {
    const r = await createScan(base(AI_3));
    if (!r.ok) throw new Error("create failed");
    await Promise.all([processScan(r.scanId), processScan(r.scanId)]);
    const before = await sql("select id, status, cost_usd from public.ai_samples where scan_id = $1 order by id", [r.scanId]);
    expect(before).toHaveLength(27);
    await processScan(r.scanId);
    expect(await sql("select id, status, cost_usd from public.ai_samples where scan_id = $1 order by id", [r.scanId])).toEqual(before);
  });
});

describe("one engine fails (acceptance c)", () => {
  it("the scan ends 'partial' and that engine is marked unavailable", async () => {
    process.env.RANKBYAI_MOCK_FAIL_ENGINE = "perplexity";
    const r = await createScan(base(AI_3));
    if (!r.ok) throw new Error("create failed");
    await processScan(r.scanId);
    const [scan] = await sql<{ status: string; summary: { engines: Record<string, { available: boolean; done: number }>; samples_failed: number } }>("select status, summary from public.scans where id = $1", [r.scanId]);
    expect(scan.status).toBe("partial");
    expect(scan.summary.engines.perplexity).toMatchObject({ available: false, done: 0 });
    expect(scan.summary.engines.openai.available).toBe(true);
    expect(scan.summary.samples_failed).toBe(9);
    const failed = await sql<{ error: string }>("select error from public.ai_samples where scan_id = $1 and engine = 'perplexity'", [r.scanId]);
    expect(failed).toHaveLength(9);
    expect(failed.every((f) => f.error.startsWith("Engine unavailable"))).toBe(true);
  });
});

describe("Maps grid (acceptance b)", () => {
  it("7×7 stores 49 ranks with the top results at each point", async () => {
    const r = await createScan(base(MAPS_7));
    if (!r.ok) throw new Error("create failed: " + JSON.stringify(r));
    await processScan(r.scanId);
    const points = await sql<{ status: string; rank: number | null; top: { rank: number; name: string }[] }>("select status, rank, top from public.scan_points where scan_id = $1 order by idx", [r.scanId]);
    expect(points).toHaveLength(49);
    expect(points.every((p) => p.status === "done" && p.top.length === 20)).toBe(true);
    expect(points[24].rank).toBeLessThanOrEqual(3); // the centre point is the business pin
    expect(points.filter((p) => p.rank !== null).every((p) => p.top[p.rank! - 1].name === "Northgate Family Dental")).toBe(true);
    const [scan] = await sql<{ status: string; actual_cost_usd: string; est_cost_usd: string; summary: { points_done: number; avg_rank: number; top3_share: number } }>("select status, actual_cost_usd, est_cost_usd, summary from public.scans where id = $1", [r.scanId]);
    expect(scan.status).toBe("done");
    expect(scan.summary.points_done).toBe(49);
    expect(scan.summary.avg_rank).toBeGreaterThan(1);
    expect(Number(scan.actual_cost_usd)).toBeCloseTo(49 * 0.0012, 5);
    expect(Number(scan.actual_cost_usd)).toBeCloseTo(Number(scan.est_cost_usd), 5);
  });
});

describe("included-scan credits", () => {
  it("a credit scan needs a balance, deducts it, and logs house spend", async () => {
    expect(await createScan(base(AI_3, { funding: "credits" }))).toMatchObject({ ok: false, error: "insufficient_credits" });
    expect(await sql("select 1 from public.scans")).toEqual([]);

    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 5, 'test_grant')", [u.workspaceId]);
    const r = await createScan(base({ kind: "ai", grid: 5, engines: ["openai", "perplexity", "gemini"] }, { funding: "credits" }));
    if (!r.ok) throw new Error("create failed: " + JSON.stringify(r));
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(2); // a 5×5 AI grid costs 3
    await processScan(r.scanId);
    const [scan] = await sql<{ status: string; actual_cost_usd: string; credits_used: number }>("select status, actual_cost_usd, credits_used from public.scans where id = $1", [r.scanId]);
    expect(scan.status).toBe("done");
    // Hard cap: house cost never exceeds credits × $0.30
    expect(Number(scan.actual_cost_usd)).toBeLessThanOrEqual(scan.credits_used * 0.3);
    const spend = await sql<{ usd: string }>("select sum(usd) as usd from public.spend_log where scan_id = $1 and funding = 'credits'", [r.scanId]);
    expect(Number(spend[0].usd)).toBeCloseTo(Number(scan.actual_cost_usd), 4);
  });

  it("refunds the credit when fewer than 80% of samples complete", async () => {
    process.env.RANKBYAI_MOCK_FAIL_ENGINE = "openai"; // 1 of 3 engines fails → 67% complete
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 1, 'test_grant')", [u.workspaceId]);
    const r = await createScan(base(AI_3, { funding: "credits" }));
    if (!r.ok) throw new Error("create failed");
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(0);
    await processScan(r.scanId);
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(1);
  });

  it("BYOK scans never touch the house spend log", async () => {
    const r = await createScan(base(AI_3));
    if (!r.ok) throw new Error("create failed");
    await processScan(r.scanId);
    expect(await sql("select 1 from public.spend_log")).toEqual([]);
  });
});

describe("keys never leak (acceptance d)", () => {
  it("a stored key is ciphertext in the database and is not readable through any client path", async () => {
    const secret = "sk-proj-SUPERSECRETVALUE-0123456789abcdef";
    const res = await saveCredential(u.workspaceId, { provider: "openai", key: secret });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain("SUPERSECRET");

    const [row] = await sql<{ ciphertext: Buffer; hint: string; status: string }>("select ciphertext, hint, status from public.api_credentials where workspace_id = $1", [u.workspaceId]);
    expect(row.ciphertext.toString("utf8")).not.toContain("SUPERSECRET");
    expect(row.ciphertext.toString("hex")).not.toContain(Buffer.from("SUPERSECRET").toString("hex"));
    expect(row.hint).toBe("…cdef");
    expect(row.status).toBe("valid");

    const pub = await u.client.from("api_credentials_public").select("*");
    expect(JSON.stringify(pub.data)).not.toContain("SUPERSECRET");
    expect((await u.client.from("api_credentials").select("*")).error).not.toBeNull();

    // Server-side resolution still works (mock mode returns placeholders; switch it off to decrypt for real).
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    const creds = await resolveCredentials(u.workspaceId, "byok");
    process.env.RANKBYAI_MOCK_PROVIDERS = "1";
    expect(creds.openai).toBe(secret);
  });

  it("mock mode can never be active on Vercel", async () => {
    const { isMockMode } = await import("@/lib/mock");
    process.env.VERCEL = "1";
    expect(isMockMode()).toBe(false);
    delete process.env.VERCEL;
    expect(isMockMode()).toBe(true);
  });
});
