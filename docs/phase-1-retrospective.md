# Phase 1 Retrospective — Tier 1 Pilot

**Iteration 2, "Pilot spine" · 9–21 Aug 2026 · 13 days · closed 21 Aug 2026**

Written at the close of Phase 1, while the details are still recoverable. The
reusable *methods* live in `docs/build-breadcrumbs.md`; this is the record of
what this iteration actually cost and what it taught.

---

## What shipped

A solo driver can sign up, upload a MoTeC `.ld`+`.ldx`+`.svm` triple, and see a
full telemetry breakdown of all 70 channels plus cross-session progression —
live at https://bytecraft-racing.vercel.app on a **$0/month stack**.

| | |
| --- | --- |
| Stories closed | **S1–S8** (all eight) |
| Commits to `main` | 34 |
| Frontend tests | **146**, across 11 test files |
| Backend reference suite | 6 files, 124 tests (Ring 1) |
| Non-test frontend source | ~4,200 lines |
| CI rings | 6 — Ring 0, 1, 3, 4, 5 (Ring 2 dormant until Phase 2) |
| Ring 3 assertions | 7 |
| Monthly cost | **$0** — Vercel free, Supabase free |
| Entry bundle | 468.63 kB (134.50 kB gzipped) |

**Acceptance test passed in full:** register → dashboard under 2 min; upload →
full view (94 ms measured on the real COTA export, against a 10 s budget);
sessions survive sign-out/sign-in.

---

## What worked

**The reference-implementation-plus-golden-masters pattern.** The Python
parsers were verified against real bytes; their output was frozen as committed
JSON; the JS port was only "done" when it reproduced them value-for-value. Not
one decode regression reached the app. This was the single highest-leverage
decision in the phase.

**Ring-gated CI, and being willing to add a ring.** Rings 0–4 caught what they
were built for. When they turned out to be *structurally incapable* of catching
a class of defect — they test source, and the bug was in the build artifact —
adding **Ring 5** was the right response rather than stretching an existing
ring's meaning.

**Choosing distance as the resampling axis in S5.** S8's lap-vs-lap delta
became a pointwise subtraction instead of a research problem, months of work
later. An early data-shape decision paid a disproportionate dividend.

**Deriving instead of migrating.** The delta needed elapsed time, which the
trace did not store. Reconstructing it from speed over distance avoided
re-ingesting every session. Same instinct closed the lap-reconciliation bug:
flags computed on read, no migration, existing sessions fixed on deploy.

**Refusing to fake capability.** Progression measures gap to the driver's *own*
best rather than inventing an "ideal lap" library that does not exist. Empty and
unreliable channels are flagged, never hidden. Out-laps are shown but never
presented as lap times. Every one of those was more work than the dishonest
version and each is still correct today.

---

## What went wrong, and what it cost

Six defects reached `main` or production. Every one shares a shape: **a check
passed in a friendlier environment than the one that mattered.**

| Defect | Why the tests missed it |
| --- | --- |
| Permanent upload lockout after a partial failure | Fixture too small to produce the failing path |
| `Math.min(...)` stack overflow on real-size files | Fixture 300 samples; real file 29,490 |
| Session timestamps shifted by timezone | Container runs UTC, so the bug was invisible locally |
| Out-lap reported as a 174 s lap the driver never set | Single-lap fixture **cannot express** multi-lap segmentation |
| Production bundle contained **no application at all** | Rings 0–4 test source, not the artifact |
| Demo session advertised a fastest lap that did not exist | Every test fixture was internally self-consistent |

**The through-line:** a green suite over a small, tidy, self-consistent fixture
is not evidence about real input. The two most valuable debugging sessions in
the phase were (1) running the owner's real COTA export through the ingest, and
(2) querying the production database after the acceptance walkthrough. Both
found real bugs in minutes that the entire test suite had missed for days.

**The most expensive single miss** was the hollow bundle. Five green rings and a
plausible-looking 198 kB artifact, and the only tell was a bundle hash that
did not change across a substantial source edit. It reached production once,
because a guard on a branch protects nothing until it is merged.

---

## Deliberate deviations from plan, and whether they held

| Deviation | Verdict |
| --- | --- |
| No FastAPI backend in the pilot; browser talks to Supabase under RLS | **Held.** Nothing to gatekeep without an agent. RLS *is* the API boundary and Ring 3 proves it. |
| Client-side parsing | **Held.** 94 ms on a real 412,850-sample export. |
| Traces to Storage, not Postgres | **Held.** Free-tier Postgres is 500 MB; rows stayed small summaries. |
| Tier thresholds in `localStorage`, not the database | **Held**, with a stated limitation (does not follow a driver across devices). A migration for three display numbers failed the payable-increment bar. |
| Sentry opt-in and lazily loaded | **Held.** A static import doubled the bundle; the SDK outweighed the product. |

---

## Carried into Phase 2 — do not lose these

1. **The committed fixture is single-lap and structurally cannot exercise
   multi-lap logic.** It hid two real bugs. **A sanitized multi-lap fixture is
   the highest-value test investment available** and it is not yet in the
   backlog. Add it before building anything that reasons about laps.
2. **Required CI checks match on the literal job name.** Renaming a job silently
   drops that gate from branch protection while everything still shows green.
   Rename a job and update the ruleset in one change.
3. **The share link needs a standing-bar amendment.** Any public session link is
   readable without `auth.uid()`, which §4 forbids as written. Deferred 21 Aug
   with no users to share with; when it returns it needs explicit sign-off and a
   tightly-audited `SECURITY DEFINER` function.
4. **Real driver PII is in the production database** unless the COTA test
   session is deleted. The repo has never held it; production does.
5. **The DeepSeek V4 cost comparison is still unresolved** (9 Aug, ~10× cheaper)
   and gates nothing until the agent goes live. Keep model choice behind
   `RunConfig`.

---

## The honest state of "done"

Phase 1 is complete against its acceptance criteria. It is **not** proven
against users — there are none yet. Everything known about how the product
behaves comes from one driver's real export and one owner's walkthrough.

The next real risk is not technical. It is building Phase 2's agent before
finding out whether drivers want the telemetry product at all.
