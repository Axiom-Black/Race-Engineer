-- ByteCraft Racing — Phase 1 (Tier 1 Pilot) schema
-- Standing bars enforced here:
--   * Tenant isolation lives in the database (RLS keyed on auth.uid())
--   * Three-file upload is atomic (DB constraint, G3.4)
--   * Upload dedup by file hash (S6 — trends must not be polluted)
--
-- NOTE (12 Aug 2026): this file is a retroactive record of the migration
-- applied directly to the live Supabase project on 10 Aug 2026 (S4) via MCP
-- `apply_migration`, before this repo had a supabase/migrations/ directory.
-- Filename matches the version already recorded in the project's migration
-- history so `supabase migration list` reconciles cleanly. Do not re-run —
-- see 20260812030000_s5_trace_and_demo_schema.sql for what changed since.

-- ── sessions ─────────────────────────────────────────────────────
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- session identity (from .ld header + .svm)
  venue text,
  car text,
  car_class text,
  ruleset text,
  session_type text,
  session_date text,   -- as recorded in the .ld header (dd/mm/yyyy)
  session_time text,
  energy_scheme text check (energy_scheme in ('fuel', 'virtual_energy')),

  -- raw file paths in the 'telemetry' storage bucket
  ld_path text,
  ldx_path text,
  svm_path text,
  ld_sha256 text not null,

  -- client-side parse results (summaries only; raw stays in Storage)
  summary jsonb,   -- header, lap summary, channel min/max + all_zero flags
  setup jsonb,     -- decoded setup sheet (.ldx first, .svm fallback)

  ingest_status text not null default 'pending'
    check (ingest_status in ('pending', 'complete', 'failed')),

  -- G3.4: a session is not 'complete' until all three storage paths exist
  constraint three_file_atomicity check (
    ingest_status <> 'complete'
    or (ld_path is not null and ldx_path is not null and svm_path is not null)
  ),

  -- dedup: same user cannot ingest the same .ld twice
  constraint unique_upload_per_user unique (user_id, ld_sha256)
);

-- ── laps ─────────────────────────────────────────────────────────
create table public.laps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lap_number int not null,
  start_s double precision,
  duration_s double precision,  -- null = in progress at export
  is_best boolean not null default false,
  trace jsonb,                  -- ~400-pt downsampled lap trace
  unique (session_id, lap_number)
);

-- ── RLS: per-driver isolation, keyed on auth.uid() ───────────────
alter table public.sessions enable row level security;
alter table public.laps enable row level security;

create policy sessions_own on public.sessions
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy laps_own on public.laps
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- progression queries: per-user combo rollup
create index sessions_combo_idx
  on public.sessions (user_id, car, venue, session_type, created_at);
create index laps_by_session_idx on public.laps (session_id);

-- ── storage: private bucket, per-user folder isolation ───────────
insert into storage.buckets (id, name, public)
values ('telemetry', 'telemetry', false);

create policy telemetry_own_read on storage.objects
  for select
  using (bucket_id = 'telemetry'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy telemetry_own_insert on storage.objects
  for insert
  with check (bucket_id = 'telemetry'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy telemetry_own_delete on storage.objects
  for delete
  using (bucket_id = 'telemetry'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
