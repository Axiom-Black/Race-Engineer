# Supabase — Tier 1 Pilot schema & tenancy gate

The version-controlled record of the pilot's database + storage, and the
automated **Ring 3** check that proves tenant isolation on every change. The
browser talks to Supabase directly, so **RLS is the API boundary** — these
files are security-critical.

## Layout

```
migrations/
  20260810035850_phase1_schema_rls_storage.sql   sessions + laps + RLS + telemetry bucket (S4)
  20260812030000_s5_trace_and_demo_schema.sql    S5 reconciliation (traces→Storage, demo, dedup)
tests/
  00_auth_shim.sql        TEST-ONLY: recreates Supabase's auth + storage schema on a bare Postgres
  01_rls_acceptance.sql   Ring 3 assertions: isolation + atomicity + dedup + storage-folder isolation
```

Migrations are the source of truth and reconcile with the live project's
migration history by filename (`supabase migration list`). Do not re-run an
applied migration; add a new timestamped one.

```bash
supabase link --project-ref <ref>
supabase db push
```

## Running the Ring 3 acceptance test

The `tests/` shim lets the **real** migrations be applied to any bare Postgres
and their RLS exercised — no Supabase needed. Do **not** apply the shim to the
live project (it only recreates what Supabase already provides).

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/00_auth_shim.sql
for m in $(ls supabase/migrations/*.sql | sort); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$m"
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01_rls_acceptance.sql
# → ALL RING 3 ACCEPTANCE CHECKS PASSED
```

CI runs exactly this against an ephemeral `postgres:16` service (the
`ring3-auth-tenancy` job in `.github/workflows/ci.yml`), so an RLS or
atomicity regression fails a gate instead of reaching production.

## What the test proves (TESTING_GATES Ring 3)

- **G3.1 / G3.3** — a client cannot forge a row it doesn't own; RLS `WITH CHECK`
  rejects a spoofed `user_id`.
- **G3.2** — an authenticated cross-user read returns **0 rows** — for `sessions`,
  `laps`, and `storage.objects`.
- **G3.4** — a session cannot reach `ingest_status = 'complete'` without all
  three raw paths **and** the trace blob recorded (`three_file_atomicity`).
