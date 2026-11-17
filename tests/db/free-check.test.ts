import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { isDisposableEmail, runFreeCheck, startFreeCheck } from "@/lib/free-check";
import { getReportView } from "@/lib/reports";

/** M2 acceptance (e): free-check limits, with simulated vendors and the real local database. */
let u: TestUser;

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("freecheck");
});
beforeEach(resetData);
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

const start = (email: string, ip = "203.0.113.7") => startFreeCheck({ email, ip, businessName: "Northgate Family Dental", city: "Austin, TX" });

describe("free check limits", () => {
  it("runs once per email: the second attempt with the same email is refused", async () => {
    const first = await start(u.email);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const run = await runFreeCheck({ freeCheckId: first.id, userEmail: u.email, workspaceId: u.workspaceId });
    expect(run.ok).toBe(true);

    const second = await start(u.email.toUpperCase()); // same inbox, different case
    expect(second).toMatchObject({ ok: false, status: 409, error: "already_used" });
    // Re-opening the emailed link returns the same report instead of running again.
    const again = await runFreeCheck({ freeCheckId: first.id, userEmail: u.email, workspaceId: u.workspaceId });
    expect(again).toEqual(run);
    expect((await sql("select 1 from public.scans")).length).toBe(1);
  });

  it("allows 3 per IP per day and refuses the 4th", async () => {
    for (let i = 0; i < 3; i++) expect((await start(`person${i}@agency.example`)).ok).toBe(true);
    expect(await start("person4@agency.example")).toMatchObject({ ok: false, status: 429, error: "ip_limit" });
    expect((await start("person5@agency.example", "198.51.100.9")).ok).toBe(true); // another network is fine
  });

  it("queues for tomorrow when the daily free budget is used up", async () => {
    await sql("insert into public.spend_log (provider, usd, funding) values ('openai', 2.99, 'free')"); // cap is $3
    const s = await start(u.email);
    if (!s.ok) throw new Error("start failed");
    const run = await runFreeCheck({ freeCheckId: s.id, userEmail: u.email, workspaceId: u.workspaceId });
    expect(run).toMatchObject({ ok: false, status: 429, error: "daily_cap", queued: true });
    expect((await sql<{ status: string }>("select status from public.free_checks where id = $1", [s.id]))[0].status).toBe("queued_tomorrow");
    expect(await sql("select 1 from public.scans")).toEqual([]);
    // Next day (budget free again) the same link runs.
    await sql("delete from public.spend_log");
    expect((await runFreeCheck({ freeCheckId: s.id, userEmail: u.email, workspaceId: u.workspaceId })).ok).toBe(true);
  });

  it("blocks disposable inboxes and other people's links", async () => {
    expect(isDisposableEmail("x@mailinator.com")).toBe(true);
    expect(await start("x@mailinator.com")).toMatchObject({ ok: false, error: "disposable_email" });
    const s = await start("someone-else@agency.example");
    if (!s.ok) throw new Error("start failed");
    expect(await runFreeCheck({ freeCheckId: s.id, userEmail: u.email, workspaceId: u.workspaceId })).toMatchObject({ ok: false, status: 404 });
  });

  it("stores hashes, never the email or IP", async () => {
    await start(u.email);
    const [row] = await sql<{ email_hash: string; ip_hash: string }>("select email_hash, ip_hash from public.free_checks");
    expect(row.email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(u.email);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
  });
});

describe("free check report", () => {
  it("is a watermarked 1×1 report on a locked workspace, funded by the house, with no customer data leaking", async () => {
    const s = await start(u.email);
    if (!s.ok) throw new Error("start failed");
    const run = await runFreeCheck({ freeCheckId: s.id, userEmail: u.email, workspaceId: u.workspaceId });
    if (!run.ok) throw new Error("run failed: " + run.message);
    expect(run.slug.length).toBeGreaterThanOrEqual(12);

    const [scan] = await sql<{ funding: string; grid_size: number; credits_used: number; status: string }>("select funding, grid_size, credits_used, status from public.scans");
    expect(scan).toMatchObject({ funding: "free", grid_size: 1, credits_used: 0, status: "done" });
    expect((await sql<{ plan: string }>("select plan from public.workspaces where id = $1", [u.workspaceId]))[0].plan).toBe("locked");
    expect(Number((await sql<{ usd: string }>("select coalesce(sum(usd),0) as usd from public.spend_log where funding = 'free'"))[0].usd)).toBeGreaterThan(0);

    const view = await getReportView(run.slug);
    expect(view).not.toBeNull();
    expect(view!.kind).toBe("free_check");
    expect(view!.watermark).toBe(true);
    expect(view!.ai?.single).toHaveLength(3);
    expect(view!.maps?.single?.rank).toBe(1);
    expect(view!.brand.hideRankbyai).toBe(false);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(u.workspaceId);
    expect(serialized).not.toContain(u.email);
    expect(serialized).not.toContain(u.id);

    expect(await getReportView("does-not-exist-123")).toBeNull();
    await admin.from("reports").update({ revoked: true }).eq("share_slug", run.slug);
    expect(await getReportView(run.slug)).toBeNull();
  });
});
