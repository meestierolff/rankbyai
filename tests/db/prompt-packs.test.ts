import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { createApiKey } from "@/lib/api-keys";
import { handleRest } from "@/lib/api-v1/rest";
import { runningScanCount } from "@/lib/cost-guard";
import { NOT_PACK_RUN } from "@/lib/packs/label";
import { processPackRun } from "@/lib/packs/run";

/**
 * Citation workflow, steps 1 and 2, against the real local database with SIMULATED vendors:
 * prompt packs (estimate first, one scan per prompt and repeat, own keys only), pack scans kept
 * out of "latest scan" readers, and the cited-page inventory with both bases of "missing".
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
const PROMPTS = ["Who is the best dentist in Austin?", "Who is the best dentist near me?", "Top 10 dentist options in Austin"];

async function rest(method: "GET" | "POST", path: string, opts: { key?: string; body?: unknown } = {}) {
  const url = new URL(BASE + path);
  const request = new Request(url, { method, headers: { Authorization: `Bearer ${opts.key ?? keyA}`, ...(opts.body ? { "Content-Type": "application/json" } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const res = await handleRest(request, url.pathname.replace("/api/v1/", "").split("/"), (work) => { deferred.queue.push(work); });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}

const runBody = (over: Record<string, unknown> = {}) => ({ business_id: businessId, service: "dentist", prompts: PROMPTS, engines: ["openai", "perplexity", "gemini"], ...over });
const count = async (table: string) => Number((await sql<{ n: string }>(`select count(*) as n from public.${table}`))[0].n);

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  a = await createTestUser("pack-a");
  b = await createTestUser("pack-b");
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
  const r = await rest("POST", "/businesses", { body: { name: "Northgate Family Dental", city: "Austin", lat: 30.3172, lng: -97.7231, website: "https://northgatefamilydental.example", phone: "+1 512 555 0174", primary_category: "Dental clinic" } });
  expect(r.status).toBe(201);
  businessId = r.body.business.id;
  await sql("update public.businesses set cid = 'mock-cid-target' where id = $1", [businessId]);
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("buyer prompt suggestions", () => {
  it("writes about ten prompts from stored fields, and nothing runs", async () => {
    const r = await rest("GET", `/packs/suggest?business_id=${businessId}&service=dentist`);
    expect(r.status).toBe(200);
    expect(r.body.service).toBe("dentist");
    const texts = r.body.suggestions.map((s: { text: string }) => s.text);
    expect(texts).toContain("Who is the best dentist in Austin?");
    expect(texts).toContain("Who is the best Dental clinic in Austin?");
    expect(texts.length).toBeGreaterThanOrEqual(8);
    // No stored answers yet, so no competitor prompt.
    expect(r.body.suggestions.some((s: { kind: string }) => s.kind === "competitor")).toBe(false);
    expect(await count("scans")).toBe(0);
  });
  it("falls back to the Google category for the service", async () => {
    const r = await rest("GET", `/packs/suggest?business_id=${businessId}`);
    expect(r.body.service).toBe("Dental clinic");
  });
});

describe("run_prompt_pack: estimate first", () => {
  it("returns prompts × repeats × one scan's estimate, with alternatives, and creates nothing", async () => {
    const r = await rest("POST", "/packs", { body: runBody({ repeats: 2 }) });
    expect(r.status).toBe(200);
    expect(r.body.confirm_required).toBe(true);
    const e = r.body.estimate;
    expect([e.prompts, e.repeats, e.scans, e.answers, e.credits]).toEqual([3, 2, 6, 18, 0]);
    expect(e.totalUsd).toBeCloseTo(e.perScanUsd * 6, 6);
    expect(e.alternatives.map((x: { grid_size: number; answers: number }) => [x.grid_size, x.answers])).toEqual([[1, 18], [3, 162], [5, 450]]);
    expect(e.alternatives[0].totalUsd).toBeCloseTo(e.totalUsd, 6);
    expect(r.body.missing_keys).toEqual([]);
    expect(await count("prompt_packs")).toBe(0);
    expect(await count("scans")).toBe(0);
  });

  it("refuses bad prompts, a locked workspace and another workspace's business", async () => {
    expect((await rest("POST", "/packs", { body: runBody({ prompts: ["best?"] }) })).body.error).toBe("invalid_prompt");
    expect((await rest("POST", "/packs", { body: runBody({ prompts: ["Best {category} near me"] }) })).body.error).toBe("invalid_prompt");
    expect((await rest("POST", "/packs", { key: keyB, body: runBody({ confirm: true }) })).status).toBe(404);
    await sql("update public.workspaces set plan = 'locked' where id = $1", [a.workspaceId]);
    expect((await rest("POST", "/packs", { body: runBody({ confirm: true }) })).body.error).toBe("lifetime_required");
    expect(await count("scans")).toBe(0);
  });
});

describe("run_prompt_pack on the user's own keys", () => {
  it("fails clearly, naming the key and the step, when an engine has no key (nothing is created)", async () => {
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    const est = await rest("POST", "/packs", { body: runBody({ engines: ["perplexity", "gemini"] }) });
    expect(est.body.missing_keys).toEqual(["perplexity", "gemini"]);
    expect(est.body.message).toMatch(/Perplexity, Gemini/);
    const r = await rest("POST", "/packs", { body: runBody({ engines: ["perplexity"], confirm: true }) });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("missing_key");
    expect(r.body.message).toMatch(/Step 1 \(run the prompt pack\).*Perplexity/);
    // Without engines and without any key: the default has nothing to pick.
    expect((await rest("POST", "/packs", { body: runBody({ engines: undefined, confirm: true }) })).body.error).toBe("missing_key");
    expect(await count("prompt_packs")).toBe(0);
    expect(await count("scans")).toBe(0);
  });
});

describe("a pack run (acceptance: stored prompt, engine, time, answer, names, cited URLs)", () => {
  it("creates one scan per prompt and repeat, runs them, and reports per prompt and engine", async () => {
    const r = await rest("POST", "/packs", { body: runBody({ confirm: true, repeats: 2, name: "Austin dentist pack" }) });
    expect(r.status).toBe(202);
    expect(r.body.scan_ids).toHaveLength(6);
    const { pack_id, run_id } = r.body;
    const scans = await sql<{ label: string; prompt_template: string; grid_size: number; funding: string }>("select label, prompt_template, grid_size, funding from public.scans order by label");
    expect(scans.map((s) => s.label)).toEqual([0, 1, 2].flatMap((i) => [1, 2].map((rep) => `pack:${run_id}:${i}:${rep}`)));
    expect(scans.every((s) => s.grid_size === 1 && s.funding === "byok")).toBe(true);
    expect(scans[0].prompt_template).toBe(PROMPTS[0]);

    await drain();
    const samples = await sql<{ prompt: string; engine: string; answer_text: string; created_at: Date; sources: unknown[] }>("select prompt, engine, answer_text, created_at, sources from public.ai_samples where status = 'done'");
    expect(samples).toHaveLength(18);
    // The prompt is asked as written.
    expect(new Set(samples.map((s) => s.prompt))).toEqual(new Set(PROMPTS));
    expect(samples.every((s) => s.answer_text && s.created_at && Array.isArray(s.sources) && s.sources.length > 0)).toBe(true);

    const g = await rest("GET", `/packs/${pack_id}`);
    expect(g.status).toBe(200);
    expect(g.body.run).toMatchObject({ id: run_id, status: "done", pages_checked: true, repeats: 2 });
    expect(g.body.results.answers).toBe(18);
    expect(g.body.results.prompts).toHaveLength(3);
    expect(g.body.results.prompts[0].engines.map((e: { engine: string; answers: number }) => [e.engine, e.answers])).toEqual([["openai", 2], ["perplexity", 2], ["gemini", 2]]);
    const share = g.body.results.share_of_answers;
    expect(share.find((s: { you: boolean }) => s.you)).toBeTruthy();
    expect(g.body.top_sources[0]).toMatchObject({ url: "https://mock-directory.example/best", answers: 18 });
    expect(g.body.disclaimer).toMatch(/observation, not a ranking/);

    const list = await rest("GET", `/packs?business_id=${businessId}`);
    expect(list.body.packs).toHaveLength(1);
    expect(list.body.packs[0]).toMatchObject({ id: pack_id, name: "Austin dentist pack", runs: 1, location: "pin", latest_run: { id: run_id, status: "done" } });
  });

  it("runs one pack at a time, and runs a saved pack again with its own prompts", async () => {
    const first = await rest("POST", "/packs", { body: runBody({ confirm: true }) });
    expect(first.status).toBe(202);
    const busy = await rest("POST", "/packs", { body: runBody({ confirm: true, prompts: ["Who is the best dentist downtown?"] }) });
    expect(busy.status).toBe(429);
    expect(busy.body.error).toBe("pack_running");
    // A pack's scans do not count against the running-scan limit for ordinary scans.
    expect(await runningScanCount(a.workspaceId)).toBe(0);
    await drain();
    const again = await rest("POST", "/packs", { body: { pack_id: first.body.pack_id, confirm: true } });
    expect(again.status).toBe(202);
    expect(again.body.pack_id).toBe(first.body.pack_id);
    expect(again.body.run_id).not.toBe(first.body.run_id);
    expect(again.body.scan_ids).toHaveLength(3);
  });

  it("keeps pack scans out of every latest-scan read, in the query itself", async () => {
    const plain = await rest("POST", "/scans", { body: { business_id: businessId, kind: "ai", keyword: "dentist", grid_size: 1, engines: ["openai"], confirm: true } });
    expect(plain.status).toBe(202);
    await drain();
    await rest("POST", "/packs", { body: runBody({ confirm: true }) });
    await drain();
    const filtered = await admin.from("scans").select("id, label").eq("business_id", businessId).or(NOT_PACK_RUN).order("created_at", { ascending: false }).limit(2);
    expect(filtered.error).toBeNull();
    expect(filtered.data!.map((s) => s.id)).toEqual([plain.body.scan_id]);
    const biz = await rest("GET", `/businesses/${businessId}`);
    expect(biz.body.recent_scans.map((s: { id: string }) => s.id)).toEqual([plain.body.scan_id]);
    // list_scans still shows everything (it is the full history, not a "latest" read), and marks pack scans.
    const all = (await rest("GET", `/scans?business_id=${businessId}`)).body.scans as { id: string; prompt_pack_run: { run_id: string; prompt: number; repeat: number } | null }[];
    expect(all).toHaveLength(4);
    expect(all.find((s) => s.id === plain.body.scan_id)!.prompt_pack_run).toBeNull();
    expect(all.filter((s) => s.prompt_pack_run).map((s) => [s.prompt_pack_run!.prompt, s.prompt_pack_run!.repeat]).sort()).toEqual([[0, 1], [1, 1], [2, 1]]);
  });

  it("another workspace sees nothing of it", async () => {
    const r = await rest("POST", "/packs", { body: runBody({ confirm: true }) });
    await drain();
    expect((await rest("GET", `/packs/${r.body.pack_id}`, { key: keyB })).status).toBe(404);
    expect((await rest("GET", `/citations?pack_id=${r.body.pack_id}`, { key: keyB })).status).toBe(404);
    expect((await rest("GET", "/packs", { key: keyB })).body.packs).toEqual([]);
  });
});

describe("online packs (a product sold online, prompts without a place)", () => {
  const online = (over: Record<string, unknown> = {}) => runBody({ service: "local rank tracking", prompts: ["What are the best local rank tracking tools?", "What is the best alternative to Local Falcon?"], scope: "online", ...over });

  it("suggests prompts without a place", async () => {
    const r = await rest("GET", `/packs/suggest?business_id=${businessId}&service=local%20rank%20tracking&scope=online`);
    expect(r.body.scope).toBe("online");
    expect(r.body.suggestions[0].text).toBe("What are the best local rank tracking tools?");
  });

  it("asks once per prompt, marks the scans online, and refuses a grid", async () => {
    expect((await rest("POST", "/packs", { body: online({ location: "grid" }) })).status).toBe(400);
    const est = await rest("POST", "/packs", { body: online() });
    expect(est.body.estimate.alternatives.map((a: { grid_size: number }) => a.grid_size)).toEqual([1]);
    const r = await rest("POST", "/packs", { body: online({ confirm: true }) });
    expect(r.status).toBe(202);
    await drain();
    const scans = await sql<{ geo_mode: string; grid_size: number; status: string }>("select geo_mode, grid_size, status from public.scans");
    expect(scans.map((s) => [s.geo_mode, s.grid_size, s.status])).toEqual([["online", 1, "done"], ["online", 1, "done"]]);
    const g = await rest("GET", `/packs/${r.body.pack_id}`);
    expect(g.body.pack.scope).toBe("online");
    expect(g.body.run.scope).toBe("online");
    // A re-run keeps the pack's scope.
    const again = await rest("POST", "/packs", { body: { pack_id: r.body.pack_id, confirm: true } });
    await drain();
    expect(again.status).toBe(202);
    expect((await sql<{ n: string }>("select count(*) as n from public.scans where geo_mode = 'online'"))[0].n).toBe("4");
  });

  it("works for a business without a map point (an online product)", async () => {
    await sql("update public.businesses set lat = null, lng = null where id = $1", [businessId]);
    expect((await rest("POST", "/packs", { body: runBody({ confirm: true }) })).body.error).toBe("business_has_no_location");
    const r = await rest("POST", "/packs", { body: online({ confirm: true }) });
    expect(r.status).toBe(202);
    await drain();
    expect((await rest("GET", `/packs/${r.body.pack_id}`)).body.run.status).toBe("done");
  });
});

describe("cited-page inventory", () => {
  async function finishedPack() {
    const r = await rest("POST", "/packs", { body: runBody({ confirm: true }) });
    await drain();
    return r.body as { pack_id: string; run_id: string };
  }

  it("counts every cited page from stored answers and dates it", async () => {
    const { pack_id, run_id } = await finishedPack();
    const r = await rest("GET", `/citations?pack_id=${pack_id}`);
    expect(r.status).toBe(200);
    expect(r.body.scope).toMatchObject({ runs: 1, answers: 9, answers_with_sources: 9 });
    const dir = r.body.urls.find((u: { domain: string }) => u.domain === "mock-directory.example");
    expect(dir).toMatchObject({ answers: 9, engines: ["gemini", "openai", "perplexity"], runs_cited: 1, disappeared_on: null });
    expect(dir.first_seen).toBe(dir.last_seen);
    const byDomain = await rest("GET", `/citations?run_id=${run_id}&group_by=domain`);
    expect(byDomain.body.domains.map((d: { domain: string }) => d.domain)).toContain("mock-openai.example");
    // In mock mode no third-party page is read: each stays on the answers basis, recorded as not readable.
    expect(dir.missing.basis).toBe("answers");
    expect(dir.page_check).toMatchObject({ status: "failed", client_named: null });
  });

  it("uses the page itself once it was read, and lists it under missing_only", async () => {
    const { pack_id, run_id } = await finishedPack();
    await sql("delete from public.cited_pages");
    await sql("update public.prompt_pack_runs set pages_checked_at = null where id = $1", [run_id]);
    // The answers leave the business out and name two rivals; the page read below shows one of them.
    await sql(`update public.ai_samples set mentioned = false, mention_position = null, named_businesses = '[{"name":"Mock Rival Six"},{"name":"Mock Rival Three"}]'`);
    const seen: string[] = [];
    await processPackRun(run_id, {
      reader: async (url, client, competitors) => {
        seen.push(url);
        expect(client.name).toBe("Northgate Family Dental");
        expect(competitors.length).toBeGreaterThan(0);
        return url.includes("mock-directory")
          ? { status: "ok", http_status: 200, title: "The best dentists", client_named: false, competitors_named: [competitors[0]] }
          : { status: "failed", http_status: 403, title: null, client_named: null, competitors_named: [] };
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    const r = await rest("GET", `/citations?pack_id=${pack_id}&missing_only=true`);
    const dir = r.body.urls.find((u: { domain: string }) => u.domain === "mock-directory.example");
    expect(dir.missing).toMatchObject({ basis: "page", client_absent: true });
    expect(dir.missing.competitors_present).toHaveLength(1);
    expect(dir.title).toBe("The best dentists");
    const hist = await rest("GET", `/citations?pack_id=${pack_id}&url=${encodeURIComponent("https://mock-directory.example/best?utm_source=chatgpt.com")}`);
    expect(hist.body.page.key).toBe("mock-directory.example/best");
    expect(hist.body.history).toEqual([{ run_id, date: expect.any(String), answers: 9, answers_naming_client: expect.any(Number) }]);
  });

  it("asks for a scope", async () => {
    expect((await rest("GET", "/citations")).status).toBe(400);
  });
});
