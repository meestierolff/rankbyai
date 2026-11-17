import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { getReportView, safeHttpUrl } from "@/lib/reports";
import { nextRunAt, runDueSchedules, upsertTrackedQuery } from "@/lib/schedules";
import { compareAi, compareHeadline, compareMaps } from "@/lib/scans/compare";
import { createScan, processScan } from "@/lib/scans/engine";
import { randomToken } from "@/lib/crypto";

/** M3 acceptance: compare, schedules from cron with the right funding, share links, white-label, revoke. */
let u: TestUser;
let businessId: string;

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("m3");
});
beforeEach(async () => {
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1, brand_name = null, brand_website = null, brand_color_hex = null, hide_rankbyai_branding = false where id = $1", [u.workspaceId]);
  const { data } = await admin.from("businesses").insert({ workspace_id: u.workspaceId, name: "Northgate Family Dental", city: "Austin", country: "US", lat: 30.3172, lng: -97.7231, cid: "mock-cid-target", primary_category: "Dentist" }).select("id").single();
  businessId = data!.id;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("compare two scans", () => {
  it("AI: per-point deltas and metric deltas", () => {
    const s = (point_idx: number, engine: "openai" | "gemini", mentioned: boolean, status = "done") => ({ point_idx, engine, status, mentioned, mention_position: mentioned ? 1 : null });
    const before = [s(0, "openai", false), s(0, "gemini", false), s(1, "openai", true), s(1, "gemini", false), s(2, "openai", true), s(2, "gemini", true), s(3, "openai", false, "failed"), s(3, "gemini", false, "failed")];
    const after = [s(0, "openai", true), s(0, "gemini", true), s(1, "openai", true), s(1, "gemini", false), s(2, "openai", false), s(2, "gemini", true), s(3, "openai", true), s(3, "gemini", false)];
    const c = compareAi(before, after, 2, 2);
    expect(c.samePoints).toBe(true);
    expect(c.points.map((p) => p.delta)).toEqual([2, 0, -1, null]); // point 3 had no answers before: no delta invented
    expect(c.pointsMentioned).toEqual({ before: 2, after: 4, total: 4, delta: 2 });
    expect(c.improved).toBe(1);
    expect(c.declined).toBe(1);
    expect(c.engines.find((e) => e.engine === "openai")).toMatchObject({ before: 2, after: 3, delta: 1 });
    expect(compareHeadline("ai", c)).toBe("Named by AI at 2/4 → 4/4 points.");
  });

  it("Maps: rank deltas (positive = better), average rank, points improved", () => {
    const p = (idx: number, rank: number | null, status = "done") => ({ idx, rank, status });
    const c = compareMaps([p(0, 5), p(1, null), p(2, 2), p(3, 9, "failed")], [p(0, 2), p(1, 12), p(2, 4), p(3, 3)]);
    expect(c.points.map((x) => x.delta)).toEqual([3, 9, -2, null]);
    expect(c.avgRank).toEqual({ before: 9.3, after: 5.3, delta: 4 });
    expect(c.top3).toEqual({ before: 1, after: 2, delta: 1 });
    expect([c.improved, c.declined, c.unchanged]).toEqual([2, 1, 0]);
    expect(compareHeadline("maps", c)).toBe("Average rank 9.3 → 5.3. 2 points improved, 1 declined.");
  });

  it("different grid sizes: metrics only, no per-point deltas", () => {
    const c = compareMaps([{ idx: 0, rank: 1, status: "done" }], [{ idx: 0, rank: 2, status: "done" }, { idx: 1, rank: 3, status: "done" }]);
    expect(c.samePoints).toBe(false);
    expect(c.points).toEqual([]);
  });
});

describe("schedules", () => {
  it("computes the next run", () => {
    expect(nextRunAt("weekly", new Date("2026-11-17T10:00:00Z"))?.toISOString()).toBe("2026-11-24T10:00:00.000Z");
    expect(nextRunAt("monthly", new Date("2026-01-31T10:00:00Z"))?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(nextRunAt("monthly", new Date("2026-11-17T10:00:00Z"))?.toISOString()).toBe("2026-12-17T10:00:00.000Z");
    expect(nextRunAt("none", new Date())).toBeNull();
  });

  const track = (over: Record<string, unknown> = {}) =>
    upsertTrackedQuery({ workspaceId: u.workspaceId, businessId, kind: "ai", keyword: "dentists", gridSize: 3, radiusMiles: 2, engines: ["openai", "perplexity", "gemini"], funding: "byok", schedule: "weekly", ...over } as Parameters<typeof upsertTrackedQuery>[0]);

  it("a weekly schedule fires from cron once it is due, runs on the user's keys, and moves forward a week", async () => {
    const t = await track();
    expect(t.ok).toBe(true);
    // Not due yet: nothing runs.
    expect((await runDueSchedules(10, new Date())).started).toBe(0);

    const in8days = new Date(Date.now() + 8 * 86_400_000);
    const report = await runDueSchedules(10, in8days);
    expect(report).toMatchObject({ due: 1, started: 1, skipped: [] });
    const [scan] = await sql<{ funding: string; status: string; tracked_query_id: string; credits_used: number }>("select funding, status, tracked_query_id, credits_used from public.scans");
    expect(scan).toMatchObject({ funding: "byok", status: "done", credits_used: 0 });
    expect(scan.tracked_query_id).toBe(t.ok ? t.id : "");
    expect(await sql("select 1 from public.spend_log")).toEqual([]); // BYOK: not our money
    const [tq] = await sql<{ next_run_at: Date }>("select next_run_at from public.tracked_queries");
    expect(Math.round((tq.next_run_at.getTime() - in8days.getTime()) / 86_400_000)).toBe(7);
    // The same tick again does not run it twice.
    expect((await runDueSchedules(10, in8days)).started).toBe(0);
  });

  it("two overlapping cron ticks start a due schedule exactly once", async () => {
    await track();
    const when = new Date(Date.now() + 8 * 86_400_000);
    const [a, b] = await Promise.all([runDueSchedules(10, when), runDueSchedules(10, when)]);
    expect(a.started + b.started).toBe(1);
    expect((await sql("select 1 from public.scans")).length).toBe(1);
  });

  it("a credit-funded schedule spends credits, and is skipped (not run for free) when the balance is empty", async () => {
    await track({ funding: "credits", kind: "maps", keyword: "dentist", gridSize: 7, engines: [] });
    const when = new Date(Date.now() + 8 * 86_400_000);
    expect(await runDueSchedules(10, when)).toMatchObject({ due: 1, started: 0, skipped: [{ reason: "insufficient_credits" }] });
    expect(await sql("select 1 from public.scans")).toEqual([]);

    await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 2, 'test_grant')", [u.workspaceId]);
    const later = new Date(when.getTime() + 8 * 86_400_000);
    expect((await runDueSchedules(10, later)).started).toBe(1);
    const [scan] = await sql<{ funding: string; mode: string; credits_used: number }>("select funding, mode, credits_used from public.scans");
    expect(scan).toMatchObject({ funding: "credits", mode: "standard", credits_used: 1 });
    expect((await admin.rpc("credit_balance", { p_workspace_id: u.workspaceId })).data).toBe(1);
  });

  it("a paused schedule and a refunded (locked) workspace do not run", async () => {
    await track();
    await sql("update public.tracked_queries set active = false");
    const when = new Date(Date.now() + 8 * 86_400_000);
    expect((await runDueSchedules(10, when)).due).toBe(0);
    await sql("update public.tracked_queries set active = true");
    await sql("update public.workspaces set plan = 'locked' where id = $1", [u.workspaceId]);
    expect(await runDueSchedules(10, when)).toMatchObject({ started: 0, skipped: [{ reason: "lifetime_required" }] });
  });

  it("updating a schedule for the same business and keyword does not create a duplicate", async () => {
    await track();
    await track({ schedule: "monthly", gridSize: 5 });
    const rows = await sql<{ schedule: string; grid_size: number }>("select schedule, grid_size from public.tracked_queries");
    expect(rows).toEqual([{ schedule: "monthly", grid_size: 5 }]);
  });
});

describe("share links and white-label", () => {
  async function scanBoth() {
    for (const spec of [{ kind: "ai", grid: 3, engines: ["openai", "perplexity", "gemini"] }, { kind: "maps", grid: 5, mode: "live" }] as const) {
      const r = await createScan({ workspaceId: u.workspaceId, plan: "lifetime", businessId, spec: spec as never, keyword: spec.kind === "ai" ? "dentists" : "dentist", radiusMiles: 2, funding: "byok", confirm: true });
      if (!r.ok) throw new Error("scan failed: " + JSON.stringify(r));
      await processScan(r.scanId);
    }
  }
  async function shareSlug() {
    const slug = randomToken(12);
    await admin.from("reports").insert({ workspace_id: u.workspaceId, business_id: businessId, kind: "share", share_slug: slug, status: "ready" });
    return slug;
  }

  it("shows the latest scans, and a newer scan replaces the older one without changing the link", async () => {
    const slug = await shareSlug();
    expect((await getReportView(slug))?.ai).toBeNull(); // no scans yet: still a valid page
    await scanBoth();
    const first = await getReportView(slug);
    expect(first?.ai?.n).toBe(3);
    expect(first?.maps?.n).toBe(5);
    expect(first?.ai?.cells).toHaveLength(9);

    const r = await createScan({ workspaceId: u.workspaceId, plan: "lifetime", businessId, spec: { kind: "ai", grid: 5, engines: ["openai"] }, keyword: "dentists", radiusMiles: 2, funding: "byok", confirm: true });
    if (!r.ok) throw new Error("scan failed");
    await processScan(r.scanId);
    expect((await getReportView(slug))?.ai?.n).toBe(5);
  });

  it("white-label: agency name, colour and website; hide-branding removes RankbyAI", async () => {
    const slug = await shareSlug();
    await scanBoth();
    let view = await getReportView(slug);
    expect(view?.brand).toMatchObject({ name: null, hideRankbyai: false });

    await sql("update public.workspaces set brand_name = 'Acme Local', brand_color_hex = '#33cc77', brand_website = 'https://acme.example/', hide_rankbyai_branding = true where id = $1", [u.workspaceId]);
    view = await getReportView(slug);
    expect(view?.brand).toMatchObject({ name: "Acme Local", color: "#33cc77", website: "https://acme.example/", hideRankbyai: true });
  });

  it("never turns an unsafe website value into a link, even if it was written straight to the database", async () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
    expect(safeHttpUrl("acme.example")).toBeNull();
    expect(safeHttpUrl("https://acme.example")).toBe("https://acme.example/");
    const slug = await shareSlug();
    // The owner may update brand columns through the Data API, bypassing our route's validation.
    const direct = await u.client.from("workspaces").update({ brand_name: "X", brand_website: "javascript:alert(document.cookie)", brand_logo_path: "someone-else/logo.png" }).eq("id", u.workspaceId);
    expect(direct.error).toBeNull();
    const view = await getReportView(slug);
    expect(view?.brand.website).toBeNull();
    expect(view?.brand.logoUrl).toBeNull();
  });

  it("white-label is ignored for a workspace that is no longer lifetime", async () => {
    const slug = await shareSlug();
    await sql("update public.workspaces set brand_name = 'Acme Local', hide_rankbyai_branding = true, plan = 'locked' where id = $1", [u.workspaceId]);
    expect((await getReportView(slug))?.brand).toMatchObject({ name: null, hideRankbyai: false });
  });

  it("revoking a slug makes it disappear; the report exposes no private identifiers", async () => {
    const slug = await shareSlug();
    await scanBoth();
    const view = await getReportView(slug);
    const text = JSON.stringify(view);
    for (const secret of [u.workspaceId, u.id, u.email, businessId]) expect(text).not.toContain(secret);
    expect(text).not.toMatch(/cost|actual_cost|est_cost/);
    await admin.from("reports").update({ revoked: true }).eq("share_slug", slug);
    expect(await getReportView(slug)).toBeNull();
  });
});
