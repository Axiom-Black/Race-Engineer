-- ════════════════════════════════════════════════════════════════
-- TEST-ONLY auth shim — emulates the slice of Supabase that the pilot
-- schema depends on, so 0001_pilot_schema.sql can be applied and its
-- RLS exercised against a bare Postgres (local + Ring 3 CI).
--
-- NEVER applied to the real Supabase project — Supabase already provides
-- the `auth` schema, `auth.uid()`, and the `authenticated`/`anon` roles.
-- Apply order: this shim → migrations/0001 → tests/01_rls_acceptance.
-- ════════════════════════════════════════════════════════════════

-- Roles the browser client authenticates as. NOLOGIN + no BYPASSRLS so
-- RLS is actually enforced when we SET ROLE to them in the assertions.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

create schema if not exists auth;
grant usage on schema auth to authenticated, anon;

-- Stub of auth.users so the sessions.user_id FK resolves.
create table if not exists auth.users (id uuid primary key);

-- auth.uid() reads the JWT 'sub' claim from a GUC, exactly as Supabase
-- does at runtime — the assertions set request.jwt.claim.sub to play a
-- given user.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant execute on function auth.uid() to authenticated, anon;
