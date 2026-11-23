-- AppSumo purchases do not change the Stripe price ladder. Plaintext codes only exist in the
-- private CSV handed to AppSumo; the application stores SHA-256 hashes of 192-bit random codes.
create table public.appsumo_code_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table public.appsumo_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  batch_id uuid not null references public.appsumo_code_batches(id),
  workspace_id uuid references public.workspaces(id) on delete set null,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  created_at timestamptz not null default now()
);
create index appsumo_codes_workspace_idx on public.appsumo_codes(workspace_id);
alter table public.appsumo_code_batches enable row level security;
alter table public.appsumo_codes enable row level security;
revoke all on public.appsumo_code_batches, public.appsumo_codes from public, anonymous, authenticated;
grant all on public.appsumo_code_batches, public.appsumo_codes to service_role;
create policy service_all on public.appsumo_code_batches for all to service_role using (true) with check (true);
create policy service_all on public.appsumo_codes for all to service_role using (true) with check (true);

create function public.redeem_appsumo_code(p_code_hash text, p_workspace_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ws public.workspaces%rowtype;
  code public.appsumo_codes%rowtype;
  entitlement uuid;
begin
  -- Lock the workspace first, so two different codes cannot both be consumed for one workspace.
  select * into ws from public.workspaces where id = p_workspace_id for update;
  if not found or p_user_id is null or ws.owner_id <> p_user_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into code from public.appsumo_codes where code_hash = p_code_hash for update;
  if not found or code.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if code.redeemed_at is not null then
    if code.workspace_id = p_workspace_id and ws.plan = 'lifetime' then
      return jsonb_build_object('ok', true, 'replayed', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if ws.plan = 'lifetime' then
    return jsonb_build_object('ok', false, 'error', 'already_lifetime');
  end if;
  insert into public.entitlements(workspace_id, kind, credits_granted)
    values (p_workspace_id, 'lifetime', 0) returning id into entitlement;
  update public.workspaces set plan = 'lifetime' where id = p_workspace_id;
  update public.appsumo_codes set workspace_id = p_workspace_id, redeemed_by = p_user_id,
    redeemed_at = now(), entitlement_id = entitlement where code_hash = p_code_hash;
  return jsonb_build_object('ok', true, 'replayed', false);
end;
$$;
revoke all on function public.redeem_appsumo_code(text, uuid, uuid) from public, anonymous, authenticated;
grant execute on function public.redeem_appsumo_code(text, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
