# ByteCraft Racing — Race Engineering Manager

Sim-racing telemetry and AI race-engineering platform for **Le Mans Ultimate**.
Drivers upload their MoTeC session exports (`.ld` + `.ldx` + `.svm`), get a full
telemetry breakdown, and — in later phases — AI race-engineering debriefs.

Built by **Axiom Black, LLC** with The ByteCraft Company. Private and proprietary
(see `LICENSE`).

## Current phase

**Phase 1 — Launch (Tier 1 Pilot):** solo-driver telemetry product on a $0/month
stack (Vite + React on Vercel; Supabase for Postgres/Auth/Storage with RLS).
The AI agent stays dark this phase. Client-side parsing; summaries persist,
raw files go to Storage.

## Repo map

**Governance — read in this order**

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Project brief & working agreement — **read first** |
| `.claude/skills/axiomblack-de-codex/` | The DE Codex — binding engineering standard (auto-loads as a skill) |
| `WORKING_PLAN.md` | Operational tracker: status, stories, invariants, decision log |
| `TESTING_GATES.md` | Ring 0–4 CI promotion contract — every push to `main` clears it |
| `CONTRIBUTING.md` | Repo layout, naming conventions, branch & PR workflow |

**Code**

| Path | What it is |
| --- | --- |
| `frontend/` | The pilot app — Vite + React SPA (talks to Supabase directly under RLS) |
| `frontend/src/lib/motec/` | `.ld`/`.ldx`/`.svm` parsers, ported from the Python reference |
| `frontend/src/lib/` | `ingest` (parse → resample → summarize), `sessions` (persistence), `delta` (lap-vs-lap) |
| `supabase/` | Migrations (source of truth for schema + RLS) and the Ring 3 tenancy test |
| `backend/` | FastAPI service + Python reference parsers — **Phase 2 inventory**, not in the pilot |
| `.github/workflows/` | Ring-gated CI |

**Data & reference**

| Path | What it is |
| --- | --- |
| `fixtures/` | Sanitized `.ld`/`.ldx`/`.svm` triple + golden masters — the repo's test data |
| `docs/` | Format findings, phase plan, AI cost model, implementation plans, deploy guide |
| `docs/pm/` | PM workbook (roadmap, OKRs, IMS, RACI, risk register, WBS, FBS) |
| `docs/archive/` | Superseded origin documents |
| `prototypes/` | Claude-artifact prototypes — design reference the app was ported from, **not app code** |

## Ground rules

- Real LMU exports contain driver PII — **local only, never committed** (enforced by `.gitignore` + Ring 0).
- No format assumption ships unverified against a real LMU export.
- Unreliable or empty data is flagged in the UI, never hidden or interpolated.
- Tenant isolation lives in the database (RLS on `auth.uid()`), never in an application `WHERE` clause.
- No AGPL/GPL dependencies without explicit owner sign-off.
