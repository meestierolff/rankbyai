import { describe, expect, it } from "vitest";
import { crawlerAccess, isAllowed, parseRobots, patternMatches } from "@/lib/audit/robots";

describe("robots.txt parsing (RFC 9309)", () => {
  it("groups consecutive User-agent lines and starts a new group after rules", () => {
    const g = parseRobots("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin # private\nSitemap: https://x.example/sitemap.xml");
    expect(g).toEqual([
      { agents: ["gptbot", "claudebot"], rules: [{ allow: false, pattern: "/" }] },
      { agents: ["*"], rules: [{ allow: false, pattern: "/admin" }] },
    ]);
  });

  it("an empty Disallow allows everything", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:"), "Googlebot", "/")).toBe(true);
  });

  it("the longest rule wins and Allow wins a tie", () => {
    const g = parseRobots("User-agent: *\nDisallow: /\nAllow: /$\nAllow: /services");
    expect(isAllowed(g, "Bingbot", "/")).toBe(true); // "/$" is longer than "/"
    expect(isAllowed(g, "Bingbot", "/services/teeth-whitening")).toBe(true);
    expect(isAllowed(g, "Bingbot", "/about")).toBe(false);
    expect(isAllowed(parseRobots("User-agent: *\nDisallow: /a\nAllow: /a"), "x", "/a")).toBe(true);
  });

  it("wildcards and end anchors", () => {
    expect(patternMatches("/*.pdf$", "/files/menu.pdf")).toBe(true);
    expect(patternMatches("/*.pdf$", "/files/menu.pdf?x=1")).toBe(false);
    expect(patternMatches("*", "/anything")).toBe(true);
    expect(patternMatches("/blog", "/blog-post")).toBe(true);
  });

  it("a named group replaces the * group for that crawler (case-insensitive)", () => {
    const g = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: googlebot\nAllow: /");
    expect(isAllowed(g, "Googlebot", "/")).toBe(true);
    expect(isAllowed(g, "Bingbot", "/")).toBe(false);
    // A group for Googlebot-News does not apply to Googlebot.
    expect(isAllowed(parseRobots("User-agent: Googlebot-News\nDisallow: /"), "Googlebot", "/")).toBe(true);
  });
});

describe("crawler access for the audit", () => {
  it("a 'block AI bots' file that also blocks the AI search crawlers is caught, training-only blocks are not a problem", () => {
    const text = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /";
    const a = crawlerAccess({ status: 200, text }, ["/", "/emergency-plumber"])!;
    expect(a.hasRobots).toBe(true);
    expect(a.blocked.map((b) => [b.agent, b.tier])).toEqual([["OAI-SearchBot", "ai_search"], ["GPTBot", "training"], ["ClaudeBot", "training"]]);
    expect(a.blocked[0].paths).toEqual(["/", "/emergency-plumber"]);
  });

  it("no robots.txt (404) or an HTML page served instead means nothing is blocked", () => {
    expect(crawlerAccess({ status: 404, text: "" }, ["/"])).toEqual({ blocked: [], paths: ["/"], hasRobots: false });
    expect(crawlerAccess({ status: 200, text: "<!doctype html><html>…" }, ["/"])?.blocked).toEqual([]);
  });

  it("a fetch failure or a server error is 'unknown', never 'allowed'", () => {
    expect(crawlerAccess(null, ["/"])).toBeNull();
    expect(crawlerAccess({ status: 503, text: "" }, ["/"])).toBeNull();
  });

  it("a crawler blocked only from a money page is reported with that page", () => {
    const a = crawlerAccess({ status: 200, text: "User-agent: Bingbot\nDisallow: /services" }, ["/", "/services/drain-cleaning"])!;
    expect(a.blocked).toEqual([{ agent: "Bingbot", tier: "search", serves: "Bing, Copilot and ChatGPT search results", paths: ["/services/drain-cleaning"] }]);
  });
});
