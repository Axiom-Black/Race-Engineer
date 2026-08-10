# ByteCraft Racing — Daily Dev Plan

_Auto-generated daily at 12:00 PM ET from `WORKING_PLAN.md`, `TESTING_GATES.md`, and the latest committed artifacts. Overwritten each run — history of decisions lives in `WORKING_PLAN.md` §5, not here._

**Run date:** 6 Aug 2026

---

## Snapshot

Phase 1 (Launch — telemetry product, agent dark) is the active phase. Iteration "Wire the spine" (S1–S6) is the critical path. Since the plan was last touched (2 Jul), two things landed without the tracker being updated: the CI promotion contract (`TESTING_GATES.md`, Ring 0–4) plus three adapter-shim test files, and a unified frontend Session Report + Track Map component. Neither closes an S-story yet — both are scaffolding waiting on the same blocker: **S1, the sanitized fixture, still isn't committed.**

---

## Area 1 — Fixture & Ring 0 (critical path, blocks everything else)

**Where it stands:** `conftest.py` and `TESTING_GATES.md` G0.1/G0.2 are written and expect `fixtures/cota_gte_sanitized.{ld,ldx,svm}`. The files themselves are not committed. Every downstream ring (parser truth, agent contracts, auth, parity) is gated behind Ring 0, and S2 (GitHub push) is gated behind S1.

**Plan of action:**
1. Take the real COTA / Ferrari 488 GTE Evo export, scrub the driver-name field (offset `0xA0`) and any other PII; leave GPS in game-world coordinate space (already compliant with G0.2).
2. Truncate to a CI-friendly sample count; keep all 70 channels represented so G1.1–G1.4 have real signal to check.
3. Commit the triple to `fixtures/` and run the Ring 0 + Ring 1 suites locally to confirm green before pushing.
4. Once green, execute S2 (push `main`, confirm CI runs on it).

---

## Area 2 — Backend parsers & orchestrator wiring (Ring 1 / Ring 2)

**Where it stands:** `test_parser_parity.py` and `test_cost_invariants.py` are adapter shims — both `skipif` because `app.ingest.motec/ldx/svm` and `app.agents.orchestrator.build_run_plan` aren't importable yet. The decode formula and model-tiering rules are fully specified (`MoTeC_LD_format_findings.md`, cost model), just not implemented behind the interfaces the tests expect.

**Plan of action:**
1. Stand up `app/ingest/motec.py`, `app/ingest/ldx.py`, `app/ingest/svm.py` implementing `parse_ld`/`parse_ldx`/`parse_svm` + `domain_of()` to the exact shapes the shim expects.
2. Stand up `app/agents/orchestrator.py::build_run_plan(run_class)` returning role/model assignments per the tiering rule (specialists = Haiku only, brain = Sonnet on Standard, Opus reserved for Deep synthesis).
3. Write `js_parity_runner.mjs` wrapping the JS port already in `ByteCraft_SessionUpload.jsx` so Ring 4 (G4.1/G4.2) can run.
4. Flip the `skipif` guards green one gate at a time; don't touch the test logic itself, only the adapter shim per the file's own instructions.

---

## Area 3 — Identity & auth (S3, the Phase 2 unlock)

**Where it stands:** Still fully "to do." No JWT/Clerk wiring evidenced in any committed doc or component. This is independent of Area 1/2 and can run in parallel.

**Plan of action:**
1. Integrate Clerk JWT issuance with a role claim (`driver` / `garage-admin` / `product-admin`).
2. Add API-side middleware that reads and verifies the claim — this is the piece that makes role gating trustworthy (currently client-side only, called out as a standing risk in both `WORKING_PLAN.md` and `TESTING_GATES.md` G3.3).
3. Write G3.1 (role claim readable by the API) as the first Ring 3 test to go green.

---

## Area 4 — Tenancy / RLS (S4)

**Where it stands:** Blocked on S3 for activation, but the policy SQL itself doesn't need to wait.

**Plan of action:**
1. Draft the RLS policies against the 14-table ORM now, independent of JWT timing.
2. Wire `get_db()` to accept a `SET LOCAL` tenant context per request (mechanism only — activation waits on S3 supplying a real tenant id).
3. Have G3.2 (cross-garage read → 0 rows at the DB layer) ready to run the moment S3 lands.

---

## Area 5 — Agent orchestration going server-side (S5/S6)

**Where it stands:** Deliberately dark. The Working Plan's explicit sequencing call: don't ship the agent ahead of identity, even though the orchestrator prototype already works (`RaceEngineeringAgent_v2.jsx` running live client-side calls). Today's only movement here was test scaffolding (Area 2), not the orchestration move itself.

**Plan of action:** No action until S3 lands — hold the line on sequencing. Keep the G2.2/G2.3 shim current so it's ready to flip the moment the orchestrator moves server-side.

---

## Area 6 — Frontend: session viewer & track map (Phase 1 UI)

**Where it stands:** `ByteCraft_SessionReport.jsx` now unifies Session Report + Track Map into one tabbed view (Summary/Performance/Instruments/Track Map) with a single lap selector and synced cursor, and fixes a bug where performance metrics were static instead of recomputing per selected lap. This is solid prototype progress but still browser-only, parsing in-browser against the one COTA fixture.

**Plan of action:**
1. Wire this component to the backend API for session persistence instead of parse-once-in-browser (Phase 1 scope: "parsed client-side, posted to API").
2. Build the cross-session Progression/trend view (best lap, gap progression, consistency across ≥2 sessions) — an explicit Phase 1 acceptance criterion with no committed artifact yet; added to `WORKING_PLAN.md` §6 backlog today so it doesn't get lost.
3. Once the backend accumulates real multi-session data, retire the "vs history" demo-baseline label currently flagged in the component's own header comment.

---

## Area 7 — Deployment & hosting (Phase 1 infra)

**Where it stands:** Not started. Waiting on S1/S2 (nothing to deploy until the repo is pushed and CI is green on Ring 0–1).

**Plan of action:** Once S2 clears, stand up Postgres + the Timescale hypertable conversion, pick frontend hosting (Vercel/Netlify) and backend hosting (Railway/Render/Fly), and wire CI/CD to deploy on a green `main`.

---

## Top priority for the next work session

Close S1. It is the only item blocking Ring 0, which blocks every other ring, which blocks the GitHub push, which blocks deployment. Everything else in this list can run in parallel once that one file triple is committed.
