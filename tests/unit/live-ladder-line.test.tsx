import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/marketing/hero";
import { LiveLadderLine, ladderLine } from "@/components/marketing/live-ladder-line";
import { OfferProvider, type LiveOffer } from "@/components/marketing/offer-context";
import { Pricing } from "@/components/marketing/pricing";
import { scenarioCosts } from "@/lib/cost/estimate";
import { buildOffer, formatClosesAt } from "@/lib/ladder";

const CLOSES = "2026-12-16T13:00:00.000Z";
/** The /api/offer shape: a ladder offer plus paidTotal. */
const offer = (over: Partial<LiveOffer> = {}): LiveOffer => ({
  ...buildOffer(1, { basePriceCents: 2900, stepCents: 1000, seatsPerStep: 5, closesAt: CLOSES }, new Date("2026-11-24T12:00:00Z")),
  paidTotal: 1,
  ...over,
});
const LINE = "data-live-ladder-line";
const render = (initial: LiveOffer | null, node: React.ReactNode) => renderToStaticMarkup(<OfferProvider initial={initial}>{node}</OfferProvider>);
/** Visible text of server-rendered HTML (tags and React's text separators removed). */
const textOf = (html: string) => html.replace(/<[^>]+>/g, "");
const costs = scenarioCosts();

describe("live ladder line", () => {
  it("is hidden when the offer is missing (503), closed, or nothing was paid for yet", () => {
    expect(ladderLine(null)).toBeNull();
    // The live endpoint today: nothing sold.
    expect(ladderLine(offer({ soldTotal: 0, paidTotal: 0, seatsLeftAtCurrentPrice: 5 }))).toBeNull();
    // A checkout hold raises soldTotal, but no seat is paid: still hidden.
    expect(ladderLine(offer({ soldTotal: 1, paidTotal: 0 }))).toBeNull();
    expect(ladderLine(offer({ open: false }))).toBeNull();
    expect(render(null, <LiveLadderLine />)).toBe("");
    expect(render(offer({ soldTotal: 0, paidTotal: 0 }), <LiveLadderLine />)).toBe("");
  });

  it("after the first sale, every figure comes from the offer JSON", () => {
    const live = offer({ soldTotal: 1, paidTotal: 1, currentPriceUsd: 29, nextPriceUsd: 39, seatsLeftAtCurrentPrice: 4, closesAt: CLOSES });
    const text = ladderLine(live)!;
    expect(text).toContain("$29");
    expect(text).toContain("4 left");
    expect(text).toContain("then $39");
    expect(text).toContain("16 December 2026 at 13:00 UTC");
    expect(text).toContain(formatClosesAt(live.closesAt));
    expect(ladderLine({ ...live, seatsLeftAtCurrentPrice: 1 })).toContain("· 1 left at this price ·");
    expect(textOf(render(live, <LiveLadderLine />))).toBe(text);
  });

  it("hero and pricing heading both follow the offer, and hide the line at zero sales", () => {
    const zero = offer({ soldTotal: 0, paidTotal: 0, seatsLeftAtCurrentPrice: 5 });
    const heroZero = render(zero, <Hero costs={costs} />);
    expect(heroZero).not.toContain(LINE);
    expect(heroZero).not.toContain("left at"); // the old pill is gone
    expect(heroZero).toContain("AI visibility you pay for once.");
    const pricingZero = render(zero, <Pricing costs={costs} />);
    expect(pricingZero).not.toContain(LINE);
    expect(pricingZero).toContain("$29 once."); // the card still shows the live price

    // A later sale moved the price: both placements show the new figures, nothing hard-coded.
    const moved = offer({ soldTotal: 6, paidTotal: 6, currentPriceUsd: 39, nextPriceUsd: 49, seatsLeftAtCurrentPrice: 4 });
    for (const html of [render(moved, <Hero costs={costs} />), render(moved, <Pricing costs={costs} />)]) {
      expect(html.split(LINE).length - 1).toBe(1);
      expect(textOf(html)).toContain("$39 lifetime · 4 left at this price · then $49 · closes 16 December 2026 at 13:00 UTC");
    }
  });

  it("pricing still renders its unavailable state without the line", () => {
    const html = render(null, <Pricing costs={costs} />);
    expect(html).not.toContain(LINE);
    expect(html).toContain("We could not load the live price.");
  });

  it("the component source holds no price, seat count or date", () => {
    const src = readFileSync("src/components/marketing/live-ladder-line.tsx", "utf8");
    expect(src).not.toMatch(/\$\d/);
    expect(src).not.toMatch(/\b\d+ left\b/);
    expect(src).not.toMatch(/December|2026|DEFAULT_LADDER/);
  });
});
