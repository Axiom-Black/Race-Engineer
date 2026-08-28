-- ════════════════════════════════════════════════════════════════
-- Ring 3 acceptance (TESTING_GATES G3.1/G3.2/G3.4) against the REAL
-- migrations in supabase/migrations/. Proves tenant isolation and
-- three-file atomicity at the DB layer — the browser talks to Postgres
-- directly, so RLS *is* the API boundary. Every check RAISEs on failure;
-- the final SELECT prints only if all passed.
-- ════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- Seed two drivers as owner (bypasses RLS to set up state).
reset role;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b')
on conflict do nothing;

-- ── Act as driver A ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;

-- A creates a pending session. user_id defaults to auth.uid(); ld_sha256 is
-- the only required field pre-upload.
insert into public.sessions (ld_sha256) values (repeat('a', 64));

do $$ begin
  if (select count(*) from public.sessions) <> 1 then
    raise exception 'setup: A should see exactly 1 session, sees %',
      (select count(*) from public.sessions);
  end if;
end $$;

-- G3.4 — cannot reach 'complete' with storage paths missing.
do $$
begin
  update public.sessions set ingest_status = 'complete';
  raise exception 'G3.4 FAIL: three_file_atomicity allowed complete without paths';
exception when check_violation then
  raise notice 'G3.4 ok — incomplete-set complete rejected';
end $$;

-- Dedup — same .ld hash for the same user is rejected.
do $$
begin
  insert into public.sessions (ld_sha256) values (repeat('a', 64));
  raise exception 'DEDUP FAIL: duplicate (user_id, ld_sha256) allowed';
exception when unique_violation then
  raise notice 'dedup ok — duplicate .ld rejected';
end $$;

-- A adds a lap under its own session (laps.user_id defaults to auth.uid()).
insert into public.laps (session_id, lap_no)
  select id, 1 from public.sessions limit 1;

-- Storage — A may write under its own {uid}/ prefix, but not another user's.
insert into storage.objects (bucket_id, name)
  values ('telemetry', '00000000-0000-0000-0000-00000000000a/s1/trace.json');
do $$
begin
  insert into storage.objects (bucket_id, name)
    values ('telemetry', '00000000-0000-0000-0000-00000000000b/s1/steal.json');
  raise exception 'STORAGE FAIL: A wrote under B''s folder';
exception when insufficient_privilege then
  raise notice 'storage ok — cross-folder write rejected';
end $$;

-- G3.5 — A may OVERWRITE its own object (the upsert retry path).
--
-- Every upload in lib/sessions.js passes `{ upsert: true }`, and an upsert
-- onto an existing object is an UPDATE. The Phase 1 migration granted only
-- SELECT/INSERT/DELETE, so a retry after a partially-failed upload — exactly
-- what upsert:true exists to serve — failed with an RLS violation whenever
-- rollbackSession() had not run (closed tab, dropped connection, crash).
-- Fixed by 20260817010000_storage_update_policy.sql; asserted here so the
-- policy cannot be dropped without a red gate.
do $$
begin
  update storage.objects
     set updated_at = now()
   where bucket_id = 'telemetry'
     and name = '00000000-0000-0000-0000-00000000000a/s1/trace.json';
  if not found then
    raise exception 'G3.5 FAIL: A could not overwrite its own object (upsert retry is broken)';
  end if;
  raise notice 'G3.5 ok — own-object overwrite permitted';
end $$;

-- ── Act as driver B ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

-- G3.2 — B sees NONE of A's rows or objects (0 at the DB layer).
do $$ begin
  if (select count(*) from public.sessions) <> 0 then
    raise exception 'G3.2 FAIL: B sees % of A''s sessions', (select count(*) from public.sessions);
  end if;
  if (select count(*) from public.laps) <> 0 then
    raise exception 'G3.2 FAIL: B sees % of A''s laps', (select count(*) from public.laps);
  end if;
  if (select count(*) from storage.objects) <> 0 then
    raise exception 'G3.2 FAIL: B sees % of A''s objects', (select count(*) from storage.objects);
  end if;
  raise notice 'G3.2 ok — cross-user read returns 0 rows (tables + storage)';
end $$;

-- G3.1/G3.3 — B cannot forge a row owned by A (RLS WITH CHECK blocks it).
do $$
begin
  insert into public.sessions (user_id, ld_sha256)
    values ('00000000-0000-0000-0000-00000000000a', repeat('b', 64));
  raise exception 'RLS FAIL: B inserted a session owned by A';
exception when insufficient_privilege then
  raise notice 'G3.1 ok — spoofed insert rejected by RLS';
end $$;

-- B lays down an object of its own, so the new UPDATE policy can be tested
-- against a real cross-tenant target rather than a hypothetical one.
insert into storage.objects (bucket_id, name)
  values ('telemetry', '00000000-0000-0000-0000-00000000000b/s1/victim.json');

-- ── Back to driver A ────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

-- G3.6 — the UPDATE policy must NOT reach across the tenant boundary.
-- An UPDATE policy is the easiest place to widen isolation by accident, so
-- the negative case is asserted alongside the positive one. RLS filters the
-- row out rather than raising, so the assertion is "zero rows affected".
do $$
declare touched int;
begin
  update storage.objects
     set updated_at = now()
   where bucket_id = 'telemetry'
     and name = '00000000-0000-0000-0000-00000000000b/s1/victim.json';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'G3.6 FAIL: A overwrote % of B''s objects', touched;
  end if;
  raise notice 'G3.6 ok — cross-tenant overwrite affected 0 rows';
end $$;

-- ════════════════════════════════════════════════════════════════
-- W0.3 · track_notes — the first driver-AUTHORED data in the product, and the
-- only table whose rows are meant to outlive the row they came from. Every
-- check below is a property the design would silently lose if the migration
-- were "simplified".
-- ════════════════════════════════════════════════════════════════

-- A writes a note against a place on the track. `session_key` is the session id
-- as text, deliberately separate from the FK — see G3.10 for why.
insert into public.track_notes
  (track_key, track_label, anchor_key, d_start, d_end, corner_label, body,
   source_session_id, session_key, car, ambient_c, track_c)
select 'circuit of the americas', 'Circuit of the Americas', 'd0024',
       0.1200, 0.1350, 'T5', 'Brake 10 m later, the kerb takes it.',
       id, id::text, 'Ferrari 499P', 29.5, 39.0
  from public.sessions limit 1;

-- G3.7 — REVISE WITHIN A SESSION. A second note on the same anchor from the
-- same session must collide, because within one session the driver is refining
-- one observation, not accumulating two. (The client upserts on this key.)
do $$
begin
  insert into public.track_notes
    (track_key, anchor_key, d_start, d_end, body, source_session_id, session_key)
  select 'circuit of the americas', 'd0024', 0.1210, 0.1360,
         'Actually brake 5 m later.', id, id::text
    from public.sessions limit 1;
  raise exception 'G3.7 FAIL: a second note on one anchor in one session was allowed';
exception when unique_violation then
  raise notice 'G3.7 ok — same session + same anchor collides (revise in place)';
end $$;

-- G3.8 — ACCUMULATE ACROSS SESSIONS. The same anchor from a DIFFERENT session
-- must be permitted: T4 in the wet and T4 in the dry are both true and neither
-- should overwrite the other. A unique key without `session_key` in it would
-- fail this.
insert into public.track_notes
  (track_key, anchor_key, d_start, d_end, body, session_key, car, ambient_c)
values ('circuit of the americas', 'd0024', 0.1190, 0.1340,
        'Cooler track — it does not take the kerb.',
        'aaaaaaaa-0000-0000-0000-000000000002', 'Oreca 07 Gibson', 14.0);

do $$ begin
  if (select count(*) from public.track_notes where anchor_key = 'd0024') <> 2 then
    raise exception 'G3.8 FAIL: expected 2 accumulated notes on one anchor, got %',
      (select count(*) from public.track_notes where anchor_key = 'd0024');
  end if;
  raise notice 'G3.8 ok — a new session accumulates a revision alongside';
end $$;

-- An anchor must be a real span on the lap. Fractions, not metres — so the
-- bounds are absolute and a value outside them is a bug, not a long circuit.
do $$
begin
  insert into public.track_notes
    (track_key, anchor_key, d_start, d_end, body, session_key)
  values ('cota', 'd0100', 0.9, 0.4, 'backwards', 'x');
  raise exception 'FAIL: anchor_ordered allowed d_start > d_end';
exception when check_violation then
  raise notice 'anchor bounds ok — reversed span rejected';
end $$;

do $$
begin
  insert into public.track_notes
    (track_key, anchor_key, d_start, d_end, body, session_key)
  values ('cota', 'd0100', 0.4, 1.4, 'off the end of the lap', 'x');
  raise exception 'FAIL: d_end > 1 allowed — a distance FRACTION cannot exceed 1';
exception when check_violation then
  raise notice 'anchor bounds ok — fraction > 1 rejected';
end $$;

do $$
begin
  insert into public.track_notes
    (track_key, anchor_key, d_start, d_end, body, session_key)
  values ('cota', 'd0100', 0.4, 0.5, '   ', 'x');
  raise exception 'FAIL: a whitespace-only note body was accepted';
exception when check_violation then
  raise notice 'body ok — empty note rejected';
end $$;

-- G3.9 — THE NOTE OUTLIVES THE SESSION. Deleting the recording must not delete
-- what the driver learned from it. This is the single assertion that separates
-- `on delete set null` from the `cascade` used for laps — get it wrong and a
-- driver clearing space silently destroys their own track guide.
do $$
declare kept int; orphaned int;
begin
  delete from public.sessions;
  select count(*) into kept from public.track_notes;
  if kept <> 2 then
    raise exception 'G3.9 FAIL: deleting the session destroyed % of 2 notes', 2 - kept;
  end if;
  select count(*) into orphaned
    from public.track_notes where source_session_id is null;
  if orphaned <> 2 then
    raise exception 'G3.9 FAIL: expected 2 notes marked orphaned, got %', orphaned;
  end if;
  -- The note has to be READABLE afterwards, not merely present: car and
  -- conditions are copied onto it precisely so it survives this.
  if not exists (
    select 1 from public.track_notes
     where car = 'Ferrari 499P' and ambient_c = 29.5
       and body = 'Brake 10 m later, the kerb takes it.'
  ) then
    raise exception 'G3.9 FAIL: the surviving note lost its car/conditions/body';
  end if;
  raise notice 'G3.9 ok — notes survive session deletion, readable, marked orphaned';
end $$;

-- G3.10 — REVISION STAYS ENFORCED AFTER THE SESSION IS GONE. `session_key` is
-- text and never nulled for this reason: SQL NULLs compare as DISTINCT, so a
-- unique key built on `source_session_id` would stop constraining anything the
-- moment it went null, and one anchor could then take unlimited duplicates.
do $$
begin
  insert into public.track_notes
    (track_key, anchor_key, d_start, d_end, body, session_key)
  values ('circuit of the americas', 'd0024', 0.1200, 0.1350,
          'duplicate of an orphaned note',
          'aaaaaaaa-0000-0000-0000-000000000002');
  raise exception 'G3.10 FAIL: an orphaned anchor accepted a duplicate revision';
exception when unique_violation then
  raise notice 'G3.10 ok — revision still enforced after the session is deleted';
end $$;

-- ── Act as driver B ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

-- G3.2, extended to notes — a driver's track guide is theirs alone. Notes are
-- free text a driver writes about their own driving; a leak here is a different
-- and worse class of leak from a telemetry row.
do $$ begin
  if (select count(*) from public.track_notes) <> 0 then
    raise exception 'G3.2 FAIL: B sees % of A''s track notes',
      (select count(*) from public.track_notes);
  end if;
  raise notice 'G3.2 ok — B sees 0 of A''s track notes';
end $$;

-- G3.1, extended to notes — B cannot forge a note owned by A.
do $$
begin
  insert into public.track_notes
    (user_id, track_key, anchor_key, d_start, d_end, body, session_key)
  values ('00000000-0000-0000-0000-00000000000a', 'cota', 'd0050', 0.25, 0.26,
          'planted', 'forged');
  raise exception 'RLS FAIL: B inserted a track note owned by A';
exception when insufficient_privilege then
  raise notice 'G3.1 ok — spoofed note insert rejected by RLS';
end $$;

-- B cannot reach across the boundary to edit or delete A's notes either. RLS
-- filters the rows out rather than raising, so the assertion is "0 affected" —
-- the same shape as G3.6, and for the same reason: UPDATE and DELETE policies
-- are the easiest place to widen isolation by accident.
do $$
declare touched int;
begin
  update public.track_notes set body = 'tampered';
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: B modified % of A''s notes', touched;
  end if;
  delete from public.track_notes;
  get diagnostics touched = row_count;
  if touched <> 0 then
    raise exception 'FAIL: B deleted % of A''s notes', touched;
  end if;
  raise notice 'notes ok — B''s update and delete both affected 0 rows';
end $$;

-- ════════════════════════════════════════════════════════════════
-- G3.11 · applied_migrations() — the drift reader.
--
-- A SECURITY DEFINER function is the one place in this schema where code runs
-- with more privilege than its caller, so it gets asserted rather than assumed.
-- The value it must NOT leak is schema_migrations.statements, which contains
-- the DDL of every table and policy in the project.
-- ════════════════════════════════════════════════════════════════
reset role;

-- The ledger table itself lives in the shim (it must exist before the
-- migrations run, not before these assertions). Seed a row to read back.
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260810035850', 'phase1', array['create table secret_shape(...)'])
on conflict (version) do nothing;

set role authenticated;

do $$
declare got text;
begin
  select version into got from public.applied_migrations() limit 1;
  if got is distinct from '20260810035850' then
    raise exception 'G3.11 FAIL: applied_migrations() returned % , expected the seeded version', got;
  end if;
  raise notice 'G3.11 ok — a signed-in driver can read the migration ledger';
end $$;

-- The disclosure this function exists to avoid. Granting SELECT on the table
-- would have handed every browser the project's full DDL; the function returns
-- one column, and the underlying table must stay unreachable.
do $$
begin
  perform 1 from supabase_migrations.schema_migrations;
  raise exception 'G3.11 FAIL: authenticated can read schema_migrations directly — statements (the DDL) are exposed';
exception when insufficient_privilege then
  raise notice 'G3.11 ok — the underlying table stays unreadable; only the version column is exposed';
end $$;

-- One column, and it is not the DDL one.
do $$
declare cols int;
begin
  select count(*) into cols
    from information_schema.columns
   where table_name = 'applied_migrations';
  if exists (
    select 1 from pg_proc p
     where p.proname = 'applied_migrations'
       and pg_get_function_result(p.oid) ilike '%statements%'
  ) then
    raise exception 'G3.11 FAIL: applied_migrations() returns the statements column';
  end if;
  raise notice 'G3.11 ok — the function does not return schema_migrations.statements';
end $$;

reset role;
select 'ALL RING 3 ACCEPTANCE CHECKS PASSED' as result;
