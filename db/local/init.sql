-- Local only: the login role PostgREST connects as (Neon creates its own "authenticator").
create role authenticator login noinherit password 'authenticator';
create role anonymous nologin;
grant anonymous to authenticator;
