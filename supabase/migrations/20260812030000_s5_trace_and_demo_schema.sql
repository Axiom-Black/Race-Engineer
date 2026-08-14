-- ByteCraft Racing — S5 back-half reconciliation.
--
-- Converges the live pilot schema onto the data contract frozen in
-- docs/s5-implementation-plan.md, decided in parallel with (and independent
-- of) the S4 schema this ALTERs. See WORKING_PLAN.md §5, 12 Aug 2026 entry,
-- for the reconciliation decision this migration executes.
--
-- What changes and why:
--   * Traces move OUT of Postgres into one trace.json blob per session in
--     the 'telemetry' bucket (trace_path). Free-tier Postgres has a 500 MB
--     cap; per-lap ~400-pt traces belong in Storage, not bloating the
--     transactional DB. laps.trace (jsonb) is dropped accordingly.
--   * Resampling axis moves from time to track DISTANCE (enforced in
--     application code, frontend/src/lib/ingest.js — this migration only
--     removes the now-unused time-indexed trace column). Distance alignment
--     is a hard prerequisite for S6 (cross-session Track Map) and S8
--     (lap-vs-lap delta overlay): two laps of different duration must line
--     up by track position, not elapsed time.
--   * sessions/laps field names converge on the S5 plan's frozen contract
--     (driver, recorded_at, length_km, fastest_lap_no/s, is_demo,
--     ldx_sha256, svm_sha256, trace_path; laps.lap_no, laps.lap_time_s,
--     laps.valid, laps.summary) so the eventual SessionReport port (Step 4)
--     has one documented shape to build against, not two.
--   * is_best is DROPPED as a stored column — now derived client-side as
--     `lap.lap_no === session.fastest_lap_no`, since fastest_lap_no already
--     lives on sessions and a second copy of the same fact is redundant.
--   * session_type, energy_scheme, summary (session-level channel
--     inventory), and setup (setup sheet) are KEPT even though the S5 plan's
--     contract didn't list them: they serve standing bars the plan didn't
--     cover (setup sheet display; unreliable/empty channel flags rendered
--     in the UI) and dropping them would be a real regression, not a
--     simplification.
--   * laps.user_id + its own RLS policy are KEPT (not switched to a
--     session_id-join-based policy per the plan's "laps inherits via
--     session_id ∈ sessions" phrasing) — this is the already-verified
--     pattern from S4 (RLS isolation confirmed at the DB layer: cross-user
--     read = 0 rows, spoofed insert rejected). Re-verified below after this
--     migration rather than risking an unverified rewrite of a working
--     security boundary.

alter table public.sessions
  add column driver text,
  add column recorded_at timestamptz,
  add column length_km numeric,
  add column lap_count int,
  add column fastest_lap_no int,
  add column fastest_lap_s numeric,
  add column is_demo boolean not null default false,
  add column ldx_sha256 text,
  add column svm_sha256 text,
  add column trace_path text;

alter table public.sessions
  drop column session_date,
  drop column session_time;

-- G3.4, extended: 'complete' now also requires the trace blob to exist.
alter table public.sessions
  drop constraint three_file_atomicity,
  add constraint three_file_atomicity check (
    ingest_status <> 'complete'
    or (ld_path is not null and ldx_path is not null and svm_path is not null
        and trace_path is not null)
  );

alter table public.laps rename column lap_number to lap_no;
alter table public.laps rename column duration_s to lap_time_s;

alter table public.laps
  add column valid boolean,
  add column summary jsonb;

alter table public.laps
  drop column is_best,
  drop column trace;
