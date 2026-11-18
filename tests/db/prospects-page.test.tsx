import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import type { SessionContext, Workspace } from "@/lib/auth";
import { dbUser } from "@/lib/db/clients";
import { createBatch, discover, processBatch } from "@/lib/prospects/batch";

/** Renders the prospect screens on the server with real data, read through row-level security. */
const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/db/session", () => ({
  currentUserDb: async () => dbUser(session.userId),
  // The session's own workspace, as the real module derives it from the verified session.
  currentMember: async () => {
    const { sql } = await import("./helpers");
    const [row] = await sql<{ workspace_id: string }>("select workspace_id from public.workspace_members where user_id = $1 order by created_at limit 1", [session.userId]);
    return row ? { userId: session.userId, workspaceId: row.workspace_id } : null;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), notFound: () => { throw new Error("NOT_FOUND"); } }));

let u: TestUser;
let other: TestUser;
let batchId: string;

const ctxFor = async (user: TestUser): Promise<SessionContext> => {
  const [workspace] = await sql<Workspace>("select * from public.workspaces where id = $1", [user.workspaceId]);
  return { user: { id: user.id, email: user.email, emailVerified: true, name: null }, workspace, role: "owner", isAdmin: false };
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("prospectpage");
  other = await createTestUser("prospectpage-other");
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  const { candidates } = await discover({ workspaceId: u.workspaceId, funding: "byok", niche: "dentist", city: "Austin, TX", country: "US" });
  const r = await createBatch({ workspaceId: u.workspaceId, plan: "lifetime", mode: "search", niche: "dentist", city: "Austin, TX", country: "US", candidates: candidates.slice(5, 7), funding: "byok", confirm: true });
  if (!r.ok) throw new Error("create failed");
  batchId = r.batchId;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("prospect screens", () => {
  it("shows a queued batch with every row waiting and no downloads yet", async () => {
    session.userId = u.id;
    const { ProspectBatchPage } = await import("@/components/app/prospects-pages");
    const raw = renderToStaticMarkup(await ProspectBatchPage({ ctx: await ctxFor(u), batchId }));
    expect(text(raw)).toContain("Building reports: 0 of 2");
    expect(text(raw)).toContain("waiting");
    expect(raw).not.toContain("reports.zip");
  });

  it("shows a finished batch with metrics, openers, report links and both downloads", async () => {
    await processBatch(batchId);
    session.userId = u.id;
    const { ProspectBatchPage } = await import("@/components/app/prospects-pages");
    const raw = renderToStaticMarkup(await ProspectBatchPage({ ctx: await ctxFor(u), batchId }));
    const html = text(raw);
    const [batch] = await sql<{ rows: { name: string; report_slug: string; maps_top3_share: number; opener: string | null }[] }>("select rows from public.prospect_batches where id = $1", [batchId]);
    expect(html).toContain("2 of 2 reports ready");
    expect(raw).toContain(`href="/api/prospects/${batchId}/reports.zip"`);
    expect(raw).toContain(`href="/api/prospects/${batchId}/export.csv"`);
    for (const row of batch.rows) {
      expect(html).toContain(row.name);
      expect(raw).toContain(`href="/r/${row.report_slug}"`);
      expect(raw).toContain(`href="/api/reports/${row.report_slug}/pdf"`);
      expect(html).toContain(`${row.maps_top3_share}%`);
      if (row.opener) expect(html).toContain(row.opener);
    }
    expect(html).toContain("AI answers vary"); // disclaimer wherever AI results show
  });

  it("lists batches on the index page with the finder", async () => {
    session.userId = u.id;
    const { ProspectIndexPage } = await import("@/components/app/prospects-pages");
    const raw = renderToStaticMarkup(await ProspectIndexPage({ ctx: await ctxFor(u) }));
    expect(text(raw)).toContain("Find businesses");
    expect(text(raw)).toContain("dentist · Austin, TX");
    expect(raw).toContain(`href="/app/prospects/${batchId}"`);
    expect(text(raw)).toContain("2 of 2");
  });

  it("another workspace gets a 404 for the batch and an empty list", async () => {
    session.userId = other.id;
    const { ProspectBatchPage, ProspectIndexPage } = await import("@/components/app/prospects-pages");
    await expect(ProspectBatchPage({ ctx: await ctxFor(other), batchId })).rejects.toThrow("NOT_FOUND");
    const raw = renderToStaticMarkup(await ProspectIndexPage({ ctx: await ctxFor(other) }));
    expect(raw).not.toContain(batchId);
    expect(text(raw)).toContain("No batches yet.");
    expect(text(raw)).toContain("Prospect mode needs lifetime access");
  });
});
