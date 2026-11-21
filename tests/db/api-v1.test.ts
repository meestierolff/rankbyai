import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { Validator } from "@seriousme/openapi-schema-validator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { createApiKey, generateApiKey, revokeApiKey, verifyApiKey } from "@/lib/api-keys";
import { MCP_PAID_TOOLS, MCP_TOOLS } from "@/lib/api-v1/mcp";
import { openApiSpec } from "@/lib/api-v1/openapi";
import { handleRest } from "@/lib/api-v1/rest";

/**
 * M6 acceptance against the real local database with SIMULATED vendors: API keys, the REST API,
 * rate limiting, the OpenAPI document, and the MCP server driven by the official MCP client.
 */
const deferred = vi.hoisted(() => ({ queue: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { deferred.queue.push(work); } }));
/** Run the work a route scheduled for after its response (scan and audit processing). */
const drain = async () => { while (deferred.queue.length) await deferred.queue.shift()!(); };

let a: TestUser;
let b: TestUser;
let keyA: string;
let keyB: string;
const BASE = "https://rankbyai.test/api/v1";

async function rest(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, opts: { key?: string | null; body?: unknown } = {}) {
  const key = opts.key === undefined ? keyA : opts.key;
  const url = new URL(BASE + path);
  const request = new Request(url, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(opts.body ? { "Content-Type": "application/json" } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const res = await handleRest(request, url.pathname.replace("/api/v1/", "").split("/"), (work) => { deferred.queue.push(work); });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, body: (await res.json()) as any };
}

async function seedBusiness(user: TestUser, key: string) {
  const r = await rest("POST", "/businesses", { key, body: { name: "Northgate Family Dental", city: "Austin", lat: 30.3172, lng: -97.7231, website: "https://northgatefamilydental.example", phone: "+1 512 555 0174", primary_category: "Dental clinic" } });
  expect(r.status).toBe(201);
  await sql("update public.businesses set cid = 'mock-cid-target' where id = $1", [r.body.business.id]);
  return r.body.business.id as string;
}

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  a = await createTestUser("api-a");
  b = await createTestUser("api-b");
});
beforeEach(async () => {
  deferred.queue.length = 0;
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = any($1)", [[a.workspaceId, b.workspaceId]]);
  const ka = await createApiKey(a.workspaceId, "Test A");
  const kb = await createApiKey(b.workspaceId, "Test B");
  if (!ka.ok || !kb.ok) throw new Error("key creation failed");
  keyA = ka.key;
  keyB = kb.key;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("API keys", () => {
  it("has the documented format and is stored only as a hash with a prefix", async () => {
    expect(keyA).toMatch(/^rbai_live_[A-Za-z0-9]{32}$/);
    expect(new Set(Array.from({ length: 200 }, generateApiKey)).size).toBe(200);
    const rows = await sql<{ prefix: string; key_hash: string; name: string }>("select prefix, key_hash, name from public.api_keys where workspace_id = $1", [a.workspaceId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].prefix).toBe(keyA.slice(0, 18));
    expect(rows[0].key_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(await sql("select * from public.api_keys"))).not.toContain(keyA.slice(18)); // the secret part is nowhere in the table
  });

  it("the owner sees names and prefixes, never the hash; other workspaces see nothing", async () => {
    const mine = await a.client.from("api_keys").select("id, name, prefix, revoked_at");
    expect(mine.data).toHaveLength(1);
    expect((await a.client.from("api_keys").select("key_hash")).error).not.toBeNull();
    expect((await b.client.from("api_keys").select("id").eq("workspace_id", a.workspaceId)).data).toEqual([]);
  });

  it("verifies a real key, and nothing else", async () => {
    expect(await verifyApiKey(keyA)).toMatchObject({ workspaceId: a.workspaceId, ownerId: a.id, plan: "lifetime" });
    for (const bad of [null, "", "rbai_live_short", keyA.slice(0, -1) + (keyA.endsWith("x") ? "y" : "x"), keyA.toLowerCase() === keyA ? keyA.toUpperCase() : keyA.toLowerCase(), `${keyA} `, "' or 1=1 --"]) {
      expect(await verifyApiKey(bad), String(bad)).toBeNull();
    }
  });

  it("a revoked key stops working at once; revoking is per workspace", async () => {
    const [row] = await sql<{ id: string }>("select id from public.api_keys where workspace_id = $1", [a.workspaceId]);
    expect(await revokeApiKey(b.workspaceId, row.id)).toBe(false); // someone else's key
    expect(await verifyApiKey(keyA)).not.toBeNull();
    expect(await revokeApiKey(a.workspaceId, row.id)).toBe(true);
    expect(await verifyApiKey(keyA)).toBeNull();
    expect((await rest("GET", "/businesses")).status).toBe(401);
  });

  it("allows five active keys per workspace", async () => {
    for (let i = 0; i < 4; i++) expect((await createApiKey(a.workspaceId, `k${i}`)).ok).toBe(true);
    expect(await createApiKey(a.workspaceId, "sixth")).toMatchObject({ ok: false, status: 409, error: "limit_reached" });
    expect(await createApiKey(a.workspaceId, "  ")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("REST: authentication and rate limit", () => {
  it("refuses requests without a valid key", async () => {
    for (const key of [null, "rbai_live_" + "A".repeat(32), "Bearer"]) {
      const r = await rest("GET", "/businesses", { key });
      expect(r.status).toBe(401);
      expect(r.body.error).toBe("unauthorized");
      expect(r.headers.get("www-authenticate")).toContain("Bearer");
    }
  });

  it("answers 429 after 60 requests in a minute for one key, and other keys are unaffected", async () => {
    // The window is a calendar minute: start early enough in one that all 63 requests land in it.
    const second = new Date().getUTCSeconds();
    if (second > 50) await new Promise((resolve) => setTimeout(resolve, (61 - second) * 1000));
    await sql("delete from public.rate_limits");
    const statuses: number[] = [];
    const remaining: number[] = [];
    for (let i = 0; i < 62; i++) {
      const r = await rest("GET", "/usage");
      statuses.push(r.status);
      remaining.push(Number(r.headers.get("x-ratelimit-remaining")));
    }
    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
    // The counter is visible on the way down: 59 left after the first request, none after the 60th.
    expect(remaining.slice(0, 60)).toEqual(Array.from({ length: 60 }, (_, i) => 59 - i));
    expect(remaining.slice(60)).toEqual([0, 0]);
    const limited = await rest("GET", "/usage");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("rate_limited");
    const wait = Number(limited.headers.get("retry-after"));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    expect(limited.headers.get("x-ratelimit-limit")).toBe("60");
    expect(limited.headers.get("x-ratelimit-remaining")).toBe("0");
    const reset = Number(limited.headers.get("x-ratelimit-reset"));
    expect(reset).toBeGreaterThan(Date.now() / 1000 - 5);
    expect(reset).toBeLessThanOrEqual(Date.now() / 1000 + 65);
    expect((await rest("GET", "/usage", { key: keyB })).status).toBe(200);
    await sql("delete from public.rate_limits");
  });

  it("unknown endpoints answer 404 with a pointer to the reference", async () => {
    expect((await rest("GET", "/nope")).status).toBe(404);
    expect((await rest("GET", "/scans/x/y/z")).status).toBe(404);
  });
});

describe("REST: businesses, scans, audits, prospects, usage", () => {
  it("adds, lists and reads businesses inside the caller's workspace only", async () => {
    const id = await seedBusiness(a, keyA);
    const list = await rest("GET", "/businesses");
    expect(list.body.businesses.map((x: { id: string }) => x.id)).toEqual([id]);
    expect((await rest("GET", `/businesses/${id}`)).body.business.name).toBe("Northgate Family Dental");
    expect((await rest("GET", `/businesses/${id}`, { key: keyB })).status).toBe(404);
    expect((await rest("GET", "/businesses", { key: keyB })).body.businesses).toEqual([]);
    expect((await rest("POST", "/businesses", { body: { name: "No place" } })).status).toBe(400);
    // Name + city means a paid lookup: estimate first, then confirm.
    const estimate = await rest("POST", "/businesses", { body: { name: "Lone Oak Dental", city: "Austin" } });
    expect(estimate.body).toMatchObject({ confirm_required: true });
    expect(estimate.body.estimate.totalUsd).toBeGreaterThan(0);
    expect(estimate.body.estimate.total_usd).toBe(estimate.body.estimate.totalUsd); // old name, kept for one release
    expect((await rest("GET", "/businesses")).body.businesses).toHaveLength(1);
    const added = await rest("POST", "/businesses", { body: { name: "Lone Oak Dental", city: "Austin", confirm: true } });
    expect(added.status).toBe(201);
    expect(added.body.business).toMatchObject({ name: "Lone Oak Dental", source: "search" });
  });

  it("a scan needs confirm: the estimate comes first and nothing runs without it", async () => {
    const id = await seedBusiness(a, keyA);
    const estimate = await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 3 } });
    expect(estimate.status).toBe(200);
    expect(estimate.body.confirm_required).toBe(true);
    expect(estimate.body.estimate.totalUsd).toBeGreaterThan(0);
    expect(await sql("select 1 from public.scans")).toEqual([]);
    expect(deferred.queue).toHaveLength(0);

    const run = await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 3, confirm: true } });
    expect(run.status).toBe(202);
    expect(run.body.status).toBe("queued");
    await drain();
    const scan = await rest("GET", `/scans/${run.body.scan_id}`);
    expect(scan.body.scan).toMatchObject({ id: run.body.scan_id, kind: "ai", status: "done", grid_size: 3 });
    expect(scan.body.scan.summary.points).toBe(9);
    expect(scan.body.scan).not.toHaveProperty("lease_until");
    const points = await rest("GET", `/scans/${run.body.scan_id}/points`);
    expect(points.body.points).toHaveLength(9);
    expect(points.body.samples).toHaveLength(27);
    expect(points.body.note).toContain("AI answers vary");
    // Another workspace cannot see it, and cannot scan this business.
    expect((await rest("GET", `/scans/${run.body.scan_id}`, { key: keyB })).status).toBe(404);
    expect((await rest("GET", `/scans/${run.body.scan_id}/points`, { key: keyB })).status).toBe(404);
    expect((await rest("POST", "/scans", { key: keyB, body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3, confirm: true } })).status).toBe(404);
    expect((await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 4, confirm: true } })).status).toBe(400);
  });

  it("compares two Maps scans of the same business", async () => {
    const id = await seedBusiness(a, keyA);
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3, mode: "live", confirm: true } });
      ids.push(r.body.scan_id);
      await drain();
    }
    const cmp = await rest("GET", `/scans/compare?a=${ids[0]}&b=${ids[1]}`);
    expect(cmp.status).toBe(200);
    expect(cmp.body).toMatchObject({ kind: "maps", a: ids[0], b: ids[1] });
    expect(typeof cmp.body.headline).toBe("string");
    expect(cmp.body.comparison.points).toHaveLength(9);
    expect((await rest("GET", `/scans/compare?a=${ids[0]}`)).status).toBe(400);
    expect((await rest("GET", `/scans/compare?a=${ids[0]}&b=${ids[1]}`, { key: keyB })).status).toBe(404);
  });

  it("runs an audit and returns findings, not-checked checks and the Fix Kit", async () => {
    const id = await seedBusiness(a, keyA);
    expect((await rest("POST", "/audits", { body: { business_id: id, service: "dentist" } })).body.confirm_required).toBe(true);
    const run = await rest("POST", "/audits", { body: { business_id: id, service: "dentist", confirm: true } });
    expect(run.status).toBe(202);
    expect((await rest("GET", `/audits/${run.body.audit_id}/fix-kit`)).status).toBe(409); // not finished yet
    await drain();
    const audit = await rest("GET", `/audits/${run.body.audit_id}`);
    expect(audit.body.audit).toMatchObject({ status: "done", service: "dentist", months: 3 });
    expect(audit.body.audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.body.audit).not.toHaveProperty("inputs");
    expect(audit.body.findings.length).toBeGreaterThan(3);
    expect(audit.body.findings[0]).toHaveProperty("evidence");
    expect(Array.isArray(audit.body.not_checked)).toBe(true);
    const kit = await rest("GET", `/audits/${run.body.audit_id}/fix-kit`);
    expect(kit.body.fix_kit.jsonld_localbusiness["@type"]).toBe("Dentist");
    expect(kit.body.fix_kit.faqs).toHaveLength(8);
    expect((await rest("GET", `/audits/${run.body.audit_id}`, { key: keyB })).status).toBe(404);
    expect((await rest("GET", `/audits/${run.body.audit_id}/fix-kit`, { key: keyB })).status).toBe(404);
  });

  it("starts a prospect batch after an estimate and reports on it", async () => {
    const estimate = await rest("POST", "/prospects", { body: { niche: "dentist", city: "Austin, TX", max_reports: 2 } });
    expect(estimate.body.confirm_required).toBe(true);
    expect(estimate.body.estimate).toMatchObject({ reports: 2, credits: 4 });
    expect(await sql("select 1 from public.prospect_batches")).toEqual([]);
    const run = await rest("POST", "/prospects", { body: { niche: "dentist", city: "Austin, TX", max_reports: 2, confirm: true } });
    expect(run.status).toBe(202);
    expect(run.body.reports).toBe(2);
    await drain();
    const batch = await rest("GET", `/prospects/${run.body.batch_id}`);
    expect(batch.body.batch).toMatchObject({ status: "done", total: 2, done: 2 });
    expect(batch.body.batch).not.toHaveProperty("rows");
    for (const r of batch.body.reports) {
      expect(r.status).toBe("done");
      expect(r.report_url).toMatch(/\/r\/[A-Za-z0-9_-]{12,}$/);
    }
    expect((await rest("GET", `/prospects/${run.body.batch_id}`, { key: keyB })).status).toBe(404);
  });

  it("reports on named businesses (named mode) and returns the names it could not find", async () => {
    const body = { niche: "seo agency", businesses: [{ name: "Brightline Local", city: "Austin, TX" }, { name: "Closed Agency", city: "Austin, TX" }] };
    const estimate = await rest("POST", "/prospects", { body });
    expect(estimate.body.confirm_required).toBe(true);
    expect(estimate.body.estimate).toMatchObject({ reports: 2, credits: 4 });
    expect(await sql("select 1 from public.prospect_batches")).toEqual([]);
    const run = await rest("POST", "/prospects", { body: { ...body, confirm: true } });
    expect(run.status).toBe(202);
    expect(run.body.reports).toBe(1);
    expect(run.body.unresolved).toEqual([expect.objectContaining({ name: "Closed Agency" })]);
    await drain();
    const batch = await rest("GET", `/prospects/${run.body.batch_id}`);
    expect(batch.body.batch).toMatchObject({ status: "done", total: 1, done: 1, mode: "csv" });
    expect(batch.body.reports[0]).toMatchObject({ business: "Brightline Local", status: "done" });
    expect(batch.body.reports[0].report_url).toMatch(/\/r\/[A-Za-z0-9_-]{12,}$/);
    expect((await rest("POST", "/prospects", { body: { niche: "seo agency" } })).status).toBe(400);
  });

  it("reports this month's own-key spend per provider and the credits left", async () => {
    const id = await seedBusiness(a, keyA);
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 7, 'pack')", [a.workspaceId]);
    const run = await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 1, confirm: true } });
    expect(run.status).toBe(202);
    await drain();
    const usage = await rest("GET", "/usage");
    expect(usage.body.included_scans.credits_left).toBe(7);
    expect(usage.body.own_keys.by_provider.map((p: { provider: string }) => p.provider).sort()).toEqual(["gemini", "openai", "perplexity"]);
    expect(usage.body.own_keys.total_usd).toBeGreaterThan(0);
    const [scan] = await sql<{ actual_cost_usd: string }>("select actual_cost_usd from public.scans");
    expect(usage.body.own_keys.total_usd).toBeCloseTo(Number(scan.actual_cost_usd), 4);
    expect((await rest("GET", "/usage", { key: keyB })).body.own_keys.total_usd).toBe(0);
  });

  it("a workspace without lifetime access can read but not run", async () => {
    const id = await seedBusiness(a, keyA);
    await sql("update public.workspaces set plan = 'locked' where id = $1", [a.workspaceId]);
    expect((await rest("GET", "/businesses")).status).toBe(200);
    expect((await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3, confirm: true } })).status).toBe(403);
    expect((await rest("POST", "/businesses", { body: { name: "X", lat: 1, lng: 1 } })).status).toBe(403);
    expect((await rest("POST", "/prospects", { body: { niche: "dentist", city: "Austin", confirm: true } })).status).toBe(403);
  });
});

describe("OpenAPI document", () => {
  it("is valid OpenAPI 3.1", async () => {
    const result = await new Validator().validate(openApiSpec("https://rankbyai.live") as unknown as Record<string, unknown>);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("describes exactly the endpoints the router serves", async () => {
    const spec = openApiSpec("https://rankbyai.live");
    const id = "00000000-0000-4000-8000-000000000000";
    const documented: string[] = [];
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const method of Object.keys(ops)) {
        documented.push(`${method.toUpperCase()} ${path}`);
        const r = await rest(method.toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE", path.replace("{id}", id), { body: method === "post" || method === "patch" ? {} : undefined });
        expect(r.status, `${method} ${path}`).not.toBe(405);
        expect(r.body.message ?? "", `${method} ${path}`).not.toContain("Unknown endpoint");
      }
    }
    expect(documented.sort()).toEqual([
      "DELETE /businesses/{id}",
      "GET /audits", "GET /audits/{id}", "GET /audits/{id}/fix-kit", "GET /branding", "GET /businesses", "GET /businesses/{id}", "GET /prospects", "GET /prospects/{id}", "GET /prospects/{id}/pitch",
      "GET /scans", "GET /scans/compare", "GET /scans/{id}", "GET /scans/{id}/points", "GET /usage",
      "PATCH /branding", "PATCH /businesses/{id}",
      "POST /audits", "POST /businesses", "POST /prospects", "POST /scans",
    ]);
    expect(spec.servers[0].url).toBe("https://rankbyai.live/api/v1");
  });
});

describe("MCP server (driven by the official MCP client)", () => {
  async function connect(key: string | null) {
    const { POST } = await import("@/app/api/mcp/route");
    const transport = new StreamableHTTPClientTransport(new URL("https://rankbyai.test/api/mcp"), {
      requestInit: { headers: key ? { Authorization: `Bearer ${key}` } : {} },
      fetch: (input, init) => POST(new Request(input as string | URL, init as RequestInit)),
    });
    const client = new Client({ name: "acceptance-test", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[])[0].text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { isError: r.isError === true, body: JSON.parse(text) as any };
  };

  it("refuses a client without a valid key", async () => {
    await expect(connect(null)).rejects.toThrow();
    await expect(connect("rbai_live_" + "B".repeat(32))).rejects.toThrow();
  });

  it("lists every tool, each with a description and an input schema", async () => {
    const client = await connect(keyA);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOLS].sort());
    for (const t of tools) {
      expect(t.description!.length, t.name).toBeGreaterThan(40);
      expect(t.inputSchema.type, t.name).toBe("object");
    }
    // Every tool that can spend money exposes `confirm`, defaulting to false.
    for (const name of MCP_PAID_TOOLS) {
      const props = tools.find((t) => t.name === name)!.inputSchema.properties as Record<string, { default?: unknown }>;
      expect(props.confirm, name).toBeDefined();
      expect(props.confirm.default, name).toBe(false);
    }
    await client.close();
  });

  it("estimate_scan → run_ai_scan {confirm: true} → get_scan works end to end", async () => {
    const id = await seedBusiness(a, keyA);
    const client = await connect(keyA);
    expect((await call(client, "list_businesses")).body.businesses[0].id).toBe(id);

    const estimate = await call(client, "estimate_scan", { business_id: id, kind: "ai", keyword: "dentist", grid_size: 3 });
    expect(estimate.isError).toBe(false);
    expect(estimate.body.confirm_required).toBe(true);
    expect(estimate.body.estimate.totalUsd).toBeGreaterThan(0);
    expect(await sql("select 1 from public.scans")).toEqual([]);

    const run = await call(client, "run_ai_scan", { business_id: id, keyword: "dentist", grid_size: 3, confirm: true });
    expect(run.isError).toBe(false);
    expect(run.body.status).toBe("queued");
    await drain();

    const scan = await call(client, "get_scan", { scan_id: run.body.scan_id, include_points: true });
    expect(scan.body.scan).toMatchObject({ status: "done", kind: "ai", grid_size: 3 });
    expect(scan.body.points).toHaveLength(9);
    expect(scan.body.samples).toHaveLength(27);
    await client.close();
  });

  it("paid tools without confirm return an estimate and do nothing", async () => {
    const id = await seedBusiness(a, keyA);
    const client = await connect(keyA);
    const attempts: [string, Record<string, unknown>][] = [
      ["run_ai_scan", { business_id: id, keyword: "dentist" }],
      ["run_maps_scan", { business_id: id, keyword: "dentist" }],
      ["run_audit", { business_id: id, service: "dentist" }],
      ["create_prospect_batch", { niche: "dentist", city: "Austin, TX" }],
      ["add_business", { name: "Lone Oak Dental", city: "Austin" }],
    ];
    for (const [tool, args] of attempts) {
      const r = await call(client, tool, args);
      expect(r.isError, tool).toBe(false);
      expect(r.body.confirm_required, tool).toBe(true);
      expect(r.body.estimate, tool).toBeDefined();
    }
    expect(deferred.queue).toHaveLength(0);
    for (const table of ["scans", "audits", "prospect_batches"]) expect(await sql(`select 1 from public.${table}`), table).toEqual([]);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.businesses"))[0].n).toBe(1);
    await client.close();
  });

  it("run_audit → get_audit → get_fix_kit, and another key cannot read the result", async () => {
    const id = await seedBusiness(a, keyA);
    const client = await connect(keyA);
    const run = await call(client, "run_audit", { business_id: id, service: "dentist", confirm: true });
    await drain();
    const audit = await call(client, "get_audit", { audit_id: run.body.audit_id });
    expect(audit.body.audit.status).toBe("done");
    expect(audit.body.findings.length).toBeGreaterThan(3);
    const kit = await call(client, "get_fix_kit", { audit_id: run.body.audit_id, confirm: true });
    expect(kit.body.fix_kit.llms_txt).toContain("# Northgate Family Dental");
    expect((await call(client, "get_usage")).body.included_scans.credits_left).toBe(0);

    const other = await connect(keyB);
    const denied = await call(other, "get_audit", { audit_id: run.body.audit_id });
    expect(denied.isError).toBe(true);
    expect(denied.body.error).toBe("not_found");
    expect((await call(other, "list_businesses")).body.businesses).toEqual([]);

    // The fix_plan prompt: listed, built from the audit's findings in priority order, and closed to other workspaces.
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["fix_plan"]);
    const plan = await client.getPrompt({ name: "fix_plan", arguments: { audit_id: run.body.audit_id } });
    const text = (plan.messages[0].content as { type: string; text: string }).text;
    expect(text).toContain("This is about Northgate Family Dental");
    expect(text).toMatch(/\nP0, fix first: /);
    expect(text).toContain("Guardrails:");
    const otherPlan = await other.getPrompt({ name: "fix_plan", arguments: { audit_id: run.body.audit_id } });
    expect((otherPlan.messages[0].content as { text: string }).text).toContain("could not load audit");
    await client.close();
    await other.close();
  });
});
