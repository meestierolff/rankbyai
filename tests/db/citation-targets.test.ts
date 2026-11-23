import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { createApiKey } from "@/lib/api-keys";
import { handleRest } from "@/lib/api-v1/rest";

/**
 * Citation workflow, step 3, against the real local database with SIMULATED DataForSEO answers:
 * estimate first, the user's own DataForSEO login only, competitors from stored data or given,
 * and the merged list with the pages the business's prompt packs saw cited.
 */
const deferred = vi.hoisted(() => ({ queue: [] as (() => Promise<unknown>)[] }));
vi.mock("next/server", () => ({ after: (work: () => Promise<unknown>) => { deferred.queue.push(work); } }));
const drain = async () => { while (deferred.queue.length) await deferred.queue.shift()!(); };

let a: TestUser;
let b: TestUser;
let keyA: string;
let keyB: string;
let businessId: string;
const BASE = "https://rankbyai.test/api/v1";
const COMPETITORS = [{ name: "Smile Haus", domain: "https://www.smilehaus.example/" }, { domain: "enamel.example" }];

async function rest(method: "GET" | "POST", path: string, opts: { key?: string; body?: unknown } = {}) {
  const url = new URL(BASE + path);
  const request = new Request(url, { method, headers: { Authorization: `Bearer ${opts.key ?? keyA}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const res = await handleRest(request, url.pathname.replace("/api/v1/", "").split("/"), (work) => { deferred.queue.push(work); });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}
const count = async (table: string) => Number((await sql<{ n: string }>(`select count(*) as n from public.${table}`))[0].n);

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  a = await createTestUser("targets-a");
  b = await createTestUser("targets-b");
});
beforeEach(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  deferred.queue.length = 0;
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = any($1)", [[a.workspaceId, b.workspaceId]]);
  const ka = await createApiKey(a.workspaceId, "Test A");
  const kb = await createApiKey(b.workspaceId, "Test B");
  if (!ka.ok || !kb.ok) throw new Error("key creation failed");
  keyA = ka.key;
  keyB = kb.key;
  const r = await rest("POST", "/businesses", { body: { name: "Northgate Family Dental", city: "Austin", lat: 30.3172, lng: -97.7231, website: "https://northgatefamilydental.example", primary_category: "Dental clinic" } });
  businessId = r.body.business.id;
  await sql("update public.businesses set cid = 'mock-cid-target' where id = $1", [businessId]);
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("find_citation_targets: estimate first", () => {
  it("returns an upper bound, the competitors and the words, and creates nothing", async () => {
    const r = await rest("POST", "/citation-targets", { body: { business_id: businessId, competitors: COMPETITORS } });
    expect(r.status).toBe(200);
    expect(r.body.confirm_required).toBe(true);
    expect(r.body.competitors).toEqual([{ name: "Smile Haus", domain: "smilehaus.example" }, { name: null, domain: "enamel.example" }]);
    expect(r.body.client_domain).toBe("northgatefamilydental.example");
    expect(r.body.url_contains).toEqual(["best", "top-", "review", "austin", "near-me"]);
    // 2 competitors + the business × (0.024 + 200 × 0.000036) + traffic (0.012 + 400 × 0.00012).
    expect(r.body.estimate.totalUsd).toBeCloseTo(3 * 0.0312 + 0.06, 6);
    expect(await count("citation_target_lists")).toBe(0);
  });

  it("asks for competitor websites when no stored scan gives them, naming who the answers named", async () => {
    const r = await rest("POST", "/citation-targets", { body: { business_id: businessId } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("competitors_required");
  });

  it("refuses a non-domain, the business's own site, and another workspace's business", async () => {
    expect((await rest("POST", "/citation-targets", { body: { business_id: businessId, competitors: [{ domain: "Smile Haus" }] } })).status).toBe(400);
    expect((await rest("POST", "/citation-targets", { body: { business_id: businessId, competitors: [{ domain: "northgatefamilydental.example" }] } })).status).toBe(400);
    expect((await rest("POST", "/citation-targets", { key: keyB, body: { business_id: businessId, competitors: COMPETITORS } })).status).toBe(404);
  });

  it("fails clearly without the user's own DataForSEO login, naming the step (nothing created)", async () => {
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    const r = await rest("POST", "/citation-targets", { body: { business_id: businessId, competitors: COMPETITORS, confirm: true } });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("missing_key");
    expect(r.body.message).toMatch(/Step 3 \(find citation targets\).*DataForSEO/);
    expect(await count("citation_target_lists")).toBe(0);
  });
});

describe("a citation target search", () => {
  it("merges competitors' list pages, marks the business's own links, records each call's cost", async () => {
    const r = await rest("POST", "/citation-targets", { body: { business_id: businessId, competitors: COMPETITORS, confirm: true } });
    expect(r.status).toBe(202);
    await drain();
    const g = await rest("GET", `/citation-targets/${r.body.list_id}`);
    expect(g.status).toBe(200);
    expect(g.body.search).toMatchObject({ status: "done", competitors: [{ domain: "smilehaus.example" }, { domain: "enamel.example" }] });
    expect(g.body.search.calls.map((c: { call: string; target: string }) => `${c.call}:${c.target}`)).toEqual(["backlinks:smilehaus.example", "backlinks:enamel.example", "backlinks:northgatefamilydental.example", "traffic:7 pages"]);
    expect(g.body.search.actual_cost_usd).toBeGreaterThan(0);
    const t = g.body.targets as { key: string; competitors_linked: string[]; client_linked: boolean; action: string; etv: number | null; page_type: string }[];
    const shared = t.find((x) => x.key === "bestlocal.example/best-dentists-2026")!;
    expect(shared.competitors_linked).toEqual(["Smile Haus", "enamel.example"]);
    expect(shared.action).toBe("pitch");
    expect(t.find((x) => x.key === "reviews.example/client-review")).toMatchObject({ client_linked: true, action: "skip" });
    expect(t.find((x) => x.page_type === "directory")).toMatchObject({ action: "directory_claim" });
    expect(t.find((x) => x.key.includes("fans.example"))!.etv).toBeNull();
    expect(g.body.note).toMatch(/not Ahrefs DR/);
    // Filters and paging.
    expect((await rest("GET", `/citation-targets/${r.body.list_id}?action=directory_claim`)).body.total).toBe(1);
    expect((await rest("GET", "/citation-targets")).body.searches).toHaveLength(1);
    // Another workspace sees nothing.
    expect((await rest("GET", `/citation-targets/${r.body.list_id}`, { key: keyB })).status).toBe(404);
  });

  it("adds the cited pages the business is missing from, first, and finds competitors from stored data", async () => {
    // A Maps scan gives the rivals' websites; a pack gives cited pages and the names the answers used.
    const maps = await rest("POST", "/scans", { body: { business_id: businessId, kind: "maps", keyword: "dentist", grid_size: 3, confirm: true } });
    expect(maps.status).toBe(202);
    const pack = await rest("POST", "/packs", { body: { business_id: businessId, service: "dentist", prompts: ["Who is the best dentist in Austin?"], engines: ["openai", "perplexity"], confirm: true } });
    await drain();
    await sql(`update public.ai_samples set mentioned = false, mention_position = null, named_businesses = '[{"name":"Mock Rival One"},{"name":"Mock Rival Two"}]' where scan_id in (select id from public.scans where label like 'pack:%')`);
    const est = await rest("POST", "/citation-targets", { body: { business_id: businessId, pack_id: pack.body.pack_id } });
    expect(est.body.competitors.length).toBeGreaterThan(0);
    // Every suggested website comes from the stored Maps results, never from a guess.
    const stored = (await sql<{ top: { domain: string | null }[] }>("select top from public.scan_points where top is not null")).flatMap((p) => p.top.map((x) => x.domain));
    for (const c of est.body.competitors) expect(stored).toContain(c.domain);
    const r = await rest("POST", "/citation-targets", { body: { business_id: businessId, pack_id: pack.body.pack_id, confirm: true } });
    await drain();
    const g = await rest("GET", `/citation-targets/${r.body.list_id}?cited_only=true`);
    expect(g.body.total).toBeGreaterThan(0);
    expect(g.body.targets[0]).toMatchObject({ source: "citations", cited: { answers: 2 } });
  });
});
