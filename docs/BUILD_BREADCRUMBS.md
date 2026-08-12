# Build Breadcrumbs — how we build, made reusable

> **What this is.** The trail of *methods* — not features. `WORKING_PLAN.md`
> tracks **what** we're building and its status; the DE Codex
> (`.claude/skills/axiomblack-de-codex/`) is the **normative** standard for how
> code must look. This file is the **empirical** record: the delivery patterns
> that actually worked on this build, written so the next application inherits
> them and starts faster than this one did.
>
> **Why it exists.** Directly serves **Codex VI.3 — "Build for reuse
> deliberately. A pattern that worked is written so the next project inherits
> it."** The goal is compounding efficiency: every project should be able to
> pick this up and reuse an increasingly sharp set of means for building
> software with Claude.
>
> **The rule: tracked and documented always.** Every work session appends to
> Part B (the trail) and promotes anything durable into Part A (the patterns).
> If a method isn't written here, the next build has to rediscover it.

---

## How to use this file

- **Starting a new app?** Read **Part A** first — it is the portable playbook.
  Each pattern names when to reach for it, how to run it, its payoff, and the
  Codex law it serves.
- **Mid-build?** When you find a faster/safer way to do something, add it to
  Part B with the date; if it will help the *next* project, lift it into Part A.
- **Environment bit you?** Log it in **Part C** so the next session skips the
  same hour of debugging.

---

## Part A — Reusable delivery patterns (the portable playbook)

Ordered roughly by when they apply in a build. Each is proven on this project.

### A1 · Plan-before-code, committed as a contract
**When:** any multi-step feature. **How:** write the decisions and a numbered
step list — each step with its own acceptance test — into a committed
`*_IMPLEMENTATION_PLAN.md` *before* writing code (see
`docs/S5_IMPLEMENTATION_PLAN.md`). **Payoff:** the plan is reviewable on its
own; steps land as small verifiable commits; no mid-build thrash. *Codex IV.1,
VI.4.*

### A2 · Surface the real decisions up front, in one ask
**When:** a feature has genuine product/architecture forks (storage location,
algorithm, scope). **How:** batch them into a single structured question with a
recommended default each, resolve them, then build. **Payoff:** avoids building
the wrong thing and reworking it. Don't ask what a sensible default already
answers.

### A3 · Reference implementation → port, verified by golden masters
**When:** re-implementing verified logic in another language/runtime (Python
parsers → JS). **How:** freeze the reference's output as committed golden-master
JSON generated from exactly the committed fixture bytes; the port is "done" only
when it reproduces them value-for-value. **Payoff:** a silent decode regression
fails a gate instead of shipping. *Codex I.2, I.3, IV.1.*

### A4 · Pure functional core, effects pushed to the edges
**When:** always, for parse/decode/transform logic. **How:** the parsers and the
ingest module take buffers/values in and return data out — no DB, network,
clock, or React inside. I/O wiring is a *separate* step. **Payoff:** the core is
fixture-testable with zero mocks; the same code runs in a test, a browser, or a
worker. *Codex III.6, II.2.*

### A5 · Verify at the real boundary locally before pushing
**When:** anything whose correctness lives in a system you don't control at
author time (DB RLS, migrations). **How:** stand up the real engine locally
(ephemeral PostgreSQL) with a thin shim for the managed parts (a fake
`auth.uid()`/roles to stand in for Supabase), apply the actual migration, and
run assertions. **Payoff:** "RLS is hard to test" becomes a deterministic gate;
no unrun SQL ships. *Codex I.1, IV.1.*

### A6 · Ring-gated CI, promoting inward
**When:** from the first commit. **How:** ordered CI jobs, each an invariant
ring — fixtures → parser truth → auth/tenancy → cross-runtime parity — where an
outer ring isn't evaluated until the inner one is green, and a violated
invariant is a stop, not a warning. **Payoff:** the pipeline encodes priority;
green means safe-to-promote. *Codex IV.4.* (See `TESTING_GATES.md`.)

### A7 · Living trackers + explicit handoff seams
**When:** every session. **How:** update `WORKING_PLAN.md` §0/§5; write commit
messages and PR bodies that record the *why* and map each change to its
acceptance test; mark what's real vs scaffolding vs assumption. **Payoff:** the
next worker (human or agent) resumes from written state, not memory. *Codex
VI.1, VI.2, VI.4.*

### A8 · Small, separable branches/PRs
**When:** whenever changes are logically independent. **How:** onboarding, the
CI fix + docs, and each S5 step went as their own branch off `main`.
**Payoff:** each reviews and merges on its own timeline; a governance doc never
blocks a feature. Restart a branch from `main` after its PR merges — never
stack new commits on already-merged history.

### A9 · Stakeholder-visible status artifact
**When:** the build has an audience who won't read the repo. **How:** publish a
status board (an Artifact) and regenerate it as state changes. **Payoff:**
progress is legible at a glance without a repo walkthrough.

### A10 · Let the fixture's oddities harden the code
**When:** testing against a real (even sanitized) sample. **How:** don't
special-case the sample's quirks away — treat a surprising fixture value as a
question about your model. **Payoff:** an all-zero `Lap Number` in the fixture
exposed a real session-windowing bug in the ingest, fixed before it reached
data. *Codex I.1, I.2.*

---

## Part B — Session trail (newest first)

Each entry: date · what shipped · the method insight worth carrying forward.

| Date | Shipped | Method insight |
| --- | --- | --- |
| 12 Aug 2026 | Independent review of merged S5 → 3 real bugs fixed (upload rollback, min/max overflow, demo-in-stats) | **A independent reviewer + verify-before-trust (Codex I.1/VI.6).** Ran a fresh agent to review code a parallel session merged, then re-verified each finding against the actual code before acting — the two serious ones (permanent upload lockout, crash on real-size files) were both invisible to the passing test suite because the *fixture is truncated*. Lesson: a green suite over a small fixture is not proof; the highest-value review question is "what does the real input do that the fixture doesn't?" |
| 12 Aug 2026 | Ring 3 RLS/atomicity gate automated against main's merged S5 schema | **A5 + Codex VI.6.** A parallel session had already merged S5 back-half to `main`. Caught it by rebasing onto `main` (the conflict was the signal), not by assuming my in-flight branch was still needed. Instead of forcing a duplicate, kept only the additive delta — the automated RLS gate — and adapted it to *their* schema. Lesson: before continuing multi-session work, rebase onto `main` first; treat a surprise conflict as "reality moved," and salvage the delta rather than re-landing the overlap. |
| 12 Aug 2026 | DE Codex added as a live project skill; this breadcrumb file created | Governance becomes real when the standard is an auto-loaded skill in-repo (not a PDF) and the reusable-method log is part of the session ritual. |
| 12 Aug 2026 | S5 Step 2 — pure `ingest()` module; 27/27 Vitest | A4 (pure core) + A10: a failing invariant test surfaced a genuine modeling bug (session end clipped to one channel's timeline), not a bad test. Fix the model, not the assertion. |
| 12 Aug 2026 | S5 Step 1 — pilot schema migration + Ring 3 RLS gate | A5: local ephemeral Postgres + an `auth.uid()` shim turned RLS/atomicity into assertions that ran *before* the push and now run in CI. |
| 12 Aug 2026 | Fixed red `main` CI (missing `pandas`); landed S5 plan doc | Install a component's declared deps (pyproject `.[dev]`), never a hand-picked subset — the subset drifts. Branch protection is the actual guard against a red PR self-merging. |
| 11–12 Aug 2026 | Onboarding spine (Supabase Auth + app shell); merged via PR #1 | A8 + transport fallback: when `git push` is policy-blocked, land commits through the platform API; after a branch's PR merges, restart it from `main`. |

---

## Part C — Environment & toolchain notes (so the next session skips the pain)

- **Vite 8 / rolldown on Linux:** the Windows-only `@rolldown/binding-win32-x64-msvc`
  must live in `optionalDependencies` only — as a hard dependency it fails
  `npm install` with `EBADPLATFORM` on Linux (CI + Vercel). CI also guards the
  npm optional-deps bug by force-installing the linux binding if `require('rolldown')`
  fails.
- **Local Postgres for RLS tests:** run the server as the `postgres` OS user
  (Postgres refuses to run as root); keep the unix socket path **< 108 bytes**
  (use a short `/tmp/…` dir, not the deep scratchpad path); put the data dir
  somewhere the `postgres` user can traverse. `runuser -u postgres -- …` works.
- **WebCrypto in ingest:** `crypto.subtle.digest('SHA-256', …)` is available in
  the browser and in Node 20 (CI/Vitest) — no dependency needed for dedup hashes.
- **GitHub writes:** this environment blocks `git push` over HTTPS by policy;
  writes go through the GitHub MCP server (and `git push` works once the app
  installation has write). `force-with-lease` is safe when a branch held only
  already-merged history.
