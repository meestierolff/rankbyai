-- A signed-in request must never be treated as "nobody".
--
-- Observed on the Neon Data API (17 Nov 2026): the first request on a newly opened gateway
-- connection runs with the right role (authenticated) but without the token's claims, so the user
-- id is empty. Row-level security then matches no rows and the request "succeeds" with an empty
-- result, which the app cannot tell apart from "this user has no data yet".
--
-- private.uid() is the single place every policy gets the user id from. When the request runs as
-- "authenticated" and there is no user id, it now raises RB001 instead of returning NULL. The
-- statement aborts before any row is read or written, and the server retries (src/lib/db/clients.ts).
-- Other roles are unchanged: visitors and the application server have no user id by design.
do $$
declare source text;
begin
  if to_regprocedure('auth.user_id()') is not null then
    source := $s$nullif(auth.user_id(), '')$s$;
  else
    source := $s$nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub', '')$s$;
  end if;
  execute format($f$
    create or replace function private.uid() returns uuid
    language plpgsql stable security definer set search_path = '' as $b$
    declare v text := %s;
    begin
      if v is null and current_setting('role', true) = 'authenticated' then
        raise exception 'rankbyai: request identity missing' using errcode = 'RB001',
          hint = 'The gateway ran this request without the token claims. Retry it.';
      end if;
      return v::uuid;
    end $b$ $f$, source);
end $$;

revoke all on function private.uid() from public;
grant execute on function private.uid() to authenticated, anonymous, service_role;

notify pgrst, 'reload schema';
