-- Maps grids up to 15×15, and grid points the user chose not to check.
--
-- Maps grids run 3×3 to 15×15 (AI grids stay 1×1, 3×3 and 5×5). A scan and a schedule store the
-- numbers of the points the user switched off (water, a park, outside the service area), numbered
-- as src/lib/scans/grid.ts builds the grid: idx = row × n + col, row 0 in the north. A skipped
-- point gets a scan_points row with status 'skipped' and is never sent to a vendor. At least one
-- point of a grid stays active.

alter table public.tracked_queries drop constraint tracked_queries_grid_size_check;
alter table public.tracked_queries add constraint tracked_queries_grid_size_check
  check (grid_size in (1, 3, 5, 7, 9, 11, 13, 15));
alter table public.tracked_queries drop constraint tracked_queries_check;
alter table public.tracked_queries add constraint tracked_queries_check
  check ((kind = 'maps' and grid_size in (3, 5, 7, 9, 11, 13, 15)) or (kind = 'ai' and grid_size in (1, 3, 5)));

alter table public.scans add column skip_points int[] not null default '{}';
alter table public.tracked_queries add column skip_points int[] not null default '{}';

-- Every skipped number is a point of the grid, and at least one point stays active.
alter table public.scans add constraint scans_skip_points_check check (
  cardinality(skip_points) < grid_size * grid_size
  and array_position(skip_points, null) is null
  and 0 <= all (skip_points)
  and grid_size * grid_size > all (skip_points)
);
alter table public.tracked_queries add constraint tracked_queries_skip_points_check check (
  cardinality(skip_points) < grid_size * grid_size
  and array_position(skip_points, null) is null
  and 0 <= all (skip_points)
  and grid_size * grid_size > all (skip_points)
);

alter table public.scan_points drop constraint scan_points_status_check;
alter table public.scan_points add constraint scan_points_status_check
  check (status in ('pending', 'posted', 'done', 'failed', 'skipped'));

notify pgrst, 'reload schema';
