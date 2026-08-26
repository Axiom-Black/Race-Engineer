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

### A12 · A skip-on-missing-config job is green either way — read the step, not the tick

**When:** any workflow written to *skip* rather than fail when its
configuration is absent (the right design — an unconfigured repo should not sit
permanently red), and any check whose pass and no-op states are visually
identical.

**How:** verify by the **step that only runs when configured**, never by the
run's conclusion. Gate that step on an explicit output
(`if: steps.cfg.outputs.configured == 'true'`) so its presence in the job's step
list *is* the evidence, and print a value the log can be read for. **Payoff:**
the keepalive run reported success in 8 seconds; the summary page looks the same
whether the secrets exist or were never added. What settled it was that the
ping step had executed at all, plus `HTTP 200` in its log. **The habit:** when a
green check answers a question it was not designed to answer, go find the
signal that was. Ask what this run would look like if the thing had *not*
worked — if the answer is "identical", the tick is not evidence. *Codex I.1.*

### A13 · Prove tenant isolation *outside* the app, in one row

**When:** any product whose isolation story is "RLS handles it". A CI suite
asserting policies on a scratch database proves the *policy*; it does not prove
the deployed project is enforcing it, and the app showing each user the right
rows would look identical if the client were doing the filtering.

**How:** run the check in SQL against production, impersonating a real account,
never through the app. Stash the privileged total in a GUC **before** dropping
role, so a single row carries both numbers and the editor's show-only-the-last-
result behaviour cannot hide half the answer:

```sql
begin;
  select set_config('probe.total',
    (select count(*)::text from public.<table>), true);
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from auth.users
                              where email = '<real user>'))::text, true);
  set local role authenticated;
  select current_setting('probe.total')::int as total_all,
         count(*)                            as visible_to_user
  from public.<table>;
rollback;
```

**Payoff:** `total_all = 4, visible_to_user = 1` is proof; `visible_to_user`
alone is not, because it is identical whether the total is 4 or 1. **Three
traps worth naming:** set the JWT claim *before* `set role`, since
`authenticated` cannot read `auth.users`; compare like for like (if the
impersonated count includes seeded/demo rows, the total must too); and
`begin`/`rollback` makes the whole probe read-only, so it is safe against
production. *Codex I.1, V.2.*

### A14 · A new dev dependency is an environment change — check the runner's

**When:** adding any dependency with a runtime floor (`engines`), especially a
test-only one. Test deps feel safe precisely because they never ship, which is
what makes this easy to miss.

**How:** before pushing, read the package's `engines` and compare it against
**the CI runner's** version, not yours. Then make the floor enforceable rather
than documentary: declare `engines` in `package.json` **and** set
`engine-strict=true` in `.npmrc`, so a wrong runtime fails `npm ci` with
`EBADENGINE` instead of warning into a scrollback nobody reads.

**Payoff:** jsdom 30 requires `>=22.22.2`; CI was pinned to Node 20. The
component suite passed locally on exactly 22.22.2 and **could never** pass on
the runner — undici, loaded by jsdom, dies with
`webidl.util.markAsUncloneable is not a function`, surfacing as
`Failed to start forks worker`, which names neither Node nor jsdom. Note the
shape: the 185 pre-existing tests still passed and the run still reported
`185 passed`, with the failure only in an "Unhandled Errors" block. **A green
count next to a red exit code is still red.** *Codex I.1, VII.3.*

### A15 · `Number()` fabricates measurements — and a component no test imports is not gated

**Two lessons from one afternoon, both about checks that look present and are not.**

**(a) Coercion invents data.** `Number(null)`, `Number('')`, `Number([])` and
`Number(false)` are all a finite `0`. In a telemetry product that is not a
quirk, it is a correctness bug with a shape: a channel whose minimum came back
null renders `0.00 … 245.98`, showing a floor nobody recorded. This was caught
**twice in one afternoon**, in two different functions, both times by a test
and neither time by review. Fix the class, not the instance — `lib/num.js`
exports `strictNum`, every numeric read goes through it, and a third
occurrence now needs someone to deliberately avoid it. Note that numeric
*strings* must still convert: Postgres sends numerics over the wire as text.

**(b) A file nothing imports is invisible to the suite.** An unclosed JSX
fragment left a 730-line component syntactically invalid and **the whole suite
still passed** — no test imported it. Lint and the build caught it; the gate
that was supposed to did not. Any component big enough to matter needs at least
a smoke test that mounts it, because import-and-render alone would have failed.
Verified the way everything else here is: reintroduce the bug, watch the suite
go red, restore. *Codex I.1, IV.2.*

---

### A16 · Spend a fixed budget where the signal is, not evenly

A downsampled series with a storage cap is not a resolution problem, it is an
**allocation** problem, and the two have very different costs. ByteCraft's trace
spread 400 points per lap evenly by distance — ~13.5 m *everywhere* at COTA,
identical down a 1.2 km straight and through a four-direction-change ess — and
corner detection plateaued at 12 corners on a twenty-corner circuit. The obvious
fix (more points) triples a row that lives in Postgres on a free tier. The
cheaper fix is to **weight each sample by how much is happening there,
integrate that weight against the axis, and place output points at equal
intervals of the weighted arc length** — inverse-CDF sampling of an importance
density. Corners went to ~5 m spacing and straights to ~35 m for the *same* 400
points, and detection reached 15. Smooth the weight field first, or the density
steps visibly at the corner entry.

**Three consequences that are easy to miss and expensive to find later:**

1. **Any downstream index-as-proxy-for-position breaks.** Every plot drawing at
   `i / (n - 1)` was about to stretch corners and compress straights. Anything
   that inferred position from an index now has to read the real axis, and the
   inverse (pointer → index) becomes a search, not a multiply.
2. **Time-based animation must stop counting indices.** A replay stepping the
   cursor at a constant index rate crawls through every corner and fires down
   every straight once corners hold 3–4× the samples — the exact inverse of the
   recorded motion. Drive it from a real time axis and density stops mattering.
3. **Every threshold tuned against the old spacing is now wrong.** All six
   corner-detection defaults moved, because the weighting changed what one
   sample index is worth. Re-sweep them; do not port them.

**And know when to stop.** One setting past the chosen one reported *sixteen*
corners by splitting a single turn at 78% and 79% into two. A bigger number from
a worse answer is the failure mode of any tuning sweep with a metric that only
counts. *Codex II.3, IV.1.*

---

### A17 · When resolution is the limit, check whether you are reading the wrong channel

Two rounds of work went into raising corner detection on a downsampled GPS
trace: 12 corners, then 15, on a circuit with 20. Both rounds were competent and
both were solving the wrong problem — the ceiling was the trace's own
resolution, so every improvement was a fight against a storage decision.

The question that ended it was not "how do I estimate curvature better" but
**"what does this measurement actually consist of, and is there a channel that
carries it more directly?"** A corner is the car carrying lateral load. The
export answers that at 25 Hz. It answers *position* at 5 Hz. Detection had been
inferring load from twice-differentiated coarse positions when the load itself
was sitting in the file at five times the rate.

**The transferable checks, in order:**

1. **Print the sample rate of every channel before designing anything on top of
   them.** They are not the same, they are usually not documented, and the one
   you assumed was best is often the worst. Here: GPS 5 Hz, speed 10 Hz,
   lateral G 25 Hz, lap number 50 Hz.
2. **Ask what the quantity physically IS**, then look for the channel that
   measures it rather than one you can derive it from. Derivation costs
   resolution and adds noise; both are avoidable if the sensor exists.
3. **Compute derived facts where the data is widest, and persist the result.**
   Detection moved to ingest, where the full-rate channels live, and the ~20
   corners per lap are stored (3.5% of the trace). Downstream consumers never
   see the resolution problem again — and the derived set is stored in
   *distance fractions*, not indices, so the next resampler cannot invalidate it.

**And the rule that decides whether a threshold travels:** express it as a
dimensionless fraction of something the data itself supplies, never as an
absolute in the measurement's own units. "0.25 G" is a firm corner in one car
and a rounding error in another; "15% of this session's lateral capability" is
the same statement everywhere. Same for time: seconds, never sample counts, or
a 50 Hz exporter silently gets a different answer than a 25 Hz one. Both are
pinned by tests — half the grip, and double the rate, must return the same
corners.

**Finally, on knowing a result is real rather than fitted.** The accepted
setting is the middle of a plateau: two parameters each vary across a range
without changing the answer, and the answer repeats on four independent laps.
An isolated setting that hits the target number is a fit; a plateau that hits it
is a measurement. Sweep wide enough to tell which one you have. *Codex II.1, II.3.*

---

---

### A18 · Measure the tolerance, not the answer — and let the sweep refute you

A detector that returns the right number is not the same as a detector that is
right. The distinction is the **tolerance**: how wrong can its inputs be before
the answer moves?

Corner detection returned exactly the circuit's official corner count on every
lap of the real export, which felt conclusive. Sweeping its one scale parameter
directly showed the count held **only across ±12%** of the measured value. The
number was right; the design was a knife-edge, and its failure mode was
**silent** — corners quietly missing, no error, nothing to notice. A product
meeting an unfamiliar car would have failed without ever saying so.

**The habits this produces:**

1. **Sweep every scale parameter over orders of magnitude, not over a plausible
   range.** A plausible range only tells you the answer is stable where you
   already expected it to be. The interesting question is where it breaks.
2. **Assert the tolerance in the test, not the answer.** `expect(corners).
   toHaveLength(20)` at the measured input is a fact about one file.
   `toHaveLength(20)` across a 27× input range is a property of the design.
   Pin the property — the answer follows from it, and the reverse is not true.
3. **Prefer a yardstick the subject supplies over one measured globally.** The
   fix was to scale off the *median of the local population* — here, the typical
   corner in that lap — instead of a session-wide percentile. Self-normalising
   against the thing you are classifying is immune to the global distribution
   shifting under you.
4. **Prove the new test is not vacuous by re-creating the old failure.** Wiring
   the bar back to the global scalar made it die at a 4× error where the new
   form holds to 12×. Without that check, a robustness test can pass because it
   is testing nothing.

**And the part worth being honest about:** the hypothesis was wrong. I predicted
sensitivity to the straight-to-corner ratio and to outlier spikes, and measured
both — 240 s of extra straight and a 4 G spike each moved the scalar by under
3% and changed nothing. The real fragility was somewhere I had not looked.
**Measure before you fix, even when the mechanism seems obvious**; a confident
diagnosis that survives no measurement is how you harden the wrong thing and
report it as progress. *Codex II.1, IV.3.*

---

---

## Part B — Session trail (newest first)

Each entry: date · what shipped · the method insight worth carrying forward.

| Date | Shipped | Method insight |
| --- | --- | --- |
| 26 Aug 2026 | Corner detection re-scaled off the lap's own typical corner (27× input tolerance, was ±12%) | **Measure the tolerance, not the answer — and let the sweep refute your hypothesis.** Full pattern in **A18**. The second lesson is a support one that is really a product one: the reported defect (14 corners instead of 20) was not a defect at all — it was a session parsed by an older bundle, because parsing is client-side and derived data is written at upload. Diagnosing it took three exchanges and was only settled by noticing the uploaded session's channel summary was *numerically identical* to the committed fixture's, which proved it was the same export and therefore that the detector was not the variable. **When derived data is computed at write time, a stale record is indistinguishable from a broken feature** — and nothing in the UI named the build that produced either the page or the record. The cheap fix (a build marker) and the real fix (backfill from the raw files already in Storage) are both now the top blocker, because the next occurrence costs the same three exchanges. **A smaller habit worth keeping:** the fastest way to identify what a user is looking at was to compare a summary statistic of their data against a known artifact. Channel min/max is free, carries no PII, and uniquely identified the file. |
| 26 Aug 2026 | Corner detection moved to ingest, on full-rate lateral G: 20/20 at COTA on every lap | **The ceiling was the channel, not the algorithm.** Full pattern in **A17**. The session's second lesson is about the difference between a target and a criterion: the ask was "get all 20", and it is trivially possible to reach 20 on one circuit by tuning until the count matches — which would have shipped a detector that fails on the first track nobody here has driven. What made the result trustworthy was refusing to accept any setting that was not (a) a *plateau*, with two parameters varying across a range without changing the answer, (b) *repeatable* on four independent laps, and (c) built from **dimensionless** thresholds, so a test can prove the same lap at half the grip and double the sample rate returns the same corners. The number and the confidence came from the same discipline. **Also worth carrying:** normalising a measurement per-lap felt natural and was wrong — the yardstick (lateral capability) belongs to the car and the circuit, so a lap where the driver never pushed re-scaled its own noise into signal. When you divide by something, ask what population that something should be measured over; "the thing in front of me" is a default, not an answer. |
| 26 Aug 2026 | Readability programme closed: adaptive trace resolution, map transport + panel, Progression rework, Engineering Run readiness, run averages | **Fix the allocation before you buy more capacity — and then go and check what depended on the old shape.** Full pattern in **A16**. The session's other reusable lesson is about *labels on borrowed layouts*: three of these five views were ported from prototypes that show figures we cannot compute. The prototype's Progression column says GAP TO IDEAL against a curated reference-lap library that does not exist, and its Engineering Run fills metric boxes with "— TBD". Copying either verbatim ships a claim about data you do not have; deleting them loses the layout. **What worked was keeping the layout and changing the measurement to one that is real** — gap to *your own* best, and per-agent *input readiness* instead of per-agent output — then pinning the honest label with a test that asserts the prototype's wording is **absent**, so it cannot drift back in when the file is next touched. **The Engineering Run version is worth its own note:** the prototype's TBD boxes were honest and worth nothing. Asking "what is the one real question this surface can answer today?" produced a better feature than either shipping the fake or shipping nothing — LMU ships GTE cars with several channels permanently empty, so telling a driver *now* which agents their export can feed is payable, needs no backend, and is something only we can answer. **Also, again:** two real defects this session were found by rendering and looking, not by 500 tests — an off-by-one in cumulative distance that was invisible while a derived field masked it, and a reconciled/unreconciled lap-time contradiction on one screen (that one *was* caught, by an existing test whose assertion then got **stronger**, not relaxed, to accommodate the new view). |
| 21 Aug 2026 | P0 — real multi-lap fixture + hashed golden-master format | **Diff the test fixture against the real input it came from; a fixture's limitations are usually undocumented and sometimes free to remove.** The fixture here had been "truncated for CI" — except the byte diff showed every channel record's sample-count field overwritten to 300 while all the telemetry bytes remained. It was still 849 KB. The truncation bought **no space at all** and cost the ability to test lap logic, which is how it hid two production bugs. Nobody had checked, because "truncated fixture" sounded like a reasonable trade. **Second, on golden masters that grow:** when a fixture gets 20× more data, embedding every value stops being viable (~6 MB of JSON). A **hash over the complete decoded array** is smaller than the original *and* asserts strictly more than keeping every Nth sample, which cannot see a regression between the samples it keeps — keep extremes and a few edge values in plain text so failures stay diagnosable. The risk is cross-language hash stability, so pin the canonical form narrowly (fixed decimals, normalise negative zero — Python prints `-0.000000` where JS prints `0.000000`) and **verify both runtimes agree before you rely on it**. **Third:** the masters had no committed generator, so "generated from exactly these bytes" was a promise for months. If a gate asserts provenance, the thing that produces it belongs in the repo and in CI. |
| 21 Aug 2026 | Phase 2 opened (P1: plan-doc correction) + model-selection evaluation | **Check a cost advantage against your actual volume before treating it as a decision, and check the platform's runtime before treating a port as a lift.** Two premise failures caught in one session. First: a "~10× cheaper" model option was worth ~**$10/month** at three users, and the incumbent's per-run price was already 90% optimised using provider-specific caching and batch discounts — so the honest comparison was optimised-vs-optimised, not headline-vs-optimised. The habit: multiply the delta by real volume *first*; a 10× saving on a rounding error is a rounding error. Second: "move the FastAPI service to Supabase Edge Functions" is not possible as stated, because Edge Functions run Deno — a fact worth establishing before scoping, not after. **On documenting superseded plans:** correcting a strategic document inline plus a superseded-assumptions banner beats rewriting it — the original reasoning is evidence about how the decision was made, and a plan that silently matches present reality teaches nothing. **On bias:** the owner named their own cost bias up front, which is what made a blind A/B protocol an obvious requirement rather than an imposition. Ask for the bias; it tells you which safeguard the decision needs. |
| 21 Aug 2026 | Phase 1 closed; retrospective written | **Write the retrospective at the close, and let it name the pattern across the misses rather than listing them.** Six defects reached `main` or production this phase, and tabulating them side by side showed one shape: *a check passed in a friendlier environment than the one that mattered* — a fixture too small, a container in UTC, a suite that tests source instead of the artifact, fixtures that were all internally self-consistent. That single sentence is more useful to the next build than six war stories. **The concrete habit it produces:** the two highest-yield debugging sessions of the phase were running the owner's real input through the pipeline, and querying the production database after an acceptance walkthrough — both found in minutes what the full suite had missed for days. Schedule both deliberately; neither is a test you can write. **Also:** a retro is the right place to hand forward the thing nobody will remember — here, that the committed fixture *structurally cannot* express the bugs it hid, which promoted a missing fixture from an unnoticed gap to the top backlog item. |
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

> **Superseded 25 Aug 2026 for assertions — still the tool for *looking*.**
> Component tests are now real infrastructure (`@testing-library/react` +
> jsdom, opt-in per file with `// @vitest-environment jsdom`), so anything you
> would assert by reading `innerText` belongs in a `*.test.jsx` that CI runs.
> Keep the harness below for what a suite cannot do: **seeing** the thing. The
> slab-sparkline was invisible in text output and obvious in the screenshot.
> Rule of thumb — assert in the suite, *look* in the harness.

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
