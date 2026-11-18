import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import type { ScanSpec } from "@/lib/cost-guard";
import { buildGrid } from "@/lib/scans/grid";

/**
 * Grids up to 15×15 and skipped points, against the real local database, with mock mode OFF so the
 * engine takes its real vendor paths. The vendor functions themselves are replaced by spies: nothing
 * leaves this machine, and every call the engine makes to a vendor is recorded, so the tests can
 * prove that a skipped point is never sent to one.
 */
const vendor = vi.hoisted(() => ({
  posted: [] as { keyword: string; lat: number; lng: number; tag: string }[][],
  live: [] as { lat?: number; lng?: number }[],
  ai: [] as { engine: string; lat: number; lng: number }[],
}));

const ITEMS = [
  { rank: 1, name: "Rival Dental", cid: "c-rival", placeId: null, domain: "rival.example", url: null, phone: null, address: null, city: null, region: null, country: null, lat: null, lng: null, category: null, rating: 4.5, reviews: 10 },
  { rank: 2, name: "Northgate Family Dental", cid: "mock-cid-target", placeId: null, domain: "northgate.example", url: null, phone: null, address: null, city: null, region: null, country: null, lat: null, lng: null, category: null, rating: 4.8, reviews: 50 },
];

vi.mock("@/lib/providers/dataforseo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/dataforseo")>()),
  postMapsTasks: vi.fn(async (_creds: unknown, specs: { keyword: string; lat: number; lng: number; tag: string }[]) => {
    if (specs.length > 100) throw new Error("At most 100 tasks per request."); // the real limit
    vendor.posted.push(specs);
    return specs.map((s) => ({ tag: s.tag, taskId: `task-${s.tag}`, costUsd: 0.0012 }));
  }),
  getMapsTask: vi.fn(async () => ({ ready: true, items: ITEMS })),
  mapsLive: vi.fn(async (_creds: unknown, spec: { lat?: number; lng?: number }) => {
    vendor.live.push(spec);
    return { items: ITEMS, costUsd: 0.002 };
  }),
}));
const answer = (engine: string) => async (_key: string, _prompt: string, geo: { lat: number; lng: number }) => {
  vendor.ai.push({ engine, lat: geo.lat, lng: geo.lng });
  return {
    engine, model: "test", text: "1. Rival Dental\n2. Northgate Family Dental", places: [], sources: [{ url: "https://yelp.example/x", title: "Yelp" }],
    costUsd: 0.005, costReported: true, usage: { inputTokens: 1, outputTokens: 1, searches: 1 }, raw: {},
  };
};
vi.mock("@/lib/providers/openai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/providers/openai")>()), askOpenAi: vi.fn(answer("openai")) }));
vi.mock("@/lib/providers/perplexity", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/providers/perplexity")>()), askPerplexity: vi.fn(answer("perplexity")) }));
vi.mock("@/lib/providers/gemini", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/providers/gemini")>()), askGemini: vi.fn(answer("gemini")) }));
vi.mock("@/lib/scans/places", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/scans/places")>()), fetchPlaces: vi.fn(async () => []) }));
vi.mock("@/lib/storage", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/storage")>()), putObject: vi.fn(async () => true) }));
vi.mock("@/lib/keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/keys")>()),
  resolveCredentials: vi.fn(async () => ({ dataforseo: { login: "test", password: "test" }, openai: "k", perplexity: "k", gemini: "k" })),
}));

const { createScan, processScan } = await import("@/lib/scans/engine");
const { runDueSchedules } = await import("@/lib/schedules");

let u: TestUser;
let businessId: string;
const CENTER = { lat: 30.3172, lng: -97.7231 };
const base = (spec: ScanSpec, over: Record<string, unknown> = {}) => ({
  workspaceId: u.workspaceId, plan: "lifetime" as const, businessId, spec, keyword: "dentist", radiusMiles: 2, funding: "byok" as const, confirm: true, ...over,
});
const grant = (n: number) => sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, $2, 'test_grant')", [u.workspaceId, n]);
const balance = async () => (await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data as number;
const pointsOf = (scanId: string) => sql<{ idx: number; row: number; col: number; lat: number; lng: number; status: string; rank: number | null; cost_usd: string | null; dfs_task_id: string | null }>(
  "select idx, \"row\", col, lat, lng, status, rank, cost_usd, dfs_task_id from public.scan_points where scan_id = $1 order by idx", [scanId]);
const scanRow = async (scanId: string) => (await sql<{ status: string; skip_points: number[]; credits_used: number; est_cost_usd: string; actual_cost_usd: string | null; summary: Record<string, number> }>(
  "select status, skip_points, credits_used, est_cost_usd, actual_cost_usd, summary from public.scans where id = $1", [scanId]))[0];
/** The skipped points' coordinates, as the engine would send them. */
const coordsOf = (n: number, skip: number[]) => buildGrid(CENTER, n, 2).filter((p) => skip.includes(p.idx)).map((p) => `${p.lat},${p.lng}`);

beforeAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS; // real code paths; the vendor calls are spies
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("grid-skip");
});
beforeEach(async () => {
  vendor.posted.length = 0;
  vendor.live.length = 0;
  vendor.ai.length = 0;
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  const { data, error } = await admin.from("businesses").insert({
    workspace_id: u.workspaceId, name: "Northgate Family Dental", city: "Austin", region: "Texas", country: "US", lat: CENTER.lat, lng: CENTER.lng,
    cid: "mock-cid-target", website: "https://northgate.example", phone: "+1 512 555 0174", primary_category: "Dentist",
  }).select("id").single();
  if (error) throw error;
  businessId = data.id;
});
afterAll(async () => {
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("a skipped point is never sent to a vendor", () => {
  it("Maps 15×15 on a queue: skipped points get no task; 213 tasks go out in batches of at most 100", async () => {
    const skip = [0, 1, 2, 14, 15, 112, 200, 210, 220, 222, 223, 224]; // includes the business's own point (112)
    const r = await createScan(base({ kind: "maps", grid: 15, mode: "priority", skip }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.estimate).toMatchObject({ points: 213, skipped: 12 });
    expect(r.estimate.totalUsd).toBeCloseTo(213 * 0.0012, 9);
    await processScan(r.scanId);

    const sent = vendor.posted.flat();
    expect(vendor.posted.map((b) => b.length)).toEqual([100, 100, 13]);
    expect(sent).toHaveLength(213);
    const sentIdx = sent.map((s) => Number(s.tag.split(":")[1]));
    expect(sentIdx.filter((i) => skip.includes(i))).toEqual([]);
    const sentCoords = new Set(sent.map((s) => `${s.lat},${s.lng}`));
    for (const c of coordsOf(15, skip)) expect(sentCoords.has(c)).toBe(false);

    const points = await pointsOf(r.scanId);
    expect(points).toHaveLength(225);
    for (const p of points) {
      expect(p.idx).toBe(p.row * 15 + p.col); // stable with buildGrid
      if (skip.includes(p.idx)) expect(p).toMatchObject({ status: "skipped", rank: null, cost_usd: null, dfs_task_id: null });
      else expect(p).toMatchObject({ status: "done", rank: 2 });
    }
    const scan = await scanRow(r.scanId);
    expect(scan.skip_points).toEqual(skip);
    expect(scan.status).toBe("done"); // skipped points are not failures
    expect(scan.summary).toMatchObject({ points: 213, points_skipped: 12, points_done: 213, points_failed: 0, top3_points: 213 });
    expect(Number(scan.actual_cost_usd)).toBeCloseTo(213 * 0.0012, 5);
  }, 30_000);

  it("Maps live: one lookup per active point, none at a skipped point", async () => {
    const skip = [0, 4, 8, 60];
    const r = await createScan(base({ kind: "maps", grid: 11, mode: "live", skip }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    await processScan(r.scanId);
    expect(vendor.live).toHaveLength(121 - skip.length);
    const coords = new Set(vendor.live.map((s) => `${s.lat},${s.lng}`));
    for (const c of coordsOf(11, skip)) expect(coords.has(c)).toBe(false);
    expect(await scanRow(r.scanId)).toMatchObject({ status: "done", summary: { points: 117, points_skipped: 4, points_done: 117 } });
  });

  it("AI: no engine is asked at a skipped point, and no sample row exists for it", async () => {
    const skip = [0, 4, 8]; // two corners and the business's own point of a 3×3 grid
    const r = await createScan(base({ kind: "ai", grid: 3, engines: ["openai", "perplexity", "gemini"], skip }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.estimate).toMatchObject({ points: 6, skipped: 3 });
    await processScan(r.scanId);
    expect(vendor.ai).toHaveLength(18);
    const asked = new Set(vendor.ai.map((a) => `${a.lat},${a.lng}`));
    for (const c of coordsOf(3, skip)) expect(asked.has(c)).toBe(false);
    const samples = await sql<{ point_idx: number }>("select point_idx from public.ai_samples where scan_id = $1", [r.scanId]);
    expect(samples).toHaveLength(18);
    expect(samples.some((s) => skip.includes(s.point_idx))).toBe(false);
    const points = await pointsOf(r.scanId);
    expect(points.filter((p) => p.status === "skipped").map((p) => p.idx)).toEqual(skip);
    const scan = await scanRow(r.scanId);
    expect(scan.status).toBe("done");
    expect(scan.summary).toMatchObject({ points: 6, points_skipped: 3, samples_total: 18, samples_done: 18, points_mentioned: 6 });
  });
});

describe("validation, credits and schedules", () => {
  it("refuses a skip list that leaves no point, or names points outside the grid, with a clear message", async () => {
    const all = Array.from({ length: 9 }, (_, i) => i);
    expect(await createScan(base({ kind: "maps", grid: 3, mode: "live", skip: all }))).toMatchObject({ ok: false, error: "invalid_spec", message: "At least one point must stay active: all 9 points of the 3×3 grid are skipped." });
    expect(await createScan(base({ kind: "maps", grid: 3, mode: "live", skip: [9] }))).toMatchObject({ ok: false, error: "invalid_spec" });
    expect(await createScan(base({ kind: "maps", grid: 3, mode: "live", skip: [2, 2] }))).toMatchObject({ ok: false, error: "invalid_spec" });
    expect(await sql("select 1 from public.scans")).toEqual([]);
    // The database refuses it too.
    await expect(sql(
      "insert into public.scans (workspace_id, business_id, kind, grid_size, radius_miles, center_lat, center_lng, funding, skip_points) values ($1, $2, 'maps', 3, 2, 0, 0, 'byok', $3)",
      [u.workspaceId, businessId, all],
    )).rejects.toThrow(/scans_skip_points_check/);
    await expect(sql(
      "insert into public.scans (workspace_id, business_id, kind, grid_size, radius_miles, center_lat, center_lng, funding, skip_points) values ($1, $2, 'maps', 3, 2, 0, 0, 'byok', $3)",
      [u.workspaceId, businessId, [9]],
    )).rejects.toThrow(/scans_skip_points_check/);
  });

  it("a 15×15 included scan costs 2 credits; skipping enough points brings it to 1", async () => {
    await grant(3);
    const full = await createScan(base({ kind: "maps", grid: 15, mode: "live" }, { funding: "credits" }));
    if (!full.ok) throw new Error(JSON.stringify(full));
    expect(full.estimate.credits).toBe(2);
    expect(await balance()).toBe(1);
    await processScan(full.scanId);
    const s = await scanRow(full.scanId);
    expect(s).toMatchObject({ status: "done", credits_used: 2 });
    expect(Number(s.actual_cost_usd)).toBeCloseTo(225 * 0.002, 5);
    expect(Number(s.actual_cost_usd)).toBeLessThanOrEqual(s.credits_used * 0.3); // the per-credit cap held

    const skip = Array.from({ length: 75 }, (_, i) => i); // 150 active points × $0.002 = $0.30
    const part = await createScan(base({ kind: "maps", grid: 15, mode: "live", skip }, { funding: "credits" }));
    if (!part.ok) throw new Error(JSON.stringify(part));
    expect(part.estimate).toMatchObject({ credits: 1, points: 150 });
    expect(await balance()).toBe(0);
    await processScan(part.scanId);
    const p = await scanRow(part.scanId);
    expect(p).toMatchObject({ status: "done", credits_used: 1 }); // exactly at the cap: not refused by float noise
    expect(vendor.live).toHaveLength(225 + 150);
  }, 30_000);

  it("skipping more than 20% of a grid does not refund the credit of a scan that ran in full", async () => {
    await grant(1);
    const r = await createScan(base({ kind: "maps", grid: 5, mode: "live", skip: [0, 1, 2, 3, 4, 5, 6, 7] }, { funding: "credits" }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    await processScan(r.scanId);
    expect(await scanRow(r.scanId)).toMatchObject({ status: "done", credits_used: 1 });
    expect(await balance()).toBe(0);
  });

  it("a scheduled run keeps the schedule's skipped points", async () => {
    const skip = [0, 6, 24, 42, 48];
    await sql(
      "insert into public.tracked_queries (workspace_id, business_id, kind, keyword, grid_size, radius_miles, funding, schedule, next_run_at, skip_points) values ($1, $2, 'maps', 'dentist', 7, 2, 'byok', 'weekly', now() - interval '1 minute', $3)",
      [u.workspaceId, businessId, skip],
    );
    const report = await runDueSchedules(10, new Date(), async () => {});
    expect(report).toMatchObject({ due: 1, started: 1 });
    const [scan] = await sql<{ id: string; skip_points: number[]; est_cost_usd: string; mode: string }>("select id, skip_points, est_cost_usd, mode from public.scans");
    expect(scan.skip_points).toEqual(skip);
    expect(scan.mode).toBe("standard");
    expect(Number(scan.est_cost_usd)).toBeCloseTo(44 * 0.0006, 5);
    await processScan(scan.id);
    const sent = vendor.posted.flat().map((s) => Number(s.tag.split(":")[1]));
    expect(sent).toHaveLength(44);
    expect(sent.filter((i) => skip.includes(i))).toEqual([]);
  }, 30_000);

  it("the database accepts Maps schedules up to 15×15 and still refuses AI grids above 5×5", async () => {
    await sql("insert into public.tracked_queries (workspace_id, business_id, kind, keyword, grid_size, schedule) values ($1, $2, 'maps', 'dentist', 15, 'weekly')", [u.workspaceId, businessId]);
    await expect(sql("insert into public.tracked_queries (workspace_id, business_id, kind, niche, grid_size, schedule) values ($1, $2, 'ai', 'dentist', 7, 'weekly')", [u.workspaceId, businessId])).rejects.toThrow(/tracked_queries_check|tracked_queries_grid_size_check/);
    await expect(sql("insert into public.tracked_queries (workspace_id, business_id, kind, keyword, grid_size, schedule) values ($1, $2, 'maps', 'dentist', 17, 'weekly')", [u.workspaceId, businessId])).rejects.toThrow(/grid_size_check|tracked_queries_check/);
  });
});
