import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { createApiKey } from "@/lib/api-keys";
import { handleRest } from "@/lib/api-v1/rest";

/**
 * REST and MCP: Maps grids up to 15×15 and `skip_points`, against the local database with
 * SIMULATED vendors (RANKBYAI_MOCK_PROVIDERS=1).
 */
const deferred = vi.hoisted(() => ({ queue: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { deferred.queue.push(work); } }));
const drain = async () => { while (deferred.queue.length) await deferred.queue.shift()!(); };

let u: TestUser;
let key: string;
let businessId: string;
const BASE = "https://rankbyai.test/api/v1";

async function rest(method: "GET" | "POST", path: string, body?: unknown) {
  const url = new URL(BASE + path);
  const request = new Request(url, { method, headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const res = await handleRest(request, url.pathname.replace("/api/v1/", "").split("/"), (work) => { deferred.queue.push(work); });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
}

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("grid-api");
});
beforeEach(async () => {
  deferred.queue.length = 0;
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  const k = await createApiKey(u.workspaceId, "Grid test");
  if (!k.ok) throw new Error("key creation failed");
  key = k.key;
  const r = await rest("POST", "/businesses", { name: "Northgate Family Dental", city: "Austin", lat: 30.3172, lng: -97.7231, primary_category: "Dentist" });
  expect(r.status).toBe(201);
  businessId = r.body.business.id;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("REST: grid sizes and skip_points", () => {
  it("estimates a 15×15 grid on the active points only, with the credits they need", async () => {
    const full = await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 15, mode: "live" });
    expect(full.status).toBe(200);
    expect(full.body.estimate).toMatchObject({ points: 225, skipped: 0, credits: 2, totalUsd: 0.45 });
    const part = await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 15, mode: "live", skip_points: Array.from({ length: 75 }, (_, i) => i) });
    expect(part.body.estimate).toMatchObject({ points: 150, skipped: 75, credits: 1, totalUsd: 0.3 });
    expect((await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 17 })).body.error).toBe("invalid_spec");
  });

  it("refuses a bad skip list with 400 and says why", async () => {
    const outside = await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 3, skip_points: [9] });
    expect(outside).toMatchObject({ status: 400, body: { error: "invalid_spec", message: "A 3×3 grid has points 0 to 8; 9 is not one of them." } });
    const all = await rest("POST", "/scans", { business_id: businessId, kind: "ai", keyword: "dentist", grid_size: 1, engines: ["openai"], skip_points: [0] });
    expect(all.status).toBe(400);
    expect(all.body.message).toMatch(/At least one point must stay active/);
    expect((await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 3, skip_points: [1, 1] })).body.message).toBe("Each point can be skipped only once.");
    expect((await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 3, skip_points: [1.5] })).body.error).toBe("invalid_request");
    expect((await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 3, skip_points: [-1] })).body.error).toBe("invalid_request");
  });

  it("runs with skip_points and reports them on the scan and its points", async () => {
    const r = await rest("POST", "/scans", { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 5, mode: "live", skip_points: [24, 0, 12], confirm: true });
    expect(r.status).toBe(202);
    await drain();
    const scan = await rest("GET", `/scans/${r.body.scan_id}`);
    expect(scan.body.scan).toMatchObject({ status: "done", skip_points: [0, 12, 24], summary: { points: 22, points_skipped: 3, points_done: 22 } });
    const points = await rest("GET", `/scans/${r.body.scan_id}/points`);
    expect(points.body.points.filter((p: { status: string }) => p.status === "skipped").map((p: { idx: number }) => p.idx)).toEqual([0, 12, 24]);
    const list = await rest("GET", "/scans");
    expect(list.body.scans[0].skip_points).toEqual([0, 12, 24]);
  });
});

describe("MCP: grid enums and skip_points", () => {
  const post = async (request: Request) => (await import("@/app/api/mcp/route")).POST(request);
  it("publishes the new grid sizes and a bounded skip_points on the scan tools", async () => {
    const transport = new StreamableHTTPClientTransport(new URL("https://rankbyai.test/api/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
      fetch: (input, init) => post(new Request(input as string | URL, init as RequestInit)),
    });
    const client = new Client({ name: "grid-test", version: "1.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (name: string) => tools.find((t) => t.name === name)!.inputSchema.properties as Record<string, any>;
    expect(props("run_maps_scan").grid_size).toMatchObject({ enum: [3, 5, 7, 9, 11, 13, 15], default: 7 });
    expect(props("run_ai_scan").grid_size).toMatchObject({ enum: [1, 3, 5] });
    expect(props("estimate_scan").grid_size).toMatchObject({ enum: [1, 3, 5, 7, 9, 11, 13, 15], default: 3 });
    expect(props("estimate_scan").grid_size.description).toContain("AI scans: 1, 3 or 5. Maps scans: 3, 5, 7, 9, 11, 13 or 15.");
    for (const name of ["estimate_scan", "run_ai_scan", "run_maps_scan"]) {
      expect(props(name).skip_points, name).toMatchObject({ type: "array", maxItems: 224, items: { type: "integer", minimum: 0, maximum: 224 } });
    }
    const r = await client.callTool({ name: "estimate_scan", arguments: { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 13, mode: "priority", skip_points: [0, 1] } });
    expect(r.isError).toBe(false);
    expect((r.structuredContent as { estimate: { points: number; skipped: number; credits: number } }).estimate).toMatchObject({ points: 167, skipped: 2, credits: 2 });
  });
});
