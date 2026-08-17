-- ════════════════════════════════════════════════════════════════
-- TEST-ONLY shim — recreates, on a bare Postgres, the slice of Supabase
-- the migrations depend on, so the REAL migration files can be applied
-- and their RLS exercised (local + Ring 3 CI). NEVER applied to Supabase.
--
-- Apply order: this shim → the migrations in supabase/migrations/ (in
-- filename order) → tests/01_rls_acceptance.sql.
-- ════════════════════════════════════════════════════════════════

-- gen_random_uuid() safety net (core in PG13+).
create extension if not exists pgcrypto;

-- Roles the client authenticates as. NOLOGIN + no BYPASSRLS so RLS is
-- actually enforced under SET ROLE in the assertions.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

-- ── auth schema ──────────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to authenticated, anon;
create table if not exists auth.users (id uuid primary key);

-- Reads the JWT 'sub' claim from a GUC, exactly as Supabase does at runtime.
create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, anon;

-- ── storage schema (migration 1 creates a bucket + object policies) ──
create schema if not exists storage;
grant usage on schema storage to authenticated, anon;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  created_at timestamptz not null default now(),
  -- Real Supabase carries updated_at, and an upsert touches it. Needed so
  -- G3.5/G3.6 can exercise the UPDATE policy the way the client actually
  -- does, rather than against a column invented for the test.
  updated_at timestamptz not null default now()
);
-- Supabase ships storage.objects with RLS already enabled; mirror that so
-- the telemetry_own_* policies the migration creates are actually enforced.
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

-- storage.foldername('uid/sess/file.json') -> {uid, sess}; [1] is the owner.
create or replace function storage.foldername(name text) returns text[]
  language sql immutable
  as $$ select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1] $$;
grant execute on function storage.foldername(text) to authenticated, anon;

-- ── grants for the public tables the migrations will create ──────
-- The migrations don't GRANT (Supabase auto-grants to authenticated); on a
-- bare Postgres we arrange the same via default privileges, applied to
-- tables postgres creates next in public.
grant usage on schema public to authenticated, anon;
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
