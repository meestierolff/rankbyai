-- Usage for the API's GET /usage: what a workspace's scans and audits cost, per provider and per
-- funding source, since a given moment. Own-key costs are what the user's vendors billed them;
-- included-scan costs are ours and are reported only as credits.
create or replace function public.workspace_usage(p_workspace_id uuid, p_since timestamptz)
returns table (provider text, funding text, usd numeric, calls bigint)
language sql stable security invoker set search_path = '' as $$
  select 'dataforseo'::text, s.funding, coalesce(sum(p.cost_usd), 0)::numeric, count(*)
    from public.scan_points p join public.scans s on s.id = p.scan_id
   where s.workspace_id = p_workspace_id and s.created_at >= p_since and p.cost_usd is not null
   group by s.funding
  union all
  select a.engine::text, s.funding, coalesce(sum(a.cost_usd), 0)::numeric, count(*)
    from public.ai_samples a join public.scans s on s.id = a.scan_id
   where s.workspace_id = p_workspace_id and s.created_at >= p_since and a.cost_usd is not null
   group by a.engine, s.funding
  union all
  select 'audit'::text, a.funding, coalesce(sum(a.cost_usd), 0)::numeric, count(*)
    from public.audits a
   where a.workspace_id = p_workspace_id and a.created_at >= p_since and a.status = 'done'
   group by a.funding;
$$;

revoke all on function public.workspace_usage(uuid, timestamptz) from public, anonymous, authenticated;
grant execute on function public.workspace_usage(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
