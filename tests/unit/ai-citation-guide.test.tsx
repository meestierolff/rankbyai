import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/marketing/page-shell", () => ({ PageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/offer", () => ({ getOfferCached: vi.fn() }));

import Page, { metadata } from "@/app/(marketing)/guides/ai-citation-workflow/page";
import { AI_CITATION_GUIDE as guide } from "@/lib/ai-citation-guide";
import { buildOffer } from "@/lib/ladder";
import { getOfferCached } from "@/lib/offer";
import { SEO_PAGES } from "@/lib/seo-pages";
import { STATIC_PAGES } from "@/lib/site-pages";

const live = { available: true as const, paidTotal: 0, offer: buildOffer(2, { basePriceCents: 2900, stepCents: 1000, seatsPerStep: 5, closesAt: "2026-12-16T13:00:00Z" }, new Date("2026-11-28T12:00:00Z")) };
async function render(result: Awaited<ReturnType<typeof getOfferCached>> = live) {
  vi.mocked(getOfferCached).mockResolvedValue(result);
  return renderToStaticMarkup(await Page()).replace(/<!-- -->/g, "");
}
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("AI citation workflow guide (X lead magnet)", () => {
  it("stays unlisted: noindex, own canonical, and out of the sitemap, footer and llms.txt registries", () => {
    expect(guide.listed).toBe(false);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/guides/ai-citation-workflow");
    expect(STATIC_PAGES.some((p) => p.path === guide.path)).toBe(false);
    expect(SEO_PAGES.some((p) => p.path === guide.path)).toBe(false);
  });

  it("server-renders the prompts, the four steps, the teardown and both connect snippets", async () => {
    const html = await render();
    expect(html).toContain(guide.h1);
    expect(html.match(/<li><code>/g)).toHaveLength(10);
    for (const id of ["step-1", "step-2", "step-3", "step-4", "teardown", "on-rails", "try-it"]) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("claude mcp add --transport http rankbyai https://rankbyai.live/api/mcp");
    expect(html).toContain("&quot;url&quot;: &quot;https://rankbyai.live/api/mcp&quot;");
    expect(html).toContain('href="/free-check"');
    expect(text(html)).toContain("There is no guaranteed ranking in ChatGPT, Gemini or Perplexity.");
  });

  it("states the teardown the way the stored scans support it", async () => {
    const t = text(await render());
    expect(t).toContain("#1 on 9 of the 16 grid points that returned Maps results");
    expect(t).toContain("it named five other agencies there instead");
    expect(t).toContain("At the grid point nearest the metro’s downtown, none of the three engines named them");
    expect(t).toContain("ChatGPT and Perplexity cited third-party lists and directories");
    expect(t).not.toContain("two competitors were named there instead");
  });

  it("takes every price from the live offer, and handles a moved, unavailable or closed offer", async () => {
    expect(text(await render())).toContain("Lifetime access is $29 today, then $39 after the next 3 sales. The lifetime deal closes on 16 December 2026 at 13:00 UTC.");
    const moved = { ...live, offer: buildOffer(9, { basePriceCents: 2900, stepCents: 1000, seatsPerStep: 5, closesAt: "2026-12-16T13:00:00Z" }, new Date("2026-11-28T12:00:00Z")) };
    expect(text(await render(moved))).toContain("Lifetime access is $39 today, then $49 after the next sale.");
    const missing = text(await render({ available: false, reason: "unreachable" }));
    expect(missing).toContain("The live price is on the pricing page.");
    expect(missing).not.toMatch(/\$(29|39|49)\b/);
    const closed = text(await render({ ...live, offer: { ...live.offer, open: false } }));
    expect(closed).toContain("The lifetime deal has closed");
    expect(closed).not.toMatch(/\$(29|39|49)\b/);
  });
});
