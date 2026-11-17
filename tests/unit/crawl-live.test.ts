import { describe, expect, it } from "vitest";
import { crawlSite, fetchPage } from "@/lib/audit/crawl";

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
  it("crawls a small site", async () => {
    const crawl = await crawlSite("https://example.com", 3);
    expect(crawl.home?.title).toBe("Example Domain");
  });
});
