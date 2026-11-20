import { describe, expect, it } from "vitest";
import { summarizeMaps, top3Reach } from "@/lib/scans/summary";

/** A 5×5 grid with 1-mile spacing, as [lat, lng, rank] rows read from two real scans on 20 Nov 2026. */
const grid = (lat0: number, lng0: number, dLat: number, dLng: number, ranks: (number | null)[]) =>
  ranks.map((rank, i) => ({ lat: lat0 - Math.floor(i / 5) * dLat, lng: lng0 + (i % 5) * dLng, rank }));

// South Austin Dentist, Austin TX: #4 at its own pin, top 3 just north, east and west, weak to the south.
const southAustin = grid(30.26628, -97.82375, 0.014495, 0.016775, [
  null, null, null, null, null,
  2, 2, 1, 6, null,
  5, 1, 4, 2, null,
  10, 8, 4, 7, null,
  null, null, null, null, null,
]);
const southAustinPin = { lat: 30.2373, lng: -97.7902 };

// Caffeinated Marketing, Mawson Lakes SA: top 3 across the middle block, absent 2 miles north, south and east.
const caffeinated = grid(-34.78499, 138.5851, 0.014495, 0.017652, [
  null, null, null, null, null,
  2, 2, 2, 1, null,
  2, 2, 1, 2, null,
  1, 1, 1, 2, null,
  null, null, null, null, null,
]);
const caffeinatedPin = { lat: -34.81397, lng: 138.62041 };

describe("top-3 reach, ring by ring from the pin", () => {
  it("South Austin Dentist holds the top 3 out to about a mile, though it is #4 at its own pin", () => {
    expect(top3Reach(southAustin, southAustinPin)).toEqual({ miles: 1, atLeast: false });
  });

  it("Caffeinated Marketing holds it out to 1.4 miles, not to the 2.2-mile corner points", () => {
    expect(top3Reach(caffeinated, caffeinatedPin)).toEqual({ miles: 1.4, atLeast: false });
  });

  it("top 3 everywhere means 'at least' the grid's edge", () => {
    const all = southAustin.map((p) => ({ ...p, rank: 1 }));
    expect(top3Reach(all, southAustinPin)).toEqual({ miles: 2.8, atLeast: true });
  });

  it("no number when it does not hold the top 3 around its pin, or the grid does not cover the pin", () => {
    expect(top3Reach(southAustin.map((p) => ({ ...p, rank: 9 })), southAustinPin)).toBeNull();
    expect(top3Reach(southAustin, { lat: 30.4, lng: -97.79 })).toBeNull(); // a grid moved ~11 miles away
    expect(top3Reach(southAustin.slice(0, 3), southAustinPin)).toBeNull();
  });

  it("the Maps summary carries it when the pin is known, and leaves it out otherwise", () => {
    const rows = southAustin.map((p, idx) => ({ idx, status: "done" as const, rank: p.rank, top: [], lat: p.lat, lng: p.lng }));
    expect(summarizeMaps(rows, "South Austin Dentist", southAustinPin)).toMatchObject({ top3_reach_mi: 1, top3_reach_at_least: false });
    expect(summarizeMaps(rows, "South Austin Dentist")).not.toHaveProperty("top3_reach_mi");
    // Skipped points are not done: they never count against the reach.
    const skipped = rows.map((r) => (r.idx === 16 ? { ...r, status: "skipped" as const } : r));
    expect(summarizeMaps(skipped, "South Austin Dentist", southAustinPin).top3_reach_mi).toBe(1);
  });
});
