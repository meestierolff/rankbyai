-- Prompt packs and cited pages (citation workflow, steps 1 and 2).
--
-- A prompt pack is a list of buyer prompts for one business ("Who is the best dentist in Austin?").
-- A run of a pack is ordinary AI scans, one per prompt and repeat, tagged in scans.label as
-- "pack:<run>:<prompt>:<repeat>" (src/lib/packs/label.ts). Those scans are side runs: they never
-- count as the business's latest scan. The answers, named businesses and cited sources stay in
-- ai_samples as for any scan; nothing is copied.
--
-- cited_pages holds what RankbyAI read on a page that the AI answers cited: whether the page names
-- the business and which competitors it names. One row per business and page (the business decides
-- which name is looked for).
--
-- Only the server writes these tables; members read their own workspace's rows. Nothing from 0001
-- carries over to a new table, so the service_role grant and policy are stated again.

create table public.prompt_packs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- The service people ask for, e.g. "dentist": the {service} of the prompts and the default for later steps.
  service text not null check (char_length(service) between 2 and 120),
  -- The prompts as written by the user: a JSON array of 1 to 15 strings.
  prompts jsonb not null check (jsonb_typeof(prompts) = 'array' and jsonb_array_length(prompts) between 1 and 15),
  engines text[] not null check (cardinality(engines) between 1 and 3 and engines <@ array['openai', 'perplexity', 'gemini']),
  -- 1 = asked once at the business's map point; 3 or 5 = on a grid around it.
  grid_size int not null default 1 check (grid_size in (1, 3, 5)),
  radius_miles numeric(6, 2) not null default 2 check (radius_miles > 0 and radius_miles <= 50),
  -- Each prompt is asked this many times per run (one run is not a stable ranking).
  repeats int not null default 1 check (repeats between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prompt_packs_business_idx on public.prompt_packs (business_id, created_at desc);
create index prompt_packs_ws_idx on public.prompt_packs (workspace_id, created_at desc);

create table public.prompt_pack_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pack_id uuid not null references public.prompt_packs (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The settings this run used, so a later edit of the pack never changes what a run shows.
  prompts jsonb not null check (jsonb_typeof(prompts) = 'array'),
  engines text[] not null,
  grid_size int not null,
  repeats int not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed')),
  est_cost_usd numeric(10, 5),
  actual_cost_usd numeric(10, 5),
  trigger text not null default 'manual' check (trigger in ('manual', 'schedule')),
  -- Reading the cited pages after the answers are in: one worker at a time, then the time it finished.
  pages_lease_until timestamptz,
  pages_checked_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index prompt_pack_runs_pack_idx on public.prompt_pack_runs (pack_id, created_at desc);
create index prompt_pack_runs_ws_idx on public.prompt_pack_runs (workspace_id, created_at desc);
create index prompt_pack_runs_open_idx on public.prompt_pack_runs (status) where status in ('queued', 'running');

-- A pack's scans are found by their label; this keeps that lookup an index scan.
create index scans_label_idx on public.scans (label) where label is not null;

create table public.cited_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- The page address without tracking parameters or fragment (src/lib/citations/classify.ts normalizeUrl).
  url_key text not null check (char_length(url_key) between 4 and 2048),
  url text not null check (char_length(url) between 8 and 2048),
  status text not null check (status in ('ok', 'failed')),
  http_status int,
  title text check (title is null or char_length(title) <= 300),
  -- Null when the page could not be read: never guessed.
  client_named boolean,
  competitors_named jsonb not null default '[]'::jsonb check (jsonb_typeof(competitors_named) = 'array'),
  fetched_at timestamptz not null default now(),
  unique (business_id, url_key)
);
create index cited_pages_ws_idx on public.cited_pages (workspace_id);

alter table public.prompt_packs enable row level security;
alter table public.prompt_pack_runs enable row level security;
alter table public.cited_pages enable row level security;

revoke all on public.prompt_packs, public.prompt_pack_runs, public.cited_pages from anonymous, authenticated;
grant all on public.prompt_packs, public.prompt_pack_runs, public.cited_pages to service_role;
create policy service_all on public.prompt_packs for all to service_role using (true) with check (true);
create policy service_all on public.prompt_pack_runs for all to service_role using (true) with check (true);
create policy service_all on public.cited_pages for all to service_role using (true) with check (true);

-- Members read their own workspace's rows. No insert, update or delete for clients: the server writes.
grant select on public.prompt_packs, public.prompt_pack_runs, public.cited_pages to authenticated;
create policy prompt_packs_member_read on public.prompt_packs for select to authenticated using (private.is_workspace_member(workspace_id));
create policy prompt_pack_runs_member_read on public.prompt_pack_runs for select to authenticated using (private.is_workspace_member(workspace_id));
create policy cited_pages_member_read on public.cited_pages for select to authenticated using (private.is_workspace_member(workspace_id));

notify pgrst, 'reload schema';
