-- Free check without sign-in, optional email after the result, and campaign attribution (Nov 2026).
--
-- Until now the free check ran only after Google sign-in: the unique index on free_checks.email_hash
-- was the "one per person" rule. A signed-out visitor now runs it directly, so that rule moves to
-- the server: a visitor cookie, a device/network fingerprint, the IP, and a daily AND monthly house
-- budget that is claimed atomically together with the check (free_check_claim below).
--
-- Anonymous checks need a workspace to own their business, scan and report rows (both tables
-- require one), so one system workspace holds them. It has no members, so row-level security shows
-- it to nobody; only the server reads it. Its reports are stored with revoked = true, so a share link
-- (/r/{slug}) never opens them: the result is shown only to the browser that holds the check's cookie.

-- ───────────────────────── system owner + workspace ─────────────────────────
insert into public.profiles (id, email)
values ('00000000-0000-4000-8000-00000000fc01', 'free-checks@system.rankbyai.invalid')
on conflict (id) do nothing;
insert into public.workspaces (id, owner_id, name)
values ('00000000-0000-4000-8000-00000000fc02', '00000000-0000-4000-8000-00000000fc01', 'Free checks (system, no members)')
on conflict (id) do nothing;

-- ───────────────────────── free_checks: identity without an account ─────────────────────────
-- Signed-in checks keep binding email_hash (unique); anonymous checks leave it null.
alter table public.free_checks alter column email_hash drop not null;
alter table public.free_checks
  add column visitor_hash text,      -- HMAC of the random visitor id in the browser's cookie
  add column fingerprint_hash text,  -- HMAC of network prefix + user agent + accept-language
  add column access_hash text,       -- sha256 of the secret in the check's cookie: who may run and read it
  add column country text,
  add column input_key text,         -- HMAC of the normalised business + city + country, for repeat detection
  add column attempts int not null default 0,
  add column claimed_at timestamptz,
  add column finished_at timestamptz,
  add column error text,             -- last failure code (not shown to anyone else)
  add column completed_reported_at timestamptz; -- free_check_completed sent once, after the result was shown
create index free_checks_visitor_idx on public.free_checks (visitor_hash) where visitor_hash is not null;
create index free_checks_fingerprint_idx on public.free_checks (fingerprint_hash, created_at desc) where fingerprint_hash is not null;
create index free_checks_input_idx on public.free_checks (input_key, created_at desc) where input_key is not null;
create index free_checks_running_idx on public.free_checks (claimed_at) where status = 'running';

-- ───────────────────────── house budget for free checks ─────────────────────────
-- Spend so far today and this month (UTC), plus checks running right now. Read-only.
create or replace function public.free_check_budget()
returns table (day_usd numeric, month_usd numeric, running int)
language sql stable security definer set search_path = '' as $$
  select
    (select coalesce(sum(l.usd), 0) from public.spend_log l where l.funding = 'free' and l.day = (now() at time zone 'utc')::date)::numeric,
    (select coalesce(sum(l.usd), 0) from public.spend_log l where l.funding = 'free' and l.day >= date_trunc('month', now() at time zone 'utc')::date)::numeric,
    (select count(*) from public.free_checks f where f.status = 'running' and f.claimed_at > now() - interval '10 minutes')::int;
$$;

-- Claim one check for running, or say why not. One transaction under one advisory lock, so two
-- requests can never both pass the budget test: every running check counts as p_reserve dollars
-- (an upper bound of one check's cost) until its real spend is logged. Returns:
--   'ok' (claimed, attempts + 1), 'done', 'running', 'not_found', 'attempts', 'day_cap', 'month_cap'.
-- A check that has been 'running' for over 10 minutes is treated as dead and may be claimed again
-- (it still counts against its attempts).
create or replace function public.free_check_claim(p_id uuid, p_reserve numeric, p_day_cap numeric, p_month_cap numeric, p_max_attempts int)
returns text language plpgsql security definer set search_path = '' as $$
declare
  fc public.free_checks%rowtype;
  b record;
begin
  perform pg_advisory_xact_lock(hashtext('rankbyai:free_check_budget'));
  select * into fc from public.free_checks where id = p_id for update;
  if not found then return 'not_found'; end if;
  if fc.status = 'done' then return 'done'; end if;
  if fc.status = 'running' and fc.claimed_at > now() - interval '10 minutes' then return 'running'; end if;
  if fc.attempts >= p_max_attempts then return 'attempts'; end if;
  select * into b from public.free_check_budget();
  if b.month_usd + (b.running + 1) * p_reserve > p_month_cap then
    update public.free_checks set status = 'queued_tomorrow', error = 'month_cap' where id = p_id;
    return 'month_cap';
  end if;
  if b.day_usd + (b.running + 1) * p_reserve > p_day_cap then
    update public.free_checks set status = 'queued_tomorrow', error = 'day_cap' where id = p_id;
    return 'day_cap';
  end if;
  update public.free_checks set status = 'running', attempts = attempts + 1, claimed_at = now(), error = null where id = p_id;
  return 'ok';
end;
$$;

-- ───────────────────────── optional email, after the result ─────────────────────────
-- Given by the visitor only after the result is shown. Used to send that result, and for product
-- news only when marketing_opt_in is true (a separate box, never pre-ticked). Withdrawing deletes the
-- row. Server only.
create table public.free_check_emails (
  id uuid primary key default gen_random_uuid(),
  free_check_id uuid not null unique references public.free_checks (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  marketing_opt_in boolean not null default false,
  consent_version text not null,
  withdraw_token_hash text not null unique,
  result_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.free_check_emails enable row level security;
revoke all on public.free_check_emails from anonymous, authenticated;
grant all on public.free_check_emails to service_role;
create policy service_all on public.free_check_emails for all to service_role using (true) with check (true);

-- ───────────────────────── campaign attribution + exactly-once conversions ─────────────────────────
-- utm_* and click ids (gclid, gbraid, wbraid) from the first landing, stored only when the visitor's
-- consent allowed keeping them. *_reported_at is set by one conditional UPDATE, so a signup or a
-- purchase is reported to analytics at most once, whatever the browser does.
alter table public.profiles
  add column attribution jsonb,
  add column signup_reported_at timestamptz;
alter table public.orders
  add column attribution jsonb,
  add column conversion_reported_at timestamptz;

grant execute on function public.free_check_budget(), public.free_check_claim(uuid, numeric, numeric, numeric, int) to service_role;

notify pgrst, 'reload schema';
