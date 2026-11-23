import { describe, expect, it } from "vitest";
import { resolveCredentials } from "@/lib/keys";
import { backlinksLive, bulkTrafficLive } from "@/lib/providers/dataforseo";
import { buildFilters, defaultTokens } from "@/lib/targets/plan";

/**
 * REAL DataForSEO Backlinks and Labs calls (house login from .env.local), for citation targets.
 * Checks the account can use the Backlinks API at all, the filter syntax, the response shape and
 * the cost each response reports. Skipped unless LIVE_DFS=1. Expected spend: about $0.06
 * (2 backlinks calls of 10 rows at $0.024 + $0.000036 a row, 1 traffic call at $0.012 + $0.00012 a URL).
 *
 *   LIVE_DFS=1 npx vitest run tests/live/dataforseo-backlinks-live.test.ts
 */
const live = process.env.LIVE_DFS === "1";
const LIST_FILTER = [["url_from", "ilike", "%best%"], "or", ["url_from", "ilike", "%top-%"], "or", ["url_from", "ilike", "%review%"]];

describe.skipIf(!live || process.env.LIVE_DFS_LOCAL !== "1")("the local filter (city, near-me and the directory list)", () => {
  it("is accepted by DataForSEO (about $0.024)", async () => {
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    const creds = (await resolveCredentials(null, "credits")).dataforseo!;
    const filters = buildFilters(defaultTokens("local", "Austin"), { directories: true });
    const r = await backlinksLive(creds, { target: "localfalcon.com", limit: 5, filters });
    console.log(`[live] local filter: ${r.items.length} rows of ${r.total} | cost $${r.costUsd} | ${r.items.map((i) => i.domain).join(", ")}`);
    expect(r.costUsd).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(!live || process.env.LIVE_DFS_LOCAL === "1")("DataForSEO backlinks and traffic, real calls", () => {
  it("finds list pages linking to a competitor and to the client, and estimates their traffic", async () => {
    delete process.env.RANKBYAI_MOCK_PROVIDERS;
    const creds = (await resolveCredentials(null, "credits")).dataforseo!;
    expect(creds).toBeTruthy();
    const competitor = await backlinksLive(creds, { target: "localfalcon.com", limit: 10, filters: LIST_FILTER });
    console.log(`[live] competitor: ${competitor.items.length} rows of ${competitor.total} | cost $${competitor.costUsd} | ${competitor.items.slice(0, 5).map((i) => `${i.url} (rank ${i.pageRank})`).join(" ; ")}`);
    const client = await backlinksLive(creds, { target: "rankbyai.live", limit: 10, filters: LIST_FILTER });
    console.log(`[live] client: ${client.items.length} rows of ${client.total} | cost $${client.costUsd}`);
    const urls = [...new Set(competitor.items.map((i) => i.url))].slice(0, 10);
    const traffic = await bulkTrafficLive(creds, urls, "US");
    console.log(`[live] traffic for ${urls.length} URLs | cost $${traffic.costUsd} | ${[...traffic.etv.entries()].slice(0, 5).map(([u, v]) => `${u} → ${v}`).join(" ; ")}`);
    expect(competitor.items.every((i) => /best|top-|review/i.test(i.url))).toBe(true);
    expect(competitor.costUsd).toBeGreaterThan(0);
  }, 240_000);
});
