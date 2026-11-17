-- Claiming a scan for processing is one atomic statement in the database, so two overlapping workers
-- (a cron tick and a user request, or two cron ticks) can never both take the same scan.
-- The lease clock is the database clock: workers on different machines cannot disagree about "now".
create or replace function public.claim_scan(p_scan_id uuid, p_lease_seconds int default 120)
returns setof public.scans language sql security invoker set search_path = '' as $$
  update public.scans
     set lease_until = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 900))),
         status = 'running',
         started_at = coalesce(started_at, now())
   where id = p_scan_id
     and status in ('queued', 'running')
     and (lease_until is null or lease_until < now())
  returning *;
$$;

revoke all on function public.claim_scan(uuid, int) from public, anonymous, authenticated;
grant execute on function public.claim_scan(uuid, int) to service_role;

notify pgrst, 'reload schema';
