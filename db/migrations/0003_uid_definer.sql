-- private.uid() runs with its owner's rights. On Neon the API roles (anonymous, authenticated,
-- service_role) have no access to the "auth" schema, so a policy that called private.uid() directly
-- failed with "permission denied for schema auth". The function only ever returns the caller's own
-- id from the verified request token, so running it as its owner exposes nothing.
do $$
begin
  if to_regprocedure('auth.user_id()') is not null then
    execute $f$create or replace function private.uid() returns uuid language sql stable security definer set search_path = '' as
      $b$ select nullif(auth.user_id(), '')::uuid $b$ $f$;
  else
    execute $f$create or replace function private.uid() returns uuid language sql stable security definer set search_path = '' as
      $b$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')::uuid $b$ $f$;
  end if;
end $$;

revoke all on function private.uid() from public;
grant execute on function private.uid() to authenticated, anonymous, service_role;

notify pgrst, 'reload schema';
