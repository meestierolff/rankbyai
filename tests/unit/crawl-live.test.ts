import { describe, expect, it } from "vitest";
import { crawlSite, fetchPage, probeCrawlers } from "@/lib/audit/crawl";

/** Network test, off by default. Run with LIVE_CRAWL=1 to check the pinned fetch against a real public site. */
describe.skipIf(!process.env.LIVE_CRAWL)("website fetcher (live)", () => {
  it("fetches a public page through the pinned connection", async () => {
    const page = await fetchPage("https://example.com/");
    expect(page?.status).toBe(200);
    expect(page?.html).toContain("Example Domain");
  });
  it("refuses a private address", async () => {
    expect(await fetchPage("http://127.0.0.1:80/")).toBeNull();
    expect(await fetchPage("http://169.254.169.254/latest/meta-data/")).toBeNull();
  });
  it("asks the homepage as named crawlers and keeps who answered (status, server, cf-ray)", async () => {
    const plain = await probeCrawlers("https://example.com/", ["OAI-SearchBot", "GPTBot"]);
    expect(plain.map((p) => p.agent)).toEqual(["OAI-SearchBot", "GPTBot"]);
    for (const p of plain) expect(p.status).toBeTypeOf("number");
    // A page served through Cloudflare carries cf-ray whatever it answers.
    const [cf] = await probeCrawlers("https://developers.cloudflare.com/", ["OAI-SearchBot"]);
    expect(cf.status).toBeTypeOf("number");
    expect(cf.cfRay).toBeTruthy();
  });
  it("crawls a small site", async () => {
    const crawl = await crawlSite("https://example.com", 3);
    expect(crawl.home?.title).toBe("Example Domain");
  });
});
