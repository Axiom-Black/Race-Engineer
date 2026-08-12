# ByteCraft Racing — Working Plan

> **What this is.** The operational tracker that sits on top of the strategic *Product Phase Plan v1.0*.
> The Phase Plan says *what ships in what order and why*. This says *what we're doing right now,
> whether it's done, and what's in the way*. Keep this in the repo root. Update it every work session.
> The structure is generic on purpose — copy it to spin up the next Claude-built tool (see §7).

---

## 0 · Status at a glance

| Field | Value |
| --- | --- |
| **Product** | ByteCraft Racing — Race Engineering Manager (Axiom Black, LLC) |
| **Flagship deliverable** | Race Engineering Agent (multi-agent: Orchestrator → specialists → Optimizer → Synthesizer) — dark until Phase 2 |
| **Current phase** | Phase 1 — Launch *(Tier 1 Pilot: telemetry product on a $0/month stack — Vite+React on Vercel, Supabase for Postgres/Auth/Storage/RLS; client-side parsing; no FastAPI in the pilot)* |
| **Current iteration** | Iteration 2 — "Pilot spine" (S1–S8 below) |
| **Health** | 🟢 On track — S3 (JS parsers) closed on `main`; onboarding spine (S5 front half) shipped. S5 back half (upload → parse → persist → dashboard) is now the critical path, and its parser dependency is satisfied. |
| **Top blocker** | None — S1/S3/S4 closed, onboarding spine landed. S5 back half wires the S3 `motec/` parsers into the upload flow → SessionReport/TrackMap. S2 branch protection still manual (plan-gated on private repo). |
| **Last updated** | 12 Aug 2026 — _(update this line and §5 every session)_ |

---

## 1 · The Loop *(how this plan is run — the reusable part)*

Five moves, repeated. This is the whole methodology; everything else is content.

1. **Slice** — break the next phase into INVEST-shaped stories (independent, small, testable). A story too fuzzy to estimate becomes a **spike** first.
2. **Define done** — every story gets one acceptance test. "Done" = that test passes. No test, no story.
3. **Triage** — park each candidate in the ROI grid: *Do Now* (high value / low cost) → *Do Later* → *Do Much Later* → *Never*. Only pull *Do Now* into the iteration.
4. **Build** — smallest working increment first. Every increment must leave something a driver would pay for (the Phase Plan's guiding principle).
5. **Update this file** — move story status, log the decision or blocker in §5, bump §0. That's the ritual. If it isn't written here, it didn't happen.

**Cadence:** one iteration per focused push. **Standing rule:** cut scope before cutting quality (the Iron Cross — schedule, quality, staff are fixed; *scope* is the lever).

---

## 2 · Now / Next / Later

Collapsed roadmap. Full detail and acceptance criteria live in *Product Phase Plan v1.0*; the 9 Aug 2026 stack pivot (this file, §5) supersedes the Phase Plan's hosting notes.

| **NOW — Phase 1: Launch (Tier 1 Pilot)** | **NEXT — Phase 2: Intelligence + Teams** | **LATER — Phase 3–4: Run it / Grow it** |
| --- | --- | --- |
| Solo driver uploads a `.ld`+`.ldx`+`.svm` set, sees all 70 channels + cross-session progression. No AI, no teams. | Turn the Race Engineer Agent server-side. Roles, quotas, metering, garages, billing. | Ops dashboards, content pipeline, B2B/league pilots. Second sim title. Live/voice tier. |
| Deploy: Vite+React SPA on Vercel; Supabase Postgres/Auth/Storage with RLS. Client-side parsing; summaries + ~400-pt/lap traces persist; raw files to Storage. No backend service, no TimescaleDB. | The FastAPI service (`backend/`, Phase 2 inventory) returns as the **only writer** for metered operations. Identity = Supabase Auth JWT (Clerk superseded). | Directional; scope set by Phase 3 data. |

**Sequencing tension to hold consciously:** the Race Engineer Agent is the exciting deliverable and it already works as a prototype — but strategy puts a *telemetry* launch first (small surface, defers per-run API cost until revenue exists). Resist shipping the agent early. It goes live in Phase 2, on the identity spine already laid by Supabase Auth + RLS.

---

## 3 · Current iteration — "Pilot spine"

The honest critical path for the Tier 1 Pilot. Iteration 1 ("Wire the spine": Clerk JWT, FastAPI RLS wiring, server-side agent) was retired 9 Aug 2026 — it described Phase 2 work on a superseded stack; its S5/S6 concerns return in Phase 2 with Supabase Auth as the identity source.

| # | Story (INVEST) | Status | Acceptance test = done when… | Notes |
| --- | --- | --- | --- | --- |
| S1 | Reference bundle in repo: sanitized `.ld`/`.ldx`/`.svm` fixture triple **+ Python golden-master JSON** of its decoded output | ✅ Done 10 Aug 2026 | Ring 0 green (G0.1/G0.2); golden masters committed under `fixtures/` | Closed via a PR from branch `claude/materials-repo-guide-wy7pl4` — see §5. Driver-name offset confirmed `0x9E` (not `0xA0`); field holds a `DRIVER_REDACTED` placeholder, not a null-zeroed field (noted deviation, see `fixtures/FIXTURE_NOTES.md`). `scale` (0x1C) and float32 questions resolved from real bytes. |
| S2 | CI pipeline + branch protection | 🟨 In progress | A PR that breaks a Ring 0–1 gate cannot merge to `main`; pushes to `main` run the rings | `.github/workflows/ci.yml` committed 10 Aug: Ring 0 (fixture present, hashes vs FIXTURE_NOTES, no telemetry outside `fixtures/`, driver field scrubbed) → Ring 1 (backend suite vs fixture). First run triggers on this push — confirm green. **Branch protection still manual** (GitHub → Settings → Branches); note GitHub free tier only enforces protection on public repos — decide: upgrade, or hold the PR discipline by convention. |
| S3 | JS parser modules (`ld.js`/`ldx.js`/`svm.js`) with the **full** decode formula — `phys = raw × mul / (scale × 10^dec) + shift` (both `shift` AND `scale`; int-only sample reads, no float branch) | ✅ Done 10 Aug 2026 | JS decode of the fixture matches `fixtures/golden_master_*.json` exactly (G1.2/G4.1); the 9 `CAL`-badged channels decode to physical units; Ambient/Track Temp read ~29/39 °C (scale=50); `all_zero` flags surface in parser output | Ported from the Python reference into `frontend/src/lib/motec/` (`ld`/`ldx`/`svm`/`domain`). Vitest golden-master suite: **18/18** — every decoded trace value-for-value, quirk flags, lap boundaries, `.ldx` summary + truncation detector, `.svm` sections + energy branch, G4.2 domain snapshot (`fixtures/golden_master_domains.json`, newly frozen). Ring 4 wired into CI after Ring 1. |
| S4 | Vite + React scaffold + Supabase project: Auth wired, Phase 1 schema, RLS keyed on `auth.uid()` on every table & bucket, storage buckets, atomic three-file constraint | ✅ Done 10 Aug 2026 | RLS test: authenticated cross-user read returns **0 rows at the DB layer**; a session row cannot reach `complete` without all three storage paths recorded | Supabase project `bytecraft-racing` (us-east-1, $0/mo confirmed). All three DB-layer tests passed: cross-user read = 0 rows; spoofed insert rejected by RLS; `complete` without `.svm` path rejected by `three_file_atomicity`. Browser smoke green (reachable / auth / RLS query). Schema: `sessions` + `laps`, `telemetry` bucket with per-user folder policies, dedup constraint on `(user_id, ld_sha256)`. |
| S5 | Core loop: upload → client-side parse → summaries + downsampled traces persist → SessionReport/TrackMap dashboard renders | 🟨 In progress | The real COTA triple (local only) uploads and renders a complete session view in < 10 s; unreliable/empty channels display SIM/EMPTY flags | **Front half done 11 Aug** — onboarding spine shipped: Supabase Auth email+password sign-up/sign-in/sign-out (`src/lib/auth.jsx`), auth-gated app shell + empty-state dashboard replacing the S4 smoke screen. **Back-half plan** committed (`docs/S5_IMPLEMENTATION_PLAN.md`, 6 steps). **Steps 1–2 done 12 Aug.** Step 1: pilot schema as `supabase/migrations/0001_pilot_schema.sql` (+ `0002_storage.sql`); Ring 3 acceptance in CI + verified on Postgres 16. Step 2: `src/lib/ingest/session.js` — pure `ingest(ld, ldx, svm) → {session, laps, trace}` on the S3 parsers (distance-resampled 400-pt/lap traces, per-lap summaries, empty-channel reporting, SHA-256 dedup keys); Vitest 9/9 (27/27 total). Remaining: Step 3 upload flow → Step 4 SessionReport (4 tabs) → Step 5 demo seed. |
| S6 | Progression/trend view on persisted multi-session data | ⬜ To do | Best-lap progression chart renders across ≥ 2 uploaded sessions of the same car/track combo | Explicit Phase 1 acceptance criterion (promoted from backlog). Rewire `v12_Merged`'s progression tab from the seeded generator to real session summaries. Dedup uploads by file hash so trends can't be polluted. |
| S7 | Deploy to Vercel + error tracking (Sentry free tier) | ⬜ To do | Production URL passes the walkthrough: register → empty dashboard < 2 min; upload → full view < 10 s; sessions survive sign-out/sign-in | Vercel + Supabase CLIs, matching future CI. |
| S8 | Lap-vs-lap overlay with cumulative delta-time trace | ⬜ To do | Two laps of one session overlay on the report's plots with a delta trace; selectable reference lap | The one scope addition that moves "viewer" → "tool a driver pays for". Data structures (400-pt laps with elapsed time) already support it. |

**Definition of done for the iteration:** S1–S8 acceptance tests pass and a stranger can sign up on the production URL, upload a session, see honest telemetry, and watch their trend after a second upload.

**Iteration ROI triage (for anything proposed mid-flight):** does it serve S1–S8? If not → park it in §6, don't pull it in.

---

## 4 · Standing bars *(apply to every story, every phase — never negotiable)*

These are the cross-phase engineering invariants. A story that violates one is not done, regardless of its own acceptance test.

- **Parsers grounded in real files** — no format assumption ships unverified against a real LMU export (the `.svm` guess-vs-reality miss is the cautionary tale).
- **Three-file upload is atomic** — no session exists without `.ld`+`.ldx`+`.svm` together; in the pilot: enforced client-side before insert AND by a database constraint / `ingest_status` check.
- **Specialists never run on Opus** — the cost model's central rule; enforced by automated test (dormant in the pilot; the invariant tests stay and must keep passing/skipping).
- **Tenant isolation lives in the database** — RLS policies keyed on `auth.uid()`, not application `WHERE` clauses.
- **Unreliable data is flagged, never hidden** — empty channels (GTE: Tyre Load ×4, Grip Fract ×4, Battery Charge; plus per-session all-zero channels) display with explicit flags. *(Ambient/Track Temp were **reclassified 10 Aug 2026**: the "unreliable" flag was masking our own dropped-`scale` decode bug — with the full formula they decode correctly and are no longer flagged. The bar itself is unchanged: whatever is genuinely unreliable gets flagged, and flags must be **rendered in the UI**, not just carried in data — the prototype review found no dashboard renders them yet.)*
- **Standards are audited** — all code answers to Clean Code / Clean Architecture / Clean Agile; Code Craft is the tracking mechanism.
- **Every increment is payable** — no phase ships infrastructure without a user-visible capability attached.

---

## 5 · Blockers & decisions log *(append-only; newest on top — this is the "updated" record)*

| Date | Type | Entry |
| --- | --- | --- |
| 12 Aug 2026 | Progress | **S5 Step 2 — ingest module.** `src/lib/ingest/session.js`: pure `ingest(ldBuf, ldxText, svmText) → {session, laps, trace}` built entirely on the golden-tested S3 parsers (no new decode assumptions). Lap windows from the `.ld` Lap Number boundaries with the final lap running to the true session end (max sample time across channels — so a marker-less session isn't clipped to the Lap Number channel's own length, a bug the fixture surfaced). Per-lap traces resampled to 400 points **by track distance** (trapezoid-integrated Ground Speed; time-based fallback if the car never moves), GPS normalized to the session bbox. Per-lap summaries (min/max/avg per channel) + honest empty-channel reporting (`emptyChannels`, `knownEmptyForClass`); header/car/class/ruleset merged from `.ld`+`.svm`; SHA-256 dedup keys via WebCrypto. Vitest 9/9 (27/27 total) — lap count vs boundaries, 400-pt & monotonic-distance & unit-box invariants, summary min/max cross-checked against the raw decode, known-empty GTE channels asserted empty, dedup hashes vs an independent SHA-256. |
| 12 Aug 2026 | Progress | **S5 Step 1 — pilot schema committed + Ring 3 live.** Codified the (previously dashboard-only) pilot schema as `supabase/migrations/0001_pilot_schema.sql`: `sessions` + `laps`, owner-scoped RLS on `auth.uid()`, `three_file_atomicity` check (no `complete` without all three raw paths + trace path), `(user_id, ld_sha256)` dedup; storage bucket + per-user object policies in `0002_storage.sql`. Added a Ring 3 CI job (ephemeral `postgres:16` service) that applies an auth shim → the migration → `tests/01_rls_acceptance.sql`, asserting G3.1/G3.2/G3.4 at the DB layer. Verified locally on Postgres 16: cross-user read 0 rows, spoofed insert rejected, incomplete-set `complete` rejected, duplicate `.ld` rejected — and the migration re-applies as a no-op (idempotent). Also landed the approved back-half plan doc. `main` CI green (Rings 0/1/4) before this branch. |
| 11 Aug 2026 | Progress | **S5 front half — onboarding spine shipped.** Replaced the S4 smoke screen with the real onboarding funnel: `AuthProvider`/`useAuth` over Supabase Auth (`src/lib/auth.jsx`), email+password sign-up / sign-in / sign-out, an auth-gated root (`App.jsx` `Gate`) with a first-paint loading guard so a restored session never flashes the sign-in form, a branded `AuthScreen` (client-side validation + friendly Supabase error mapping; treats a session-less sign-up as "confirm your email"), and an `AppShell` with top bar + honest empty-state dashboard pointing at the next step (upload is disabled, not faked — Standing bar: no faked capability). Shared tokens in `src/theme.js`, atoms in `src/components/ui.jsx`. Rebased onto the S3 merge; kept S3's `package.json` (`vitest` + optional-only win32 binding, which already resolves the Linux `EBADPLATFORM` install). `npm run build`, `oxlint`, and `vitest` (18/18) all green on Linux. |
| 10 Aug 2026 | Progress | **S3 closed.** JS parsers ported from the Python reference into `frontend/src/lib/motec/`: full decode formula (`shift` + `scale`), latin1 strings, truncation clamp, `all_zero` flags, lap boundaries from Lap Number. Vitest golden-master suite 18/18 against the fixture — includes G1.5 tripwires (scale 50/50/9, int32-only GPS, `0x9E`) and G1.4 truncated-input safety. G4.2 domain mapping snapshot generated and committed (`fixtures/golden_master_domains.json` — frozen verbatim from the prototype `domainOf`). Ring 4 added to CI as a third job after Ring 1 (with a guard for the npm optional-deps bug that also bit locally — win32 rolldown binding moved to `optionalDependencies`). The prototype JSX parser and its `CAL` badges are now formally superseded. |
| 10 Aug 2026 | Progress | **S4 closed; S2 CI committed.** Supabase project `bytecraft-racing` created (us-east-1, free tier, cost confirmed $0/mo). Phase 1 migration applied: `sessions`/`laps` with RLS on `auth.uid()`, `three_file_atomicity` check, `(user_id, ld_sha256)` dedup, private `telemetry` bucket with per-user folder policies. Acceptance verified at the DB layer (cross-user read 0 rows; spoofed insert rejected; incomplete-set `complete` rejected) and from the browser (Vite scaffold smoke screen: reachable/auth/RLS all green). `.github/workflows/ci.yml` added — Ring 0 → Ring 1 on every push/PR to `main`. Branch protection remains manual and is plan-gated on private repos (GitHub free enforces only on public). Frontend scaffold note: Vite 8 uses rolldown; the npm optional-deps bug required force-installing `@rolldown/binding-win32-x64-msvc@1.2.3` locally. |
| 10 Aug 2026 | Progress | **Reference bundle reviewed and merged to `main`.** Manual gate pass (no CI yet): bundle based on current `main`; fixture hashes match `FIXTURE_NOTES.md`; `DRIVER_REDACTED` confirmed at `0x9E` by byte inspection; repo-wide PII grep clean; all deps MIT/BSD/Apache; our adapter shims untouched. Python suite run against the fixture: **124 passed / 13 skipped / 0 failed** after fixing the golden-master test's stale key names (the wiring gap the 10 Aug entry below predicted). Review fixes committed on the branch before merge: test keys, a §5 log line that quoted the driver's surname inside a grep command (G0.2), and a `FIXTURE_NOTES.md` erratum. |
| 10 Aug 2026 | Decision | **Ambient/Track Temp reclassified — not an LMU quirk.** The long-standing "unreliable temperature channels" flag was masking our own decode bug: the `scale` field (0x1C) is a divisor (`phys = raw × mul / (scale × 10^dec) + shift`), 50 on both temp channels — dropping it produced the −265 °C garbage that got the channels flagged. With the full formula they decode to plausible values (~29/39 °C) and the parser no longer flags them. §4 standing bar, `TESTING_GATES.md` G1.1/G1.3/G1.5, and `CLAUDE.md` updated; JS port (S3) must implement **both** `shift` and `scale`. |
| 10 Aug 2026 | Progress | **S1 closed.** Reference bundle received and committed on branch `claude/materials-repo-guide-wy7pl4` (PR pending review by Tosin): FastAPI scaffold under `backend/app/` + `backend/tests/unit/`; sanitized `.ld`/`.ldx`/`.svm` triple + split golden-master JSON (`golden_master_ld/ldx/svm.json`) under `fixtures/`; `fixtures/FIXTURE_NOTES.md` records the SHA-256 hashes and closes all three open decode questions. All three resolved from real-byte evidence: driver-name field starts at `0x9E` (not `0xA0` — findings doc corrected); full formula is `phys = raw * mul / (scale * 10^dec) + shift`, `scale` non-1 for Ambient/Track Temp (50) and Steering Wheel Position (9); no datatype-category-3 channel is float32 (GPS is the only 4-byte pair, and it's int32). PII note: the driver-name field is scrubbed with a `DRIVER_REDACTED` placeholder rather than null bytes — a deviation from "zero the whole field," recorded rather than hidden. Two received files (`backend/tests/unit/test_motec_parser.py` and a duplicate `MoTeC_LD_format_findings.md`) carried the real driver name in plaintext and were scrubbed before commit; full-repo case-insensitive grep for the driver's name came back clean. Known wiring gaps left for CI hookup (S2/S3): `backend/tests/unit/test_motec_parser.py`'s `TestSanitizedFixture` golden-master comparison still assumes the old flat `ld_*`-prefixed, dict-keyed-by-channel-name JSON shape and needs updating to the split-file, list-of-channels shape now committed; `app/ingest/svm.py` (referenced by `test_parser_parity.py`'s adapter shim) was not present in the scaffold. |
| 9 Aug 2026 | Decision | Rings re-grounded for the pilot: Ring 3 = Supabase RLS on `auth.uid()` (was Clerk JWT); Ring 4 = JS-vs-**golden-master** parity (no Python at runtime; Python generates the committed truth data once). `TESTING_GATES.md` updated to match. |
| 9 Aug 2026 | Blocker | JS prototype parser omits the `+ shift` decode term — 9 core channels (throttle, brake, clutch, steering ×2, G ×3, fuel) un-decodable client-side (`CAL` badges). Python parsers are the reference implementation. Also open, settle from evidence only: `scale` (0x1C) semantics; possible float32 channels read as int32; driver-name offset `0x9E` vs `0xA0`. Reference bundle requested (backend zip + sanitized fixture + golden masters). |
| 9 Aug 2026 | Progress | Housekeeping commit: repo reorganized (`docs/`, `docs/pm/`, `prototypes/`, `backend/tests/`), LICENSE (proprietary) + `.gitignore` (blocks `*.ld/*.ldx/*.svm` outside `fixtures/`) added, mislabeled file extensions fixed, PII scrubbed from findings doc + two prototype data blobs. Three copyrighted Pearson PDFs removed from the tree (also independently deleted on remote); they remain in commit history pending a rewrite decision. |
| 9 Aug 2026 | Progress | Repo live at `github.com/Axiom-Black/Race-Engineer`, `main` pushed (old-S2 push objective met; CI enforcement is new-S2). Handover bundle received and committed. |
| 9 Aug 2026 | Decision | **Tier 1 Pilot stack pivot:** Vercel (frontend) + Supabase (Postgres/Auth/Storage/RLS), $0/month; **no FastAPI in the pilot**; parsing client-side; summaries + ~400-pt/lap traces persist, raw files to Storage; no TimescaleDB. Clerk **superseded** by Supabase Auth. Iteration 1 ("Wire the spine") retired — it was Phase 2 work on the old stack. Supersedes conflicting notes in the Phase Plan, PM workbook, and older tracker entries. |
| 6 Aug 2026 | Progress | `TESTING_GATES.md` (Ring 0–4 promotion contract) formalized and committed, along with adapter-shim test files (`conftest.py`, `test_parser_parity.py`, `test_cost_invariants.py`). All backend-facing suites currently `skipif` — they define the contract but nothing is wired to real code yet. |
| 6 Aug 2026 | Progress | Frontend: `ByteCraft_SessionReport.jsx` unifies Session Report + Track Map into one tabbed component (Summary/Performance/Instruments/Track Map) driven by a single lap selector and synced cursor; fixes a prior bug where performance metrics were static instead of recomputing per selected lap. |
| 2 Jul 2026 | Decision | Adopted this Working Plan as the operational tracker atop Phase Plan v1.0. |
| 30 Jun 2026 | Resolved | MoTeC `.ld` decode formula (`raw × mul / 10^dec + shift`) confirmed against real files; all 70 channels in validated ranges. Launch blocker cleared. |

---

## 6 · Backlog *(parked — pull only when it becomes "Do Now")*

**Phase 1 candidates (cheap, high value — next pulls if the iteration runs ahead):**
- Shareable read-only session link (public flag under RLS / signed URL) — distribution in the sim-racing Discord ecosystem.
- CSV export of decoded channels.
- Simple 3-sector splits (distance thirds per lap) feeding Progression.
- Supabase free-tier quota policy: decide behavior at the 1 GB storage cap (~1,100 raw sessions) and mitigate the free-project inactivity pause before the pilot has real users.

**Phase 2+ (unchanged):**
- Stripe billing lifecycle (quotas are fiction without it).
- Garage invite flow + pooled quota aggregation.
- Session notes: driver-written + agent-tagged, persisted per session.
- Published corner-dossier pipeline: draft → review → publish, versioned read-only (Phase 3).
- Car-level dimension on the Progression page (e.g. models within LMGT3).
- TimescaleDB hypertables (Phase 2+ migration decision, not a launch requirement).
- Local companion app: auto-sync `.ld/.ldx` first, live-coaching bridge later.
- Live on-track voice coaching — separate premium tier; **price its real-time cost apart from batch inference**.
- Second sim title (iRacing / ACC) — new ingest parser only; rest of stack is title-agnostic (Phase 4).

---

## 7 · Reusing this for the next Claude-built tool

The value here is the *shape*, not the ByteCraft content. To start a new tool:

1. Copy this file to the new repo as `WORKING_PLAN.md`. Delete the content in §0, §2, §3, §5, §6.
2. Keep §1 (The Loop) and §4 (Standing bars) verbatim — that's the reusable operating system. Edit §4's invariants to the new tool's non-negotiables.
3. Fill §0 status header, then write the **Now/Next/Later** in §2 (three columns, one phase each — resist more).
4. Slice only the *Now* column into §3 stories. Give each an acceptance test. That's the whole plan; don't pre-plan Next/Later in detail — Phase-N data decides Phase-N+1.
5. Drive it with The Loop. Update §0 and §5 every session.

**One-line spirit:** *plan the phase you're in, define done by a passing test, cut scope not quality, and write down what happened.*
