-- Runtime support for the scan engine (M2).
-- lease_until: one worker at a time per scan (claimed with a single conditional UPDATE).
alter table public.scans add column if not exists lease_until timestamptz;
alter table public.scans add column if not exists label text;
alter table public.ai_samples add column if not exists model text;
alter table public.businesses add column if not exists share_revoked boolean not null default false;

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

revoke all on function public.engine_cost_medians(int, int), public.house_spend(date) from public, anon, authenticated;
grant execute on function public.engine_cost_medians(int, int), public.house_spend(date) to service_role;
