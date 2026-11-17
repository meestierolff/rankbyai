-- Prospect batches are processed over several invocations (the Maps queue answers after minutes).
-- One worker at a time holds a batch, claimed atomically on the database clock, like scans.
alter table public.prospect_batches add column if not exists lease_until timestamptz;
alter table public.prospect_batches add column if not exists country text;
alter table public.prospect_batches add column if not exists finished_at timestamptz;

create or replace function public.claim_prospect_batch(p_batch_id uuid, p_lease_seconds int default 240)
returns setof public.prospect_batches language sql security invoker set search_path = '' as $$
  update public.prospect_batches
     set lease_until = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 900))),
         status = 'running'
   where id = p_batch_id
     and status in ('queued', 'running')
     and (lease_until is null or lease_until < now())
  returning *;
$$;

revoke all on function public.claim_prospect_batch(uuid, int) from public, anonymous, authenticated;
grant execute on function public.claim_prospect_batch(uuid, int) to service_role;

notify pgrst, 'reload schema';
