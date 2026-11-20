import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { admin, anon, closePool, createTestUser, deleteTestUsers, resetData, sql, type TestUser } from "./helpers";
import { getRegionalPage, listRegionalPages, rebuildRegionalPages, slugify } from "@/lib/regional";
import { createScan, processScan } from "@/lib/scans/engine";

/** Regional pages (brief 12): what may be published, and when a page becomes indexable. */
let u: TestUser;
let businessId: string;

async function aiScan(funding: "byok" | "credits" | "free", grid: 1 | 3 = 3) {
  const r = await createScan({ workspaceId: u.workspaceId, plan: "lifetime", businessId, spec: { kind: "ai", grid, engines: ["openai", "perplexity", "gemini"] }, keyword: "Dentists", radiusMiles: 2, funding, confirm: true });
  if (!r.ok) throw new Error(JSON.stringify(r));
  await processScan(r.scanId);
}

const stored = async () => (await sql<{ sample_count: number; scans_count: number; indexable: boolean }>("select sample_count, scans_count, indexable from public.regional_pages where niche_slug = 'dentists' and city_slug = 'austin'"))[0];

beforeAll(async () => {
  process.env.RANKBYAI_MOCK_PROVIDERS = "1";
  delete process.env.VERCEL;
  await resetData();
  u = await createTestUser("regional");
});
beforeEach(async () => {
  await resetData();
  await sql("update public.workspaces set plan = 'lifetime', lifetime_seat = 1, share_scans_for_regional_pages = false where id = $1", [u.workspaceId]);
  await sql("insert into public.credit_ledger (workspace_id, delta, reason) values ($1, 10, 'pack')", [u.workspaceId]);
  const { data } = await admin.from("businesses").insert({ workspace_id: u.workspaceId, name: "Northgate Family Dental", city: "Austin", region: "Texas", country: "US", lat: 30.3172, lng: -97.7231, cid: "mock-cid-target" }).select("id").single();
  businessId = data!.id;
});
afterAll(async () => {
  delete process.env.RANKBYAI_MOCK_PROVIDERS;
  await resetData();
  await deleteTestUsers();
  await closePool();
});

describe("what may be published", () => {
  it("own-key scans are private unless the workspace opted in", async () => {
    await aiScan("byok");
    expect(await rebuildRegionalPages()).toEqual({ pages: 0, indexable: 0, announced: 0 });
    expect(await sql("select 1 from public.regional_pages")).toEqual([]);

    await sql("update public.workspaces set share_scans_for_regional_pages = true where id = $1", [u.workspaceId]);
    expect((await rebuildRegionalPages()).pages).toBe(1);
    expect(await stored()).toMatchObject({ sample_count: 27, scans_count: 1, indexable: false });
    expect(await getRegionalPage("dentists", "austin")).toBeNull(); // one scan is not enough to be public
  });

  it("free checks never count, however many there are: anyone can run one without an account", async () => {
    for (let i = 0; i < 10; i++) await aiScan("free", 1);
    expect(await rebuildRegionalPages()).toEqual({ pages: 0, indexable: 0, announced: 0 });
    expect(await sql("select 1 from public.regional_pages")).toEqual([]);
  });

  it("scans on our own keys count, and two scans with 27 answers make a page indexable", async () => {
    await aiScan("credits");
    await rebuildRegionalPages();
    expect(await stored()).toMatchObject({ sample_count: 27, scans_count: 1, indexable: false });
    expect(await getRegionalPage("dentists", "austin")).toBeNull(); // thin pages are not public at all
    expect(await listRegionalPages(true)).toEqual([]); // and not in the index or the sitemap

    await aiScan("credits");
    expect(await rebuildRegionalPages()).toEqual({ pages: 1, indexable: 1, announced: 0 }); // IndexNow pings only in production
    const page = (await getRegionalPage("dentists", "austin"))!;
    expect(page).toMatchObject({ sample_count: 54, scans_count: 2, indexable: true });
    expect(page.labels).toEqual({ niche: "dentists", city: "Austin", region: "Texas", country: "US" });
    expect(page.top_businesses.length).toBeGreaterThan(2);
    expect(page.top_businesses[0].answers).toBeGreaterThanOrEqual(page.top_businesses[1].answers);
    expect(page.top_businesses.every((b) => b.answers <= page.sample_count)).toBe(true);
    expect(Object.values(page.engine_stats).reduce((s, e) => s + e!.answers, 0)).toBe(54);
    expect((await listRegionalPages(true)).map((p) => `${p.niche_slug}/${p.city_slug}`)).toEqual(["dentists/austin"]);
  });

  it("a page never carries the identity of whoever scanned", async () => {
    await aiScan("credits");
    await rebuildRegionalPages();
    const row = JSON.stringify(await sql("select * from public.regional_pages"));
    for (const secret of [u.workspaceId, u.id, u.email, businessId]) expect(row).not.toContain(secret);
  });

  it("visitors can read published pages and nothing else; unknown and malformed addresses give nothing", async () => {
    await aiScan("credits");
    await aiScan("credits");
    await rebuildRegionalPages();
    expect(((await anon().from("regional_pages").select("niche_slug")).data ?? []).length).toBe(1);
    expect((await anon().from("regional_pages").insert({ niche_slug: "x", city_slug: "y" })).error).not.toBeNull();
    expect(await getRegionalPage("plumbers", "austin")).toBeNull();
    expect(await getRegionalPage("../etc", "austin")).toBeNull();
    expect(await getRegionalPage("dentists", "Austin; drop table")).toBeNull();
  });

  it("slugs are stable and safe", () => {
    expect(slugify("Emergency Plumbers & Drain Cleaning")).toBe("emergency-plumbers-and-drain-cleaning");
    expect(slugify("São Paulo")).toBe("sao-paulo");
    expect(slugify("  --  ")).toBe("");
  });
});
