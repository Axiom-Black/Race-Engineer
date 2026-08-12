-- ════════════════════════════════════════════════════════════════
-- ByteCraft Racing — Tier 1 Pilot schema (S5 · Step 1)
--
-- Canonical definition of the pilot's Postgres surface: `sessions` +
-- `laps`, owner-scoped RLS keyed on auth.uid(), the three-file
-- atomicity constraint, and content-addressed dedup. Storage (the
-- `telemetry` bucket + per-user object policies) is a Supabase-specific
-- concern and lives in 0002_storage.sql so this file applies against a
-- bare Postgres in CI (Ring 3) with only the auth shim.
--
-- SOURCE OF TRUTH. The S4 schema was hand-applied directly in the
-- Supabase project; this migration codifies it. The pilot has no
-- production data yet, so if the live project diverges, reconcile it TO
-- this file (see supabase/README.md) rather than the other way around.
--
-- Standing bars enforced here (WORKING_PLAN §4):
--   • Tenant isolation lives in the database — RLS on auth.uid(), never
--     an application WHERE clause.
--   • Three-file upload is atomic — a row cannot reach 'complete'
--     without all three raw paths AND the trace path recorded.
-- ════════════════════════════════════════════════════════════════

-- gen_random_uuid() is core in PG13+; this is a no-op safety net.
create extension if not exists pgcrypto;

-- ── sessions ────────────────────────────────────────────────────
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),

  -- Header (decoded from .ld, enriched from .ldx/.svm).
  venue         text,
  driver        text,
  car           text,
  car_class     text,
  ruleset       text,
  recorded_at   timestamptz,          -- session date/time from the .ld header

  -- Circuit / session summary.
  length_km     numeric(6,3),
  lap_count     integer not null default 0,
  fastest_lap_no integer,
  fastest_lap_s numeric(9,3),

  -- Ingest lifecycle.
  ingest_status text not null default 'pending'
                check (ingest_status in ('pending', 'complete', 'failed')),
  is_demo       boolean not null default false,

  -- Content-addressed dedup keys (SHA-256, computed client-side pre-upload).
  ld_sha256     char(64) not null,
  ldx_sha256    char(64),
  svm_sha256    char(64),

  -- Storage object paths ({user_id}/{session_id}/…). Null until uploaded.
  ld_path       text,
  ldx_path      text,
  svm_path      text,
  trace_path    text,

  -- Three-file atomicity: a session is only 'complete' when every raw
  -- file AND the downsampled trace blob are recorded. Enforced at the DB,
  -- so a hand-crafted client cannot mark an incomplete set complete.
  constraint three_file_atomicity check (
    ingest_status <> 'complete'
    or (ld_path is not null
        and ldx_path is not null
        and svm_path is not null
        and trace_path is not null)
  ),

  -- One session per identical .ld per user — trends can't be polluted by
  -- re-uploading the same export.
  constraint sessions_user_ld_uniq unique (user_id, ld_sha256)
);

create index if not exists sessions_user_created_idx
  on public.sessions (user_id, created_at desc);

-- ── laps ────────────────────────────────────────────────────────
create table if not exists public.laps (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  lap_no      integer not null,
  lap_time_s  numeric(9,3),
  valid       boolean not null default true,
  -- Per-channel min/max/avg + empty/unreliable flags. Small; the bulky
  -- ~400-pt/lap traces live as a JSON blob in Storage, not here.
  summary     jsonb not null default '{}'::jsonb,

  constraint laps_session_lap_uniq unique (session_id, lap_no)
);

create index if not exists laps_session_idx on public.laps (session_id);

-- ── Grants ──────────────────────────────────────────────────────
-- The browser client authenticates as `authenticated`; RLS (below) scopes
-- which rows it may touch. `anon` (signed-out) gets nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.laps to authenticated;

-- ── Row-Level Security ──────────────────────────────────────────
alter table public.sessions enable row level security;
alter table public.laps     enable row level security;

-- sessions: owner-only in the pilot. (Garage/role sharing is Phase 2,
-- layered on this same auth.uid() spine.)
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select using (user_id = auth.uid());

drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
  for insert with check (user_id = auth.uid());

drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions
  for delete using (user_id = auth.uid());

-- laps: visibility inherited through the owning session. No direct
-- user_id column — the subquery is the boundary, and sessions RLS filters
-- it in turn.
drop policy if exists laps_select on public.laps;
create policy laps_select on public.laps
  for select using (
    exists (select 1 from public.sessions s
            where s.id = laps.session_id and s.user_id = auth.uid()));

drop policy if exists laps_insert on public.laps;
create policy laps_insert on public.laps
  for insert with check (
    exists (select 1 from public.sessions s
            where s.id = laps.session_id and s.user_id = auth.uid()));

drop policy if exists laps_update on public.laps;
create policy laps_update on public.laps
  for update using (
    exists (select 1 from public.sessions s
            where s.id = laps.session_id and s.user_id = auth.uid()));

drop policy if exists laps_delete on public.laps;
create policy laps_delete on public.laps
  for delete using (
    exists (select 1 from public.sessions s
            where s.id = laps.session_id and s.user_id = auth.uid()));
