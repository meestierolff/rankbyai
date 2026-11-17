import { describe, expect, it } from "vitest";
import { buildOffer, DEFAULT_LADDER, formatClosesAt, heatFor, priceCentsFor, priceCentsForSale, seatsLeftFor } from "@/lib/ladder";

describe("lifetime price ladder", () => {
  it("prices sales #1, #5, #6 and #11 as the brief requires", () => {
    expect(priceCentsForSale(1)).toBe(2900);
    expect(priceCentsForSale(5)).toBe(2900);
    expect(priceCentsForSale(6)).toBe(3900);
    expect(priceCentsForSale(11)).toBe(4900);
  });

  it("never sells more than 5 seats at one price", () => {
    const counts = new Map<number, number>();
    for (let sale = 1; sale <= 200; sale++) {
      const p = priceCentsForSale(sale);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBe(DEFAULT_LADDER.seatsPerStep);
  });

  it("counts seats left at the current price", () => {
    expect(seatsLeftFor(0)).toBe(5);
    expect(seatsLeftFor(2)).toBe(3);
    expect(seatsLeftFor(4)).toBe(1);
    expect(seatsLeftFor(5)).toBe(5);
  });

  it("builds the public offer", () => {
    const offer = buildOffer(7, DEFAULT_LADDER, new Date("2026-11-20T00:00:00Z"));
    expect(offer).toMatchObject({
      soldTotal: 7,
      currentPriceUsd: 39,
      nextPriceUsd: 49,
      seatsLeftAtCurrentPrice: 3,
      seatsPerStep: 5,
      stepUsd: 10,
      basePriceUsd: 29,
      bandIndex: 1,
      open: true,
    });
    expect(offer.upcoming.map((u) => u.priceUsd)).toEqual([49, 59, 69, 79]);
  });

  it("closes at the published time and shows it as static text", () => {
    expect(buildOffer(0, DEFAULT_LADDER, new Date("2026-12-16T13:00:00Z")).open).toBe(false);
    expect(buildOffer(0, DEFAULT_LADDER, new Date("2026-12-16T12:59:59Z")).open).toBe(true);
    expect(formatClosesAt(DEFAULT_LADDER.closesAt)).toBe("16 December 2026 at 13:00 UTC");
  });

  it("heats the accent as seats run out", () => {
    expect([5, 4, 3, 2, 1].map(heatFor)).toEqual(["calm", "calm", "calm", "warm", "hot"]);
  });

  it("is monotonic: the price never goes down as sales grow", () => {
    let last = 0;
    for (let sold = 0; sold < 500; sold++) {
      const p = priceCentsFor(sold);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
});
