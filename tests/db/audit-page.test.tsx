import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { generateFixKit } from "@/lib/audit/fixkit";
import { createAudit, processAudit } from "@/lib/audit/run";
import type { SessionContext, Workspace } from "@/lib/auth";
import { dbUser } from "@/lib/db/clients";

/**
 * Renders the audit screens on the server with real data from the local database, reading through
 * row-level security as the signed-in user would. Proves the pages render and show stored numbers.
 */
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

let u: TestUser;
let other: TestUser;
let auditId: string;

const ctxFor = async (user: TestUser): Promise<SessionContext> => {
  const [workspace] = await sql<Workspace>("select * from public.workspaces where id = $1", [user.workspaceId]);
  return { user: { id: user.id, email: user.email, emailVerified: true, name: null }, workspace, role: "owner", isAdmin: false };
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("auditpage");
  other = await createTestUser("auditpage-other");
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1 where id = $1", [u.workspaceId]);
  const { data } = await admin.from("businesses").insert({
    workspace_id: u.workspaceId, name: "Northgate Family Dental", city: "Austin", region: "Texas", country: "US", address: "4100 Mock Lamar Blvd, Austin, TX 78756",
    lat: 30.3172, lng: -97.7231, cid: "mock-cid-target", website: "https://northgatefamilydental.example", phone: "+1 512 555 0174", primary_category: "Dental clinic", source: "search",
  }).select("id").single();
  const r = await createAudit({ workspaceId: u.workspaceId, plan: "lifetime", businessId: data!.id, service: "dentist", months: 3, funding: "byok", confirm: true });
  if (!r.ok) throw new Error("create failed");
  auditId = r.auditId;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("audit screens", () => {
  it("shows progress while the audit is queued", async () => {
    session.userId = u.id;
    const { AuditDetailPage } = await import("@/components/app/audit-pages");
    const html = text(renderToStaticMarkup(await AuditDetailPage({ ctx: await ctxFor(u), auditId })));
    expect(html).toContain("Running the audit…");
    expect(html).not.toContain("Findings (");
  });

  it("shows the score, findings with evidence, the maths and the Fix Kit entry point", async () => {
    await processAudit(auditId);
    session.userId = u.id;
    const { AuditDetailPage } = await import("@/components/app/audit-pages");
    const raw = renderToStaticMarkup(await AuditDetailPage({ ctx: await ctxFor(u), auditId }));
    const html = text(raw);
    const [audit] = await sql<{ score: number; checks_ran: number; checks_total: number }>("select score, checks_ran, checks_total from public.audits where id = $1", [auditId]);

    expect(raw).toContain(`aria-label="Score ${audit.score} out of 100"`);
    expect(html).toContain(`${Math.round((audit.checks_ran / audit.checks_total) * 100)}% of checks ran (${audit.checks_ran} of ${audit.checks_total})`);
    expect(html).toContain("First audit of this business");
    for (const label of ["Identity & NAP", "Business profile", "Website & schema", "Reviews", "AI presence", "Competitive gap"]) expect(html).toContain(label);

    // Findings: title with the real numbers, evidence rows, how to fix.
    expect(html).toContain("38 reviews vs a map-pack median of 112");
    expect(html).toContain("Phone on the website doesn't match the Google profile");
    expect(html).toContain("Google profile phone +1 512 555 0174");
    expect(html).toContain("How to fix: Ask every customer. Aim for 25 new reviews a month for 3 months to reach the median.");
    expect(raw).toContain('href="https://mockrivalone.example/services/dental-implants"'); // service gap cites the competitor page

    // Competitor table, review maths and page maths, all from stored inputs.
    expect(html).toContain("Northgate Family Dental (you)");
    expect(html).toContain("Mock Rival Two");
    expect(html).toContain("You 38 · competitor median 112 · gap 74 · ÷ 3 months = 25 reviews/month");
    expect(html).toContain("6 services × 4 areas = 24 pages; you have 1 → 23 to build");
    expect(raw).toContain(`href="/api/audits/${auditId}/pages.csv"`);

    expect(html).toContain("Build the Fix Kit");
    expect(html).toMatch(/Checks that passed \(\d+\)/);
    expect(html).toContain("AI answers vary"); // disclaimer wherever AI results show
    expect(html).toContain("simulated vendor data"); // development mode is labelled
  });

  it("expands a crawler finding per crawler: evidence, likely cause, where to look, steps and a check to copy", async () => {
    const { probeDetail } = await import("@/lib/audit/crawler-fix");
    const detail = probeDetail({ agent: "OAI-SearchBot", status: 403, server: "cloudflare", cfRay: "8f1a2b3c4d5e6f70-AMS", cfMitigated: "challenge", snippet: "Just a moment..." }, "ai_search", "ChatGPT search", "https://northgate.example")!;
    await sql("insert into public.audit_findings (audit_id, priority, category, title, evidence, fix, impact_note, check_key, data) values ($1, 'P1', 'website', $2, $3::jsonb, $4, null, 'crawler_http', $5::jsonb)", [
      auditId, "The server refuses requests that name AI search crawlers: OAI-SearchBot", JSON.stringify([{ label: "Request naming OAI-SearchBot (search)", value: "HTTP 403, cf-mitigated: challenge" }]),
      "Likely a Cloudflare bot setting.", JSON.stringify({ crawlers: [detail] }),
    ]);
    session.userId = u.id;
    const { AuditDetailPage } = await import("@/components/app/audit-pages");
    const raw = renderToStaticMarkup(await AuditDetailPage({ ctx: await ctxFor(u), auditId }));
    const html = text(raw);
    expect(html).toContain("OAI-SearchBot · search crawler · server answer · likely");
    expect(html).toContain("Likely cause: Cloudflare answered with a challenge page");
    expect(html).toContain("Where to look:");
    expect(html).toContain("“Bot fight mode”");
    expect(html).toContain("Steps:");
    expect(html).toContain(`-A "OAI-SearchBot" 'https://northgate.example/'`);
    expect(html).toContain("Copy check");
    expect(html).toContain("from its own servers");
  });

  it("shows the Fix Kit blocks once generated", async () => {
    await generateFixKit(auditId, u.workspaceId);
    session.userId = u.id;
    const { AuditDetailPage } = await import("@/components/app/audit-pages");
    const html = text(renderToStaticMarkup(await AuditDetailPage({ ctx: await ctxFor(u), auditId })));
    for (const block of ["Business description", "8 FAQs", "LocalBusiness schema", "FAQPage schema", "llms.txt draft", "Checklist"]) expect(html).toContain(block);
    expect(html).toContain('"@type": "Dentist"');
    expect(html).not.toContain("Build the Fix Kit");
  });

  it("lists audits on the index page with the start form", async () => {
    session.userId = u.id;
    const { AuditIndexPage } = await import("@/components/app/audit-pages");
    const html = text(renderToStaticMarkup(await AuditIndexPage({ ctx: await ctxFor(u) })));
    expect(html).toContain("Run an audit");
    expect(html).toContain("Estimate before you run");
    expect(html).toContain("Northgate Family Dental");
    expect(html).toContain("done");
  });

  it("another workspace gets a 404 for the audit and an empty list", async () => {
    session.userId = other.id;
    const { AuditDetailPage, AuditIndexPage } = await import("@/components/app/audit-pages");
    await expect(AuditDetailPage({ ctx: await ctxFor(other), auditId })).rejects.toThrow("NOT_FOUND");
    const raw = renderToStaticMarkup(await AuditIndexPage({ ctx: await ctxFor(other) }));
    expect(raw).not.toContain(`/app/audit/${auditId}`);
    expect(text(raw)).toContain("No audits yet.");
    expect(text(raw)).toContain("Add a business first");
    expect(text(raw)).toContain("Sample data"); // a locked workspace sees the labelled sample preview
  });
});
