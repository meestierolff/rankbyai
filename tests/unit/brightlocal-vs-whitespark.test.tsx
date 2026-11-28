import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactTableView, ourPriceCell } from "@/components/marketing/seo-article";
import { BRIGHTLOCAL_VS_WHITESPARK, OUR_LIVE_PRICE, type DatedCell } from "@/lib/competitors";
import { buildOffer } from "@/lib/ladder";
import { faqLd } from "@/lib/seo";
import { SEO_PAGES, seoPage, type Block, type Inline } from "@/lib/seo-pages";
import { STATIC_PAGES } from "@/lib/site-pages";

const PATH = "/brightlocal-vs-whitespark";
const page = seoPage(PATH)!;
const table = BRIGHTLOCAL_VS_WHITESPARK;
const inlines = (b: Block): Inline[] => {
  if (typeof b === "string") return [b];
  if ("p" in b) return b.p;
  if ("list" in b) return b.list;
  if ("code" in b) return [b.code];
  return [b.table.caption, ...b.table.columns, ...b.table.rows.flat(2)];
};
const blocksOf = (p: typeof page) => [...p.sections.flatMap((s) => s.body), ...(p.afterTable ?? [])];
const linksIn = (p: typeof page) => blocksOf(p).flatMap(inlines).filter((x): x is { text: string; href: string } => typeof x !== "string");
const textOf = (p: typeof page) =>
  [p.title, p.description, p.h1, p.answer, p.entity?.("") ?? "", ...p.sections.flatMap((s) => [s.h2, ...s.body.flatMap(inlines).map((x) => (typeof x === "string" ? x : x.text))]), ...p.faqs.flatMap((f) => [f.q, f.a])].join("\n");
const offer = (sold: number, now = "2026-11-24T12:00:00Z") =>
  buildOffer(sold, { basePriceCents: 2900, stepCents: 1000, seatsPerStep: 5, closesAt: "2026-12-16T13:00:00.000Z" }, new Date(now));

describe("/brightlocal-vs-whitespark", () => {
  it("is registered with the title, meta and H1 from the brief, and in the sitemap list", () => {
    expect(page.title).toBe("BrightLocal vs Whitespark: Prices Checked 24 Nov 2026"); // + " | RankbyAI" from the layout
    expect(page.description).toBe("BrightLocal sells one suite from $41/mo; Whitespark sells each tool separately, grids from $10/mo. Prices from both vendors' pages, dated, plus AI answers.");
    expect(page.h1).toBe("BrightLocal vs Whitespark: suite or separate tools?");
    expect(page.schemaType).toBe("WebPage");
    expect(STATIC_PAGES.find((p) => p.path === PATH)).toEqual({ path: PATH, title: page.h1, updated: "2026-11-24", inLlms: true });
  });

  it("opens answer-first and keeps 'alternative' out of the title, H1 and H2s", () => {
    expect(page.answer.startsWith("BrightLocal vs Whitespark comes down to how you want to buy.")).toBe(true);
    expect(page.answer).toContain("24 November 2026");
    for (const h of [page.title, page.h1, ...page.sections.map((s) => s.h2)]) expect(h.toLowerCase()).not.toContain("alternative");
    expect(textOf(page).toLowerCase()).toContain("whitespark vs brightlocal");
  });

  it("makes no first/only/best claims, no banned words and no timing promise", () => {
    const text = textOf(page);
    expect(text).not.toMatch(/\b(the first|the only|best|powerful|invisible|losing customers)\b/i);
    expect(text).toContain("We make RankbyAI");
    expect(table.footnote).toContain("We make RankbyAI.");
    expect(table.footnote).toContain("“No mention found” means the pages we read say nothing about it");
  });

  it("FAQ JSON-LD is built from the visible FAQ text", () => {
    expect(page.faqs).toHaveLength(6);
    const ld = faqLd(page.faqs) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(ld.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(page.faqs.map((f) => [f.q, f.a]));
  });

  it("every vendor cell links the vendor's own page; RankbyAI's cells hold no price", () => {
    expect(table.columns.map((c) => c.name)).toEqual(["BrightLocal", "Whitespark", "RankbyAI (ours)"]);
    for (const row of table.rows) {
      expect(row.cells).toHaveLength(3);
      const [bl, ws, ours] = row.cells as DatedCell[];
      expect(bl.sources?.length).toBeGreaterThan(0);
      for (const s of bl.sources!) expect(new URL(s).hostname).toBe("www.brightlocal.com");
      expect(ws.sources?.length).toBeGreaterThan(0);
      for (const s of ws.sources!) expect(new URL(s).hostname).toBe("whitespark.ca");
      if (ours !== (OUR_LIVE_PRICE as unknown)) {
        expect(ours.sources).toBeUndefined();
        expect(ours.text).not.toMatch(/\$\d/);
      }
    }
    const ai = table.rows.find((r) => r.label.startsWith("AI answers"))!.cells[1] as DatedCell;
    expect(ai.text.startsWith("No mention found")).toBe(true);
    expect(ai.unknown).toBe(true);
    // Only the two cells we could not re-read on 24 Nov keep their older date.
    const older = table.rows.flatMap((r) => (r.cells as DatedCell[]).filter((c) => typeof c === "object" && c.readOn).map((c) => [r.label, c.readOn]));
    expect(older).toEqual([["API and MCP", "20 Nov 2026"], ["White-label", "20 Nov 2026"]]);
  });

  it("the RankbyAI price comes from the live offer and is withheld when the offer is unavailable", () => {
    expect(ourPriceCell(null)).toBeNull();
    expect(ourPriceCell(offer(0))?.text).toBe("$29 once, while the lifetime deal is open (live price)");
    expect(ourPriceCell(offer(7))?.text).toContain("$39 once");
    expect(ourPriceCell(offer(0, "2026-12-17T00:00:00Z"))?.text).toBe("The lifetime deal has closed");
    const html = renderToStaticMarkup(<FactTableView table={table} offer={null} />);
    const entryRow = html.slice(html.indexOf(">Entry price<"), html.indexOf(">Google Maps grid<"));
    expect(entryRow).toContain("See pricing");
    expect(entryRow).not.toContain("once,");
    expect(renderToStaticMarkup(<FactTableView table={table} offer={offer(12)} />)).toContain("$49 once, while the lifetime deal is open");
  });

  it("has at least three approved internal links in, no self-link, and no tracking parameters", () => {
    const sources = SEO_PAGES.filter((p) => p.path !== PATH && linksIn(p).some((l) => l.href === PATH)).map((p) => p.path);
    expect(sources.sort()).toEqual(["/alternatives/brightlocal", "/blog/brightlocal-pricing", "/local-falcon-vs-brightlocal", "/local-rank-tracker"]);
    expect(linksIn(page).some((l) => l.href === PATH)).toBe(false);
    expect(page.related).not.toContain(PATH);
    // Section anchors are valid internal destinations; query/tracking parameters are not.
    for (const l of SEO_PAGES.flatMap(linksIn)) expect(l.href).not.toMatch(/\?|utm_/);
    // Outgoing links named in the brief, and none to pages that do not exist yet.
    const out = new Set([...linksIn(page).map((l) => l.href), ...page.related]);
    for (const p of ["/local-falcon-vs-brightlocal", "/blog/brightlocal-pricing", "/alternatives/brightlocal", "/map-rank-tracker", "/ai-visibility-tracker", "/pricing"]) expect(out.has(p)).toBe(true);
    expect(out.has("/local-seo-report") || out.has("/ai-visibility-checker")).toBe(false);
  });

  it("the entity line reads correctly with and without a maker name", () => {
    expect(page.entity!("Example Maker")).toContain("is pay-once AI visibility and local SEO software made by Example Maker. It is not affiliated with BrightLocal or Whitespark.");
    expect(page.entity!("")).toContain("is pay-once AI visibility and local SEO software. It is not affiliated with BrightLocal or Whitespark.");
    expect(page.entity!("")).toContain("BrightLocal (brightlocal.com) is a UK-based local SEO platform sold as plans; Whitespark (whitespark.ca) is a Canadian local SEO company, founded in 2005 in Edmonton");
  });
});
