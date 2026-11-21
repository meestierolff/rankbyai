import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { createApiKey } from "@/lib/api-keys";
import { MCP_TOOLS } from "@/lib/api-v1/mcp";
import { handleOptions, handleRest } from "@/lib/api-v1/rest";

/**
 * The API fixes from the 18 Nov 2026 test report, against the real local database with SIMULATED
 * vendors: update and delete of businesses, workspace isolation of every new operation, money
 * rounding and estimate keys, rate-limit headers, HEAD / OPTIONS / 405, the list endpoints,
 * branding, and the MCP protocol details (driven by the official MCP client).
 */
const deferred = vi.hoisted(() => ({ queue: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { deferred.queue.push(work); } }));
const drain = async () => { while (deferred.queue.length) await deferred.queue.shift()!(); };

let a: TestUser;
let b: TestUser;
let keyA: string;
let keyB: string;
const BASE = "https://rankbyai.test/api/v1";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
type Method = "GET" | "POST" | "PATCH" | "DELETE" | "HEAD" | "PUT";

async function rest(method: Method, path: string, opts: { key?: string | null; body?: unknown } = {}) {
  const key = opts.key === undefined ? keyA : opts.key;
  const url = new URL(BASE + path);
  const request = new Request(url, { method, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(opts.body ? { "Content-Type": "application/json" } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const res = await handleRest(request, url.pathname.replace("/api/v1/", "").split("/"), (work) => { deferred.queue.push(work); });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, text, body: (text ? JSON.parse(text) : null) as any };
}

async function seedBusiness(key: string, name = "Northgate Family Dental") {
  const r = await rest("POST", "/businesses", { key, body: { name, city: "Austin", address: "410 W 38th St", lat: 30.3172, lng: -97.7231, website: "https://northgatefamilydental.example", phone: "+1 512 555 0174", primary_category: "Dental clinic" } });
  expect(r.status).toBe(201);
  await sql("update public.businesses set cid = 'mock-cid-target' where id = $1", [r.body.business.id]);
  return r.body.business.id as string;
}
const businessRow = async (id: string) => (await sql<{ name: string; address: string | null; city: string | null; client_id: string | null }>("select name, address, city, client_id from public.businesses where id = $1", [id]))[0];

/** Every number in the value that sits under a key naming US dollars. */
function usdValues(value: unknown, key = ""): number[] {
  if (typeof value === "number") return /usd/i.test(key) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((v) => usdValues(v, key));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => usdValues(v, k));
  return [];
}
const decimals = (n: number) => (String(n).includes("e") ? 99 : (String(n).split(".")[1] ?? "").length);

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  a = await createTestUser("parity-a");
  b = await createTestUser("parity-b");
});
beforeEach(async () => {
  deferred.queue.length = 0;
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1, brand_name = null, brand_color_hex = null, brand_website = null, reply_to_email = null, hide_rankbyai_branding = false where id = any($1)", [[a.workspaceId, b.workspaceId]]);
  const ka = await createApiKey(a.workspaceId, "Parity A");
  const kb = await createApiKey(b.workspaceId, "Parity B");
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

describe("REST: update and delete a business", () => {
  it("PATCH changes only the fields that are sent", async () => {
    const id = await seedBusiness(keyA);
    const renamed = await rest("PATCH", `/businesses/${id}`, { body: { name: "  Northgate Dental  " } });
    expect(renamed.status).toBe(200);
    expect(renamed.body.business).toMatchObject({ id, name: "Northgate Dental", city: "Austin", address: "410 W 38th St" });
    const moved = await rest("PATCH", `/businesses/${id}`, { body: { address: "", city: "Round Rock" } });
    expect(moved.body.business).toMatchObject({ name: "Northgate Dental", address: null, city: "Round Rock" });
    expect(await businessRow(id)).toMatchObject({ name: "Northgate Dental", address: null, city: "Round Rock", client_id: null });
    // Coordinates and anything else outside the four fields are refused, not silently dropped.
    for (const body of [{}, { lat: 1 }, { name: "" }, { name: "x".repeat(301) }, { client_id: "nope" }]) {
      const r = await rest("PATCH", `/businesses/${id}`, { body });
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.error).toBe("invalid_request");
    }
    expect((await rest("PATCH", `/businesses/${UNKNOWN}`, { body: { name: "X" } })).status).toBe(404);
  });

  it("assigns a client of the same workspace, and refuses another workspace's client", async () => {
    const id = await seedBusiness(keyA);
    const [mine] = await sql<{ id: string }>("insert into public.clients (workspace_id, name) values ($1, 'Client A') returning id", [a.workspaceId]);
    const [theirs] = await sql<{ id: string }>("insert into public.clients (workspace_id, name) values ($1, 'Client B') returning id", [b.workspaceId]);
    const foreign = await rest("PATCH", `/businesses/${id}`, { body: { client_id: theirs.id } });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error).toBe("invalid_client");
    expect((await businessRow(id)).client_id).toBeNull();
    expect((await rest("PATCH", `/businesses/${id}`, { body: { client_id: mine.id } })).body.business.client_id).toBe(mine.id);
    expect((await rest("PATCH", `/businesses/${id}`, { body: { client_id: null } })).body.business.client_id).toBeNull();
  });

  it("DELETE removes the business with its scans, audit, schedule and share link, as the app does", async () => {
    const id = await seedBusiness(keyA);
    const keep = await seedBusiness(keyA, "Lone Oak Dental");
    const scan = await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3, mode: "live", confirm: true } });
    expect(scan.status).toBe(202);
    const audit = await rest("POST", "/audits", { body: { business_id: id, service: "dentist", confirm: true } });
    expect(audit.status).toBe(202);
    await drain();
    await sql("insert into public.tracked_queries (workspace_id, business_id, kind, keyword, grid_size, schedule) values ($1, $2, 'maps', 'dentist', 3, 'weekly')", [a.workspaceId, id]);
    await sql("insert into public.reports (workspace_id, business_id, kind, share_slug) values ($1, $2, 'share', 'parityslug0001')", [a.workspaceId, id]);

    const gone = await rest("DELETE", `/businesses/${id}`);
    expect(gone.status).toBe(200);
    expect(gone.body).toEqual({ deleted: true, id });
    for (const table of ["scans", "audits", "tracked_queries", "reports"]) {
      expect(await sql(`select 1 from public.${table} where business_id = $1`, [id]), table).toEqual([]);
    }
    expect(await sql("select 1 from public.scan_points where scan_id = $1", [scan.body.scan_id])).toEqual([]);
    expect(await sql("select 1 from public.audit_findings where audit_id = $1", [audit.body.audit_id])).toEqual([]);
    expect((await rest("GET", `/businesses/${id}`)).status).toBe(404);
    expect((await rest("DELETE", `/businesses/${id}`)).status).toBe(404); // already gone
    expect((await rest("GET", "/businesses")).body.businesses.map((x: { id: string }) => x.id)).toEqual([keep]);
  });

  it("a key from another workspace cannot read, update or delete the business", async () => {
    const id = await seedBusiness(keyA);
    const before = await businessRow(id);
    expect((await rest("GET", `/businesses/${id}`, { key: keyB })).status).toBe(404);
    expect((await rest("PATCH", `/businesses/${id}`, { key: keyB, body: { name: "Taken over" } })).status).toBe(404);
    expect((await rest("DELETE", `/businesses/${id}`, { key: keyB })).status).toBe(404);
    expect((await rest("GET", "/businesses", { key: keyB })).body.businesses).toEqual([]);
    expect(await businessRow(id)).toEqual(before); // still there, unchanged
    expect((await rest("GET", `/businesses/${id}`)).body.business.name).toBe("Northgate Family Dental");
  });

  it("an id that is not a UUID answers 400, an unknown UUID 404", async () => {
    const calls: [Method, string][] = [
      ["GET", "/businesses/not-a-uuid"], ["PATCH", "/businesses/not-a-uuid"], ["DELETE", "/businesses/not-a-uuid"],
      ["GET", "/scans/123"], ["GET", "/scans/123/points"], ["GET", "/audits/abc"], ["GET", "/audits/abc/fix-kit"], ["GET", "/prospects/abc"],
    ];
    for (const [method, path] of calls) {
      const r = await rest(method, path, { body: method === "PATCH" ? { name: "X" } : undefined });
      expect(r.status, `${method} ${path}`).toBe(400);
      expect(r.body.error, `${method} ${path}`).toBe("invalid_request");
    }
    for (const path of [`/businesses/${UNKNOWN}`, `/scans/${UNKNOWN}`, `/audits/${UNKNOWN}`, `/prospects/${UNKNOWN}`]) {
      const r = await rest("GET", path);
      expect(r.status, path).toBe(404);
      expect(r.body.error, path).toBe("not_found");
    }
  });
});

describe("REST: money", () => {
  it("rounds every dollar amount to at most 6 decimal places and uses totalUsd in every estimate", async () => {
    const id = await seedBusiness(keyA);
    const estimates = [
      await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3 } }),
      await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 9, mode: "standard" } }),
      await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 3, funding: "credits" } }),
      await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 5 } }),
      await rest("POST", "/audits", { body: { business_id: id, service: "dentist" } }),
      await rest("POST", "/prospects", { body: { niche: "dentist", city: "Austin, TX", max_reports: 10 } }),
      await rest("POST", "/prospects", { body: { niche: "dentist", city: "Manchester", country: "GB", max_reports: 5 } }),
      await rest("POST", "/businesses", { body: { name: "Lone Oak Dental", city: "Austin" } }),
    ];
    for (const r of estimates) {
      expect(r.body.confirm_required, r.text).toBe(true);
      const e = r.body.estimate;
      expect(typeof e.totalUsd, r.text).toBe("number");
      expect(e.totalUsd).toBeGreaterThan(0);
      expect(Array.isArray(e.lines), r.text).toBe(true);
      const amounts = usdValues(r.body);
      expect(amounts.length).toBeGreaterThanOrEqual(2);
      for (const n of amounts) expect(decimals(n), `${n} in ${r.text}`).toBeLessThanOrEqual(6);
      // The lines add up to the total, to the precision the API promises.
      expect(e.lines.reduce((s: number, l: { usd: number }) => s + l.usd, 0)).toBeCloseTo(e.totalUsd, 5);
    }
    // The Maps 3×3 estimate from the report: 9 points at $0.0012 is $0.0108, not 0.010799999999999999.
    expect(estimates[0].body.estimate.totalUsd).toBe(0.0108);
    expect(estimates[0].body.estimate).toMatchObject({ highUsd: 0.0108, basis: "published prices", credits: 1 });
    expect(estimates[0].body.estimate.lines[0].provider).toBe("dataforseo");
    // Only the business lookup (and the Fix Kit) still carry the old snake_case name.
    expect(estimates[7].body.estimate.total_usd).toBe(estimates[7].body.estimate.totalUsd);
    for (const r of estimates.slice(0, 7)) expect(r.body.estimate).not.toHaveProperty("total_usd");
  });

  it("rounds the amounts of a finished scan and of usage", async () => {
    const id = await seedBusiness(keyA);
    const run = await rest("POST", "/scans", { body: { business_id: id, kind: "ai", keyword: "dentist", grid_size: 3, confirm: true } });
    expect(run.status).toBe(202);
    for (const n of usdValues(run.body)) expect(decimals(n)).toBeLessThanOrEqual(6);
    await drain();
    for (const path of [`/scans/${run.body.scan_id}`, "/scans", "/usage"]) {
      const r = await rest("GET", path);
      const amounts = usdValues(r.body);
      expect(amounts.length, path).toBeGreaterThan(0);
      for (const n of amounts) expect(decimals(n), `${n} in ${path}`).toBeLessThanOrEqual(6);
    }
  });
});

describe("REST: rate-limit headers, HEAD, OPTIONS and 405", () => {
  it("sends limit, remaining and reset on every authenticated response, whatever its status", async () => {
    await sql("delete from public.rate_limits");
    const id = await seedBusiness(keyA); // request 1 of this key's minute
    const calls: [Method, string, number][] = [
      ["GET", "/usage", 200], ["GET", `/businesses/${UNKNOWN}`, 404], ["GET", "/businesses/x", 400], ["GET", "/nope", 404],
      ["PUT", "/usage", 405], ["PATCH", `/businesses/${id}`, 400], ["HEAD", "/usage", 200], ["DELETE", `/businesses/${id}`, 200],
    ];
    for (const [method, path, status] of calls) {
      const r = await rest(method, path);
      expect(r.status, `${method} ${path}`).toBe(status);
      expect(r.headers.get("x-ratelimit-limit")).toBe("60");
      const left = Number(r.headers.get("x-ratelimit-remaining"));
      const reset = Number(r.headers.get("x-ratelimit-reset"));
      expect(Number.isInteger(left) && left >= 0 && left < 60, `${method} ${path}: ${left}`).toBe(true);
      expect(reset).toBeGreaterThan(Date.now() / 1000 - 5);
      expect(reset).toBeLessThanOrEqual(Date.now() / 1000 + 65);
      expect(r.headers.get("access-control-allow-origin")).toBeNull();
    }
    // An unauthenticated request is not counted and gets no counter.
    const anonymous = await rest("GET", "/usage", { key: null });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("x-ratelimit-remaining")).toBeNull();
  });

  it("counts down within one minute", async () => {
    const second = new Date().getUTCSeconds();
    if (second > 55) await new Promise((resolve) => setTimeout(resolve, (61 - second) * 1000));
    await sql("delete from public.rate_limits");
    const first = await rest("GET", "/usage");
    const second2 = await rest("GET", "/usage");
    expect(first.headers.get("x-ratelimit-remaining")).toBe("59");
    expect(second2.headers.get("x-ratelimit-remaining")).toBe("58");
    expect(second2.headers.get("x-ratelimit-reset")).toBe(first.headers.get("x-ratelimit-reset"));
    expect(Number(first.headers.get("x-ratelimit-reset")) % 60).toBe(0);
    expect((await rest("GET", "/usage", { key: keyB })).headers.get("x-ratelimit-remaining")).toBe("59"); // per key
  });

  it("HEAD answers like GET without a body, and starts nothing", async () => {
    const id = await seedBusiness(keyA);
    const head = await rest("HEAD", "/usage");
    expect(head.status).toBe(200);
    expect(head.text).toBe("");
    expect(head.headers.get("content-type")).toContain("application/json");
    expect((await rest("HEAD", `/businesses/${id}`)).status).toBe(200);
    expect((await rest("HEAD", `/businesses/${UNKNOWN}`)).status).toBe(404);
    expect((await rest("HEAD", "/nope")).status).toBe(404);
    expect((await rest("HEAD", "/usage", { key: null })).status).toBe(401);
    // HEAD on a Fix Kit that does not exist yet must not build it.
    const audit = await rest("POST", "/audits", { body: { business_id: id, service: "dentist", confirm: true } });
    await drain();
    const probe = await rest("HEAD", `/audits/${audit.body.audit_id}/fix-kit`);
    expect(probe.status).toBe(404);
    expect(await sql("select 1 from public.fix_kits")).toEqual([]);
    expect((await rest("GET", `/audits/${audit.body.audit_id}/fix-kit`)).status).toBe(200);
    expect((await rest("HEAD", `/audits/${audit.body.audit_id}/fix-kit`)).status).toBe(200);
    // HEAD on a queued scan does not start a worker for it.
    const scan = await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3, confirm: true } });
    deferred.queue.length = 0;
    expect((await rest("HEAD", `/scans/${scan.body.scan_id}`)).status).toBe(200);
    expect(deferred.queue).toHaveLength(0);
  });

  it("OPTIONS lists the methods of the path and sends no CORS headers", async () => {
    const allow = (path: string) => handleOptions(path.split("/"));
    expect(allow("usage").status).toBe(204);
    expect(allow("usage").headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(allow("businesses").headers.get("allow")).toBe("GET, HEAD, OPTIONS, POST");
    expect(allow(`businesses/${UNKNOWN}`).headers.get("allow")).toBe("DELETE, GET, HEAD, OPTIONS, PATCH");
    expect(allow("branding").headers.get("allow")).toBe("GET, HEAD, OPTIONS, PATCH");
    expect(allow("scans/compare").headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(allow("nope").status).toBe(404);
    for (const path of ["usage", "businesses", "nope"]) {
      for (const [name] of allow(path).headers) expect(name.toLowerCase().startsWith("access-control"), `${path}: ${name}`).toBe(false);
    }
  });

  it("a method the endpoint does not serve answers 405 with Allow; every advertised method is served", async () => {
    const wrong = await rest("DELETE", "/usage");
    expect(wrong.status).toBe(405);
    expect(wrong.body.error).toBe("method_not_allowed");
    expect(wrong.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect((await rest("POST", `/businesses/${UNKNOWN}`, { body: {} })).status).toBe(405);
    expect((await rest("PATCH", "/scans", { body: {} })).status).toBe(405);
    for (const path of ["usage", "businesses", `businesses/${UNKNOWN}`, "scans", "audits", "prospects", "branding", `scans/${UNKNOWN}/points`]) {
      const methods = handleOptions(path.split("/")).headers.get("allow")!.split(", ").filter((m) => m !== "OPTIONS");
      for (const method of methods) {
        const r = await rest(method as Method, `/${path}`, { body: method === "POST" || method === "PATCH" ? {} : undefined });
        expect(r.status, `${method} /${path}`).not.toBe(405);
        expect(r.body?.message ?? "", `${method} /${path}`).not.toContain("Unknown endpoint");
      }
    }
  });
});

describe("REST: lists", () => {
  it("lists scans of the caller's workspace, newest first, with filters and paging", async () => {
    const first = await seedBusiness(keyA);
    const other = await seedBusiness(keyA, "Lone Oak Dental");
    const theirs = await seedBusiness(keyB, "Their Dental");
    const ids: string[] = [];
    for (const [key, business, kind] of [[keyA, first, "maps"], [keyA, first, "ai"], [keyA, other, "maps"], [keyB, theirs, "maps"]] as const) {
      const r = await rest("POST", "/scans", { key, body: { business_id: business, kind, keyword: "dentist", grid_size: 3, mode: "live", confirm: true } });
      expect(r.status).toBe(202);
      ids.push(r.body.scan_id);
      await drain();
    }
    const all = await rest("GET", "/scans");
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ limit: 50, offset: 0 });
    expect(all.body.scans.map((s: { id: string }) => s.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect(all.body.scans[0]).toMatchObject({ business_id: other, kind: "maps", status: "done", grid_size: 3, keyword: "dentist" });
    for (const s of all.body.scans) {
      expect(s).not.toHaveProperty("lease_until");
      expect(s).not.toHaveProperty("workspace_id");
    }
    expect((await rest("GET", `/scans?business_id=${first}`)).body.scans.map((s: { id: string }) => s.id)).toEqual([ids[1], ids[0]]);
    expect((await rest("GET", "/scans?kind=ai")).body.scans.map((s: { id: string }) => s.id)).toEqual([ids[1]]);
    expect((await rest("GET", "/scans?status=failed")).body.scans).toEqual([]);
    expect((await rest("GET", "/scans?limit=1&offset=1")).body.scans.map((s: { id: string }) => s.id)).toEqual([ids[1]]);
    // Another workspace sees its own scan and nothing else, also when it asks for this business by id.
    expect((await rest("GET", "/scans", { key: keyB })).body.scans.map((s: { id: string }) => s.id)).toEqual([ids[3]]);
    expect((await rest("GET", `/scans?business_id=${first}`, { key: keyB })).body.scans).toEqual([]);
    for (const bad of ["limit=0", "limit=201", "offset=-1", "offset=100001", "kind=web", "business_id=x"]) expect((await rest("GET", `/scans?${bad}`)).status, bad).toBe(400);
  });

  it("lists audits and prospect batches of the caller's workspace", async () => {
    const mine = await seedBusiness(keyA);
    const theirs = await seedBusiness(keyB, "Their Dental");
    const auditA = await rest("POST", "/audits", { body: { business_id: mine, service: "dentist", confirm: true } });
    const auditB = await rest("POST", "/audits", { key: keyB, body: { business_id: theirs, service: "plumber", confirm: true } });
    await drain();
    const audits = await rest("GET", "/audits");
    expect(audits.body.audits).toHaveLength(1);
    expect(audits.body.audits[0]).toMatchObject({ id: auditA.body.audit_id, business_id: mine, status: "done", service: "dentist", months: 3 });
    expect(audits.body.audits[0]).not.toHaveProperty("inputs");
    expect(audits.body.audits[0].score).toBeGreaterThanOrEqual(0);
    expect((await rest("GET", "/audits", { key: keyB })).body.audits.map((x: { id: string }) => x.id)).toEqual([auditB.body.audit_id]);
    expect((await rest("GET", `/audits?business_id=${theirs}`)).body.audits).toEqual([]);
    expect((await rest("GET", "/audits?status=queued")).body.audits).toEqual([]);

    const run = await rest("POST", "/prospects", { body: { niche: "dentist", city: "Austin, TX", max_reports: 2, confirm: true } });
    expect(run.status).toBe(202);
    await drain();
    await sql("insert into public.prospect_batches (workspace_id, mode, niche, city, funding, total, status, rows) values ($1, 'search', 'plumber', 'Leeds', 'byok', 1, 'queued', '[{\"name\":\"Secret Co\"}]')", [b.workspaceId]);
    const batches = await rest("GET", "/prospects");
    expect(batches.body.batches).toHaveLength(1);
    expect(batches.body.batches[0]).toMatchObject({ id: run.body.batch_id, niche: "dentist", status: "done", total: 2, done: 2 });
    for (const hidden of ["rows", "lease_until", "credits_reserved", "workspace_id"]) expect(batches.body.batches[0]).not.toHaveProperty(hidden);
    const other = await rest("GET", "/prospects", { key: keyB });
    expect(other.body.batches.map((x: { niche: string }) => x.niche)).toEqual(["plumber"]);
    expect(other.text).not.toContain("Secret Co");
    expect((await rest("GET", "/prospects?status=done", { key: keyB })).body.batches).toEqual([]);
    // The share link of each report is on the batch itself.
    const batch = await rest("GET", `/prospects/${run.body.batch_id}`);
    for (const r of batch.body.reports) expect(r.report_url).toMatch(/^https?:\/\/.+\/r\/[A-Za-z0-9_-]{12,}$/);
  }, 120_000);
});

describe("REST: branding", () => {
  it("reads and changes the white-label fields of the caller's workspace only", async () => {
    const empty = await rest("GET", "/branding");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ branding: { brand_name: null, brand_color_hex: null, brand_website: null, reply_to_email: null, hide_rankbyai_branding: false, report_default_view: "map", has_logo: false } });

    const set = await rest("PATCH", "/branding", { body: { brand_name: " Northside SEO ", brand_color_hex: "#1A2b3C", brand_website: "https://northside.example", reply_to_email: "hello@northside.example", hide_rankbyai_branding: true } });
    expect(set.status).toBe(200);
    expect(set.body.branding).toEqual({ brand_name: "Northside SEO", brand_color_hex: "#1A2b3C", brand_website: "https://northside.example", reply_to_email: "hello@northside.example", hide_rankbyai_branding: true, report_default_view: "map", has_logo: false });
    // Report links can open on the rank grid instead of the map.
    expect((await rest("PATCH", "/branding", { body: { report_default_view: "grid" } })).body.branding.report_default_view).toBe("grid");
    expect((await rest("PATCH", "/branding", { body: { report_default_view: "table" } })).status).toBe(400);
    await rest("PATCH", "/branding", { body: { report_default_view: "map" } });
    // Only the fields that are sent change: the hide flag and the rest stay as they were.
    const partial = await rest("PATCH", "/branding", { body: { brand_name: "Northside", reply_to_email: "" } });
    expect(partial.body.branding).toMatchObject({ brand_name: "Northside", brand_color_hex: "#1A2b3C", brand_website: "https://northside.example", reply_to_email: null, hide_rankbyai_branding: true });
    expect((await rest("GET", "/branding")).body).toEqual(partial.body);

    for (const body of [{}, { brand_color_hex: "red" }, { brand_website: "javascript:alert(1)" }, { brand_website: "northside.example" }, { reply_to_email: "nope" }, { hide_rankbyai_branding: "true" }, { brand_logo_path: "x/y.png" }, { plan: "lifetime" }, { brand_name: "x".repeat(81) }]) {
      const r = await rest("PATCH", "/branding", { body });
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect((await rest("GET", "/branding")).body).toEqual(partial.body);

    // Workspace B is untouched, and the stored row of A matches what the API returned.
    expect((await rest("GET", "/branding", { key: keyB })).body.branding).toMatchObject({ brand_name: null, hide_rankbyai_branding: false });
    const rows = await sql<{ id: string; brand_name: string | null; hide_rankbyai_branding: boolean }>("select id, brand_name, hide_rankbyai_branding from public.workspaces where id = any($1)", [[a.workspaceId, b.workspaceId]]);
    expect(rows.find((r) => r.id === a.workspaceId)).toMatchObject({ brand_name: "Northside", hide_rankbyai_branding: true });
    expect(rows.find((r) => r.id === b.workspaceId)).toMatchObject({ brand_name: null, hide_rankbyai_branding: false });
  });

  it("reports an uploaded logo without exposing where it is stored, and needs lifetime access to change", async () => {
    await sql("update public.workspaces set brand_logo_path = $2 where id = $1", [a.workspaceId, `${a.workspaceId}/logo.png`]);
    const r = await rest("GET", "/branding");
    expect(r.body.branding.has_logo).toBe(true);
    expect(r.text).not.toContain("logo.png");
    await sql("update public.workspaces set plan = 'locked' where id = $1", [a.workspaceId]);
    expect((await rest("GET", "/branding")).status).toBe(200);
    const denied = await rest("PATCH", "/branding", { body: { brand_name: "X" } });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("lifetime_required");
    await sql("update public.workspaces set brand_logo_path = null where id = $1", [a.workspaceId]);
  });
});

describe("MCP: protocol, schemas and the new tools (official MCP client)", () => {
  const post = async (request: Request) => (await import("@/app/api/mcp/route")).POST(request);
  async function connect(key: string) {
    const transport = new StreamableHTTPClientTransport(new URL("https://rankbyai.test/api/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
      fetch: (input, init) => post(new Request(input as string | URL, init as RequestInit)),
    });
    const client = new Client({ name: "parity-test", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }
  /** Calls a tool and checks that the structured result and the text block carry the same JSON. */
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { type: string; text: string }[])[0].text;
    const body = JSON.parse(text);
    expect(r.structuredContent, name).toEqual(body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { isError: r.isError === true, body: body as any };
  };
  const initialize = (key: string | null, method = "POST") => new Request("https://rankbyai.test/api/mcp", {
    method,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "raw", version: "1.0.0" } } }) : undefined,
  });

  it("is stateless and POST only: no listChanged, no session id, GET answers 405, and rate headers are sent", async () => {
    const client = await connect(keyA);
    expect(client.getServerCapabilities()?.tools?.listChanged).toBe(false);
    await client.close();

    const res = await post(initialize(keyA));
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
    expect(Number(res.headers.get("x-ratelimit-remaining"))).toBeGreaterThanOrEqual(0);
    expect(Number(res.headers.get("x-ratelimit-reset"))).toBeGreaterThan(Date.now() / 1000 - 5);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(await res.text()).toContain('"listChanged":false');

    const { GET } = await import("@/app/api/mcp/route");
    const get = await GET(initialize(keyA, "GET"));
    expect(get.status).toBe(405);
    expect(get.headers.get("x-ratelimit-remaining")).not.toBeNull();
    expect((await post(initialize(null))).status).toBe(401);
  });

  it("sends structuredContent and text to a client on the 2025-03-26 protocol, without a session", async () => {
    const res = await post(new Request("https://rankbyai.test/api/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${keyA}`, Accept: "application/json, text/event-stream", "Content-Type": "application/json", "MCP-Protocol-Version": "2025-03-26" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_usage", arguments: {} } }),
    }));
    expect(res.status).toBe(200);
    const raw = await res.text();
    const message = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find((l) => l.startsWith("data:"))!.slice(5));
    console.info("[2025-03-26 tools/call]", Object.keys(message.result ?? message));
    expect(message.result.isError).toBe(false);
    const fromText = JSON.parse(message.result.content[0].text);
    expect(fromText.included_scans.credits_left).toBe(0);
    expect(message.result.structuredContent).toEqual(fromText);
  });

  it("publishes real enums and bounds in every input schema", async () => {
    const client = await connect(keyA);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...MCP_TOOLS]);
    expect(new Set(MCP_TOOLS).size).toBe(MCP_TOOLS.length);
    const tool = (name: string) => tools.find((t) => t.name === name)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (name: string) => tool(name).inputSchema.properties as Record<string, any>;

    // No JavaScript safe-integer bounds anywhere: every numeric limit is a real one.
    const bounds = (schema: unknown): number[] => {
      if (Array.isArray(schema)) return schema.flatMap(bounds);
      if (!schema || typeof schema !== "object") return [];
      return Object.entries(schema).flatMap(([k, v]) => (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"].includes(k) && typeof v === "number" ? [v] : bounds(v)));
    };
    for (const t of tools) for (const n of bounds(t.inputSchema)) expect(Math.abs(n), `${t.name}: ${n}`).toBeLessThanOrEqual(1_000_000);
    for (const name of ["list_businesses", "list_scans", "list_audits", "list_prospect_batches"]) {
      expect(props(name).limit, name).toMatchObject({ type: "integer", minimum: 1, maximum: 200, default: 50 });
      expect(props(name).offset, name).toMatchObject({ type: "integer", minimum: 0, maximum: 100000, default: 0 });
    }
    expect(props("estimate_scan").grid_size).toMatchObject({ enum: [1, 3, 5, 7, 9, 11, 13, 15], default: 3 });
    expect(props("estimate_scan").grid_size.description).toContain("AI scans: 1, 3 or 5. Maps scans: 3, 5, 7, 9, 11, 13 or 15.");
    expect(props("run_ai_scan").grid_size).toMatchObject({ enum: [1, 3, 5] });
    expect(props("run_maps_scan").grid_size).toMatchObject({ enum: [3, 5, 7, 9, 11, 13, 15] });
    for (const name of ["estimate_scan", "run_ai_scan", "run_maps_scan"]) expect(props(name).grid_size, name).not.toHaveProperty("minimum");
    expect(props("add_business").address).toMatchObject({ type: "string", maxLength: 400 });
    expect(props("add_business").lat).toMatchObject({ minimum: -90, maximum: 90 });
    expect(props("run_ai_scan").prompt_template).toMatchObject({ type: "string", maxLength: 400 });
    expect(props("run_maps_scan")).not.toHaveProperty("prompt_template");

    // Fixed-shape tools publish an output schema; estimate-or-run tools do not.
    for (const name of ["list_businesses", "update_business", "delete_business", "estimate_scan", "list_scans", "compare_scans", "list_audits", "get_audit", "list_prospect_batches", "get_prospect_batch", "get_pitch_asset", "get_branding", "update_branding", "get_usage"]) {
      expect(tool(name).outputSchema?.type, name).toBe("object");
    }
    for (const name of ["add_business", "run_ai_scan", "run_maps_scan", "get_scan", "run_audit", "get_fix_kit", "create_prospect_batch"]) expect(tool(name).outputSchema, name).toBeUndefined();
    await client.close();
  });

  it("every tool with an output schema returns a result that fits it, against real rows", async () => {
    const client = await connect(keyA);
    await client.listTools(); // the client now checks each structured result against the tool's output schema
    const added = await call(client, "add_business", { name: "Northgate Family Dental", city: "Austin", address: "410 W 38th St", lat: 30.3172, lng: -97.7231 });
    expect(added.isError).toBe(false);
    const id = added.body.business.id as string;
    expect(added.body.business.address).toBe("410 W 38th St");
    await sql("update public.businesses set cid = 'mock-cid-target' where id = $1", [id]);

    expect((await call(client, "list_businesses", { limit: 5 })).body.businesses).toHaveLength(1);
    const updated = await call(client, "update_business", { business_id: id, name: "Northgate Dental", city: null });
    expect(updated.isError).toBe(false);
    expect(updated.body.business).toMatchObject({ name: "Northgate Dental", city: null, address: "410 W 38th St" });

    const estimate = await call(client, "estimate_scan", { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3 });
    expect(estimate.isError).toBe(false);
    expect(estimate.body.estimate.totalUsd).toBe(0.0108);
    const badGrid = await call(client, "estimate_scan", { business_id: id, kind: "ai", keyword: "dentist", grid_size: 9 });
    expect(badGrid.isError).toBe(true);
    expect(badGrid.body.error).toBe("invalid_spec");
    expect(await sql("select 1 from public.scans")).toEqual([]);

    // Agents poll while work is queued: results must fit the output schemas in that state too.
    const polls = async (when: string, checks: [string, Record<string, unknown>][]) => {
      for (const [tool, args] of checks) expect((await call(client, tool, args)).isError, `${tool} ${when}`).toBe(false);
    };
    const scans: string[] = [];
    for (let i = 0; i < 2; i++) {
      const run = await call(client, "run_maps_scan", { business_id: id, keyword: "dentist", grid_size: 3, mode: "live", confirm: true });
      expect(run.isError).toBe(false);
      scans.push(run.body.scan_id);
      if (i === 0) {
        const queued = await call(client, "list_scans", { status: "queued" });
        expect(queued.isError).toBe(false);
        expect(queued.body.scans.map((s: { id: string }) => s.id)).toEqual([run.body.scan_id]);
        await polls("while a scan is queued", [["list_scans", {}], ["get_scan", { scan_id: run.body.scan_id, include_points: true }]]);
      }
      await drain();
    }
    const aiScans: string[] = [];
    for (let i = 0; i < 2; i++) {
      const run = await call(client, "run_ai_scan", { business_id: id, keyword: "dentist", grid_size: 1, confirm: true });
      expect(run.isError).toBe(false);
      aiScans.push(run.body.scan_id);
      await drain();
    }
    const aiCompare = await call(client, "compare_scans", { a: aiScans[0], b: aiScans[1] });
    expect(aiCompare.isError).toBe(false);
    expect(aiCompare.body).toMatchObject({ kind: "ai", a: aiScans[0], b: aiScans[1] });
    expect(typeof aiCompare.body.headline).toBe("string");
    const template = await call(client, "run_ai_scan", { business_id: id, keyword: "dentist", grid_size: 1, prompt_template: "Who is the best {service} in {city}?", confirm: true });
    expect(template.isError).toBe(false);
    await drain();
    expect((await sql<{ prompt: string }>("select prompt from public.ai_samples where scan_id = $1 limit 1", [template.body.scan_id]))[0].prompt).toMatch(/^Who is the best dentist/);
    expect((await call(client, "run_ai_scan", { business_id: id, keyword: "dentist", grid_size: 1, prompt_template: "No placeholders", confirm: true })).isError).toBe(true);

    const listed = await call(client, "list_scans", { business_id: id, kind: "maps" });
    expect(listed.isError).toBe(false);
    expect(listed.body.scans.map((s: { id: string }) => s.id)).toEqual([scans[1], scans[0]]);
    expect((await call(client, "compare_scans", { a: scans[0], b: scans[1] })).body).toMatchObject({ kind: "maps", a: scans[0], b: scans[1] });

    const audit = await call(client, "run_audit", { business_id: id, service: "dentist", confirm: true });
    expect(audit.isError).toBe(false);
    await polls("while an audit is queued", [["list_audits", {}], ["list_audits", { status: "queued" }], ["get_audit", { audit_id: audit.body.audit_id }]]);
    await drain();
    const audits = await call(client, "list_audits", { status: "done" });
    expect(audits.isError).toBe(false);
    expect(audits.body.audits.map((x: { id: string }) => x.id)).toEqual([audit.body.audit_id]);
    const got = await call(client, "get_audit", { audit_id: audit.body.audit_id });
    expect(got.isError).toBe(false);
    expect(got.body.findings.length).toBeGreaterThan(3);
    // Crawler findings publish their per-crawler advice as `crawlers`; other findings' internal `data` stays private.
    const crawler = { agent: "OAI-SearchBot", purpose: "search", serves: "ChatGPT search", blocked_by: "robots_txt", evidence: "User-agent: OAI-SearchBot\nDisallow: /", cause: "robots.txt has its own group for OAI-SearchBot that disallows /.", confidence: "high", where_to_look: [], steps: ["In robots.txt, delete “Disallow: /”."], verify: "curl -s https://x.example/robots.txt", caveat: null };
    const [one, two] = (await sql<{ id: string }>("select id from public.audit_findings where audit_id = $1 order by id limit 2", [audit.body.audit_id]));
    await sql("update public.audit_findings set check_key = 'ai_crawlers', data = $2::jsonb where id = $1", [one.id, JSON.stringify({ crawlers: [crawler] })]);
    await sql("update public.audit_findings set data = $2::jsonb where id = $1", [two.id, JSON.stringify({ internal: "not for the API" })]);
    const withCrawlers = await call(client, "get_audit", { audit_id: audit.body.audit_id });
    expect(withCrawlers.isError).toBe(false);
    const published = withCrawlers.body.findings.filter((f: { crawlers?: unknown }) => f.crawlers);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ check_key: "ai_crawlers", crawlers: [crawler] });
    expect(JSON.stringify(withCrawlers.body)).not.toContain("not for the API");
    expect(withCrawlers.body.findings.some((f: Record<string, unknown>) => "data" in f)).toBe(false);
    expect((await rest("GET", `/audits/${audit.body.audit_id}`)).body.findings).toEqual(withCrawlers.body.findings);

    const batch = await call(client, "create_prospect_batch", { niche: "dentist", city: "Austin, TX", max_reports: 2, confirm: true });
    expect(batch.isError).toBe(false);
    await polls("while a batch is queued", [["list_prospect_batches", {}], ["get_prospect_batch", { batch_id: batch.body.batch_id }]]);
    await drain();
    const batches = await call(client, "list_prospect_batches");
    expect(batches.isError).toBe(false);
    expect(batches.body.batches.map((x: { id: string }) => x.id)).toEqual([batch.body.batch_id]);
    const reports = await call(client, "get_prospect_batch", { batch_id: batch.body.batch_id });
    expect(reports.isError).toBe(false);
    expect(reports.body.reports).toHaveLength(2);
    expect(reports.body.reports[0].report_url).toMatch(/\/r\/[A-Za-z0-9_-]{12,}$/);

    // The email teaser of a finished report: same JSON over MCP and REST, numbers from the report, nothing sent.
    const first = reports.body.reports[0] as { business: string; business_id: string; report_url: string };
    const pitch = await call(client, "get_pitch_asset", { batch_id: batch.body.batch_id, business_id: first.business_id });
    expect(pitch.isError).toBe(false);
    expect(pitch.body).toMatchObject({ business: first.business, business_id: first.business_id, image_url: `${pitch.body.report_url}/pitch-image` });
    expect(pitch.body.report_url).toMatch(/\/r\/[A-Za-z0-9_-]{12,}$/);
    expect(pitch.body.email.text).toContain(pitch.body.report_url);
    expect(pitch.body.email.text).toContain(first.business);
    expect(pitch.body.email.lines.length).toBeGreaterThanOrEqual(4);
    expect(pitch.body.email.lines.length).toBeLessThanOrEqual(8);
    const restPitch = await rest("GET", `/prospects/${batch.body.batch_id}/pitch?business_id=${first.business_id}`);
    expect(restPitch.status).toBe(200);
    expect(restPitch.body.email).toEqual(pitch.body.email);
    expect((await rest("GET", `/prospects/${batch.body.batch_id}/pitch?business_id=${UNKNOWN}`)).status).toBe(404);
    expect((await rest("GET", `/prospects/${batch.body.batch_id}/pitch`)).status).toBe(400);
    expect((await rest("GET", `/prospects/${batch.body.batch_id}/pitch?business_id=${first.business_id}`, { key: keyB })).status).toBe(404);
    expect((await rest("POST", `/prospects/${batch.body.batch_id}/pitch?business_id=${first.business_id}`, { body: {} })).status).toBe(405);

    expect((await call(client, "get_branding")).body.branding).toMatchObject({ brand_name: null, has_logo: false });
    const brand = await call(client, "update_branding", { brand_name: "Northside SEO", hide_rankbyai_branding: true });
    expect(brand.isError).toBe(false);
    expect(brand.body.branding).toMatchObject({ brand_name: "Northside SEO", hide_rankbyai_branding: true, brand_website: null });
    // White-label reaches the teaser: signed with the agency's name.
    const signed = await call(client, "get_pitch_asset", { batch_id: batch.body.batch_id, business_id: first.business_id });
    expect(signed.body.email.lines.at(-1)).toBe("— Northside SEO");
    expect((await call(client, "update_branding", { brand_website: "ftp://x" })).isError).toBe(true);
    const usage = await call(client, "get_usage");
    expect(usage.isError).toBe(false);
    expect(usage.body.own_keys.total_usd).toBeGreaterThan(0);

    const removed = await call(client, "delete_business", { business_id: id });
    expect(removed.isError).toBe(false);
    expect(removed.body).toEqual({ deleted: true, id });
    expect((await call(client, "list_scans", { business_id: id })).body.scans).toEqual([]);
    expect((await call(client, "list_audits")).body.audits.map((x: { business_id: string }) => x.business_id)).not.toContain(id);
    await client.close();
  }, 180_000);

  it("a key from another workspace cannot read, update or delete through the tools", async () => {
    const id = await seedBusiness(keyA);
    const scan = await rest("POST", "/scans", { body: { business_id: id, kind: "maps", keyword: "dentist", grid_size: 3, mode: "live", confirm: true } });
    await drain();
    await rest("PATCH", "/branding", { body: { brand_name: "Agency A" } });
    const before = await businessRow(id);
    const other = await connect(keyB);
    await other.listTools();

    for (const [tool, args] of [["update_business", { business_id: id, name: "Taken over" }], ["delete_business", { business_id: id }], ["get_scan", { scan_id: scan.body.scan_id }]] as const) {
      const r = await call(other, tool, args);
      expect(r.isError, tool).toBe(true);
      expect(r.body.error, tool).toBe("not_found");
    }
    const malformed = await call(other, "delete_business", { business_id: "not-a-uuid" });
    expect(malformed.isError).toBe(true);
    expect(malformed.body.error).toBe("invalid_request");
    expect((await call(other, "list_businesses")).body.businesses).toEqual([]);
    expect((await call(other, "list_scans")).body.scans).toEqual([]);
    expect((await call(other, "list_scans", { business_id: id })).body.scans).toEqual([]);
    expect((await call(other, "list_audits")).body.audits).toEqual([]);
    expect((await call(other, "list_prospect_batches")).body.batches).toEqual([]);
    expect((await call(other, "get_branding")).body.branding.brand_name).toBeNull();
    await call(other, "update_branding", { brand_name: "Agency B" });

    expect(await businessRow(id)).toEqual(before);
    expect(await sql("select 1 from public.scans where id = $1", [scan.body.scan_id])).toHaveLength(1);
    expect((await rest("GET", "/branding")).body.branding.brand_name).toBe("Agency A");
    await other.close();
  });
});
