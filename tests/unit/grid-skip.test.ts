import { describe, expect, it } from "vitest";
import { z } from "zod";
import { gridSizesText, largerMapsGridsText, largestOneCreditMapsGrid, mapsCreditTiers, scanCreditsFor } from "@/lib/cost/credits";
import { openApiSpec } from "@/lib/api-v1/openapi";
import { AI_GRID_SIZES, MAPS_GRID_RANGE, MAPS_GRID_SIZES } from "@/lib/pricing-constants";
import { compareAi, compareHeadline, compareMaps } from "@/lib/scans/compare";
import { buildGrid, pointName } from "@/lib/scans/grid";
import { MAX_POINT_IDX, activePointCount, centreIdx, normalizeSkip, skippedLine, validateSkipPoints } from "@/lib/scans/skip";
import { summarizeAi, summarizeMaps, type AiSampleRow, type MapsPointRow } from "@/lib/scans/summary";

/** Grid sizes up to 15×15 and skipped grid points: the pure rules shared by the app, the server and the API. */

describe("skip list validation (server-side rule, also used by the API)", () => {
  it("accepts no list, an empty list and points of the grid", () => {
    expect(validateSkipPoints(15, undefined)).toBeNull();
    expect(validateSkipPoints(15, [])).toBeNull();
    expect(validateSkipPoints(15, [0, 112, 224])).toBeNull();
    expect(validateSkipPoints(3, [4])).toBeNull(); // the business's own point may be skipped too
  });

  it("refuses numbers outside the grid, fractions, repeats and non-lists, with a clear message", () => {
    expect(validateSkipPoints(3, [9])).toBe("A 3×3 grid has points 0 to 8; 9 is not one of them.");
    expect(validateSkipPoints(3, [-1])).toMatch(/0 to 8/);
    expect(validateSkipPoints(5, [1.5])).toMatch(/whole numbers/);
    expect(validateSkipPoints(5, ["3"])).toMatch(/whole numbers/);
    expect(validateSkipPoints(5, [3, 3])).toBe("Each point can be skipped only once.");
    expect(validateSkipPoints(5, "3")).toMatch(/list/);
  });

  it("at least one point must stay active", () => {
    expect(validateSkipPoints(3, [0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe("At least one point must stay active: all 9 points of the 3×3 grid are skipped.");
    expect(validateSkipPoints(1, [0])).toMatch(/At least one point must stay active/);
    expect(validateSkipPoints(3, [0, 1, 2, 3, 5, 6, 7, 8])).toBeNull(); // only the centre left
  });

  it("stores a list sorted and without repeats, and counts the active points", () => {
    expect(normalizeSkip([12, 3, 3, 0])).toEqual([0, 3, 12]);
    expect(normalizeSkip(undefined)).toEqual([]);
    expect(activePointCount(15, 12)).toBe(213);
    expect(skippedLine(15, 12)).toBe("12 of 225 points skipped");
    expect(skippedLine(1, 0)).toBe("0 of 1 point skipped");
  });
});

describe("grid numbering is stable with the server's grid", () => {
  it("idx = row × n + col for every size up to 15×15, and the centre is the business", () => {
    const c = { lat: 51.5, lng: -0.12 };
    for (const n of [...AI_GRID_SIZES, ...MAPS_GRID_SIZES]) {
      const g = buildGrid(c, n, 2);
      expect(g).toHaveLength(n * n);
      g.forEach((p, i) => {
        expect(p.idx).toBe(i);
        expect(p.idx).toBe(p.row * n + p.col);
      });
      expect(g[centreIdx(n)].lat).toBeCloseTo(c.lat, 6);
      expect(g[centreIdx(n)].lng).toBeCloseTo(c.lng, 6);
    }
    expect(pointName(14, 14)).toBe("O15"); // the south-east corner of a 15×15 grid
  });
});

describe("summaries leave skipped points out of every metric", () => {
  const top = (rank: number) => [{ rank: 1, name: rank === 1 ? "Me" : "Rival One" }, { rank: 2, name: rank === 2 ? "Me" : "Rival Two" }, { rank: 3, name: "Rival Three" }];
  const pt = (idx: number, status: MapsPointRow["status"], rank: number | null): MapsPointRow => ({ idx, status, rank, top: status === "done" ? top(rank ?? 99) : null });

  it("Maps: points, averages, top-3 share and share of local voice count the checked points only", () => {
    const rows: MapsPointRow[] = [pt(0, "done", 1), pt(1, "done", 2), pt(2, "skipped", null), pt(3, "skipped", null), pt(4, "done", null)];
    const s = summarizeMaps(rows, "Me");
    expect(s).toMatchObject({ points: 3, points_skipped: 2, points_done: 3, points_failed: 0, top3_points: 2, found_points: 2 });
    expect(s.top3_share).toBeCloseTo(2 / 3, 3);
    expect(s.avg_rank).toBe(Math.round(((1 + 2 + 21) / 3) * 10) / 10);
    expect(s.solv).toBeCloseTo(2 / 9, 3);
    // Exactly the same numbers as a grid that never had those points.
    const without = summarizeMaps(rows.filter((r) => r.status !== "skipped"), "Me");
    expect({ ...s, points_skipped: 0 }).toEqual(without);
  });

  it("Maps: a skipped point is never a failure", () => {
    const s = summarizeMaps([pt(0, "done", 4), pt(1, "skipped", null)], "Me");
    expect(s.points_failed).toBe(0);
    expect(s.points_done / s.points).toBe(1);
  });

  it("AI: points, mention rate and share of voice count the checked points only", () => {
    const s = (point_idx: number, mentioned: boolean): AiSampleRow => ({
      point_idx, engine: "openai", status: "done", mentioned, mention_position: mentioned ? 2 : null,
      named_businesses: [{ name: "Me", position: 2, you: mentioned }, { name: "Rival", position: 1 }], sources: [], cost_usd: 0.01,
    });
    const sum = summarizeAi([s(0, true), s(1, false), s(2, true)], 9, [3, 4, 5, 6, 7, 8]);
    expect(sum).toMatchObject({ points: 3, points_skipped: 6, samples_total: 3, samples_done: 3, points_mentioned: 2 });
    expect(sum.ai_mention_rate).toBeCloseTo(2 / 3, 3);
    // A stray sample at a skipped point is not counted.
    const stray = summarizeAi([s(0, true), s(1, false), s(2, true), s(4, true)], 9, [3, 4, 5, 6, 7, 8]);
    expect(stray.samples_total).toBe(3);
    expect(stray.points_mentioned).toBe(2);
    expect(summarizeAi([s(0, true)], 1).points_skipped).toBe(0);
  });
});

describe("compare: skipped points have no delta and are not in the totals", () => {
  it("Maps: a point skipped in either scan has no delta", () => {
    const p = (idx: number, rank: number | null, status = "done") => ({ idx, rank, status });
    const c = compareMaps([p(0, 5), p(1, 3), p(2, null, "skipped")], [p(0, 2), p(1, null, "skipped"), p(2, null, "skipped")]);
    expect(c.points.map((x) => x.delta)).toEqual([3, null, null]);
    expect(c.avgRank).toEqual({ before: 4, after: 2, delta: 2 });
  });

  it("AI: the total is the points the later scan checked", () => {
    const s = (point_idx: number, mentioned: boolean) => ({ point_idx, engine: "openai" as const, status: "done", mentioned, mention_position: mentioned ? 1 : null });
    const c = compareAi([s(0, false), s(1, true), s(2, false)], [s(0, true), s(1, true)], 3, 3);
    expect(c.pointsMentioned.total).toBe(2);
    expect(compareHeadline("ai", c)).toBe("Named by AI at 1/2 → 2/2 points.");
  });
});

describe("copy and API documents follow the grid sizes and the credit rule", () => {
  it("credit tiers: 3×3 to 11×11 for one credit, 13×13 and 15×15 for two", () => {
    expect(mapsCreditTiers()).toEqual([{ credits: 1, sizes: [3, 5, 7, 9, 11] }, { credits: 2, sizes: [13, 15] }]);
    expect(largestOneCreditMapsGrid()).toBe("11×11");
    expect(largerMapsGridsText()).toBe("13×13 and 15×15 Maps grids use 2 credits");
    expect(MAPS_GRID_RANGE).toBe("3×3 to 15×15");
    expect(gridSizesText(MAPS_GRID_SIZES)).toBe("3×3, 5×5, 7×7, 9×9, 11×11, 13×13 or 15×15");
    expect(scanCreditsFor("maps", 15, 224)).toBe(1);
  });

  it("OpenAPI: grid sizes, skip_points with real bounds, and the skipped point status", () => {
    const spec = openApiSpec("https://rankbyai.live") as unknown as { paths: Record<string, Record<string, { requestBody?: { content: { "application/json": { schema: { properties: Record<string, Record<string, unknown>> } } } } }>>; components: { schemas: Record<string, { properties: Record<string, Record<string, unknown>> }> } };
    const props = spec.paths["/scans"].post.requestBody!.content["application/json"].schema.properties;
    expect(props.grid_size.enum).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
    expect(props.grid_size.description).toBe("AI scans: 1, 3 or 5. Maps scans: 3, 5, 7, 9, 11, 13 or 15.");
    expect(props.skip_points).toMatchObject({ type: "array", maxItems: 224, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 224 } });
    expect(spec.components.schemas.ScanPoint.properties.status.enum).toContain("skipped");
    expect(spec.components.schemas.Scan.properties).toHaveProperty("skip_points");
    expect(spec.components.schemas.Estimate.properties).toHaveProperty("points");
    expect(spec.components.schemas.Estimate.properties).toHaveProperty("skipped");
  });

  it("the skip_points schema the API and MCP use emits only real bounds (no safe-integer limits)", () => {
    // Same expression as CreateScan.skip_points (lib/api-v1/core) and the MCP tools' skip_points (lib/api-v1/mcp).
    const max = MAX_POINT_IDX;
    expect(max).toBe(224);
    const json = z.toJSONSchema(z.array(z.number().int().min(0).max(max)).max(max)) as { maxItems: number; items: { minimum: number; maximum: number } };
    expect(json.maxItems).toBe(224);
    expect(json.items.minimum).toBe(0);
    expect(json.items.maximum).toBe(224);
  });
});
