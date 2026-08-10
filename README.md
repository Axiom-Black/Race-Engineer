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

| Path | What it is |
| --- | --- |
| `CLAUDE.md` | Project brief & working agreement — **read first** |
| `WORKING_PLAN.md` | Operational tracker: status, stories, invariants, decision log |
| `TESTING_GATES.md` | Ring 0–4 CI promotion contract — every push to `main` clears it |
| `claude_DAILY_DEV_PLAN.md` | Generated daily snapshot (reference) |
| `docs/` | Format findings (`.ld`/`.ldx` byte-level), phase plan, AI cost model |
| `docs/pm/` | PM workbook (roadmap, OKRs, IMS, RACI, risk register, WBS, FBS) |
| `docs/archive/` | Superseded origin documents |
| `prototypes/` | Claude-artifact prototypes — source material for the Vite port, **not app code** |
| `backend/tests/` | Adapter-shim test suites (skip until wired) — Phase 2 inventory |
| `fixtures/` | *(pending — S1)* sanitized `.ld`/`.ldx`/`.svm` test triple |

## Ground rules

- Real LMU exports contain driver PII — **local only, never committed** (enforced by `.gitignore` + Ring 0).
- No format assumption ships unverified against a real LMU export.
- No AGPL/GPL dependencies without explicit owner sign-off.
