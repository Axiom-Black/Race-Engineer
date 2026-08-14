# Contributing — layout, naming, and workflow

Conventions for this repo, written down so they stop drifting. The **DE Codex**
(`.claude/skills/axiomblack-de-codex/`) governs *how code is written*; this file
governs *where things live and what they're called*.

---

## Repo layout

```
CLAUDE.md WORKING_PLAN.md TESTING_GATES.md   governance — read in that order
CONTRIBUTING.md README.md LICENSE           this file, front door, license
.claude/skills/                             the DE Codex (auto-loads)
.github/workflows/                          ring-gated CI
frontend/                                   the pilot SPA (Vite + React)
  src/components/                           React components
  src/lib/                                  pure logic + I/O adapters
  src/lib/motec/                            .ld/.ldx/.svm parsers
  public/fixtures/                          browser-served copy of the fixture
supabase/migrations/                        schema + RLS — source of truth
supabase/tests/                             Ring 3 tenancy acceptance
backend/                                    FastAPI + Python reference (Phase 2)
fixtures/                                   sanitized test triple + golden masters
docs/                                       reference docs, plans, findings
prototypes/                                 design reference, NOT app code
```

**Two rules about placement:**

- **Pure logic separates from I/O.** Parsing, resampling, and maths live in
  `src/lib/*` with no network, DB, clock, or React. Anything that touches
  Supabase lives in `src/lib/sessions.js`. This is what makes the core
  fixture-testable with no mocks (Codex III.6).
- **`prototypes/` is provenance, not code.** Nothing imports from it. It is the
  artifact material the app was ported from, kept so a reader can see where a
  design came from (Codex VI.2). Do not add to it.

---

## File naming

| Where | Convention | Example |
| --- | --- | --- |
| Root governance docs | `SCREAMING_SNAKE.md` | `WORKING_PLAN.md` |
| Everything in `docs/` | `kebab-case.md` | `motec-ld-format.md` |
| React components | `PascalCase.jsx` | `SessionReport.jsx` |
| JS modules | `camelCase.js` | `ingest.js`, `delta.js` |
| Tests | mirror the subject + `.test.js` | `delta.test.js` |
| SQL migrations | `<timestamp>_snake_case.sql` | `20260812030000_s5_trace_and_demo_schema.sql` |
| Fixtures | `snake_case` | `cota_gte_sanitized.ld` |

Root docs keep `SCREAMING_SNAKE` because `CLAUDE.md`, `README.md`, and `LICENSE`
are fixed conventions and the trackers are referenced by name everywhere,
including CI. Everything under `docs/` is kebab-case: one convention, URL-safe,
and it sorts predictably.

**Migration filenames are load-bearing.** They must match the timestamps in the
live Supabase project's migration history so `supabase migration list`
reconciles. Never rename an applied migration; add a new one.

---

## Branches

```
feat/<slug>     new capability          feat/s8-lap-delta-overlay
fix/<slug>      bug fix                 fix/upload-rollback
chore/<slug>    tooling, deps, cleanup  chore/repo-housekeeping
docs/<slug>     documentation only      docs/deploy-guide
```

Name the branch after **what the change is**, not who or what wrote it.

**Branch lifecycle**
1. Branch from current `origin/main` — always fetch first.
2. One logical change per branch; keep them small and separately reviewable.
3. After the PR merges, **delete the branch** (locally and on the remote).
4. Never stack new commits on already-merged history. If more work follows,
   restart from `main` with a fresh branch.

That last rule exists because it was broken twice: a merged branch was reused,
and the follow-up commits stranded outside `main`.

---

## Pull requests

Every PR body should answer three things:

1. **What changed** — and for a non-obvious call, *why that way*.
2. **How it was verified** — the actual command output or acceptance test, not
   "should work". A green suite over a small fixture is not proof; say what the
   fixture cannot cover.
3. **What is deliberately not done** — scaffolding, known gaps, follow-ups.
   Mark provenance: real vs demonstration vs unverified assumption (Codex VI.2).

CI must be green before merge. The rings promote inward — an outer ring is not
evaluated until the inner one passes, so a Ring 0 failure means everything
downstream is unproven, not passing.

---

## Session ritual

Start by loading the DE Codex and reading `WORKING_PLAN.md` §0/§3 plus
`docs/build-breadcrumbs.md` Part A. End by updating `WORKING_PLAN.md` §0/§5,
appending a breadcrumb entry, running the gates, and committing. If it isn't
written down, it didn't happen.
