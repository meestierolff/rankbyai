-- OAuth 2.1 for the MCP server (/api/mcp), so MCP clients (Claude, ChatGPT, Cursor, ...) can connect
-- with the user's existing RankbyAI sign-in instead of a pasted API key. See src/lib/oauth.
--
-- RankbyAI is its own authorization server (issuer = the site URL). Users are the Neon Auth users the
-- app already has: the consent page reads the normal session, and a grant ties one client to one user
-- AND one workspace. Nothing here stores or exposes api_credentials.
--
-- Every secret (client secret, authorization code, access and refresh token) is stored only as
-- sha256(value + pepper), like api_keys.key_hash. Only the server touches these tables: RLS is on,
-- the client roles get nothing, and the app lists a workspace's grants as the server, filtered by
-- the signed-in member's workspace.
--
-- Nothing from 0001 carries over to a new table, so the service_role grant and policy are stated here.

-- Clients: registered through dynamic client registration (RFC 7591, kind 'dcr', client_id issued
-- by us) or identified by a Client ID Metadata Document (kind 'cimd', client_id = the document URL,
-- cached here with the time it was fetched).
create table public.oauth_clients (
  client_id text primary key check (char_length(client_id) between 8 and 500),
  kind text not null check (kind in ('dcr', 'cimd')),
  client_name text not null check (char_length(client_name) between 1 and 100),
  client_uri text check (client_uri is null or char_length(client_uri) <= 500),
  logo_uri text check (logo_uri is null or char_length(logo_uri) <= 500),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  token_endpoint_auth_method text not null check (token_endpoint_auth_method in ('none', 'client_secret_basic', 'client_secret_post')),
  client_secret_hash text,
  application_type text not null default 'web' check (application_type in ('web', 'native')),
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  -- A public client has no secret; a confidential client always has one.
  check ((token_endpoint_auth_method = 'none') = (client_secret_hash is null))
);

-- One approval: this user let this client use this workspace. Revoking it (from the app or by
-- deleting the workspace) ends every token issued under it at once.
create table public.oauth_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null references public.oauth_clients (client_id) on delete cascade,
  scope text not null,
  resource text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create unique index oauth_grants_active_idx on public.oauth_grants (workspace_id, user_id, client_id) where revoked_at is null;
create index oauth_grants_ws_idx on public.oauth_grants (workspace_id);

-- Authorization codes: single use (used_at is set by one conditional UPDATE), ten minutes, bound to
-- the redirect URI, the PKCE challenge (S256) and the resource. family_id links the tokens issued
-- from a code, so a replayed code can revoke them.
create table public.oauth_codes (
  code_hash text primary key,
  grant_id uuid not null references public.oauth_grants (id) on delete cascade,
  family_id uuid not null default gen_random_uuid(),
  redirect_uri text not null,
  code_challenge text not null,
  scope text not null,
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Access tokens (one hour) and refresh tokens (30 days, rotated on every use). rotated_at marks a
-- refresh token that has been exchanged; presenting it again after the short reuse window revokes
-- its whole family.
create table public.oauth_tokens (
  token_hash text primary key,
  kind text not null check (kind in ('access', 'refresh')),
  grant_id uuid not null references public.oauth_grants (id) on delete cascade,
  family_id uuid not null,
  scope text not null,
  resource text not null,
  expires_at timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_tokens_family_idx on public.oauth_tokens (family_id);
create index oauth_tokens_grant_idx on public.oauth_tokens (grant_id);
create index oauth_tokens_expiry_idx on public.oauth_tokens (expires_at);

alter table public.oauth_clients enable row level security;
alter table public.oauth_grants enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;

-- Server only: the client roles get nothing; the server role gets everything, as an explicit policy.
revoke all on public.oauth_clients, public.oauth_grants, public.oauth_codes, public.oauth_tokens from anonymous, authenticated;
grant all on public.oauth_clients, public.oauth_grants, public.oauth_codes, public.oauth_tokens to service_role;
create policy service_all on public.oauth_clients for all to service_role using (true) with check (true);
create policy service_all on public.oauth_grants for all to service_role using (true) with check (true);
create policy service_all on public.oauth_codes for all to service_role using (true) with check (true);
create policy service_all on public.oauth_tokens for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
