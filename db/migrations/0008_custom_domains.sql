-- Custom domains for white-label report links: https://reports.agency.com/r/{slug}.
--
-- One domain per workspace for now. Only the server writes rows (src/app/api/domains), after it has
-- added the domain to the Vercel project; members read their own workspace's row. The proxy
-- (src/proxy.ts) serves a hostname only while its row is 'active', and on it only the reports of
-- that row's workspace.
--
-- Nothing from 0001 carries over to a new table: the service_role grant and the service_all
-- policy there ran once over the tables that existed then. Both are stated again below.
create table public.workspace_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  -- Lower case, no trailing dot, a subdomain (at least three labels). The app checks more
  -- (reserved names, our own domains); this is the floor the database holds itself.
  hostname text not null unique check (
    hostname = lower(hostname)
    and char_length(hostname) between 4 and 253
    and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.){2,}([a-z]{2,63}|xn--[a-z0-9-]{1,59})$'
  ),
  status text not null default 'pending' check (status in ('pending', 'verifying', 'active', 'error')),
  -- The DNS records to show the owner, as Vercel returned them: [{ type, name, host, value, reason? }].
  records jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  last_error text,
  checked_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_domains enable row level security;

-- Client roles start from nothing; the server role gets everything, as an explicit policy.
revoke all on public.workspace_domains from anonymous, authenticated;
grant all on public.workspace_domains to service_role;
create policy service_all on public.workspace_domains for all to service_role using (true) with check (true);

-- Members read their own workspace's domain. No insert, update or delete for clients.
grant select on public.workspace_domains to authenticated;
create policy workspace_domains_member_read on public.workspace_domains for select to authenticated
  using (private.is_workspace_member(workspace_id));

notify pgrst, 'reload schema';
