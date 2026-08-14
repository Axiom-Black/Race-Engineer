# S5 Back Half — Implementation Plan & PR Checklist

> **Status:** Steps 1/2/5 built and live-verified (12 Aug 2026) against a
> parallel, independent implementation of S5's back half that existed before
> this plan was seen — see the "Reconciliation notes" callouts on each step
> for the specific deviations, and `WORKING_PLAN.md` §5 for the decision to
> reconcile onto this plan's architecture rather than the other
> implementation's (time-based resampling, Postgres-inline traces). Steps 3/4
> remain open as described below.

## Goal (acceptance test)

The real COTA triple (local only) uploads and renders a complete session view
in **< 10 s**; unreliable/empty channels show flags; a brand-new account lands
on a populated **demo session** without uploading anything.

## Branch strategy

Fresh branch off `main` **after PR #1 (onboarding spine) merges** —
`claude/s5-core-loop`. Keeps onboarding and the core loop as separate,
reviewable PRs. (This plan doc rides in on PR #1, so once #1 merges it is
already on `main` and the S5 branch inherits it.)

## Decisions locked (12 Aug 2026)

| Decision | Choice |
| --- | --- |
| Trace storage | Downsampled traces → one JSON blob per session in the `telemetry` Storage bucket. Postgres holds session + lap summaries only. |
| Downsampling | Each lap resampled to ~400 points **by track distance** (aligns laps for Track Map, progression, and the S8 overlay). |
| Demo seed | On first sign-in, parse the committed fixture client-side and insert a read-only demo session. |
| Dashboard | Full SessionReport — all four tabs (Summary / Performance / Instruments / Track Map). |

**Defaults on record:** per-lap summary = lap times + per-channel min/max/avg +
EMPTY/unreliable flags (**sector splits deferred** to backlog); pilot schema
committed as an in-repo migration; upload order = parse→validate→upload→insert→
`complete` with orphan cleanup on failure.

## Data contracts (freeze before any UI)

**Trace blob** — `telemetry/{user_id}/{session_id}/trace.json`, matching the
prototype `SessionReport` `pts` shape so the port is 1:1:

```jsonc
{
  "aspect": 0.58,
  "laps": [
    { "lap": 1, "time": 138.8,
      "pts": [ { "x": 0.06, "y": 0.65, "s": 146.1, "t": 100, "b": 1,
                 "g": 2, "gl": 0.08, "glo": -0.34, "r": 7106,
                 "sl": [-2.1,-2.1,-4.1,-4.1], "d": 0.0 }, "…≈400" ] }
  ]
}
```

`d` = normalized distance 0→1 (the resample axis). `x,y` = GPS lat/lon
normalized to the session bounding box (game-world coords — relative only,
never overlay on a real map). `s` speed, `t` throttle, `b` brake, `g` gear,
`gl`/`glo` lateral/longitudinal G, `r` rpm, `sl` per-wheel slip.

**Postgres** (lean — summaries only):

- `sessions`: `id, user_id, created_at, venue, driver, car, car_class,
  ruleset, recorded_at, length_km, lap_count, fastest_lap_no, fastest_lap_s,
  ingest_status('pending'|'complete'|'failed'), is_demo, ld_sha256, ldx_sha256,
  svm_sha256, ld_path, ldx_path, svm_path, trace_path`
- `laps`: `id, session_id, lap_no, lap_time_s, valid, summary jsonb`
  (per-channel min/max/avg + `emptyChannels[]`, `unreliableChannels[]`)
- Dedup: `unique(user_id, ld_sha256)`
- Atomicity: `check(ingest_status <> 'complete' OR (ld_path, ldx_path,
  svm_path, trace_path all NOT NULL))`

## PR checklist

### ☑ Step 1 — Schema migration (in-repo) · `supabase/migrations/`
- `sessions` + `laps` DDL above; `telemetry` bucket + per-user folder policies.
- **Acceptance verified 12 Aug:** re-ran the DB-layer tests post-migration —
  authenticated cross-user read = 0 rows; spoofed insert rejected; `complete`
  without `trace_path` rejected (G3.4 extended).
- **Reconciliation notes (deviations from this section, deliberate):**
  - Two files, not one: `20260810035850_phase1_schema_rls_storage.sql`
    (retroactive record of the S4 CREATE, already live since 10 Aug — this is
    the "pilot schema uncommitted" gap this step correctly flagged) +
    `20260812030000_s5_trace_and_demo_schema.sql` (the ALTER to this step's
    contract). Filenames match the timestamps Supabase's own migration
    history already recorded, so `supabase migration list` reconciles.
  - `laps` KEEPS its own `user_id` column + `laps_own` RLS policy, not the
    `session_id ∈ sessions` join this step describes. That join-based policy
    is unverified; the column+policy pattern was already proven at the DB
    layer in S4. Not switching a working security boundary without a reason.
  - `is_best` is **not** a stored column (redundant with `fastest_lap_no` now
    living on `sessions` — derive `lap.lap_no === session.fastest_lap_no`
    client-side).
  - `sessions` KEEPS `session_type`, `energy_scheme`, `summary` (session-level
    channel inventory), and `setup` (setup sheet) — this section's field list
    didn't include them, but dropping them regresses standing bars (setup
    sheet display; flags rendered in the UI) this plan doesn't otherwise cover.

### ☑ Step 2 — Ingest module (pure, tested) · `src/lib/ingest.js`
- Pipeline: `parseLd` + `decodeAll` → `lapBoundaries` → per-lap **distance
  resample to 400 pts** (integrate distance from Ground Speed·dt) → per-lap
  summaries + `allZero`/`reliable` flags → merge `.ldx` `setupSummary` +
  `.svm` `vehicleInfo`/`energyScheme` into header.
- SHA-256 of each raw file (dedup keys — `ld` only is the actual unique
  constraint; `ldx`/`svm` hashes are stored for integrity, not dedup).
- **Acceptance verified 12 Aug:** `ingest.test.js`, 11/11 vs the fixture —
  distance-monotonicity of the resample axis, GPS x/y bounded [0,1] against
  the session-wide box, per-lap + session-level flag parity, `recordedAt`
  parsed correctly from the `.ld` header. Live end-to-end: parsed, uploaded,
  round-tripped (trace blob + lap summaries) against the real Supabase
  project, cleaned up after.
- **Reconciliation note:** `export async function parseSessionFiles({ldBytes, ldxText, svmText})`,
  not `ingest(ldBuf, ldxBuf, svmText)` — same job, this repo's existing naming
  convention (matches the S3 `motec/` modules' style). Flat file, not a
  nested `ingest/` directory — no second file exists yet to justify one.
  GPS-arc-length fallback for distance integration (mentioned as a fallback
  in this step) is **not implemented** — Ground-Speed·dt only. The fixture
  never needed it; add it before it's load-bearing on a real export with
  unreliable Ground Speed.

### ◐ Step 3 — Upload flow · `src/components/UploadDropzone.jsx` (not a port of `ByteCraft_SessionUpload.jsx`)
- The atomic three-file picker + correct persistence order (parse → dedup
  check → upload raw + trace blob → insert laps → flip `complete`) **exists
  and is live-verified** — dedup rejection and interrupted-upload-leaves-no-
  `complete`-row both confirmed against the real project.
- **Not done:** this is an original minimal dropzone, not the prototype port
  this step specifies — no progress percentage UI, no file-size cap, no
  <10 s budget instrumentation. Functionally atomic; not yet the polished
  flow this step describes. Real remaining work, not a rename.

### ☐ Step 4 — SessionReport, 4 tabs · `src/components/report/*` (port `ByteCraft_SessionReport.jsx` + `ByteCraft_TrackMap.jsx`) — NOT STARTED
- `SessionDetail.jsx` exists as a deliberately minimal stand-in (header +
  lap table + full channel inventory with EMPTY/UNRELIABLE flags rendered —
  live-verified in the browser) to prove the pipeline honestly. It does not
  read the trace blob at all and is not the product-scope dashboard below.
  The trace blob (`getSessionTrace()` in `lib/sessions.js`) is fetched by
  nothing yet — this step is what will consume it.
- Summary / Performance / Instruments / Track Map; shared lap selector + synced
  cursor.
- Loads `laps` summaries from Postgres + the trace blob from Storage; Track Map
  colors by channel via `domainOf`.
- **EMPTY / unreliable flags rendered in the UI** — not just carried in data.
- Single-session defaults for `history` / `histAvg` (cross-session arrives in
  S6).
- **Acceptance:** a persisted session renders all four tabs; empty channels
  show EMPTY badges.
- **Standing bar:** unreliable data flagged, never hidden (G1.3).

### ☑ Step 5 — Demo-session seed · `src/lib/demo.js`
- On first sign-in (user has no sessions), fetch the committed fixture, run
  the Step 2 ingest, insert as `is_demo = true`. Idempotent (`useRef` guard,
  only fires once the first real session list confirms zero rows).
- **Acceptance verified 12 Aug, in-browser:** signed in as a fresh SQL-created
  confirmed test account (see reconciliation note) with zero sessions;
  watched the seed message render, then a populated demo session appear with
  a DEMO badge, correct venue/car/date/fastest-time/lap-count. Cleaned up
  after.
- **Not done:** demo sessions aren't yet enforced read-only anywhere (no RLS
  or UI check blocks a demo row from being edited/deleted like a real one).
- **Reconciliation note:** fixture is served from `frontend/public/fixtures/`
  (a second copy of the already-sanitized triple, alongside the one in
  `/fixtures` that CI uses) so the browser can `fetch()` it — `.gitignore`
  updated with a matching whitelist entry for the new path.

### ☐ Step 6 — Docs & gates
- `WORKING_PLAN.md` §0 / §3 / §5 updated 12 Aug for Steps 1/2/5 + the
  reconciliation decision; S5's row is still "in progress," not done — Steps
  3/4 remain.
- **Not done:** no CI check yet that the migration files in `supabase/
  migrations/` actually apply cleanly to a fresh database (this step's "new
  Ring 3 migration check"). Real gap — the two files are believed correct
  because they were derived from a live-verified `apply_migration` run, but
  nothing in CI proves that mechanically yet.

## Risk register

- **Distance integration accuracy** — GPS is game-world coordinates (relative
  only); prefer Ground-Speed·dt, GPS arc-length as fallback. Validate the
  resampled lap length against the `.ldx` fastest-lap figure.
- **< 10 s budget** — 70 channels × full-resolution decode in-browser;
  downsample *before* building `pts`, and move to a Web Worker if the main
  thread stalls. If anything must be capped, `log` it — never silently.
- **Storage-cap policy** (1 GB free ≈ 1,100 sessions) — out of scope here;
  already parked in `WORKING_PLAN.md` §6.

## Explicitly out of scope (not S5)

Cross-session history / `histAvg` and progression (S6) · Vercel deploy (S7) ·
lap-vs-lap overlay (S8) · sector splits (backlog) · any agent / metering
(Phase 2).
