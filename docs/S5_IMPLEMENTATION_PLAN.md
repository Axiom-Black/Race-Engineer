# S5 Back Half — Implementation Plan & PR Checklist

> **Status:** approved plan, pre-code. Author it here so the core-loop PR has a
> reviewable contract before a line is written. Supersedes nothing in
> `WORKING_PLAN.md`; it expands S5's row into an executable checklist.

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

### ☐ Step 1 — Schema migration (in-repo) · `supabase/migrations/0001_pilot_schema.sql`
- `sessions` + `laps` DDL above; `telemetry` bucket + per-user folder policies.
- RLS on both tables keyed on `auth.uid()`; `laps` inherits via
  `session_id ∈ sessions`.
- **Acceptance:** migration applies clean; authenticated cross-user read = 0
  rows; a spoofed insert and an incomplete-set `complete` are both rejected at
  the DB layer.
- **Gates:** Ring 3 G3.1 / G3.2 / G3.4. Also closes the "pilot schema
  uncommitted" gap (today it lives only in the Supabase project).

### ☐ Step 2 — Ingest module (pure, tested) · `src/lib/ingest/session.js`
- `ingest(ldBuf, ldxBuf, svmText) → { session, laps, trace }`.
- Pipeline: `parseLd` + `decodeAll` → `lapBoundaries` → per-lap **distance
  resample to 400 pts** (integrate distance from Ground Speed·dt; GPS
  arc-length as fallback) → per-lap summaries + `allZero`/`reliable` flags →
  merge `.ldx` `setupSummary` + `.svm` `vehicleInfo`/`energyScheme` into header.
- SHA-256 of each raw file (dedup keys).
- **Acceptance:** fixture ingests to the expected lap count + summary shape;
  Vitest against the golden masters; 400-pt-per-lap invariant asserted.
- **Gates:** Ring 4 (extends the existing `motec` suite). Standing bar:
  parsers grounded in real files — reuses S3, introduces no new format
  assumptions.

### ☐ Step 3 — Upload flow · `src/components/upload/*` (port `ByteCraft_SessionUpload.jsx`)
- Atomic three-file picker (`.ld` + `.ldx` + `.svm`), client-validated before
  any write.
- Order: ingest + validate → upload raw to Storage → upload trace blob →
  insert `sessions` + `laps` → flip `ingest_status = 'complete'`. Orphan
  cleanup on any failure. Dedup check surfaces "already uploaded".
- Progress UI; enforce the < 10 s target; sane file-size cap.
- **Acceptance:** the real COTA triple persists end-to-end in < 10 s;
  interrupting mid-flow leaves no `complete` row.
- **Standing bars:** three-file upload atomic (client UX *and* DB constraint);
  gating is never client-side only.

### ☐ Step 4 — SessionReport, 4 tabs · `src/components/report/*` (port `ByteCraft_SessionReport.jsx` + `ByteCraft_TrackMap.jsx`)
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

### ☐ Step 5 — Demo-session seed · `src/lib/demo/seed.js`
- On first sign-in (user has no sessions), fetch the committed fixture, run the
  Step 2 ingest, insert as `is_demo = true` read-only session. Idempotent;
  guarded against re-seeding.
- **Acceptance:** a brand-new account lands on a populated dashboard with zero
  upload.

### ☐ Step 6 — Docs & gates
- `WORKING_PLAN.md` §0 / §3 / §5 (S5 → done); note S6 unblocked.
- Confirm CI green (Rings 0 / 1 / 4) + the new Ring 3 migration check.
- PR body maps each item to its acceptance test.

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
