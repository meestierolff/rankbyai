import { MAPS_GRID_SIZES } from "@/lib/pricing-constants";

/**
 * Grid points the user chose not to check (water, a park, outside the service area). Pure and
 * client-safe: the scan form, the server and the API use the same rules.
 *
 * A point is named by its idx, numbered as buildGrid() in ./grid numbers the grid: idx = row × n + col,
 * row 0 in the north, so idx 0 is the north-west corner and the centre (the business) is (n × n − 1) / 2.
 */

/** Highest point idx of the largest grid (15×15: 0 to 224). Also the most points one scan can skip. */
export const MAX_POINT_IDX = Math.max(...MAPS_GRID_SIZES) ** 2 - 1;

/** Why this skip list is not valid for an n×n grid, in plain words; null when it is. */
export function validateSkipPoints(grid: number, skip: unknown): string | null {
  if (skip == null) return null;
  if (!Array.isArray(skip)) return "skip_points must be a list of grid point numbers.";
  const total = grid * grid;
  for (const v of skip) {
    if (typeof v !== "number" || !Number.isInteger(v)) return "skip_points must be whole numbers: the idx of each grid point to skip.";
  }
  const outside = (skip as number[]).find((v) => v < 0 || v >= total);
  if (outside !== undefined) return `A ${grid}×${grid} grid has points 0 to ${total - 1}; ${outside} is not one of them.`;
  if (new Set(skip).size !== skip.length) return "Each point can be skipped only once.";
  if (skip.length >= total) return `At least one point must stay active: all ${total} points of the ${grid}×${grid} grid are skipped.`;
  return null;
}

/** Sorted, without repeats: the form in which a skip list is stored. */
export const normalizeSkip = (skip: readonly number[] | null | undefined): number[] => [...new Set(skip ?? [])].sort((a, b) => a - b);

/** Points of an n×n grid that are checked. */
export const activePointCount = (grid: number, skipped: number): number => Math.max(0, grid * grid - skipped);

/** Index of the centre point (the business location) of an n×n grid. */
export const centreIdx = (grid: number): number => (grid * grid - 1) / 2;

/** "12 of 225 points skipped" */
export const skippedLine = (grid: number, skipped: number): string => `${skipped} of ${grid * grid} ${grid * grid === 1 ? "point" : "points"} skipped`;
