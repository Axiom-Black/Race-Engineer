# Supabase — Tier 1 Pilot schema

Canonical, version-controlled definition of the pilot's database and storage.
The browser talks to Supabase directly, so **RLS is the API boundary** — these
files are security-critical, not bookkeeping.

## Layout

```
migrations/
  0001_pilot_schema.sql   sessions + laps, RLS (auth.uid()), atomicity, dedup
  0002_storage.sql        telemetry bucket + per-user object policies (Supabase)
tests/
  00_auth_shim.sql        TEST-ONLY: emulates auth.uid()/roles on a bare Postgres
  01_rls_acceptance.sql   Ring 3 assertions: isolation + atomicity + dedup
```

## Applying to the Supabase project

`0001` and `0002` are the source of truth. The S4 schema was hand-applied in
the dashboard; this codifies it. The pilot has **no production data yet**, so if
the live project diverges, reconcile it *to* these files (simplest: re-create
the pilot tables/bucket from them) rather than editing them to match drift.

```bash
supabase link --project-ref <ref>
supabase db push        # applies migrations/ in order
```

Do **not** apply `tests/00_auth_shim.sql` to Supabase — it only recreates, for a
bare Postgres, the `auth` schema/roles that Supabase already provides.

## Running the Ring 3 acceptance test locally

Needs a local PostgreSQL 16 (`initdb`/`psql`). Against any reachable Postgres:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_auth_shim.sql \
  -f supabase/migrations/0001_pilot_schema.sql \
  -f supabase/tests/01_rls_acceptance.sql
# → ALL RING 3 ACCEPTANCE CHECKS PASSED
```

CI runs exactly this against an ephemeral `postgres:16` service (the
`ring3-auth-tenancy` job in `.github/workflows/ci.yml`). The migration is
re-runnable (`create … if not exists`, `drop policy if exists` before each
`create policy`), so a re-apply is a safe no-op.

## What the test proves (TESTING_GATES Ring 3)

- **G3.1 / G3.3** — a client cannot forge a row it doesn't own; RLS `WITH CHECK`
  rejects a spoofed `user_id`.
- **G3.2** — an authenticated cross-user read returns **0 rows at the DB layer**.
- **G3.4** — a session cannot reach `ingest_status = 'complete'` without all
  three raw paths and the trace path recorded (`three_file_atomicity`).
