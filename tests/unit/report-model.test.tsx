import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VARIANTS, type VariantKey } from "@/app/dev/report-preview/fixtures";
import { contrastRatio, fitVerdict, fixPrompt, headlineStats, placeOf, quoteBlocks, sentenceEnds, splitBlocks, textOn, verdict } from "@/components/report/derive";
import {
  aiCounts, buildAiPoints, buildMapsPoints, buildQuote, mapsCounts, nearestPoint, recommendedFrom, safeHttpUrl, type QuoteRow, type RawPoint, type RawSample,
} from "@/components/report/model";
import { ReportBody } from "@/components/report/report-body";
import type { ReportView } from "@/components/report/types";
import { AI_DISCLAIMER_TEXT, NOT_AFFILIATED } from "@/lib/copy";

const SITE = "https://rankbyai.live";
const pt = (idx: number, n: number, status = "done", extra: Partial<RawPoint> = {}): RawPoint => ({ idx, row: Math.floor(idx / n), col: idx % n, lat: 30 + Math.floor(idx / n) * 0.01, lng: -97 + (idx % n) * 0.01, status, ...extra });
const sample = (point_idx: number, engine: RawSample["engine"], named: string[], you: number | null, status = "done"): RawSample => ({
  point_idx, engine, status, mentioned: status === "done" ? you != null : null, mention_position: you,
  named_businesses: named.map((name, i) => ({ name, position: i + 1, ...(you === i + 1 ? { you: true } : {}) })),
});

describe("report counts", () => {
  // 3×3: point 5 skipped (water), point 8 had no answer at all, point 4 is the business location.
  const points = Array.from({ length: 9 }, (_, i) => pt(i, 3, i === 5 ? "skipped" : "done"));
  const samples: RawSample[] = [];
  for (const p of points) {
    if (p.status === "skipped") continue;
    for (const e of ["openai", "gemini"] as const) {
      if (p.idx === 8) samples.push(sample(8, e, [], null, "failed"));
      else if (p.idx === 4 && e === "gemini") samples.push(sample(4, e, ["Acme Dental", "Smile Dental"], 1));
      else if (p.idx === 1 && e === "openai") samples.push(sample(1, e, [], null, "failed"));
      else samples.push(sample(p.idx, e, ["Smile Dental", "Pecan Row"], null));
    }
  }
  const ai = buildAiPoints(points, samples, ["openai", "gemini"]);

  it("never counts skipped or failed points, and an engine without an answer is not 'not named'", () => {
    expect(ai[5].state).toBe("skipped");
    expect(ai[8].state).toBe("failed");
    expect(ai[1].results.find((r) => r.engine === "openai")!.state).toBe("no_answer");
    expect(aiCounts(ai)).toEqual({ pointsChecked: 7, pointsMentioned: 1, pointsFailed: 1, pointsSkipped: 1, answersDone: 13 });
  });

  it("who AI recommends instead: points and answers over the same samples, the business always listed", () => {
    const rows = recommendedFrom(ai, samples, "Acme Dental");
    expect(rows[0]).toEqual({ name: "Smile Dental", you: false, points: 7, answers: 13 });
    expect(rows.find((r) => r.you)).toEqual({ name: "Acme Dental", you: true, points: 1, answers: 1 });
    // Samples at a skipped point are ignored even if one slipped in.
    const leaked = recommendedFrom(ai, [...samples, sample(5, "openai", ["Ghost Dental"], null)], "Acme Dental");
    expect(leaked.some((r) => r.name === "Ghost Dental")).toBe(false);
  });

  it("the quoted point is the checked point nearest the business; failed and skipped points are never chosen", () => {
    expect(nearestPoint(ai, { lat: 30.01, lng: -96.99 }, 3)?.idx).toBe(4);
    expect(nearestPoint(ai, { lat: 30.01, lng: -96.98 }, 3)?.idx).not.toBe(5);
    expect(nearestPoint(ai, null, 3)?.idx).toBe(4);
  });

  it("Google Maps: skipped and failed points are left out of top-3 and done counts", () => {
    const maps = buildMapsPoints([pt(0, 2, "done", { rank: 2 }), pt(1, 2, "done", { rank: null }), pt(2, 2, "skipped", { rank: 1 }), pt(3, 2, "failed", { rank: 1 })]);
    expect(maps.map((p) => p.state)).toEqual(["done", "done", "skipped", "failed"]);
    expect(maps[2].rank).toBeNull();
    expect(mapsCounts(maps)).toEqual({ pointsDone: 2, top3Points: 1, pointsFailed: 1, pointsSkipped: 1 });
  });

  it("quotes keep the answer verbatim, cap its length, and only link http(s) sources", () => {
    const row: QuoteRow = {
      ...sample(4, "openai", ["Acme Dental"], 1), prompt: "I'm in North Loop, Austin. Who are the best dentists near me?",
      answer_text: `1. **Acme Dental** – gentle care.\n${"x".repeat(7000)}`,
      sources: [{ url: "javascript:alert(1)", title: "bad" }, { url: "https://dir.example/a", title: "Dir" }, { url: "https://dir.example/a", title: "dup" }],
    };
    const q = buildQuote(ai[4], [row], ["openai", "gemini"], 3);
    expect(q.atBusiness).toBe(true);
    expect(q.prompt).toBe(row.prompt);
    expect(q.answers[0].answer!.startsWith("1. **Acme Dental** – gentle care.")).toBe(true);
    expect(q.answers[0].answer!.length).toBe(6000);
    expect(q.answers[0].answerCut).toBe(true);
    expect(q.answers[0].cited).toEqual([{ url: "https://dir.example/a", title: "Dir", domain: "dir.example" }]);
    expect(q.answers[1].state).toBe("no_answer");
    expect(safeHttpUrl("data:text/html,x")).toBeNull();
  });
});

describe("quoted answer formatting", () => {
  it("keeps every word, turns markdown markers into formatting and highlights the business", () => {
    const answer = "Here are some options:\n\n1. **Smile Dental** – friendly [1]\n2. **acme dental** – see [their site](https://acme.example) for hours\n- Ask about insurance";
    const blocks = quoteBlocks(answer, ["Acme Dental"]);
    const text = blocks.map((b) => `${b.marker ?? ""}${b.spans.map((s) => s.text).join("")}`).join("|");
    expect(text).toBe("Here are some options:|1.Smile Dental – friendly [1]|2.acme dental – see their site for hours|•Ask about insurance");
    const you = blocks.flatMap((b) => b.spans).filter((s) => s.you);
    expect(you).toEqual([{ text: "acme dental", bold: true, you: true }]);
    expect(splitBlocks(blocks, 30).head).toHaveLength(2);
  });
});

describe("headline and verdict", () => {
  it("uses the stored opener when there is one, so the email and the page say the same", () => {
    const view = VARIANTS.full.build();
    expect(verdict(view)).toBe(view.opener);
  });

  it("builds a plain sentence from the counts otherwise", () => {
    const view = VARIANTS["maps-only"].build();
    expect(verdict(view)).toBe(`Pecan Row Dentistry is in the top 3 for “dentist” at ${view.maps!.top3Points} of ${view.maps!.pointsDone} points around Austin.`);
    const big = VARIANTS.big.build();
    expect(verdict(big)).toContain(`at ${big.ai!.pointsMentioned} of ${big.ai!.pointsChecked} points`);
    expect(big.maps!.pointsSkipped).toBeGreaterThan(0);
    expect(big.maps!.pointsDone + big.maps!.pointsFailed + big.maps!.pointsSkipped).toBe(225);
  });

  it("shows only the parts a report has", () => {
    expect(headlineStats(VARIANTS["maps-only"].build()).map((s) => s.key)).toEqual(["maps"]);
    expect(headlineStats(VARIANTS.free.build()).map((s) => `${s.key}:${s.value}/${s.of}`)).toEqual(["ai:1/2", "maps:#6/null"]);
    expect(headlineStats(VARIANTS.full.build()).map((s) => s.key)).toEqual(["ai", "maps", "audit"]);
  });

  it("picks a readable text colour for an agency's button", () => {
    for (const c of ["#7c6cf2", "#ffcc00", "#123456", "#33cc77", "#000000", "#ffffff"]) expect(contrastRatio(c, textOn(c))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("report page", () => {
  const html = (view: ReportView) => renderToStaticMarkup(<ReportBody view={view} pdfHref="/r/abcdefghijkl/pdf" siteUrl={SITE} />);

  it.each(Object.keys(VARIANTS) as VariantKey[])("%s renders with one h1, the disclaimer wherever AI shows, and no relative link back to RankbyAI", (key) => {
    const view = VARIANTS[key].build();
    const out = html(view);
    expect(out.match(/<h1/g)).toHaveLength(1);
    if (view.ai) expect(out).toContain(AI_DISCLAIMER_TEXT.replace(/;/g, ";").replace(/'/g, "&#x27;"));
    for (const [, href] of out.matchAll(/href="([^"]+)"/g)) {
      expect(href.startsWith("/") ? href : "ok").not.toMatch(/^\/(#|$|pricing|login|app)/);
    }
    expect(out).not.toMatch(/\$\d|#pricing|countdown|only \d+ left/i);
  });

  it("white-label with hidden branding never mentions RankbyAI", () => {
    const out = html(VARIANTS["white-label"].build());
    expect(out).not.toContain("RankbyAI");
    expect(out).not.toContain(NOT_AFFILIATED);
    expect(out).toContain("Contact Brightline Local");
    expect(out).toContain('href="https://brightline-local.example/"');
  });

  it("RankbyAI's own reports link home with an absolute address (custom domains serve the same page)", () => {
    const out = html(VARIANTS.full.build());
    expect(out).toContain(`href="${SITE}"`);
    expect(out).toContain(NOT_AFFILIATED);
  });
});

describe("link-preview finding", () => {
  const long = "At 24 of 25 spots around Austin, AI assistants named Smile Dental and not Dr. Alexandra Papadopoulos Family & Cosmetic Dentistry of North Austin; it is outside the Google Maps top 3 at 74 of 81 spots. It has 21 reviews against a map-pack median of 112.";
  it("does not end a sentence at an abbreviation in a name", () => {
    expect(sentenceEnds("Named Dr. Alexandra Smith at 3. It has 21 reviews.")).toEqual([31]);
    expect(sentenceEnds("Named J. Smith Dental. Then more.")).toEqual([22]);
  });
  it("keeps short findings whole at the largest size", () => {
    expect(fitVerdict("AI assistants named the business at 2 of 9 points.", false)).toEqual({ text: "AI assistants named the business at 2 of 9 points.", size: 27 });
  });
  it("steps the font down, then keeps whole sentences, never cutting at Dr.", () => {
    const f = fitVerdict(long, false);
    expect(f.text.endsWith("74 of 81 spots.")).toBe(true);
    expect(f.size).toBeLessThan(27);
    expect(f.text).not.toMatch(/Dr\.$/);
  });
  it("falls back to the claim before a semicolon", () => {
    const one = long.split(" It has")[0].replace("74 of 81", "74 of 81 spots and on every one of the nine nearest streets to the practice, a long clause that keeps going past the budget for");
    const f = fitVerdict(one, false);
    expect(f.text).toBe("At 24 of 25 spots around Austin, AI assistants named Smile Dental and not Dr. Alexandra Papadopoulos Family & Cosmetic Dentistry of North Austin.");
  });
  it("every preview variant's finding fits the budget", () => {
    for (const key of Object.keys(VARIANTS) as VariantKey[]) {
      const f = fitVerdict(verdict(VARIANTS[key].build()), false);
      expect(f.text.length, key).toBeLessThanOrEqual(250);
    }
  });
});

describe("place line", () => {
  const at = (city: string | null, region: string | null) => placeOf({ business: { name: "X", city, region, category: null, lat: null, lng: null } } as unknown as ReportView);
  it("joins city and region once", () => {
    expect(at("Austin", "TX")).toBe("Austin, TX");
    expect(at("Austin, TX", "TX")).toBe("Austin, TX");
    expect(at("Austin, tx", "TX")).toBe("Austin, tx");
    expect(at("Texarkana", "TX")).toBe("Texarkana, TX");
    expect(at(null, "TX")).toBe("TX");
    expect(at("Austin", null)).toBe("Austin");
  });
});

describe("fix prompt for an AI assistant", () => {
  const html = (view: ReportView) => renderToStaticMarkup(<ReportBody view={view} pdfHref="/r/abcdefghijkl/pdf" siteUrl={SITE} />);
  it("restates the report's findings and every audit fix, and forbids invented facts", () => {
    const view = VARIANTS.full.build();
    const p = fixPrompt(view)!;
    expect(p).toContain(`This is about ${view.business.name}, a dentist in Austin, TX.`);
    expect(p).toContain(`named ${view.business.name} at ${view.ai!.pointsMentioned} of them`);
    for (const f of view.audit!.findings) expect(p).toContain(f.fix);
    expect(p).toContain("Do not invent reviews, ratings, prices, awards or claims.");
    expect(p).not.toMatch(/RankbyAI/);
  });
  it("is shown on RankbyAI reports and left out of white-label ones (the agency sells the fix)", () => {
    expect(html(VARIANTS.full.build())).toContain("Hand this to your AI assistant");
    expect(html(VARIANTS["white-label"].build())).not.toContain("Hand this to your AI assistant");
  });
  it("is null when there is nothing to fix", () => {
    const view = VARIANTS.full.build();
    const ai = { ...view.ai!, pointsMentioned: view.ai!.pointsChecked };
    expect(fixPrompt({ ...view, ai, maps: null, audit: { ...view.audit!, findings: [] } })).toBeNull();
  });
});
