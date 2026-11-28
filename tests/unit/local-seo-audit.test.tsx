import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/marketing/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/offer", () => ({ getOfferCached: vi.fn() }));
vi.mock("@/lib/availability", () => ({ packsOpen: () => false }));

import { SeoArticle, seoMetadata } from "@/components/marketing/seo-article";
import { getOfferCached } from "@/lib/offer";
import { buildOffer } from "@/lib/ladder";
import { LOCAL_SEO_AUDIT_PAGE as page } from "@/lib/local-seo-audit-page";
import { SEO_PAGES } from "@/lib/seo-pages";
import { STATIC_PAGES } from "@/lib/site-pages";

const live = { available: true as const, paidTotal: 0, offer: buildOffer(6, { basePriceCents: 2900, stepCents: 1000, seatsPerStep: 5, closesAt: "2026-12-16T13:00:00Z" }, new Date("2026-11-26T12:00:00Z")) };
async function render(result: Awaited<ReturnType<typeof getOfferCached>> = live) {
  vi.mocked(getOfferCached).mockResolvedValue(result);
  return renderToStaticMarkup(await SeoArticle({ page }));
}

describe("local SEO audit landing page", () => {
  it("server-renders the diagnostic content, sample before opening, and matching structured FAQ", async () => {
    const html = await render();
    expect(html).toContain(`<h1`);
    expect(html).toContain(page.h1);
    expect(html.indexOf("Sample data")).toBeLessThan(html.indexOf("A local SEO audit checks"));
    expect(html).toContain("audit-checklist");
    const table = page.sections.flatMap(s => s.body).find(b => typeof b === "object" && "table" in b && b.table.columns.length === 5);
    expect(table && typeof table === "object" && "table" in table && table.table.rows.every(row => row.length === 5)).toBe(true);
    const ld = JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1]);
    const faq = ld["@graph"].find((n: { "@type": string }) => n["@type"] === "FAQPage");
    expect(faq.mainEntity).toHaveLength(4);
    for (const [i, question] of faq.mainEntity.entries()) {
      expect(question.name).toBe(page.faqs[i].q);
      expect(question.acceptedAnswer.text).toBe(page.faqs[i].a);
      expect(html).toContain(page.faqs[i].q);
    }
    expect(ld["@graph"].some((n: { "@type": string[] }) => n["@type"].includes("SoftwareApplication"))).toBe(true);
    expect(html).not.toContain("AggregateRating");
    expect(html).toContain("AI answers vary between runs, places and time");
    expect(html).not.toContain('href="/local-seo-report"');
    expect(html).toContain('href="/#free-check"');
  });

  it("uses live offer values at zero paid sales, and handles unavailable or closed offers", async () => {
    expect((await render()).replace(/<[^>]+>/g, "")).toContain("$39 once for lifetime access · next $49");
    const missing = await render({ available: false, reason: "unreachable" });
    expect(missing).toContain("live price is temporarily unavailable");
    expect(missing).not.toContain('"price":');
    const closed = await render({ ...live, offer: { ...live.offer, open: false } });
    expect(closed).toContain("lifetime deal has closed");
    expect(closed).not.toContain('"price":');
    expect(closed).toContain("Included-scan packs are not on sale yet");
  });

  it("registers one canonical, discovery entries and four contextual incoming links", () => {
    expect(seoMetadata(page).alternates.canonical).toBe("/local-seo-audit");
    expect(STATIC_PAGES.filter(p => p.path === page.path)).toEqual([{ path: page.path, title: page.h1, updated: "2026-11-26", inLlms: true }]);
    for (const path of ["/local-seo-software", "/blog/how-to-show-up-in-chatgpt", "/alternatives/brightlocal", "/map-rank-tracker"]) {
      expect(JSON.stringify(SEO_PAGES.find(p => p.path === path))).toContain('"href":"/local-seo-audit"');
    }
  });
});
