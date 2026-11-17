-- RankbyAI schema for plain Postgres (Neon in production, a local Postgres + PostgREST in development).
-- Rules enforced here:
--   * RLS is ON for every table.
--   * The API roles (anonymous, authenticated) get NO default privileges; each grant below is explicit.
--   * Secrets (key ciphertext, API key hashes) and money tables are never writable or readable by
--     clients; public data leaves only through explicit views.
--   * Plan, credits, orders and the ladder change only through SECURITY DEFINER functions that are
--     executable by service_role alone.
--
-- Roles (PostgREST / Neon Data API convention: the request's JWT names the role to switch to):
--   anonymous      public visitors: the ladder view and indexable regional pages only
--   authenticated  a signed-in user: their own workspace, through RLS
--   service_role   the application server: trusted writes. Never given to a browser.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anonymous') then create role anonymous nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  -- The API gateway connects as "authenticator" and switches to the role named in the JWT.
  if exists (select from pg_roles where rolname = 'authenticator') then
    grant anonymous, authenticated, service_role to authenticator;
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anonymous, service_role;
grant usage on schema public to authenticated, anonymous, service_role;

-- The signed-in user's id, from the request's JWT ("sub").
-- Neon's Data API exposes it as auth.user_id(); PostgREST exposes the claims as a setting.
do $$
begin
  if to_regprocedure('auth.user_id()') is not null then
    execute $f$create or replace function private.uid() returns uuid language sql stable set search_path = '' as
      $b$ select nullif(auth.user_id(), '')::uuid $b$ $f$;
  else
    execute $f$create or replace function private.uid() returns uuid language sql stable set search_path = '' as
      $b$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $b$ $f$;
  end if;
end $$;
grant execute on function private.uid() to authenticated, anonymous, service_role;

-- ───────────────────────── identity ─────────────────────────
create table public.profiles (
  id uuid primary key, -- the user id issued by the auth provider (Neon Auth)
  email text not null,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  plan text not null default 'locked' check (plan in ('locked', 'lifetime')),
  lifetime_seat int,
  brand_name text,
  brand_logo_path text,
  brand_color_hex text check (brand_color_hex is null or brand_color_hex ~ '^#[0-9a-fA-F]{6}$'),
  brand_website text,
  reply_to_email text,
  hide_rankbyai_branding boolean not null default false,
  share_scans_for_regional_pages boolean not null default false,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Membership helpers live in `private` so they are not exposed as RPC endpoints.
create or replace function private.is_workspace_member(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select private.uid())
  );
$$;

create or replace function private.is_workspace_owner(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = (select private.uid())
  );
$$;
grant execute on function private.is_workspace_member(uuid), private.is_workspace_owner(uuid) to authenticated, anonymous, service_role;

-- First sign-in → profile + personal workspace + owner membership. Idempotent; called by the server.
create or replace function public.ensure_user(p_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  ws_id uuid;
begin
  insert into public.profiles (id, email) values (p_id, coalesce(p_email, ''))
  on conflict (id) do update set email = excluded.email where public.profiles.email is distinct from excluded.email;
  -- Serialise concurrent first requests of the same user.
  perform 1 from public.profiles where id = p_id for update;
  select m.workspace_id into ws_id from public.workspace_members m where m.user_id = p_id order by m.created_at limit 1;
  if ws_id is null then
    insert into public.workspaces (owner_id, name)
    values (p_id, coalesce(nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'My workspace'))
    returning id into ws_id;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, p_id, 'owner');
  end if;
  return ws_id;
end;
$$;

-- ───────────────────────── BYOK vault ─────────────────────────
create table public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('dataforseo', 'openai', 'perplexity', 'gemini')),
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  key_version int not null default 1,
  hint text,
  status text not null default 'unchecked' check (status in ('valid', 'invalid', 'unchecked')),
  last_validated_at timestamptz,
  last_balance_usd numeric(12, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);

-- ───────────────────────── CRM-ish ─────────────────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  notes text,
  created_at timestamptz not null default now()
);
create index clients_ws_idx on public.clients (workspace_id);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  name text not null check (char_length(name) between 1 and 300),
  cid text,
  place_id text,
  address text,
  city text,
  region text,
  country text,
  lat double precision,
  lng double precision,
  website text,
  phone text,
  primary_category text,
  categories jsonb not null default '[]'::jsonb,
  rating numeric(3, 2),
  reviews_count int,
  source text not null default 'search' check (source in ('search', 'csv', 'prospect', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index businesses_ws_idx on public.businesses (workspace_id);

create table public.tracked_queries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('maps', 'ai')),
  keyword text,
  prompt_template text,
  niche text,
  grid_size int not null check (grid_size in (1, 3, 5, 7, 9)),
  radius_miles numeric(6, 2) not null default 2 check (radius_miles > 0 and radius_miles <= 50),
  engines text[] not null default '{}',
  funding text not null default 'byok' check (funding in ('byok', 'credits')),
  schedule text not null default 'none' check (schedule in ('none', 'daily', 'weekly', 'monthly')),
  next_run_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((kind = 'maps' and grid_size in (3, 5, 7, 9)) or (kind = 'ai' and grid_size in (1, 3, 5)))
);
create index tracked_queries_ws_idx on public.tracked_queries (workspace_id);
create index tracked_queries_due_idx on public.tracked_queries (next_run_at) where active and schedule <> 'none';

-- ───────────────────────── scans ─────────────────────────
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  tracked_query_id uuid references public.tracked_queries (id) on delete set null,
  kind text not null check (kind in ('maps', 'ai')),
  keyword text,
  prompt_template text,
  niche text,
  engines text[] not null default '{}',
  grid_size int not null,
  radius_miles numeric(6, 2) not null,
  center_lat double precision not null,
  center_lng double precision not null,
  mode text not null default 'standard' check (mode in ('standard', 'priority', 'live')),
  funding text not null check (funding in ('byok', 'credits', 'free', 'internal')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed')),
  credits_used int not null default 0,
  est_cost_usd numeric(10, 5),
  actual_cost_usd numeric(10, 5),
  summary jsonb not null default '{}'::jsonb,
  error text,
  label text,
  -- One worker at a time per scan (claimed with a single conditional UPDATE).
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index scans_ws_created_idx on public.scans (workspace_id, created_at desc);
create index scans_business_idx on public.scans (business_id, kind, created_at desc);
create index scans_status_idx on public.scans (status) where status in ('queued', 'running');

create table public.scan_points (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  idx int not null,
  "row" int not null,
  col int not null,
  lat double precision not null,
  lng double precision not null,
  label text,
  dfs_task_id text,
  rank int,
  top jsonb,
  cost_usd numeric(10, 5),
  status text not null default 'pending' check (status in ('pending', 'posted', 'done', 'failed')),
  error text,
  unique (scan_id, idx)
);
create index scan_points_task_idx on public.scan_points (dfs_task_id) where dfs_task_id is not null;

create table public.ai_samples (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  point_idx int not null,
  engine text not null check (engine in ('openai', 'perplexity', 'gemini')),
  engine_variant text,
  model text,
  prompt text not null,
  answer_text text,
  mentioned boolean,
  mention_position int,
  named_businesses jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  cost_usd numeric(10, 5),
  raw_path text,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now(),
  unique (scan_id, point_idx, engine)
);
create index ai_samples_engine_cost_idx on public.ai_samples (engine, created_at desc) where status = 'done';

-- ───────────────────────── audit + fix kit ─────────────────────────
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  scan_ids uuid[] not null default '{}',
  score int check (score between 0 and 100),
  category_scores jsonb not null default '{}'::jsonb,
  checks_ran int not null default 0,
  checks_total int not null default 0,
  inputs jsonb not null default '{}'::jsonb,
  funding text not null default 'byok' check (funding in ('byok', 'credits', 'free', 'internal')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  est_cost_usd numeric(10, 5),
  cost_usd numeric(10, 5),
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index audits_business_idx on public.audits (business_id, created_at desc);

create table public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits (id) on delete cascade,
  priority text not null check (priority in ('P0', 'P1', 'P2', 'P3')),
  category text not null,
  title text not null,
  evidence jsonb not null default '[]'::jsonb,
  fix text not null,
  impact_note text,
  check_key text not null,
  data jsonb not null default '{}'::jsonb
);
create index audit_findings_audit_idx on public.audit_findings (audit_id);

create table public.fix_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  audit_id uuid references public.audits (id) on delete set null,
  description text,
  faqs jsonb not null default '[]'::jsonb,
  jsonld_localbusiness jsonb,
  jsonld_faq jsonb,
  llms_txt text,
  checklist jsonb not null default '[]'::jsonb,
  cost_usd numeric(10, 5),
  created_at timestamptz not null default now()
);
create index fix_kits_business_idx on public.fix_kits (business_id, created_at desc);

-- ───────────────────────── reports + prospects ─────────────────────────
create table public.prospect_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  mode text not null check (mode in ('search', 'csv')),
  niche text,
  city text,
  funding text not null default 'byok' check (funding in ('byok', 'credits')),
  total int not null default 0,
  done int not null default 0,
  failed int not null default 0,
  credits_reserved int not null default 0,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed')),
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  batch_id uuid references public.prospect_batches (id) on delete set null,
  kind text not null check (kind in ('share', 'prospect', 'free_check')),
  scan_ids uuid[] not null default '{}',
  audit_id uuid references public.audits (id) on delete set null,
  share_slug text not null unique check (char_length(share_slug) >= 12),
  opener text,
  pdf_path text,
  watermark boolean not null default false,
  revoked boolean not null default false,
  status text not null default 'ready' check (status in ('queued', 'running', 'ready', 'failed')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reports_ws_idx on public.reports (workspace_id, created_at desc);
create index reports_business_idx on public.reports (business_id);

-- ───────────────────────── money ─────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  email text,
  product_key text not null check (product_key in ('lifetime', 'pack_25', 'pack_100')),
  amount_cents int not null check (amount_cents >= 0),
  tax_cents int not null default 0,
  currency text not null default 'usd',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'partially_refunded')),
  ladder_seat int,
  ladder_price_cents int,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_ws_idx on public.orders (workspace_id, created_at desc);
create unique index orders_ladder_seat_uniq on public.orders (ladder_seat) where ladder_seat is not null;

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('lifetime', 'pack')),
  credits_granted int not null default 0,
  source_order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_order_id)
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  delta int not null,
  reason text not null,
  scan_id uuid references public.scans (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  ref text,
  created_at timestamptz not null default now()
);
create index credit_ledger_ws_idx on public.credit_ledger (workspace_id);
create unique index credit_ledger_order_grant_uniq on public.credit_ledger (order_id, reason) where order_id is not null;

create table public.ladder_lock (
  id int primary key default 1 check (id = 1),
  base_price_cents int not null default 2900 check (base_price_cents > 0),
  step_cents int not null default 1000 check (step_cents >= 0),
  seats_per_step int not null default 5 check (seats_per_step > 0),
  closes_at timestamptz not null default '2026-12-16T13:00:00Z'
);
insert into public.ladder_lock (id) values (1);

create table public.ladder_holds (
  id uuid primary key default gen_random_uuid(),
  stripe_checkout_session_id text unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  price_cents int not null,
  expires_at timestamptz not null,
  released boolean not null default false,
  converted_order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ladder_holds_active_idx on public.ladder_holds (expires_at) where not released;

create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ───────────────────────── developer access ─────────────────────────
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_ws_idx on public.api_keys (workspace_id);

-- ───────────────────────── server-only operational tables ─────────────────────────
create table public.free_checks (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique,
  ip_hash text,
  report_id uuid references public.reports (id) on delete set null,
  business_name text,
  city text,
  status text not null default 'pending' check (status in ('pending', 'queued_tomorrow', 'running', 'done', 'failed')),
  created_at timestamptz not null default now()
);
create index free_checks_ip_idx on public.free_checks (ip_hash, created_at desc);

create table public.spend_log (
  id uuid primary key default gen_random_uuid(),
  day date not null default (now() at time zone 'utc')::date,
  provider text not null,
  usd numeric(10, 5) not null,
  scan_id uuid references public.scans (id) on delete set null,
  funding text not null check (funding in ('credits', 'free', 'internal')),
  kind text not null default 'commit' check (kind in ('reserve', 'commit')),
  created_at timestamptz not null default now()
);
create index spend_log_day_idx on public.spend_log (day, funding);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index jobs_due_idx on public.jobs (run_after) where status = 'queued';

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table public.geo_cache (
  key text primary key,
  kind text not null,
  value jsonb not null,
  created_at timestamptz not null default now()
);

create table public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  url text,
  email text not null,
  reason text,
  status text not null default 'open' check (status in ('open', 'done', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  body text check (body is null or char_length(body) <= 4000),
  votes int not null default 0,
  status text not null default 'open' check (status in ('open', 'planned', 'shipped', 'declined')),
  created_at timestamptz not null default now()
);
create table public.feature_request_votes (
  request_id uuid not null references public.feature_requests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- ───────────────────────── public regional data ─────────────────────────
create table public.regional_pages (
  id uuid primary key default gen_random_uuid(),
  niche_slug text not null,
  city_slug text not null,
  labels jsonb not null default '{}'::jsonb,
  engine_stats jsonb not null default '{}'::jsonb,
  top_businesses jsonb not null default '[]'::jsonb,
  maps_leaders jsonb not null default '[]'::jsonb,
  sample_count int not null default 0,
  scans_count int not null default 0,
  first_seen timestamptz not null default now(),
  last_updated timestamptz not null default now(),
  indexable boolean generated always as (sample_count >= 27 and scans_count >= 2) stored,
  unique (niche_slug, city_slug)
);

-- ═════════════════════════ RLS ═════════════════════════
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.api_credentials enable row level security;
alter table public.clients enable row level security;
alter table public.businesses enable row level security;
alter table public.tracked_queries enable row level security;
alter table public.scans enable row level security;
alter table public.scan_points enable row level security;
alter table public.ai_samples enable row level security;
alter table public.audits enable row level security;
alter table public.audit_findings enable row level security;
alter table public.fix_kits enable row level security;
alter table public.prospect_batches enable row level security;
alter table public.reports enable row level security;
alter table public.orders enable row level security;
alter table public.entitlements enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.ladder_lock enable row level security;
alter table public.ladder_holds enable row level security;
alter table public.stripe_events enable row level security;
alter table public.api_keys enable row level security;
alter table public.free_checks enable row level security;
alter table public.spend_log enable row level security;
alter table public.jobs enable row level security;
alter table public.rate_limits enable row level security;
alter table public.geo_cache enable row level security;
alter table public.removal_requests enable row level security;
alter table public.feature_requests enable row level security;
alter table public.feature_request_votes enable row level security;
alter table public.regional_pages enable row level security;

-- Start from zero privileges for client roles, then grant explicitly.
revoke all on all tables in schema public from anonymous, authenticated;
revoke all on all sequences in schema public from anonymous, authenticated;
alter default privileges in schema public revoke all on tables from anonymous, authenticated;
alter default privileges in schema public revoke all on functions from anonymous, authenticated, public;
grant all on all tables in schema public to service_role;
-- The server role sees everything, stated as explicit policies (no reliance on a BYPASSRLS attribute).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy service_all on public.%I for all to service_role using (true) with check (true)', t.tablename);
  end loop;
end $$;

-- profiles: own row
grant select on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select private.uid()));

-- workspaces: members read; owner may update BRAND columns only (column grant).
grant select on public.workspaces to authenticated;
grant update (name, brand_name, brand_logo_path, brand_color_hex, brand_website, reply_to_email,
              hide_rankbyai_branding, share_scans_for_regional_pages)
  on public.workspaces to authenticated;
create policy workspaces_select_member on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspaces_update_owner on public.workspaces for update to authenticated
  using (owner_id = (select private.uid())) with check (owner_id = (select private.uid()));

grant select on public.workspace_members to authenticated;
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- api_credentials: NO client grants at all. Members see only the safe view below.
create view public.api_credentials_public
with (security_barrier = true) as
  select c.workspace_id, c.provider, c.hint, c.status, c.last_validated_at, c.last_balance_usd, c.updated_at
  from public.api_credentials c
  where private.is_workspace_member(c.workspace_id);
grant select on public.api_credentials_public to authenticated;

-- members CRUD: clients, businesses, tracked_queries
grant select, insert, update, delete on public.clients, public.businesses, public.tracked_queries to authenticated;
create policy clients_member_all on public.clients for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy businesses_member_all on public.businesses for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy tracked_queries_member_all on public.tracked_queries for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- members read-only: scans and everything derived from them
grant select on public.scans, public.scan_points, public.ai_samples, public.audits, public.audit_findings,
  public.fix_kits, public.prospect_batches, public.reports, public.orders, public.entitlements,
  public.credit_ledger to authenticated;
create policy scans_member_read on public.scans for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy scan_points_member_read on public.scan_points for select to authenticated
  using (exists (select 1 from public.scans s where s.id = scan_id and private.is_workspace_member(s.workspace_id)));
create policy ai_samples_member_read on public.ai_samples for select to authenticated
  using (exists (select 1 from public.scans s where s.id = scan_id and private.is_workspace_member(s.workspace_id)));
create policy audits_member_read on public.audits for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy audit_findings_member_read on public.audit_findings for select to authenticated
  using (exists (select 1 from public.audits a where a.id = audit_id and private.is_workspace_member(a.workspace_id)));
create policy fix_kits_member_read on public.fix_kits for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy prospect_batches_member_read on public.prospect_batches for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy reports_member_read on public.reports for select to authenticated
  using (workspace_id is not null and private.is_workspace_member(workspace_id));
create policy orders_member_read on public.orders for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy entitlements_member_read on public.entitlements for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy credit_ledger_member_read on public.credit_ledger for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- api_keys: members read metadata; the hash column is never granted.
grant select (id, workspace_id, name, prefix, last_used_at, revoked_at, created_at) on public.api_keys to authenticated;
create policy api_keys_member_read on public.api_keys for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- feature requests: any signed-in member reads all; inserts go to own workspace; votes via RPC.
grant select (id, title, body, votes, status, created_at) on public.feature_requests to authenticated;
grant insert (workspace_id, title, body) on public.feature_requests to authenticated;
create policy feature_requests_read on public.feature_requests for select to authenticated using (true);
create policy feature_requests_insert on public.feature_requests for insert to authenticated
  with check (private.is_workspace_member(workspace_id));

-- regional pages: public read of indexable rows only.
grant select on public.regional_pages to anonymous, authenticated;
create policy regional_pages_public_read on public.regional_pages for select to anonymous, authenticated
  using (indexable);

-- Server-only tables (no policies, no grants): api_credentials, ladder_lock, ladder_holds,
-- stripe_events, free_checks, spend_log, jobs, rate_limits, geo_cache, removal_requests,
-- feature_request_votes. removal_requests is written by a server route after Turnstile.

-- ═════════════════════════ ladder ═════════════════════════
-- Public, counts only. `sold_total` drives the price (paid + refunded + active holds);
-- `paid_total` is the honest "N sold" number shown on the site.
create view public.ladder_state as
with cfg as (select * from public.ladder_lock where id = 1),
counts as (
  select
    (select count(*) from public.orders o
      where o.product_key = 'lifetime' and o.status in ('paid', 'refunded', 'partially_refunded'))::int as paid_total,
    (select count(*) from public.ladder_holds h where not h.released and h.expires_at > now())::int as holds_active
)
select
  (counts.paid_total + counts.holds_active) as sold_total,
  counts.paid_total,
  cfg.base_price_cents + cfg.step_cents * ((counts.paid_total + counts.holds_active) / cfg.seats_per_step) as current_price_cents,
  cfg.base_price_cents + cfg.step_cents * ((counts.paid_total + counts.holds_active) / cfg.seats_per_step + 1) as next_price_cents,
  cfg.seats_per_step - ((counts.paid_total + counts.holds_active) % cfg.seats_per_step) as seats_left_at_current_price,
  cfg.seats_per_step,
  cfg.step_cents,
  cfg.base_price_cents,
  ((counts.paid_total + counts.holds_active) / cfg.seats_per_step) as band_index,
  cfg.closes_at
from cfg, counts;
grant select on public.ladder_state to anonymous, authenticated, service_role;

-- The ladder terms can be tuned before launch but never after the first sale or hold.
create or replace function private.ladder_config_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.base_price_cents, new.step_cents, new.seats_per_step)
     is distinct from (old.base_price_cents, old.step_cents, old.seats_per_step)
     and exists (select 1 from public.orders where product_key = 'lifetime') then
    raise exception 'ladder terms are frozen after the first lifetime sale';
  end if;
  return new;
end;
$$;
create trigger ladder_config_guard before update on public.ladder_lock
  for each row execute function private.ladder_config_guard();

-- Reserve a seat at the price the buyer was shown. Serialised by the ladder_lock row.
create or replace function public.ladder_reserve(p_user_id uuid, p_workspace_id uuid, p_expected_price_cents int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cfg public.ladder_lock%rowtype;
  existing public.ladder_holds%rowtype;
  sold int;
  price int;
  new_id uuid;
begin
  select * into cfg from public.ladder_lock where id = 1 for update;

  if now() >= cfg.closes_at then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  if exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.plan = 'lifetime') then
    return jsonb_build_object('ok', false, 'error', 'already_lifetime');
  end if;

  -- One live hold per buyer: reuse it (keeps their price, blocks seat-hoarding).
  select * into existing from public.ladder_holds h
    where h.user_id = p_user_id and not h.released and h.expires_at > now() + interval '2 minutes'
    order by h.created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'hold_id', existing.id, 'price_cents', existing.price_cents,
      'expires_at', existing.expires_at, 'session_id', existing.stripe_checkout_session_id, 'reused', true);
  end if;
  -- Any older hold of this buyer is too close to expiry to pay on: release it.
  update public.ladder_holds set released = true where user_id = p_user_id and not released;

  select (select count(*) from public.orders o
            where o.product_key = 'lifetime' and o.status in ('paid', 'refunded', 'partially_refunded'))
       + (select count(*) from public.ladder_holds h where not h.released and h.expires_at > now())
    into sold;
  price := cfg.base_price_cents + cfg.step_cents * (sold / cfg.seats_per_step);

  if price <> p_expected_price_cents then
    return jsonb_build_object('ok', false, 'error', 'price_changed', 'current_price_cents', price);
  end if;

  -- The hold outlives the 30-minute Stripe session, so a paid session always finds its hold.
  insert into public.ladder_holds (user_id, workspace_id, price_cents, expires_at)
  values (p_user_id, p_workspace_id, price, now() + interval '40 minutes')
  returning id into new_id;

  return jsonb_build_object('ok', true, 'hold_id', new_id, 'price_cents', price,
    'expires_at', now() + interval '40 minutes', 'reused', false);
end;
$$;

create or replace function public.ladder_attach_session(p_hold_id uuid, p_session_id text)
returns void language sql security definer set search_path = '' as $$
  update public.ladder_holds set stripe_checkout_session_id = p_session_id where id = p_hold_id;
$$;

create or replace function public.ladder_release_hold(p_session_id text default null, p_hold_id uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.ladder_holds set released = true
   where not released and converted_order_id is null
     and ((p_session_id is not null and stripe_checkout_session_id = p_session_id)
       or (p_hold_id is not null and id = p_hold_id));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.ladder_release_expired()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.ladder_holds set released = true where not released and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Paid lifetime checkout → order + seat + plan, atomically and idempotently.
-- Replaying the same session returns the existing order and changes nothing.
create or replace function public.assign_ladder_seat(
  p_session_id text, p_payment_intent_id text, p_workspace_id uuid, p_user_id uuid, p_email text,
  p_amount_cents int, p_tax_cents int, p_currency text, p_hold_id uuid, p_customer_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.orders%rowtype;
  hold public.ladder_holds%rowtype;
  seat int;
  ladder_price int;
  new_order uuid;
begin
  perform 1 from public.ladder_lock where id = 1 for update;

  select * into existing from public.orders where stripe_checkout_session_id = p_session_id;
  if found then
    return jsonb_build_object('order_id', existing.id, 'seat', existing.ladder_seat, 'replayed', true);
  end if;

  if p_hold_id is not null then
    select * into hold from public.ladder_holds where id = p_hold_id;
  end if;
  ladder_price := coalesce(hold.price_cents, p_amount_cents);

  select coalesce(max(ladder_seat), 0) + 1 into seat from public.orders where product_key = 'lifetime';

  insert into public.orders (workspace_id, user_id, email, product_key, amount_cents, tax_cents, currency,
    stripe_checkout_session_id, stripe_payment_intent_id, status, ladder_seat, ladder_price_cents)
  values (p_workspace_id, p_user_id, p_email, 'lifetime', p_amount_cents, coalesce(p_tax_cents, 0),
    coalesce(p_currency, 'usd'), p_session_id, p_payment_intent_id, 'paid', seat, ladder_price)
  returning id into new_order;

  if hold.id is not null then
    update public.ladder_holds set released = true, converted_order_id = new_order where id = hold.id;
  end if;

  update public.workspaces
     set plan = 'lifetime', lifetime_seat = seat,
         stripe_customer_id = coalesce(p_customer_id, stripe_customer_id)
   where id = p_workspace_id;

  insert into public.entitlements (workspace_id, kind, credits_granted, source_order_id)
  values (p_workspace_id, 'lifetime', 0, new_order);

  return jsonb_build_object('order_id', new_order, 'seat', seat, 'replayed', false);
end;
$$;

-- Paid pack checkout → order + entitlement + ledger grant, idempotent per session.
create or replace function public.fulfill_pack_order(
  p_session_id text, p_payment_intent_id text, p_workspace_id uuid, p_user_id uuid, p_email text,
  p_product_key text, p_credits int, p_amount_cents int, p_tax_cents int, p_currency text,
  p_customer_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  existing public.orders%rowtype;
  new_order uuid;
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  select * into existing from public.orders where stripe_checkout_session_id = p_session_id;
  if found then
    return jsonb_build_object('order_id', existing.id, 'replayed', true);
  end if;
  if p_product_key not in ('pack_25', 'pack_100') or p_credits <= 0 then
    raise exception 'invalid pack';
  end if;

  insert into public.orders (workspace_id, user_id, email, product_key, amount_cents, tax_cents, currency,
    stripe_checkout_session_id, stripe_payment_intent_id, status)
  values (p_workspace_id, p_user_id, p_email, p_product_key, p_amount_cents, coalesce(p_tax_cents, 0),
    coalesce(p_currency, 'usd'), p_session_id, p_payment_intent_id, 'paid')
  returning id into new_order;

  insert into public.entitlements (workspace_id, kind, credits_granted, source_order_id)
  values (p_workspace_id, 'pack', p_credits, new_order);
  insert into public.credit_ledger (workspace_id, delta, reason, order_id)
  values (p_workspace_id, p_credits, 'pack_purchase', new_order);

  if p_customer_id is not null then
    update public.workspaces set stripe_customer_id = coalesce(stripe_customer_id, p_customer_id) where id = p_workspace_id;
  end if;
  return jsonb_build_object('order_id', new_order, 'replayed', false);
end;
$$;

-- Full refund: lifetime → workspace locked (data kept, seat still counts on the ladder);
-- pack → claw back the unused remainder (balance never below 0). Idempotent.
create or replace function public.apply_refund(p_payment_intent_id text, p_charge_id text, p_full boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ord public.orders%rowtype;
  granted int;
  balance int;
  clawback int;
begin
  select * into ord from public.orders where stripe_payment_intent_id = p_payment_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;
  if ord.status = 'refunded' then
    return jsonb_build_object('ok', true, 'order_id', ord.id, 'replayed', true);
  end if;

  if not p_full then
    update public.orders set status = 'partially_refunded', stripe_charge_id = coalesce(p_charge_id, stripe_charge_id)
     where id = ord.id;
    return jsonb_build_object('ok', true, 'order_id', ord.id, 'partial', true, 'product_key', ord.product_key);
  end if;

  update public.orders set status = 'refunded', refunded_at = now(),
         stripe_charge_id = coalesce(p_charge_id, stripe_charge_id)
   where id = ord.id;

  if ord.product_key = 'lifetime' then
    update public.workspaces set plan = 'locked' where id = ord.workspace_id;
  else
    perform 1 from public.workspaces where id = ord.workspace_id for update;
    select coalesce(sum(credits_granted), 0) into granted from public.entitlements where source_order_id = ord.id;
    select coalesce(sum(delta), 0) into balance from public.credit_ledger where workspace_id = ord.workspace_id;
    clawback := least(granted, greatest(balance, 0));
    if clawback > 0 then
      insert into public.credit_ledger (workspace_id, delta, reason, order_id)
      values (ord.workspace_id, -clawback, 'pack_refund', ord.id)
      on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'order_id', ord.id, 'product_key', ord.product_key,
    'workspace_id', ord.workspace_id, 'amount_cents', ord.amount_cents, 'replayed', false);
end;
$$;

-- ═════════════════════════ credits ═════════════════════════
create or replace function public.credit_balance(p_workspace_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger where workspace_id = p_workspace_id;
$$;

-- Atomic: row-lock the workspace, check the balance, write the debit.
create or replace function public.use_credits(p_workspace_id uuid, p_n int, p_scan_id uuid default null, p_reason text default 'scan', p_ref text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare balance int;
begin
  if p_n <= 0 then return true; end if;
  perform 1 from public.workspaces where id = p_workspace_id for update;
  select coalesce(sum(delta), 0) into balance from public.credit_ledger where workspace_id = p_workspace_id;
  if balance < p_n then
    return false;
  end if;
  insert into public.credit_ledger (workspace_id, delta, reason, scan_id, ref)
  values (p_workspace_id, -p_n, p_reason, p_scan_id, p_ref);
  return true;
end;
$$;

-- Give back whatever a scan consumed (once).
create or replace function public.refund_credits(p_scan_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  ws uuid;
  net int;
begin
  select workspace_id into ws from public.scans where id = p_scan_id;
  if ws is null then return 0; end if;
  perform 1 from public.workspaces where id = ws for update;
  select coalesce(sum(delta), 0) into net from public.credit_ledger where scan_id = p_scan_id;
  if net >= 0 then return 0; end if;
  insert into public.credit_ledger (workspace_id, delta, reason, scan_id)
  values (ws, -net, 'scan_refund', p_scan_id);
  update public.scans set credits_used = 0 where id = p_scan_id;
  return -net;
end;
$$;

-- ═════════════════════════ rate limits + jobs + votes ═════════════════════════
-- Fixed-window counter. Returns true while the caller is inside the limit.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c int;
begin
  insert into public.rate_limits as r (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into c;
  return c <= p_limit;
end;
$$;

create or replace function public.claim_jobs(p_limit int default 5)
returns setof public.jobs language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.jobs j set status = 'running', attempts = j.attempts + 1, locked_at = now()
   where j.id in (
     select id from public.jobs
      where (status = 'queued' and run_after <= now())
         or (status = 'running' and locked_at < now() - interval '10 minutes')
      order by run_after
      limit p_limit
      for update skip locked)
  returning j.*;
end;
$$;

-- One vote per user, callable by signed-in users.
create or replace function public.vote_feature_request(p_request_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if (select private.uid()) is null then
    raise exception 'not signed in';
  end if;
  insert into public.feature_request_votes (request_id, user_id) values (p_request_id, (select private.uid()))
  on conflict do nothing;
  if found then
    update public.feature_requests set votes = votes + 1 where id = p_request_id returning votes into v;
  else
    select votes into v from public.feature_requests where id = p_request_id;
  end if;
  return v;
end;
$$;

-- ═════════════════════════ estimates + spend ═════════════════════════
-- Median cost per engine over the latest real samples, for estimates (brief 10.1).
create or replace function public.engine_cost_medians(p_min_samples int default 50, p_window int default 200)
returns table (engine text, median_usd numeric, n int)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select s.engine, s.cost_usd, row_number() over (partition by s.engine order by s.created_at desc) as rn
    from public.ai_samples s
    where s.status = 'done' and s.cost_usd is not null and s.cost_usd > 0
  )
  select r.engine, percentile_cont(0.5) within group (order by r.cost_usd)::numeric as median_usd, count(*)::int as n
  from ranked r
  where r.rn <= p_window
  group by r.engine
  having count(*) >= p_min_samples;
$$;

-- House-key spend for a day (cost guard + /admin).
create or replace function public.house_spend(p_day date default (now() at time zone 'utc')::date)
returns table (funding text, provider text, usd numeric)
language sql stable security definer set search_path = '' as $$
  select l.funding, l.provider, coalesce(sum(l.usd), 0)::numeric
  from public.spend_log l where l.day = p_day
  group by l.funding, l.provider;
$$;


-- Function privileges: everything is service_role only, except the vote RPC.
revoke all on all functions in schema public from public, anonymous, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.vote_feature_request(uuid) to authenticated;

-- Files (brand logos, raw AI answers, PDFs) live in S3-compatible object storage, not in the database.

-- PostgREST caches the schema: tell it to reload (harmless where nothing listens).
notify pgrst, 'reload schema';
