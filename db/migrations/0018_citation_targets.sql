-- Citation targets (citation workflow, step 3): pages that link to up to three competitors from a
-- "best / top / review" list (DataForSEO Backlinks, on the user's own DataForSEO login), merged with
-- the pages AI answers cited (step 2), with DataForSEO's estimated traffic per page.
--
-- One row per search. `targets` holds the merged list (at most 1,000 pages, best first); `calls`
-- holds each DataForSEO call with the cost its response reported. Only the server writes; members
-- read their own workspace's rows.

create table public.citation_target_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  pack_id uuid references public.prompt_packs (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed')),
  -- [{ name, domain }], one to three.
  competitors jsonb not null check (jsonb_typeof(competitors) = 'array' and jsonb_array_length(competitors) between 1 and 3),
  client_domain text,
  scope text not null default 'local' check (scope in ('local', 'online')),
  tokens text[] not null default '{}',
  rows_per_site int not null check (rows_per_site between 1 and 1000),
  traffic_cap int not null check (traffic_cap between 0 and 1000),
  est_cost_usd numeric(10, 5),
  actual_cost_usd numeric(10, 5),
  calls jsonb not null default '[]'::jsonb check (jsonb_typeof(calls) = 'array'),
  targets jsonb not null default '[]'::jsonb check (jsonb_typeof(targets) = 'array'),
  error text,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index citation_target_lists_business_idx on public.citation_target_lists (business_id, created_at desc);
create index citation_target_lists_ws_idx on public.citation_target_lists (workspace_id, created_at desc);

alter table public.citation_target_lists enable row level security;
revoke all on public.citation_target_lists from anonymous, authenticated;
grant all on public.citation_target_lists to service_role;
create policy service_all on public.citation_target_lists for all to service_role using (true) with check (true);
grant select on public.citation_target_lists to authenticated;
create policy citation_target_lists_member_read on public.citation_target_lists for select to authenticated using (private.is_workspace_member(workspace_id));

notify pgrst, 'reload schema';
