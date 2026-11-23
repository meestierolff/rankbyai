import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import type { SessionContext, Workspace } from "@/lib/auth";
import { dbUser } from "@/lib/db/clients";
import { processPackRun, startPack } from "@/lib/packs/run";

/** Renders the citation workflow page on the server with real data, read through row-level security. */
const session = vi.hoisted(() => ({ userId: "", ctx: null as SessionContext | null }));
vi.mock("@/lib/db/session", () => ({
  currentUserDb: async () => dbUser(session.userId),
  currentMember: async () => {
    const { sql } = await import("./helpers");
    const [row] = await sql<{ workspace_id: string }>("select workspace_id from public.workspace_members where user_id = $1 order by created_at limit 1", [session.userId]);
    return row ? { userId: session.userId, workspaceId: row.workspace_id } : null;
  },
}));
vi.mock("@/lib/auth", () => ({ requireSession: async () => session.ctx!, getSessionContext: async () => session.ctx }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), notFound: () => { throw new Error("NOT_FOUND"); } }));

let u: TestUser;
let other: TestUser;
let businessId: string;
let packId: string;

const ctxFor = async (user: TestUser): Promise<SessionContext> => {
  const [workspace] = await sql<Workspace>("select * from public.workspaces where id = $1", [user.workspaceId]);
  return { user: { id: user.id, email: user.email, emailVerified: true, name: null }, workspace, role: "owner", isAdmin: false };
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
async function render(user: TestUser, query: Record<string, string> = {}) {
  session.userId = user.id;
  session.ctx = await ctxFor(user);
  const { default: Page } = await import("@/app/app/businesses/[id]/citations/page");
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: businessId }), searchParams: Promise.resolve(query) }));
}

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("citations-page");
  other = await createTestUser("citations-page-other");
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  const [b] = await sql<{ id: string }>(
    "insert into public.businesses (workspace_id, name, city, lat, lng, website, primary_category, cid) values ($1, 'Northgate Family Dental', 'Austin', 30.3172, -97.7231, 'https://northgatefamilydental.example', 'Dental clinic', 'mock-cid-target') returning id",
    [u.workspaceId],
  );
  businessId = b.id;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("citation workflow page", () => {
  it("before any pack: suggested prompts to edit, and an empty state", async () => {
    const t = text(await render(u));
    expect(t).toContain("Citation workflow · Northgate Family Dental");
    expect(await render(u)).toContain('value="Who is the best dental clinic in Austin?"');
    expect(t).toContain("No prompt pack yet");
    expect(t).not.toContain("2 · Cited pages");
  });

  it("after a run: results per prompt and engine, share of answers, and the cited pages", async () => {
    const r = await startPack({ workspaceId: u.workspaceId, plan: "lifetime", businessId, service: "dentist", prompts: ["Who is the best dentist in Austin?", "Top 10 dentist options in Austin"], engines: ["openai", "gemini"], confirm: true });
    if (!r.ok) throw new Error(r.message);
    packId = r.packId;
    await processPackRun(r.runId);
    const t = text(await render(u));
    expect(t).toContain("Results · dentist: buyer prompts");
    expect(t).toContain("Top 10 dentist options in Austin");
    expect(t).toContain("Share of answers");
    expect(t).toContain("2 · Cited pages");
    expect(t).toContain("mock-directory.example");
    expect(t).toContain("in the answers");
    expect(t).toContain("Run this pack again");
  });

  it("filters to missing pages and groups by site from the address bar", async () => {
    // Every simulated answer named the business, so nothing is missing yet.
    expect(text(await render(u, { pack: packId, view: "missing", group: "domain" }))).toContain("No sites here.");
    // Gemini's answers now leave it out: the page only Gemini cited becomes missing; the shared one does not.
    await sql(`update public.ai_samples set mentioned = false, mention_position = null, named_businesses = '[{"name":"Mock Rival Six"}]' where engine = 'gemini'`);
    const t = text(await render(u, { pack: packId, view: "missing", group: "domain" }));
    expect(t).toContain("mock-gemini.example");
    expect(t).not.toContain("mock-directory.example");
    expect(text(await render(u, { pack: packId, group: "domain" }))).toContain("mock-directory.example");
  });

  it("shows step 3: the competitor form and the latest search's pages with a CSV link", async () => {
    const { startTargets, processTargets } = await import("@/lib/targets/run");
    const r = await startTargets({ workspaceId: u.workspaceId, plan: "lifetime", businessId, competitors: [{ name: "Smile Haus", domain: "smilehaus.example" }], confirm: true });
    if (!r.ok) throw new Error(r.message);
    await processTargets(r.listId);
    const html = await render(u, { pack: packId });
    const t = text(html);
    expect(t).toContain("3 · Citation targets");
    expect(t).toContain("The 10 Best Dentists in 2026");
    expect(t).toContain("Ask to be listed");
    expect(t).toContain("Claim the listing");
    expect(html).toContain(`/api/citation-targets/${r.listId}/csv`);
  });

  it("another workspace gets a 404, not the pack", async () => {
    await expect(render(other)).rejects.toThrow("NOT_FOUND");
  });
});
