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

reset role;
select 'ALL RING 3 ACCEPTANCE CHECKS PASSED' as result;
