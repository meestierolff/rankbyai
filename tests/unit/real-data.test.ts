import { describe, expect, it } from "vitest";
import { pickFeaturedPage } from "@/components/marketing/real-data";
import type { RegionalPage } from "@/lib/regional";

const page = (city: string, country: string, samples: number, top: number): RegionalPage => ({
  niche_slug: "dentist", city_slug: city.toLowerCase(), labels: { niche: "dentist", city, region: null, country }, engine_stats: {},
  top_businesses: [{ name: "Top Practice", answers: top }], maps_leaders: [], sample_count: samples, scans_count: 2,
  first_seen: "2026-11-20", last_updated: "2026-11-20", indexable: true,
});

describe("which city page the landing features", () => {
  it("skips pages outside the target markets and pages one business dominates", () => {
    const berlin = page("Berlin", "DE", 200, 20);
    const austin = page("Austin", "US", 81, 34 + 10); // 44 of 81: more than half
    const denver = page("Denver", "US", 54, 12);
    expect(pickFeaturedPage([berlin, austin, denver])).toBe(denver);
  });
  it("shows nothing rather than a page that reads as an advert", () => {
    expect(pickFeaturedPage([page("Austin", "US", 81, 60)])).toBeNull();
    expect(pickFeaturedPage([])).toBeNull();
  });
});
