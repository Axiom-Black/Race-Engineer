-- ════════════════════════════════════════════════════════════════
-- S5 · Step 1 acceptance test (TESTING_GATES Ring 3: G3.1/G3.2/G3.4).
-- Proves tenant isolation and three-file atomicity AT THE DATABASE
-- LAYER — the browser talks to Postgres directly, so RLS *is* the API
-- boundary. Every check RAISEs on failure; the final SELECT only prints
-- if all passed. Run after 00_auth_shim + migrations/0001.
-- ════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- Two drivers. Seed as owner (bypasses RLS to set up state).
reset role;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b')
on conflict do nothing;

-- ── Act as driver A ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
set role authenticated;

-- A creates a pending session (paths still null — upload hasn't happened).
insert into public.sessions (user_id, ld_sha256)
  values ('00000000-0000-0000-0000-00000000000a', repeat('a', 64));

do $$ begin
  if (select count(*) from public.sessions) <> 1 then
    raise exception 'setup: A should see exactly 1 session, sees %',
      (select count(*) from public.sessions);
  end if;
end $$;

-- G3.4 — a session cannot reach 'complete' with paths missing.
do $$
begin
  update public.sessions set ingest_status = 'complete'
    where user_id = '00000000-0000-0000-0000-00000000000a';
  raise exception 'G3.4 FAIL: three_file_atomicity allowed complete without paths';
exception when check_violation then
  raise notice 'G3.4 ok — incomplete-set complete rejected';
end $$;

-- Dedup — same .ld hash for the same user is rejected.
do $$
begin
  insert into public.sessions (user_id, ld_sha256)
    values ('00000000-0000-0000-0000-00000000000a', repeat('a', 64));
  raise exception 'DEDUP FAIL: duplicate (user_id, ld_sha256) allowed';
exception when unique_violation then
  raise notice 'dedup ok — duplicate .ld rejected';
end $$;

-- A adds a lap under its own session.
insert into public.laps (session_id, lap_no, lap_time_s)
  select id, 1, 95.123 from public.sessions
  where user_id = '00000000-0000-0000-0000-00000000000a';

-- ── Act as driver B ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

-- G3.2 — B sees NONE of A's sessions or laps (0 rows at the DB layer).
do $$ begin
  if (select count(*) from public.sessions) <> 0 then
    raise exception 'G3.2 FAIL: B sees % of A''s sessions',
      (select count(*) from public.sessions);
  end if;
  if (select count(*) from public.laps) <> 0 then
    raise exception 'G3.2 FAIL: B sees % of A''s laps',
      (select count(*) from public.laps);
  end if;
  raise notice 'G3.2 ok — cross-user read returns 0 rows';
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
