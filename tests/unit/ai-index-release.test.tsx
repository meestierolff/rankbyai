import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/regional", () => ({ listRegionalPagesCached: async () => [], hasRegionalPages: async () => false }));
vi.mock("@/lib/offer", () => ({ getOfferCached: async () => ({ available: false }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("AI_INDEX_PUBLIC release switch", () => {
  for (const enabled of [false,true]) {
    it(`${enabled ? "enables" : "disables"} metadata, sitemap, llms.txt and research links together`, async () => {
      vi.stubEnv("AI_INDEX_PUBLIC",String(enabled)); vi.resetModules();
      const [{metadata}, {default:sitemap}, {GET}, {IndexResearchLink}] = await Promise.all([
        import("@/app/(marketing)/ai-index/seo-agencies/page"),
        import("@/app/sitemap"), import("@/app/llms.txt/route"), import("@/components/ai-index/shared"),
      ]);
      expect(metadata.robots).toMatchObject({index:enabled,follow:true});
      const entries=(await sitemap()).filter(row=>row.url.includes("/ai-index/seo-agencies"));
      expect(entries).toHaveLength(enabled ? 388 : 0);
      if(enabled) expect(entries.every(row=>row.lastModified==="2026-11-24")).toBe(true);
      expect((await (await GET()).text()).includes("https://rankbyai.live/ai-index/seo-agencies")).toBe(enabled);
      const html=renderToStaticMarkup(<IndexResearchLink />);
      expect(html.includes('href="/ai-index/seo-agencies"')).toBe(enabled);
    });
  }
});
