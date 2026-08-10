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
| **Flagship deliverable** | Race Engineering Agent (multi-agent: Orchestrator → specialists → Optimizer → Synthesizer) |
| **Current phase** | Phase 1 — Launch *(telemetry product; agent stays dark)* |
| **Current iteration** | Iteration 1 — "Wire the spine" |
| **Health** | 🟡 On track, one sequencing tension to hold (see §3) |
| **Top blocker** | S1 — sanitized `.ld`/`.ldx`/`.svm` fixture still not committed; every CI ring (Ring 0) and the GitHub push (S2) sit behind it |
| **Last updated** | 6 Aug 2026 — _(update this line and §5 every session)_ |

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

Collapsed roadmap. Full detail and acceptance criteria live in *Product Phase Plan v1.0*.

| **NOW — Phase 1: Launch** | **NEXT — Phase 2: Intelligence + Teams** | **LATER — Phase 3–4: Run it / Grow it** |
| --- | --- | --- |
| Solo driver uploads a `.ld`+`.ldx`+`.svm` set, sees all 70 channels + trends. No AI, no teams. | Turn the Race Engineer Agent server-side. Roles, quotas, metering, garages, billing. | Ops dashboards, content pipeline, B2B/league pilots. Second sim title. Live/voice tier. |
| Deploy: frontend on Vercel/Netlify, backend + Postgres on Railway/Render/Fly, Timescale hypertable. | Depends entirely on **identity** landing first. | Directional; scope set by Phase 3 data. |

**Sequencing tension to hold consciously:** the Race Engineer Agent is the exciting deliverable and it already works as a prototype — but strategy puts a *telemetry* launch first (small surface, defers per-run API cost until revenue exists). Resist shipping the agent early. It goes live in Phase 2, on the identity spine built below.

---

## 3 · Current iteration — "Wire the spine"

The honest critical path. The agent can't become real until requests can be authenticated, gated, and metered server-side. Identity is the hidden dependency under everything in Phase 2, so we lay it now.

| # | Story (INVEST) | Status | Acceptance test = done when… | Notes |
| --- | --- | --- | --- | --- |
| S1 | Commit a sanitized `.ld` fixture so the repo can run parser tests without driver PII | ⬜ To do | CI runs the MoTeC integration suite against the anonymized fixture, green | **Still the blocker.** `conftest.py` + Ring 0 gates (`TESTING_GATES.md`) are now committed and expect `fixtures/cota_gte_sanitized.{ld,ldx,svm}` — the scaffolding exists, the actual sanitized files don't yet. Scrub the driver-name field (`0xA0`) from the real COTA/488 GTE export and commit the triple. |
| S2 | Complete the GitHub push (repo is currently local only) | ⬜ To do | `main` pushed; CI pipeline runs on it | Blocked by S1 (don't push real telemetry) |
| S3 | Integrate Clerk JWT with role claims (driver / garage-admin / product-admin) | ⬜ To do | A signed JWT carries a role claim the API can read | **The unlock.** Everything below waits on this. Independent of S1/S2 — can run in parallel. |
| S4 | Wire `get_db()` to `SET LOCAL` per-request tenant context for RLS | ⬜ To do | RLS test as garage-admin role: cross-garage read returns 0 rows at the DB layer | Needs S3 (JWT gives the tenant id). `G3.2` gate is defined in `TESTING_GATES.md`; policy SQL not yet drafted. |
| S5 | Move agent orchestration server-side (out of the browser) | ⬜ To do | A Standard run completes server-side < 60 s and writes tokens + cost to `agent_runs` | Deliberately parked — resist shipping ahead of identity per §2 sequencing tension. `test_cost_invariants.py` (G2.2/G2.3) is committed as an adapter shim, skips until `app.agents.orchestrator.build_run_plan` exists. |
| S6 | Enforce the three cost levers on the real run path | ⬜ To do | Invariant test: specialists never touch Opus; 2nd identical run shows ≥ 60 % cached input | Model tiering + prompt caching + run metering. Covered by the same shim as S5. |

**Definition of done for the iteration:** S1–S6 acceptance tests all pass, and a driver account can trigger a metered, server-side agent run gated by its real role.

**Iteration ROI triage (for anything proposed mid-flight):** does it serve S1–S6? If not → park it in §6, don't pull it in.

---

## 4 · Standing bars *(apply to every story, every phase — never negotiable)*

These are the cross-phase engineering invariants. A story that violates one is not done, regardless of its own acceptance test.

- **Parsers grounded in real files** — no format assumption ships unverified against a real LMU export (the `.svm` guess-vs-reality miss is the cautionary tale).
- **Three-file upload is atomic** — no session exists without `.ld`+`.ldx`+`.svm` together; enforced at the API boundary.
- **Specialists never run on Opus** — the cost model's central rule; enforced by automated test.
- **Tenant isolation lives in the database** — RLS policies, not application `WHERE` clauses.
- **Unreliable data is flagged, never hidden** — known-bad channels (ambient/track temp) and empty channels display with explicit flags.
- **Standards are audited** — all code answers to Clean Code / Clean Architecture / Clean Agile; Code Craft is the tracking mechanism.
- **Every increment is payable** — no phase ships infrastructure without a user-visible capability attached.

---

## 5 · Blockers & decisions log *(append-only; newest on top — this is the "updated" record)*

| Date | Type | Entry |
| --- | --- | --- |
| 6 Aug 2026 | Progress | `TESTING_GATES.md` (Ring 0–4 promotion contract) formalized and committed, along with adapter-shim test files (`conftest.py`, `test_parser_parity.py`, `test_cost_invariants.py`). All backend-facing suites currently `skipif` — they define the contract but nothing is wired to real code yet. |
| 6 Aug 2026 | Progress | Frontend: `ByteCraft_SessionReport.jsx` unifies Session Report + Track Map into one tabbed component (Summary/Performance/Instruments/Track Map) driven by a single lap selector and synced cursor; fixes a prior bug where performance metrics were static instead of recomputing per selected lap. |
| 6 Aug 2026 | Blocker (unchanged) | S1 fixture still not committed — see §3. This is the single item blocking Ring 0 (and therefore every ring behind it) once the repo pushes. |
| 2 Jul 2026 | Decision | Adopted this Working Plan as the operational tracker atop Phase Plan v1.0. |
| 30 Jun 2026 | Resolved | MoTeC `.ld` decode formula (`raw × mul / 10^dec + shift`) confirmed against real files; all 70 channels in validated ranges. Launch blocker cleared. |
| — | Blocker | Frontend not yet wired to backend; agent calls still run client-side (closed by S5). |
| — | Blocker | Role gating is client-side only — not trustworthy until S3 lands. |

---

## 6 · Backlog *(parked — pull only when it becomes "Do Now")*

- Stripe billing lifecycle (Phase 2 — quotas are fiction without it).
- Garage invite flow + pooled quota aggregation (Phase 2).
- Session notes: driver-written + agent-tagged, persisted per session (Phase 2).
- Published corner-dossier pipeline: draft → review → publish, versioned read-only (Phase 3).
- Car-level dimension on the Progression page (e.g. models within LMGT3).
- TimescaleDB hypertable conversion (executes with the Phase 1 deploy).
- Local companion app: auto-sync `.ld/.ldx` first, live-coaching bridge later.
- Live on-track voice coaching — separate premium tier; **price its real-time cost apart from batch inference** to avoid an anchor problem.
- Second sim title (iRacing / ACC) — new ingest parser only; rest of stack is title-agnostic (Phase 4).
- Cross-session Progression/trend view (best lap, gap progression, consistency across ≥2 sessions) — explicit Phase 1 acceptance criterion, not yet evidenced in any committed frontend artifact; needs a story once S1/S2 clear.

---

## 7 · Reusing this for the next Claude-built tool

The value here is the *shape*, not the ByteCraft content. To start a new tool:

1. Copy this file to the new repo as `WORKING_PLAN.md`. Delete the content in §0, §2, §3, §5, §6.
2. Keep §1 (The Loop) and §4 (Standing bars) verbatim — that's the reusable operating system. Edit §4's invariants to the new tool's non-negotiables.
3. Fill §0 status header, then write the **Now/Next/Later** in §2 (three columns, one phase each — resist more).
4. Slice only the *Now* column into §3 stories. Give each an acceptance test. That's the whole plan; don't pre-plan Next/Later in detail — Phase-N data decides Phase-N+1.
5. Drive it with The Loop. Update §0 and §5 every session.

**One-line spirit:** *plan the phase you're in, define done by a passing test, cut scope not quality, and write down what happened.*
