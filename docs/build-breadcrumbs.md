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
`docs/s5-implementation-plan.md`). **Payoff:** the plan is reviewable on its
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

### A11 · Gate the artifact, not just the source
**When:** any build step stands between your tests and what users load —
bundlers, tree-shaking, compile-time env inlining, container images.
**How:** add a final ring that inspects the **build output**: assert it
contains something only the real product would contain, and assert a size
floor. Separately, make a misconfigured build *fail* rather than emit a
degraded artifact. **Payoff:** Vite inlines `import.meta.env` at build time;
with env vars absent, an unconditional throw let the minifier strip the entire
application — exit 0, no warning, 198.70 kB of library where 461.64 kB of
product belonged. Rings 0–4 were green the whole time because they test
source. The tell was a bundle hash that didn't change across a substantial
source edit. **Two habits worth keeping:** treat *unchanged output from
changed input* as a defect until proven otherwise, and prefer a build that
refuses over a build that degrades quietly. *Codex I.1, VI.6.*

---

## Part B — Session trail (newest first)

Each entry: date · what shipped · the method insight worth carrying forward.

| Date | Shipped | Method insight |
| --- | --- | --- |
| 21 Aug 2026 | Fault classification + free-tier keepalive | **A platform's documented limits are part of your product's behaviour — design for them before users find them.** The free tier pauses after a week idle and caps storage at 1 GB; both were *known* from the start and both would still have reached a driver as `TypeError: Failed to fetch`, because every surface rendered `err.message` raw. Classifying faults into a handful of actionable kinds cost one small pure module and changed a broken-looking app into one that explains itself. **Two transferable specifics:** (1) put the retry affordance *only* on faults where retrying can work — a "Try again" button on a full disk teaches users to distrust your buttons; (2) where you genuinely cannot distinguish causes, say the honest superset ("may be waking from idle") rather than guessing the likely one — a confident wrong diagnosis is worse than a vague right one. Also: prevention and degradation are both needed, and the degradation is the one to trust — the keepalive cron is best-effort against an undocumented timer, so the graceful failure path is the real safety net. |
| 21 Aug 2026 | `.ldx`/`.ld` lap reconciliation + UI flags | **Query the production database after an acceptance run — the UI can look fine while the data contradicts itself.** The owner reported login, upload and logout all working, and they were; reading the actual rows showed the seeded demo advertising `lap_count 3` and a fastest lap 2 while holding one partial lap. No test failed, because every test used a self-consistent fixture. **The general shape:** when two files describe the same fact, decide *explicitly* which is authoritative for *which* fact, then treat disagreement as information to surface rather than a case to average away. Here `.ldx` won for summary, `.ld` for boundaries, with a tolerance below which drift is sample-grid noise rather than conflict — flagging a 25 ms gap on every upload would have been noise dressed as rigour. **Two habits:** a check that identifies a record by an id from a *different* source (`lap.lap_no === session.fastest_lap_no`) needs to verify that record exists before trusting the match; and computing derived flags on read from already-persisted values means a data-quality fix ships without a migration or a re-ingest. |
| 17 Aug 2026 | Sentry wired opt-in and lazy; ErrorBoundary; G5.2 made non-positional | **Measure a dependency's weight before you accept it, and let the measurement pick the design.** A static `@sentry/react` import doubled the bundle — 461.64 → 938.82 kB, 132 → 289 kB gzipped — meaning the observability SDK outweighed the product it was observing. Behind a dynamic `import()` the cost becomes zero when unconfigured (the chunk isn't even emitted) and off-critical-path when it is. The habit worth carrying: build once with and once without the new dependency and diff the output; "it's just an SDK" is not a size estimate. **Second, on instrumenting a product that holds PII:** an error reporter is a pipe to a third party, so decide *what must never leave* before wiring it — here that meant no Session Replay, redaction of emails/UUIDs/JWTs, dropped request bodies, and discarding breadcrumbs that name a telemetry file, because those filenames are usually people's names. State the residual limitation (a denylist can't catch every name) rather than implying completeness. **Third:** adding a lazy chunk exposed that G5.2 identified its target with `find … | head -1` — a check that names its subject *positionally* silently changes meaning the moment the output shape changes. It now resolves the entry chunk from `index.html`. |
| 17 Aug 2026 | First production deploy (Vercel) — and the guard that wasn't there yet | **A gate protects only what it has been merged into, and the deploy target may be outside your reach.** The first production build ran from `main` *before* the PR carrying the build guard landed, so it shipped the exact hollow artifact the guard existed to prevent — an asset the owner measured at 0.1 kB — while the branch preview of the same source, built with the guard and the env vars, loaded fine. Two builds, one blank, both green. **Second lesson, environmental:** this sandbox's proxy allow-lists GitHub/npm/PyPI only, so `vercel.app` was unreachable and I could not inspect the deployed artifact at all — every conclusion had to come from the owner's observations. Where the deploy target is unreachable, the CI-side artifact assertion is the only verification you own; write it, and merge it before the first deploy, not after. **Also portable:** provider warnings need judgement, not obedience — Vercel flags `VITE_`-prefixed vars as browser-exposed, which is exactly correct and exactly intended here, and marking the publishable key "Sensitive" would have broken the Development environment for no security gain. |
| 17 Aug 2026 | Cloud-session bootstrap (`SessionStart` hook + `scripts/cloud_setup.sh`) | **Environment setup belongs in the repo, and a setup script must be read against the repo's real shape.** Ephemeral cloud containers make "it works on my checkout" a per-session tax; committing the hook means every future session inherits a working toolchain instead of rediscovering it. The trap was writing the canonical `npm ci` at the repo root — this repo's npm project is `frontend/`, so the root version would have "succeeded" loudly and installed nothing. Two rules fell out: point setup at where the manifest actually lives, and mine CI for the workarounds it already encodes (the rolldown optional-binding guard was in `ci.yml` and had to be repeated, or Vitest breaks in-session). Also make the hook total — every path `exit 0`, unset env vars included — since a failing `SessionStart` hook degrades every session that follows. |
| 17 Aug 2026 | Cloud-session bootstrap (`SessionStart` hook + `scripts/cloud_setup.sh`) | **Environment setup belongs in the repo, and a setup script must be read against the repo's real shape.** Ephemeral cloud containers make "it works on my checkout" a per-session tax; committing the hook means every future session inherits a working toolchain instead of rediscovering it. The trap was writing the canonical `npm ci` at the repo root — this repo's npm project is `frontend/`, so the root version would have "succeeded" loudly and installed nothing. Two rules fell out: point setup at where the manifest actually lives, and mine CI for the workarounds it already encodes (the rolldown optional-binding guard was in `ci.yml` and had to be repeated, or Vitest breaks in-session). Also make the hook total — every path `exit 0`, unset env vars included — since a failing `SessionStart` hook degrades every session that follows. **The sharper lesson came from the rebase:** the hosting environment supplied the right Supabase values under *Next.js* variable names while the app reads *Vite* ones, so every cloud build was refused on a fresh clone. No ring caught it, because CI injects its own placeholders — the defect lived in the seam between the environment's config and the repo, and only running the real command in the real container exposed it. **Rule: a setup script's job is not finished when dependencies install — it is finished when the project's own build and test commands actually run.** |
| 17 Aug 2026 | Storage UPDATE policy + Ring 3 G3.5/G3.6 | **Audit the deployed permissions against what the client code actually calls — the two drift apart silently.** No test failed and no user complained: the gap surfaced from reading the live project's policy list next to `lib/sessions.js` and noticing that every upload passes `upsert: true` while storage granted only SELECT/INSERT/DELETE. The failure was *conditional* (a cleanup path hid it whenever it managed to run), which is why neither tests nor manual use had caught it — the broken case needs a crash to reach. **Portable rules:** for every write option the client sets, ask which SQL verb it becomes and whether policy covers it; assert the positive AND negative case whenever adding an UPDATE policy; and prove a new gate fails without its fix before landing it — here, exit 3 without the migration, 0 with it. A gate that passes in both states is worse than none, because it launders an assumption into evidence. |
| 17 Aug 2026 | S6 back half (car filter, threshold persistence, sparkline parity) + Ring 5 after finding a hollow production bundle | **A11 — the artifact is a separate claim from the source, and an unchanged output hash is a bug report.** Preparing S7, the bundle hash and byte count came back *identical* across a substantial source change. That single anomaly, rather than any failing test, exposed that every production build had been shipping 198.70 kB of Supabase library with the entire application dead-code-eliminated behind a config guard (461.64 kB when configured). Five green rings had said nothing, because all five test source. Also reinforced: **check what the integration can actually do before planning around it** — the Vercel connector could create projects and read logs but had no env-var write tool, and the account wasn't linked to GitHub at all, so the "connect" step was never going to be drivable from here. Same shape as the 403-on-tag-deletion lesson: verify a capability, don't assume it. |
| 17 Aug 2026 | Tier thresholds persisted per driver | **Match the storage tier to what the data actually is, and state the limitation in the UI.** Thresholds change a *label*, not a measurement, so a migration + RLS policy to persist three numbers failed the "every increment is payable" test. localStorage behind a single seam (`lib/prefs.js`) is the honest lean choice — provided the constraint is visible ("Saved to this browser") rather than hidden, and the swap point is one module when it stops being enough. Defensive detail worth carrying: `localStorage` **throws** under private browsing and storage policies, it doesn't return null, so every access needs a try/catch and a failed *write* should surface, not vanish. |
| 13 Aug 2026 | Session-time zone fix + UNRELIABLE tripwire | **A bug that the dev environment hides is still a bug, and dead code should be pinned rather than deleted when it is part of a contract.** The timestamp rendered correctly here only because the container is UTC — the error was invisible locally and would appear on every real user's machine. Where a defect depends on ambient environment (timezone, locale, DPI), assert the *wrong* answer explicitly in the test so a regression cannot hide behind a friendly dev box. And for the unreachable UNRELIABLE branch: deleting it would have broken the golden-master contract the Python reference also honours, so the right move was a tripwire test that forces verification the day someone makes it live. |
| 13 Aug 2026 | Real-file acceptance run → out-lap classification bug found and fixed | **Run the real input before declaring an acceptance test passed, and let a second source arbitrate.** The suite was green and the fixture "looked like" a session — but it held one lap at 300 samples/channel, so it could not express multi-lap segmentation at all. The real export (5 segments, 29k samples/channel) exposed an out-lap being reported as a lap time the driver never set. The fix was only *provable* because a second, independent source existed: the `.ldx` states Total Laps and Fastest Lap, and the new rule reproduces both exactly. Cross-validation (Codex I.3) turns a plausible fix into a verified one. |
| 13 Aug 2026 | Repo housekeeping — kebab-case `docs/`, conventions in `CONTRIBUTING.md`, dead-file + branch cleanup | **Verify a rename by resolving every reference, and check "merged" by content not by SHA.** Renames are only safe if the sweep covers *every* file type — a `.py` comment was the one dangling reference left after sweeping md/yml/js. And with squash-merge workflows `git branch --contains` always says "not merged", so branch cleanup must compare trees: that check found one branch holding four files that never reached `main`, which a blind delete would have destroyed. Tag before deleting anything unmerged — and check that you *can*: in this environment the GitHub App pushes refs fine but returns 403 on deleting a ref or creating a tag, so branch cleanup is a local-only operation and the remote pass belongs to a human. Verify a destructive capability before planning around it. |
| 13 Aug 2026 | S8 — lap-vs-lap overlay + Δ-time trace | **An early data-shape decision pays its dividend, and derive-don't-migrate.** The delta is a pointwise subtraction only because S5 resampled every lap onto the same normalized-distance grid — a story that could have been hard was cheap because the axis was chosen correctly months of work earlier. Second: the trace had no time field, and the obvious move (add one, re-ingest everything) was avoidable — elapsed time was *reconstructable* from speed over distance, scaled to the known lap time, so the feature reads data already in Storage. Prefer deriving from what you have over migrating what you stored. |
| 12 Aug 2026 | S5 completed — full four-tab SessionReport on real data + Vercel deploy kit | **Port the prototype's *language*, not its data.** The prototype carried precomputed sample metrics (history, corner buckets); building on those would have faked capability. Instead computed every tab from the real trace/summaries and dropped what the data can't back yet — honest and simpler. Charts are inline SVG against the existing theme tokens (no chart lib, no new deps): a shared distance cursor across plots + track map is just one integer index. For a hosted demo, the deploy kit (vercel.json + a DEPLOY.md with exact env vars) makes the one out-of-environment step a 5-min dashboard task for the owner rather than a blocker. |
| 12 Aug 2026 | Independent review of merged S5 → 3 real bugs fixed (upload rollback, min/max overflow, demo-in-stats) | **A independent reviewer + verify-before-trust (Codex I.1/VI.6).** Ran a fresh agent to review code a parallel session merged, then re-verified each finding against the actual code before acting — the two serious ones (permanent upload lockout, crash on real-size files) were both invisible to the passing test suite because the *fixture is truncated*. Lesson: a green suite over a small fixture is not proof; the highest-value review question is "what does the real input do that the fixture doesn't?" |
| 12 Aug 2026 | Ring 3 RLS/atomicity gate automated against main's merged S5 schema | **A5 + Codex VI.6.** A parallel session had already merged S5 back-half to `main`. Caught it by rebasing onto `main` (the conflict was the signal), not by assuming my in-flight branch was still needed. Instead of forcing a duplicate, kept only the additive delta — the automated RLS gate — and adapted it to *their* schema. Lesson: before continuing multi-session work, rebase onto `main` first; treat a surprise conflict as "reality moved," and salvage the delta rather than re-landing the overlap. |
| 12 Aug 2026 | DE Codex added as a live project skill; this breadcrumb file created | Governance becomes real when the standard is an auto-loaded skill in-repo (not a PDF) and the reusable-method log is part of the session ritual. |
| 12 Aug 2026 | S5 Step 2 — pure `ingest()` module; 27/27 Vitest | A4 (pure core) + A10: a failing invariant test surfaced a genuine modeling bug (session end clipped to one channel's timeline), not a bad test. Fix the model, not the assertion. |
| 12 Aug 2026 | S5 Step 1 — pilot schema migration + Ring 3 RLS gate | A5: local ephemeral Postgres + an `auth.uid()` shim turned RLS/atomicity into assertions that ran *before* the push and now run in CI. |
| 12 Aug 2026 | Fixed red `main` CI (missing `pandas`); landed S5 plan doc | Install a component's declared deps (pyproject `.[dev]`), never a hand-picked subset — the subset drifts. Branch protection is the actual guard against a red PR self-merging. |
| 11–12 Aug 2026 | Onboarding spine (Supabase Auth + app shell); merged via PR #1 | A8 + transport fallback: when `git push` is policy-blocked, land commits through the platform API; after a branch's PR merges, restart it from `main`. |

---

## Part C — Environment & toolchain notes (so the next session skips the pain)

### Render a component in isolation in ~2 minutes (throwaway harness)

Unit tests cover logic; they say nothing about what the thing *looks* like. A
disposable harness renders one component against stub data with no Supabase,
no auth, and no login flow — and it is fast enough to be worth doing for any
non-trivial UI change. It caught two defects in S6 that 33 passing logic tests
did not: a single-session combo being awarded the top tier badge, and a
two-bar sparkline rendering as full-width slabs.

Recipe — create `frontend/.harness/` (add to `.gitignore`, delete afterwards):

- `stub-sessions.js` / `stub-auth.jsx` — plain modules exporting the same
  names as the real ones.
- `vite.config.js` with `root` set to the harness dir and **regex** aliases,
  which is what lets you intercept a *relative* import from a component:
  ```js
  resolve: { alias: [
    { find: /.*\/lib\/sessions$/, replacement: path.join(here, 'stub-sessions.js') },
    { find: /.*\/lib\/auth$/,     replacement: path.join(here, 'stub-auth.jsx') },
  ]}
  ```
- `index.html` + `main.jsx` mounting just the component under test.
- `npx vite --config .harness/vite.config.js --port 5199 --strictPort`

Then drive it with Playwright and **assert, don't just screenshot** — read
`innerText`, count elements, mutate an input, reload, and check persistence.
Take the screenshot too: the slab-sparkline was invisible in the text output
and obvious in the image. Environment specifics: `playwright-core` is not in
this project (and shouldn't be) — install it in a scratch dir outside the
repo; it is CommonJS, so `import pkg from 'playwright-core'; const { chromium }
= pkg`. The browser is at `/opt/pw-browsers/chromium` — pass it as
`executablePath`, and never run `playwright install`. Kill the dev server via
`pgrep -f "vit[e] --config"`; the bracket trick stops the pattern matching its
own command line (a plain `pkill -f` kills the shell).

- **Cloud sessions (`Race Engineer - Dev` environment):** the container is
  ephemeral and clones the repo fresh, so nothing installed in a previous
  session survives. `.claude/settings.json` runs `scripts/cloud_setup.sh` on
  `SessionStart`, which installs `frontend/` deps (~4 s) when
  `CLAUDE_CODE_REMOTE=true`. The `supabase`, `vercel`, and `gh` CLIs are **not**
  installed — use the Supabase/Vercel/GitHub MCP servers instead.
  Backend Python deps are not preinstalled: run `pip install -e ".[dev]"` from
  `backend/` when you need the Ring 1 suite. **Env-var naming trap:** the
  environment injects `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (right values, Next.js names) but Vite only exposes `VITE_`-prefixed names, so
  the build is refused and dev throws at runtime. `cloud_setup.sh` bridges this
  by writing `frontend/.env.local`; if a future session sees "Build refused:
  missing VITE_SUPABASE_URL", that file is missing or the hook didn't run.
  Also note the sandbox proxy allow-lists GitHub/npm/PyPI only — `vercel.app` and
  `supabase.co` are unreachable, so the deployed site cannot be inspected from
  here and all deploy verification is owner-side.
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
- **GitHub writes:** `git push -u origin <branch>` over HTTPS **works** in the
  `Race Engineer - Dev` cloud environment (verified 17 Aug 2026) — the earlier
  "policy-blocked, push via MCP" note was true of an older environment and no
  longer applies; the GitHub MCP server remains the fallback. Ref *deletion* and
  tag creation still returned 403 when last tried, so branch cleanup stays a
  local operation. `force-with-lease` is safe when a branch held only
  already-merged history.
