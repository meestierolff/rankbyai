import { unzipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { batchCsv, createBatch, discover, findOpenBatches, processBatch, resolveRows, type BatchRow, type Candidate } from "@/lib/prospects/batch";
import { parseCsv, parseProspectCsv } from "@/lib/prospects/csv";
import { zipBatchPdfs } from "@/lib/prospects/zip";
import { getReportView } from "@/lib/reports";

/**
 * M5 acceptance against the real local database with SIMULATED vendors (RANKBYAI_MOCK_PROVIDERS=1).
 */
let u: TestUser;
let other: TestUser;

const find = () => discover({ workspaceId: u.workspaceId, funding: "byok", niche: "dentist", city: "Austin, TX", country: "US" });
const base = (candidates: Candidate[], over: Record<string, unknown> = {}) => ({ workspaceId: u.workspaceId, plan: "lifetime" as const, mode: "search" as const, niche: "dentist", city: "Austin, TX", country: "US", candidates, funding: "byok" as const, confirm: true, ...over });
const batchRow = async (id: string) => (await sql<{ status: string; total: number; done: number; failed: number; rows: BatchRow[]; credits_reserved: number; lease_until: string | null }>("select * from public.prospect_batches where id = $1", [id]))[0];
const balance = async () => (await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data as number;

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("prospector");
  other = await createTestUser("prospector-other");
});
beforeEach(async () => {
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("search mode", () => {
  it("lists at least 20 businesses for a niche and a city, each with a map location", async () => {
    const { candidates } = await find();
    expect(candidates.length).toBeGreaterThanOrEqual(20);
    expect(candidates.every((c) => c.name && c.lat != null && c.lng != null && c.rank != null)).toBe(true);
    expect(new Set(candidates.map((c) => c.cid)).size).toBe(candidates.length);
  });

  it("shows the estimate first: 2 credits per report, and creates nothing until confirmed", async () => {
    const { candidates } = await find();
    const r = await createBatch(base(candidates.slice(3, 8), { confirm: false, funding: "credits" }));
    expect(r).toMatchObject({ ok: false, status: 409, error: "confirmation_required" });
    if (r.ok) return;
    expect(r.estimate).toMatchObject({ reports: 5, credits: 10 });
    expect(r.estimate!.totalUsd).toBeCloseTo(r.estimate!.perReportUsd * 5, 6);
    expect(r.estimate!.perReportUsd).toBeLessThan(0.6); // inside what 2 credits may cost us
    expect(await sql("select 1 from public.prospect_batches")).toEqual([]);
  });

  it("needs lifetime access, a selection, and enough credits", async () => {
    const { candidates } = await find();
    expect(await createBatch(base(candidates.slice(0, 2), { plan: "locked" }))).toMatchObject({ ok: false, status: 403, error: "lifetime_required" });
    expect(await createBatch(base([]))).toMatchObject({ ok: false, status: 400, error: "nothing_selected" });
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 9, 'pack')", [u.workspaceId]);
    expect(await createBatch(base(candidates.slice(0, 5), { funding: "credits" }))).toMatchObject({ ok: false, status: 402, error: "insufficient_credits" });
    expect(await balance()).toBe(9);
    expect(await sql("select 1 from public.prospect_batches")).toEqual([]);
  });
});

describe("a 5-business batch on credits (acceptance)", () => {
  it("deducts 10 credits and completes with a report for every business", async () => {
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 12, 'pack')", [u.workspaceId]);
    const { candidates } = await find();
    const r = await createBatch(base(candidates.slice(3, 8), { funding: "credits" }));
    if (!r.ok) throw new Error("create failed: " + JSON.stringify(r));
    expect(await balance()).toBe(2);

    await processBatch(r.batchId);
    const batch = await batchRow(r.batchId);
    expect(batch).toMatchObject({ status: "done", total: 5, done: 5, failed: 0, credits_reserved: 10, lease_until: null });
    expect(await balance()).toBe(2); // nothing more is taken by the scans and audits inside a report

    for (const row of batch.rows) {
      expect(row.status).toBe("done");
      expect(row.business_id && row.maps_scan_id && row.ai_scan_id && row.audit_id && row.report_slug).toBeTruthy();
      expect(row.report_slug!.length).toBeGreaterThanOrEqual(12);
    }
    const scans = await sql<{ kind: string; grid_size: number; mode: string; funding: string; credits_used: number; status: string }>("select kind, grid_size, mode, funding, credits_used, status from public.scans");
    expect(scans).toHaveLength(10);
    expect(scans.filter((s) => s.kind === "maps").every((s) => s.grid_size === 5 && s.mode === "standard")).toBe(true);
    expect(scans.filter((s) => s.kind === "ai").every((s) => s.grid_size === 3)).toBe(true);
    expect(scans.every((s) => s.funding === "credits" && s.credits_used === 0 && ["done", "partial"].includes(s.status))).toBe(true);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.businesses where source = 'prospect'"))[0].n).toBe(5);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.reports where kind = 'prospect' and batch_id = $1", [r.batchId]))[0].n).toBe(5);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.audits where status = 'done'"))[0].n).toBe(5);
  });

  it("each report shows its grids, a P0/P1-only audit and an opener made of the report's own numbers", async () => {
    const { candidates } = await find();
    const r = await createBatch(base(candidates.slice(6, 8)));
    if (!r.ok) throw new Error("create failed");
    await processBatch(r.batchId);
    const batch = await batchRow(r.batchId);
    for (const row of batch.rows) {
      const view = (await getReportView(row.report_slug!))!;
      expect(view.kind).toBe("prospect");
      expect(view.business.name).toBe(row.name);
      expect(view.maps).toMatchObject({ n: 5 });
      expect(view.maps!.cells).toHaveLength(25);
      expect(view.ai).toMatchObject({ n: 3 });
      expect(view.ai!.cells).toHaveLength(9);
      expect(view.audit!.findings.every((f) => f.priority === "P0" || f.priority === "P1")).toBe(true);
      expect(view.opener).toBe(row.opener ?? null);
      if (view.opener) {
        // Every figure in the opener is on the report itself.
        const facts = [view.ai!.n * view.ai!.n, view.ai!.n * view.ai!.n - view.ai!.pointsMentioned, view.maps!.pointsDone, view.maps!.pointsDone - view.maps!.top3Points, 3];
        const reviewNumbers = view.audit!.findings.flatMap((f) => f.title.match(/\d+/g) ?? []).map(Number);
        const claims = view.opener.split(row.name).join("").split(view.ai!.namedInstead[0]?.name ?? "\u0000").join(""); // names may contain digits
        for (const n of claims.match(/\d+/g) ?? []) expect([...facts, ...reviewNumbers], `${n} in “${view.opener}”`).toContain(Number(n));
      }
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain(u.workspaceId);
      expect(serialized).not.toContain(u.email);
    }
  });

  it("a report that fails gives its 2 credits back, once, and the batch ends 'partial'", async () => {
    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 6, 'pack')", [u.workspaceId]);
    const { candidates } = await find();
    const broken = { ...candidates[5], name: "x".repeat(301) }; // cannot be stored: the name is longer than a business name may be
    const r = await createBatch(base([candidates[4], broken, candidates[6]], { funding: "credits" }));
    if (!r.ok) throw new Error("create failed");
    expect(await balance()).toBe(0);
    await processBatch(r.batchId);
    const batch = await batchRow(r.batchId);
    expect(batch).toMatchObject({ status: "partial", done: 2, failed: 1 });
    expect(batch.rows[1]).toMatchObject({ status: "failed", error: "This report did not complete." });
    expect(await balance()).toBe(2);
    await processBatch(r.batchId); // a finished batch is not processed again
    expect(await balance()).toBe(2);
  });

  it("two workers on one batch never duplicate work", async () => {
    const { candidates } = await find();
    const r = await createBatch(base(candidates.slice(4, 7)));
    if (!r.ok) throw new Error("create failed");
    await Promise.all([processBatch(r.batchId), processBatch(r.batchId), processBatch(r.batchId)]);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.scans"))[0].n).toBe(6);
    expect((await sql<{ n: number }>("select count(*)::int as n from public.reports"))[0].n).toBe(3);
    expect((await batchRow(r.batchId)).status).toBe("done");
    expect(await findOpenBatches()).toEqual([]);
  });

  it("another workspace cannot read the batch or its reports", async () => {
    const { candidates } = await find();
    const r = await createBatch(base(candidates.slice(4, 5)));
    if (!r.ok) throw new Error("create failed");
    await processBatch(r.batchId);
    for (const table of ["prospect_batches", "reports"]) {
      expect((await other.client.from(table).select("id")).data ?? [], table).toEqual([]);
      expect(((await u.client.from(table).select("id")).data ?? []).length, table).toBe(1);
    }
  });
});

describe("CSV mode (acceptance)", () => {
  it("resolves at least 80% of a 20-row file and lists the rows it could not match", async () => {
    const names = Array.from({ length: 20 }, (_, i) => (i % 7 === 6 ? `Permanently closed clinic ${i}` : `Lone Oak Dental ${i}`)); // 2 of 20 are not on the map
    const file = parseProspectCsv("name,city,website,phone\n" + names.map((n) => `"${n}",Austin,https://example.com,512 555 0100`).join("\n"));
    expect(file.rows).toHaveLength(20);
    const r = await resolveRows({ workspaceId: u.workspaceId, funding: "byok", rows: file.rows });
    expect(r.resolved.length + r.unresolved.length).toBe(20);
    expect(r.resolved.length / 20).toBeGreaterThanOrEqual(0.8);
    expect(r.unresolved.map((x) => x.name).sort()).toEqual(names.filter((n) => /closed/.test(n)).sort());
    expect(r.unresolved.every((x) => x.reason.length > 0)).toBe(true);
    expect(r.resolved.every((c) => c.lat != null && c.lng != null && names.includes(c.name))).toBe(true);

    const batch = await createBatch(base(r.resolved.slice(0, 2), { mode: "csv", city: null }));
    if (!batch.ok) throw new Error("create failed");
    await processBatch(batch.batchId);
    expect((await batchRow(batch.batchId)).status).toBe("done");
  });
});

describe("exports (acceptance)", () => {
  it("the zip holds one valid PDF per report and the CSV has the eight columns", async () => {
    const { candidates } = await find();
    const twin = { ...candidates[8], cid: "mock-prospect-twin" }; // two businesses with the same name
    const r = await createBatch(base([candidates[7], candidates[8], twin]));
    if (!r.ok) throw new Error("create failed");
    await processBatch(r.batchId);
    const batch = await batchRow(r.batchId);

    const zip = await zipBatchPdfs(batch.rows, "https://rankbyai.live");
    expect(zip.count).toBe(3);
    const files = unzipSync(zip.bytes);
    const names = Object.keys(files);
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9-]+-ai-visibility(-\d+)?\.pdf$/);
      const bytes = files[name];
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
      expect(Buffer.from(bytes.subarray(bytes.length - 8)).toString("latin1")).toContain("%%EOF");
      expect(bytes.length).toBeGreaterThan(3000);
    }

    const table = parseCsv(batchCsv(batch.rows, "https://rankbyai.live"));
    expect(table[0]).toEqual(["business", "website", "phone", "maps_top3_share_pct", "ai_mention_rate_pct", "top_competitor", "opener", "report_url", "status"]);
    expect(table).toHaveLength(4);
    for (const [i, line] of table.slice(1).entries()) {
      const row = batch.rows[i];
      expect(line[0]).toBe(row.name);
      expect(line[7]).toBe(`https://rankbyai.live/r/${row.report_slug}`);
      expect(line[8]).toBe("done");
      expect(Number(line[3])).toBe(row.maps_top3_share);
      expect(Number(line[4])).toBe(row.ai_mention_rate);
    }
  }, 60_000);

  it("spreadsheet formulas in business names are neutralised in the CSV", () => {
    const csv = batchCsv([{ idx: 0, status: "done", name: '=HYPERLINK("http://evil.example")', cid: null, place_id: null, address: null, city: null, region: null, country: null, website: null, phone: "+1 512", lat: 1, lng: 1, category: null, rating: null, reviews: null, rank: null }], "https://rankbyai.live");
    const line = parseCsv(csv)[1];
    expect(line[0].startsWith("'=")).toBe(true);
    expect(line[2].startsWith("'+")).toBe(true);
  });
});
