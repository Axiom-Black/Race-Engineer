-- ByteCraft Racing — let the app see which migrations the database actually has.
--
-- WHY THIS EXISTS. Ring 3 spins up a throwaway Postgres, applies every file in
-- supabase/migrations/, and asserts against it. That passes whenever the FILES
-- are internally consistent — and says nothing about whether the live project
-- has them. Nothing connects "merged to main" to "applied to production", and
-- no gate can detect the difference, because the gate builds its own database
-- from the same files it is testing.
--
-- On 28 Aug that gap shipped: Ring 3 went green on the track_notes migration
-- while the live project had never seen it, and the feature reached the owner
-- as PostgREST's "Could not find the table 'public.track_notes' in the schema
-- cache" — which reads like a transient caching fault and is nothing of the
-- kind.
--
-- Three fixes were costed (WORKING_PLAN §5, 28 Aug). This is the one chosen:
-- the app DETECTS drift rather than hoping it does not happen, and it needs no
-- production credential in CI. It does not apply anything — it tells you, and
-- you apply. That is a deliberately smaller promise than automation, and it is
-- the whole of what it delivers.
--
-- ── WHY A FUNCTION AND NOT A GRANT ───────────────────────────────────────────
--
-- `supabase_migrations.schema_migrations` is Supabase's own bookkeeping. The
-- app has no business reading that schema generally, and granting SELECT on it
-- would hand every signed-in browser the full DDL of every migration — the
-- `statements` column contains the SQL itself, including the shape of every
-- table and policy in the project. That is a needless disclosure.
--
-- So this exposes exactly one column, as text, and nothing else. SECURITY
-- DEFINER because the caller cannot read that schema and must not be able to;
-- `search_path = ''` and fully-qualified names because a SECURITY DEFINER
-- function with a mutable search_path is a privilege-escalation hole — a
-- caller who can create objects could shadow an unqualified name and have it
-- run as the owner.
--
-- ── THE LEDGER'S ONE SHARP EDGE ──────────────────────────────────────────────
--
-- The ledger is maintained by the Supabase CLI. `supabase db push` writes a row;
-- **pasting SQL into the dashboard's editor does NOT**. So a migration applied
-- by hand is invisible here and will be reported as missing even though its
-- tables exist. That is not a flaw in the check — it is the check correctly
-- reporting that the project's history is not what the repo says it is — but it
-- does mean the ledger has to be told about anything applied by hand:
--
--     insert into supabase_migrations.schema_migrations (version, name)
--     values ('20260826000000', 'w03_track_notes')
--     on conflict (version) do nothing;
--
-- Prefer `supabase db push` and this never comes up.

-- ── WHY plpgsql AND NOT sql ──────────────────────────────────────────────────
--
-- A `language sql` body is parsed and validated when the function is CREATED,
-- so it fails outright if `supabase_migrations.schema_migrations` does not
-- exist yet. That is not hypothetical: Supabase creates the ledger on the first
-- `supabase db push`, so a project that has only ever been changed by hand does
-- not have it — and neither does the bare Postgres Ring 3 stands up. A
-- migration that cannot be applied to a fresh database is not a migration.
--
-- Raising when the ledger is absent is also the RIGHT answer rather than a
-- convenient one. Returning zero rows would be read by the client as "the
-- database has no migrations", i.e. every one is missing — a loud, wrong alarm
-- produced by a project that may be perfectly healthy. The client maps an error
-- to UNKNOWN, which is exactly what "there is no ledger to compare against"
-- means (see lib/schemaDrift.js).
create or replace function public.applied_migrations()
returns table (version text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'no migration ledger: this project has no supabase_migrations.schema_migrations'
      using hint = 'Apply migrations with `supabase db push` — it creates and maintains the ledger.';
  end if;
  return query execute
    'select m.version::text from supabase_migrations.schema_migrations m order by m.version';
end;
$$;

comment on function public.applied_migrations() is
  'Migration versions this database has recorded. Read by the client to detect '
  'drift between the bundle and the schema. Exposes only the version column — '
  'never the DDL in schema_migrations.statements.';

-- Signed-in drivers only. An unauthenticated visitor has no use for it, and
-- the migration history is a small piece of internal shape.
revoke all on function public.applied_migrations() from public, anon;
grant execute on function public.applied_migrations() to authenticated;
