ByteCraft Racing — Product Phase Plan

| **BYTECRAFT RACING** **Race Engineering Manager** Product Phase Plan with Acceptance Criteria Version 1.0  ·  30 June 2026 Prepared by Axiom Black, LLC — Technology *Building The Future* |
| --- |

# **Executive Summary**

ByteCraft Racing's Race Engineering Manager is a sim-racing telemetry and AI race-engineering platform for LeMans Ultimate. The product ships in five phases, sequenced so that each phase delivers a self-contained, usable increment: a working solo telemetry dashboard first, intelligence and team features second, operational maturity third, and market expansion last.

Phase 0 (prototyping) is effectively complete. The remaining launch-critical engineering — the MoTeC binary decode — was resolved on 30 June 2026: the full conversion formula (raw × mul / 10^dec + shift) is confirmed against real LMU session files, with all 70 telemetry channels decoding to physically validated ranges. The launch blocker is cleared; Phase 1 is now an integration and deployment effort, not a research effort.

**Guiding principle: **every phase must leave the product in a state a real driver would pay for. No phase ships infrastructure without a user-visible capability attached to it.

## **Delivered Assets (Phase 0 Inventory)**

- **Parsers, verified against real files: **.ld binary telemetry (70 channels, complete decode formula), .ldx XML (lap summary + pre-decoded setup, truncation detection), .svm setup (INI format, Virtual Energy vs Fuel branch). 128 backend unit tests passing.

- **Frontend prototypes: **v12 merged application (auth shell, driver dashboard, garage admin, product admin, Code Craft auditor) and a standalone Session Upload & Telemetry Viewer that parses all three file types in-browser.

- **Backend scaffold: **FastAPI + async SQLAlchemy, 14-table ORM matching the ERD (identity, tenancy, reference data, sessions, time-series, setups), metering service enforcing the three cost-model levers, RLS tenant-isolation SQL, Docker Compose, CI pipeline.

- **Documentation: **MoTeC format findings (byte-level, reproducible), AI cost model, system architecture diagram, two ERDs.

# **Phase 0 — Prototyping**

**STATUS  ****SUBSTANTIALLY COMPLETE**

Objective: prove every risky assumption before committing to launch engineering. Risk areas were: can we parse MoTeC binaries without a vendor SDK; can the agent architecture produce useful race-engineering output at acceptable cost; is there a coherent data model spanning solo drivers and teams.

### **Acceptance criteria**

| **Acceptance criterion** | **Verification** |
| --- | --- |
| All three LMU file formats (.ld, .ldx, .svm) parse against real session exports with physically validated values | Done — 21 motec tests incl. real-file integration; fuel decode cross-checks setup file (93 L) |
| Agent pipeline (orchestrator → specialists → synthesizer) produces relevant output on real session data | Done — v2 through v12 prototypes running live API calls |
| Cost model demonstrates viable unit economics per run class | Done — $0.04 / $0.18 / $0.26 per run; metering service with 30+ tests |
| Data model covers solo users, garages (2–50 seats), reference data, and time-series | Done — ERD + 14-table ORM, FK integrity verified |
| Remaining: sanitized .ld test fixture committed to repo (real file is 850 KB and contains driver PII) | Open — create truncated anonymized fixture before repo push |

# **Phase 1 — Launch**

**STATUS  ****NEXT — INTEGRATION AND DEPLOYMENT**

Objective: a web-hosted product where an individual driver uploads a session (.ld + .ldx + .svm as a matched set), sees a full telemetry breakdown, and tracks trends across saved sessions. Single user type. No AI agents, no teams — those are Phase 2.

The strategic scope decision: launch is a telemetry product, not an AI product. This keeps the launch surface small, defers per-run API costs until revenue exists, and validates the upload-and-display loop that everything later depends on.

### **Scope**

- Individual driver dashboard: session upload (three-file atomic set), telemetry breakdown of all 70 channels with traces, setup sheet, saved session history, and cross-session trend view (best lap, gap progression, consistency).

- Account creation with basic auth (email/password via Clerk; role system deferred — everyone is a driver).

- Persistence: sessions, lap times, and setups stored server-side; parsed client-side and posted to the API (server-side ingest hardening is Phase 2).

- Hosting: frontend on Vercel or Netlify; backend + Postgres on Railway, Render, or Fly.io. TimescaleDB hypertable conversion executes with this deployment.

### **Explicitly out of scope**

- AI agent runs, run classes, quotas, and metering enforcement (built, but dark at launch).

- Garage/team accounts, admin dashboards, published track notes libraries.

### **Acceptance criteria**

| **Acceptance criterion** | **Verification** |
| --- | --- |
| A new user can register, sign in, and reach an empty dashboard in under 2 minutes | Manual walkthrough on production URL |
| Uploading a valid .ld/.ldx/.svm set produces a complete session view in under 10 seconds | Timed test with the COTA reference files |
| Upload rejects incomplete sets (missing any of the three files) with a clear message; no partial session is persisted | API test: all 7 incomplete combinations rejected |
| All 70 channels display decoded values; SIM-quirk channels (ambient/track temp) and empty channels are visibly flagged, never silently hidden | Channel inventory review against findings doc |
| Decoded values match the verified reference ranges (throttle 0–100 %, speed 0–246 km/h, fuel matches setup) | Automated: integration test suite runs in CI against sanitized fixture |
| Sessions persist across sign-out/sign-in and browser change | Manual cross-device test |
| Trend view shows best-lap progression across ≥ 2 sessions of the same car/track combination | Upload two sessions, verify chart |
| A returning user's data is isolated: no user can retrieve another user's sessions via API | Security test: authenticated cross-user request returns 403/404 |
| Uptime target 99 % over first 30 days; error tracking (Sentry or equivalent) wired | Monitoring dashboard review at day 30 |

# **Phase 2 — Feature Updates**

**STATUS  ****PROTOTYPED — REQUIRES SERVER-SIDE BUILD**

Objective: switch on intelligence and collaboration. Four workstreams: user types (role system), AI agents for data assessment, session note tracking, and team (Garage) accounts. All four are prototyped in the v12 frontend; the Phase 2 work is making them real server-side.

Hidden dependency called out explicitly: everything in this phase hangs off identity. Clerk JWT integration with role claims is the first task, because user types, note ownership, garage membership, quota enforcement, and RLS tenant isolation all require knowing who is asking at the API layer. The agents themselves are the least risky item — the orchestrator module is written and tested; it moves server-side almost mechanically.

### **Scope**

- Roles: driver, garage admin, product admin — enforced via JWT claims at the API, with the v12 role-gated dashboards wired to real permissions.

- Race Engineering Agent server-side: run classes (Quick/Standard/Deep), model tiering (Haiku specialists, Sonnet orchestrator, Opus reserved for Deep synthesis), prompt caching of curated libraries, per-plan quota enforcement, agent_runs audit trail with per-run cost.

- Session notes: driver-written and agent-tagged notes persisted per session; setup-aware agent context (telemetry as effect, setup as cause).

- Garage accounts: 2–50 seats, pooled quota, invite flow, garage admin dashboard; RLS policies activated for tenant isolation.

- Payments: plan tiers (Rookie through Paddock) with a billing provider (Stripe), since quotas without billing are unenforceable fiction.

### **Acceptance criteria**

| **Acceptance criterion** | **Verification** |
| --- | --- |
| JWT role claims gate every API route; client-side role state is never trusted | Penetration-style test: forged client role cannot access admin routes |
| A Standard agent run completes end-to-end server-side in under 60 s and records tokens + cost in agent_runs | Integration test + database assertion |
| Specialists never execute on Opus; Deep runs alone use Opus for synthesis | Automated invariant test (exists) wired into CI against live config |
| Quota enforcement blocks the (N+1)th run per plan allowance and offers upgrade/credits path | Test account at each tier exercises the limit |
| Prompt caching yields ≥ 60 % cached-input token share on second consecutive run of the same combo | Token telemetry from Anthropic API response |
| Garage admin sees only their team's sessions/usage; cross-garage access impossible at the database layer | RLS test executed as garage-admin database role |
| A garage of 3+ members shares one pooled quota with accurate aggregation | Multi-account test with concurrent runs |
| Notes (user and agent-tagged) persist, display per session, and survive agent re-runs | Functional test |
| Paid plan upgrade/downgrade takes effect within one billing event; metering respects the new allowance immediately | Stripe test-mode lifecycle run |

# **Phase 3 — Management**

**STATUS  ****PARTIALLY PROTOTYPED — ANALYTICS AND OPERATIONS TO BUILD**

Objective: run the product as a business. Two tracks: managing user experience (support tooling, product analytics, content operations) and business development (pricing experiments, B2B/league outreach for the Paddock tier, partnerships).

### **Scope**

- Product admin operations: system-wide usage and cost dashboards (token spend vs revenue per plan), user/garage management (suspend, refund, adjust quota), Published Track Notes content pipeline for the corner-dossier library.

- User experience management: onboarding funnel instrumentation, in-app feedback capture, support workflow, churn signals (sessions/week decline).

- Business development: Paddock-tier sales collateral, league partnership pilot, pricing experiment framework (run-class credit pricing).

- Code Craft in CI: the internal standards auditor runs on merge requests, logging findings against Clean Code / Clean Architecture / Clean Agile.

### **Acceptance criteria**

| **Acceptance criterion** | **Verification** |
| --- | --- |
| Product admin can answer 'what did AI cost us vs what did we bill' for any month in under one minute | Dashboard walkthrough with finance-style query |
| Per-user margin visible: any account's run history, token cost, and plan revenue on one screen | Admin console review |
| Corner-dossier publishing pipeline: draft → review → publish, with published notes versioned and visible to drivers read-only | Publish one full track (e.g., Sarthe 11 corners) end-to-end |
| Onboarding funnel instrumented: registration → first upload → second session conversion rates tracked | Analytics dashboard shows the three-step funnel |
| Support loop: user-reported issue reaches an admin queue with session context attached | Test ticket round-trip |
| At least one league/B2B pilot on the Paddock tier with a signed agreement | Business milestone — binary |
| Code Craft runs on every merge request and blocks on 'major' findings | CI pipeline check on a deliberately non-compliant PR |

# **Phase 4 — Expansion**

**STATUS  ****DIRECTIONAL — SCOPE SET BY PHASE 3 LEARNINGS**

Objective: grow the addressable market on two axes — deeper features for existing LMU users, and additional simulator titles. The architecture prepared for this from the start: the simulators reference table, per-simulator car classes and circuits, and the ingest layer's isolation of format-specific parsing behind one module boundary.

### **Scope (candidate, to be prioritized by Phase 3 data)**

- Additional sim titles: iRacing (its own telemetry format/SDK) and Assetto Corsa Competizione. Each title is a new ingest parser plus reference data — the rest of the stack is title-agnostic by design.

- Deeper features: live session telemetry (streaming rather than post-session), voice-coach premium tier, corner-by-corner comparison vs published ideal, setup recommendation engine (the Optimizer agent recommending specific parameter changes).

- Platform features: public driver profiles, league leaderboards, setup marketplace.

### **Acceptance criteria**

| **Acceptance criterion** | **Verification** |
| --- | --- |
| A second simulator title reaches parity on the core loop (upload → breakdown → trend) reusing ≥ 80 % of existing backend code | Code-diff audit of the new title's ingest module vs shared code |
| Cross-title data model holds: one driver's sessions across two titles display in one dashboard without schema migration | Functional test with mixed-title account |
| At least one expansion feature ships with usage by ≥ 25 % of active users in its first month | Product analytics |
| Unit economics hold at scale: blended AI cost per active user remains within the cost-model envelope as usage grows 10× | Monthly cost review vs model projections |

# **Cross-Phase Engineering Invariants**

These hold in every phase and are treated as standing acceptance criteria on all work:

- **Parsers are grounded in real files. **No format assumption ships without verification against an actual LMU export. The .svm format rewrite (guessed format vs. reality) is the cautionary precedent.

- **The three-file upload is atomic. **A session without its telemetry, lap, and setup files together is not a session. Enforced at the API boundary, reflected in ingest_status.

- **Specialists never run on Opus. **The cost model's central rule, enforced by automated test, holds through every phase.

- **Tenant isolation lives in the database. **RLS policies, not application WHERE clauses, are the isolation boundary once garages exist.

- **Unreliable data is flagged, never hidden. **LMU's known-bad channels (ambient/track temperature) and unpopulated channels display with explicit flags. Credibility of the telemetry product depends on honesty about the source data.

- **Standards compliance is audited. **All code answers to Clean Code, Clean Architecture, and Clean Agile, with Code Craft as the tracking mechanism and revision log as the record.

	**Engineering**  ·  **Technology**  ·  **Consulting**	axiomblack.com