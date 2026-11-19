-- A grid centre for scheduled scans, a language per business, and how report links open.
--
-- Scheduled scans (tracked_queries): an empty centre means "the business's own map point", so a
-- schedule follows the business when its location is corrected. A set centre (a grid the user moved,
-- for example for a service-area business) stays where it was put. Scans already store their centre.
--
-- Businesses: the language for text written for the business (Fix Kit, the fix prompt in reports),
-- as an ISO 639 code. Empty means the main language of the business's country.
--
-- Workspaces: whether report links open on the map (default) or on the grid. The owner may change it,
-- like the other branding columns (column grant).

alter table public.tracked_queries
  add column if not exists center_lat double precision,
  add column if not exists center_lng double precision;
alter table public.tracked_queries drop constraint if exists tracked_queries_center_check;
alter table public.tracked_queries add constraint tracked_queries_center_check check (
  (center_lat is null and center_lng is null)
  or (center_lat between -90 and 90 and center_lng between -180 and 180)
);

alter table public.businesses add column if not exists language text;
alter table public.businesses drop constraint if exists businesses_language_check;
alter table public.businesses add constraint businesses_language_check check (language is null or language ~ '^[a-z]{2,3}$');

alter table public.workspaces add column if not exists report_default_view text not null default 'map';
alter table public.workspaces drop constraint if exists workspaces_report_default_view_check;
alter table public.workspaces add constraint workspaces_report_default_view_check check (report_default_view in ('map', 'grid'));
grant update (report_default_view) on public.workspaces to authenticated;
