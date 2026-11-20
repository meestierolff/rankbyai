import { describe, expect, it } from "vitest";
import { CATEGORY_WEIGHTS, numbersIn, runChecks, scoreAudit, type AuditInputs } from "@/lib/audit/checks";
import { extractFacts } from "@/lib/audit/crawl";
import { reviewFix } from "@/lib/audit/checks";
import { pageMath, pagePlan, pagePlanCsv, reviewTarget } from "@/lib/audit/math";
import type { BusinessInfo } from "@/lib/providers/dataforseo";

const profile = (over: Partial<BusinessInfo> = {}): BusinessInfo => ({
  name: "Northgate Family Dental", description: "Family dentist.", category: "Dentist", additionalCategories: ["Cosmetic dentist"], cid: "1", placeId: null,
  address: "100 North Loop Blvd, Austin, TX 78751", addressParts: null, phone: "+1 512-555-0174", url: "https://northgate.example", domain: "northgate.example", totalPhotos: 12,
  rating: 4.6, reviews: 38, isClaimed: true, hasHours: true, attributes: [], lat: 30.3, lng: -97.7, ...over,
});
const rival = (name: string, reviews: number, photos: number, cats = 3): { name: string; profile: BusinessInfo } => ({
  name, profile: profile({ name, reviews, totalPhotos: photos, rating: 4.8, category: "Dentist", additionalCategories: Array.from({ length: cats - 1 }, (_, i) => `Cat ${i}`) }),
});

const homeHtml = (phone: string) => `<html><head><title>Northgate Family Dental | Dentist in Austin</title></head><body><h1>Family Dentist in Austin</h1>
  <p>100 North Loop Blvd, Austin, TX 78751. Call ${phone}</p></body></html>`;

function inputs(over: Partial<AuditInputs> = {}): AuditInputs {
  return {
    business: { name: "Northgate Family Dental", website: "https://northgate.example", phone: "+1 512-555-0174", address: "100 North Loop Blvd, Austin, TX 78751", city: "Austin", category: "Dentist" },
    service: "dentists",
    months: 3,
    profile: profile(),
    competitors: [rival("Smile Dental", 112, 41), rival("Pecan Row Dentistry", 96, 60), rival("Bluebonnet Dental Co.", 240, 22)],
    site: { home: extractFacts("https://northgate.example/", homeHtml("(512) 555-0147")), pages: [], hasLlmsTxt: false, knownPages: 7 },
    ai: {
      scanDate: "2026-11-17T10:00:00Z", points: 9,
      engines: [{ engine: "openai", done: 9, mentioned: 0 }, { engine: "perplexity", done: 9, mentioned: 0 }, { engine: "gemini", done: 9, mentioned: 2 }],
      namedInstead: [{ name: "Smile Dental", mentions: 14 }], sharedSources: [{ domain: "dir-a.example", engines: 3 }, { domain: "dir-b.example", engines: 2 }], competitorOnlySources: ["dir-a.example"],
    },
    services: { yours: ["Check-ups", "Fillings", "Crowns"], missing: [{ service: "Invisalign", competitor: "Smile Dental", url: "https://smile.example/invisalign" }, { service: "Dental implants", competitor: "Pecan Row Dentistry", url: "https://pecan.example/implants" }, { service: "Emergency dentist", competitor: "Smile Dental", url: "https://smile.example/emergency" }], method: "heuristic" },
    areas: { names: ["North Loop", "Hyde Park", "Crestview", "Brentwood", "Allandale", "Rosedale", "Mueller", "Windsor Park", "Hancock"], radiusMiles: 10 },
    ...over,
  };
}

describe("audit maths (hand-checked)", () => {
  it("review target: You 38 · median 112 · gap 74 · ÷ 3 months = 25 reviews/month", () => {
    expect(reviewTarget(38, [112, 96, 240], 3)).toEqual({ you: 38, top3Median: 112, top3Average: 149, top3Max: 240, gap: 74, months: 3, monthlyTarget: 25 });
    expect(reviewTarget(38, [112, 96, 240], 6)?.monthlyTarget).toBe(13); // ceil(74 / 6)
    expect(reviewTarget(300, [112, 96, 240], 3)).toMatchObject({ gap: 0, monthlyTarget: 0 });
    expect(reviewTarget(38, [], 3)).toBeNull();
    expect(reviewTarget(38, [112, 96, 240], 99)?.months).toBe(12);
  });
  it("page maths: 6 services × 9 areas = 54 pages; you have 7 → 47 to build", () => {
    const services = ["a", "b", "c", "d", "e", "f"];
    const areas = Array.from({ length: 9 }, (_, i) => `Area ${i}`);
    expect(pageMath(services, areas, 7)).toEqual({ services: 6, areas: 9, pagesNeeded: 54, pagesHave: 7, toBuild: 47 });
    const rows = pagePlan(["Dental implants"], ["North Loop", "Hyde Park"], "Northgate Family Dental");
    expect(rows).toEqual([
      { service: "Dental implants", area: "North Loop", slug: "/dental-implants-north-loop", title: "Dental Implants in North Loop | Northgate Family Dental" },
      { service: "Dental implants", area: "Hyde Park", slug: "/dental-implants-hyde-park", title: "Dental Implants in Hyde Park | Northgate Family Dental" },
    ]);
    const csv = pagePlanCsv([{ service: '=cmd|"x"', area: "A, B", slug: "/x", title: "t" }]);
    expect(csv.split("\r\n")[0]).toBe("service,area,suggested_slug,suggested_title");
    expect(csv.split("\r\n")[1]).toBe(`"'=cmd|""x""","A, B","/x","t"`); // formula neutralised, quotes escaped
  });
});

describe("checks and findings", () => {
  const checks = runChecks(inputs());
  const failed = checks.filter((c) => c.status === "fail");
  const byKey = (k: string) => checks.find((c) => c.key === k)!;

  it("finds the phone mismatch as P0 with both numbers as evidence", () => {
    const c = byKey("nap_phone");
    expect(c).toMatchObject({ status: "fail", priority: "P0" });
    expect(c.evidence.map((e) => e.value).join(" ")).toContain("555-0174");
    expect(c.evidence.map((e) => e.value).join(" ")).toContain("(512) 555-0147");
    expect(runChecks(inputs({ site: { home: extractFacts("https://northgate.example/", homeHtml("512.555.0174")), pages: [], hasLlmsTxt: false, knownPages: 7 } })).find((x) => x.key === "nap_phone")?.status).toBe("pass");
  });

  it("review finding matches the hand calculation", () => {
    const c = byKey("review_gap");
    expect(c).toMatchObject({ status: "fail", priority: "P1", title: "38 reviews vs a map-pack median of 112" });
    expect(c.fix).toBe("Ask every customer. Aim for 25 new reviews a month for 3 months to reach the median.");
    expect(c.evidence.find((e) => e.label === "Monthly target")?.value).toBe("74 ÷ 3 months = 25 reviews/month");
  });

  it("service gap cites competitor URLs; page maths shows its working", () => {
    const sp = byKey("service_pages");
    expect(sp).toMatchObject({ status: "fail", priority: "P1", title: "No page for 3 services that competitors have pages for" });
    expect(sp.evidence.filter((e) => e.source_url).map((e) => e.source_url)).toEqual(["https://smile.example/invisalign", "https://pecan.example/implants", "https://smile.example/emergency"]);
    expect(byKey("page_math").title).toBe("6 services × 9 areas = 54 pages; the site has 7");
  });

  it("AI absence at 2 of 3 engines is a P1", () => {
    expect(byKey("ai_mentions")).toMatchObject({ status: "fail", priority: "P1", title: "Not named by 2 of 3 AI engines" });
    const named = inputs();
    named.ai!.engines[0].mentioned = 4;
    expect(runChecks(named).find((c) => c.key === "ai_mentions")?.status).toBe("pass");
  });

  it("has findings at every priority level here, each with evidence", () => {
    for (const p of ["P0", "P1", "P2", "P3"]) expect(failed.some((f) => f.priority === p), p).toBe(true);
    expect(failed.every((f) => f.evidence.length > 0 && f.fix.length > 0)).toBe(true);
  });

  it("NO finding contains a number that is absent from its evidence", () => {
    const variants = [inputs(), inputs({ months: 7 }), inputs({ competitors: [rival("A", 5, 2, 1)] }), inputs({ profile: profile({ reviews: 0, totalPhotos: 0, additionalCategories: [] }) })];
    let checked = 0;
    for (const v of variants) {
      for (const c of runChecks(v).filter((x) => x.status === "fail")) {
        const hay = c.evidence.map((e) => `${e.label} ${e.value}`).join(" | ");
        const allowed = new Set(numbersIn(hay));
        for (const n of numbersIn(`${c.title} ${c.fix}`)) {
          expect(allowed.has(n), `${c.key}: "${n}" in "${c.title} / ${c.fix}" is not in evidence: ${hay}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("score", () => {
  it("is 0–100 and the published weights sum to 100", () => {
    expect(Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const s = scoreAudit(runChecks(inputs()));
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(100);
    expect(s.checksRan).toBeLessThanOrEqual(s.checksTotal);
  });

  it("checks that cannot run are 'not checked', leave the denominator, and never become findings", () => {
    const blind = inputs({ site: null, ai: null, services: null, areas: null, profile: null, competitors: [] });
    const checks = runChecks(blind);
    expect(checks.every((c) => c.status === "not_checked")).toBe(true);
    expect(checks.every((c) => !!c.reason)).toBe(true);
    const s = scoreAudit(checks);
    expect(s).toMatchObject({ score: 0, checksRan: 0 });
    expect(s.checksTotal).toBe(checks.length);

    // Only the website category unavailable: the score is computed over the rest, not dragged down.
    const noSite = scoreAudit(runChecks(inputs({ site: null })));
    expect(noSite.categoryScores.website).toMatchObject({ score: null, ran: 0 });
    expect(noSite.checksRan).toBeLessThan(noSite.checksTotal);
  });

  it("a business that passes everything scores 100", () => {
    const html = `<html><head><title>Northgate Family Dental | Dentists in Austin</title>
      <script type="application/ld+json">[{"@type":"Dentist","name":"Northgate Family Dental","telephone":"+1 512-555-0174","address":"100 North Loop Blvd, Austin, TX 78751"},{"@type":"FAQPage"}]</script></head>
      <body><h1>Dentists in Austin</h1><p>Family dentists in Austin for check-ups, fillings and crowns.</p>
      <h2>Do you take new patients?</h2><p>Yes, we take new patients every week. Most visits are booked within three days.</p>
      <h2>FAQ</h2><p>Answers to the questions patients ask us most often.</p>
      <a href="tel:+15125550174">Call</a> 100 North Loop Blvd, Austin, TX 78751 <iframe src="https://www.google.com/maps/embed?x"></iframe></body></html>`;
    const perfect = inputs({
      profile: profile({ reviews: 500, totalPhotos: 90, additionalCategories: ["a", "b", "c"], rating: 4.9 }),
      site: { home: extractFacts("https://northgate.example/", html), pages: [], hasLlmsTxt: true, knownPages: 60, robots: { status: 200, text: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /" } },
      services: { yours: ["Check-ups"], missing: [], method: "heuristic" },
      areas: { names: ["North Loop"], radiusMiles: 10 },
    });
    perfect.ai = { ...perfect.ai!, engines: perfect.ai!.engines.map((e) => ({ ...e, mentioned: 5 })), competitorOnlySources: [] };
    const checks = runChecks(perfect);
    expect(checks.filter((c) => c.status === "fail").map((c) => c.key)).toEqual([]);
    expect(scoreAudit(checks).score).toBe(100);
  });
});

describe("review gap advice stays plausible", () => {
  it("keeps the chosen months while the pace is realistic", () => {
    expect(reviewFix(74, 25, 3)).toBe("Ask every customer. Aim for 25 new reviews a month for 3 months to reach the median.");
  });
  it("spreads a large gap over a year, and states only the gap past that (real audit, 18 Nov 2026: 181 vs 748)", () => {
    expect(reviewFix(300, 100, 3)).toBe("Ask every customer. The gap is 300 reviews: about 25 new reviews a month closes it in a year.");
    // The real one: 748 − 181 = 567; 567 ÷ 12 = 48 a month is still not realistic, so only the gap is stated.
    expect(reviewFix(567, 189, 3)).toBe("Ask every customer after every visit. The gap to the median is 567 reviews, so this is a long-term habit, not a one-month push.");
  });
  it("states only the gap when even a year is not realistic", () => {
    expect(reviewFix(2000, 667, 3)).not.toMatch(/a month/);
  });
});

describe("findability: crawler access, service page, money pages", () => {
  const page = (url: string, html: string) => extractFacts(url, html);
  const servicePage = (body: string) => page("https://northgate.example/dentists-austin", `<html><head><title>Dentists in Austin | Northgate</title></head><body><nav><a href="/">Home</a> <h2>Menu</h2></nav>${body}<footer><h2>Contact us</h2><p>Call today.</p></footer></body></html>`);
  const withSite = (over: Partial<NonNullable<AuditInputs["site"]>>) => inputs({ site: { ...inputs().site!, ...over } });
  const check = (inp: AuditInputs, key: string) => runChecks(inp).find((c) => c.key === key)!;

  it("robots.txt that blocks an AI search crawler is a P1 finding; blocking only training crawlers passes", () => {
    const blocked = check(withSite({ robots: { status: 200, text: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nDisallow: /" } }), "ai_crawlers");
    expect(blocked).toMatchObject({ status: "fail", priority: "P1", title: "robots.txt blocks AI search crawlers: OAI-SearchBot" });
    expect(blocked.evidence.find((e) => e.label.startsWith("Training-only"))?.value).toBe("GPTBot");
    expect(check(withSite({ robots: { status: 200, text: "User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /" } }), "ai_crawlers").status).toBe("pass");
  });

  it("a search engine crawler blocked is P0; no robots.txt passes; an unreadable one is not checked", () => {
    expect(check(withSite({ robots: { status: 200, text: "User-agent: *\nDisallow: /" } }), "ai_crawlers")).toMatchObject({ status: "fail", priority: "P0" });
    expect(check(withSite({ robots: { status: 404, text: "" } }), "ai_crawlers").status).toBe("pass");
    expect(check(withSite({ robots: null }), "ai_crawlers").status).toBe("not_checked");
    expect(check(withSite({ robots: { status: 503, text: "" } }), "ai_crawlers").status).toBe("not_checked");
  });

  it("finds a service page by word root (plumber → Plumbing), and says 'not checked' when only the homepage was read", () => {
    const plumbing = { ...inputs(), service: "emergency plumber" };
    const pages = [{ url: "https://northgate.example/emergency-plumbing", title: "24/7 Emergency Plumbing", h1: ["Emergency plumbing in Austin"] }];
    expect(check({ ...plumbing, site: { ...plumbing.site!, pages } }, "service_page").status).toBe("pass");
    const other = [{ url: "https://northgate.example/drains", title: "Drain cleaning", h1: ["Drain cleaning"] }];
    expect(check({ ...plumbing, site: { ...plumbing.site!, pages: other } }, "service_page")).toMatchObject({ status: "fail", title: "No page is about “emergency plumber”" });
    expect(check({ ...plumbing, site: { ...plumbing.site!, pages: [] } }, "service_page").status).toBe("not_checked");
  });

  it("checks the opening words, subheadings and short answers of the money pages, not the menu or footer", () => {
    const good = servicePage(`<h1>Dentists in Austin</h1><p>Northgate is a family dental practice in Austin.</p>
      <h2>How much is a check-up?</h2><p>A check-up with cleaning costs the same as most practices nearby. We send the price before you book.</p>
      <h2>Do you see children?</h2><p>Yes, we see children from their first tooth.</p>`);
    expect(good.intro.startsWith("Dentists in Austin Northgate")).toBe(true);
    expect(good.h2Sections.map((s) => s.heading)).toEqual(["How much is a check-up?", "Do you see children?"]);
    // The homepage is a money page too, so it needs the same structure.
    const home = page("https://northgate.example/", `<html><head><title>Northgate Family Dental | Dentists in Austin</title></head><body>
      <h1>Family dentists in Austin</h1><p>Check-ups, fillings and crowns at 100 North Loop Blvd. Call +1 512-555-0174.</p>
      <h2>Opening hours</h2><p>We are open Monday to Friday, with early slots before work.</p><h2>Insurance</h2><p>We work with most dental insurance plans in Texas.</p></body></html>`);
    const ok = withSite({ home, pages: [good] });
    for (const key of ["money_opening", "money_subheadings", "answer_first"]) expect(check(ok, key).status, key).toBe("pass");

    const wall = "We are proud to serve our community with care and attention to every detail of every visit " .repeat(8);
    const poor = servicePage(`<h1>Welcome</h1><p>${wall}</p><h2>About our dentists</h2><p>${wall}.</p><h3>Team</h3>`);
    const bad = withSite({ pages: [poor] });
    expect(check(bad, "money_opening")).toMatchObject({ status: "fail", title: "The opening words of 1 of 2 money pages miss the service or the city" });
    expect(check(bad, "money_subheadings")).toMatchObject({ status: "fail", title: "2 of 2 money pages have fewer than 2 subheadings" });
    expect(check(bad, "answer_first").status).toBe("not_checked"); // one section in all: too few to judge
  });

  it("new findings state no number that is missing from their evidence", () => {
    const wall = "word ".repeat(70);
    const poor = servicePage(`<h1>Welcome</h1><h2>One</h2><p>${wall}.</p><h2>Two</h2><p>${wall}.</p><h2>Three</h2>`);
    const inp = withSite({ pages: [poor], robots: { status: 200, text: "User-agent: Bingbot\nDisallow: /" } });
    let checked = 0;
    for (const c of runChecks(inp).filter((x) => x.status === "fail" && ["ai_crawlers", "service_page", "money_opening", "money_subheadings", "answer_first"].includes(x.key))) {
      const allowed = new Set(numbersIn(c.evidence.map((e) => `${e.label} ${e.value}`).join(" | ")));
      for (const n of numbersIn(`${c.title} ${c.fix}`)) {
        expect(allowed.has(n), `${c.key}: "${n}" not in evidence`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(4);
  });
});
