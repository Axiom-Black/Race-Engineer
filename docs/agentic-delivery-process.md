# The Agentic Delivery Process

**A strict procedure for an agent–human partnership to take an application from
nothing to live.** Version 1.0 — written 21 Aug 2026, at the close of Phase 1
and the opening of Phase 2, from what actually happened rather than from what
ought to have.

> **How this differs from the neighbouring documents.**
> `docs/build-breadcrumbs.md` records *methods* — how to do a thing well.
> `WORKING_PLAN.md` records *state* — what is done and what is in the way.
> The **DE Codex** is *normative* — how code must look.
> **This file is the procedure**: who does what, in what order, and what may not
> proceed until what is true. It is deliberately written in MUST / MUST NOT.
> **Axiom Black Build Governance** (`.claude/skills/axiomblack-build-governance/`)
> sits above all of these: its five Lean principles decide *what* is worth
> building. This file decides *how the agent and the human get it delivered* —
> Establish Pull says build only what is pulled; this says what "delivered"
> must be true to claim.

**Maintenance rule (non-negotiable).** This document is revised at the close of
**every** phase, before the next phase opens. A phase is not closed until its
lessons are folded in here and §11's changelog gains a row. A process document
that only describes the phase it was written in is a memoir, not a procedure.

---

## 1 · The one asymmetry everything else follows from

An agent can write, test, verify, audit, and document faster and more
consistently than a human. An agent **cannot**:

- authorise anything (OAuth connections, app installs, org grants)
- hold a credential, or decide what a credential may reach
- click a dashboard the credential-holder owns
- spend money, or choose a billing tier
- judge whether a product's output is *good*
- supply real user data
- decide what the product is for

**Therefore: the agent's job is to reduce every task to either (a) something it
can fully own, or (b) a single, precisely specified human action.** Vague
handoffs are the dominant failure mode of this partnership, not bad code.

### 1.1 · The Human-Only Action Register

Every one of these blocked real work in Phases 0–1. Treat the list as a
pre-flight: any phase touching one of these MUST surface it in the plan *before*
building against it.

| Class | Examples encountered |
| --- | --- |
| **Identity & authorisation** | Vercel↔GitHub login connection; Vercel GitHub App install; org third-party access approval |
| **Secrets & config** | `VITE_*` env vars in the host dashboard; repo Actions secrets; a Sentry DSN |
| **Auth policy** | Enabling "Confirm email"; redirect/callback URLs; leaked-password protection |
| **Repository governance** | Branch protection / rulesets; deleting refs; plan upgrades |
| **Money** | Any paid tier; any per-run API spend |
| **Real data** | Providing genuine input files; deciding whether PII may live in production |
| **Product judgement** | Whether a debrief is *actionable*; what a metric should be *named* |

### 1.2 · Handoff format (MUST)

An agent asking for a human action MUST give:

1. the exact navigation path (`Settings → Rules → New branch ruleset`),
2. the exact values, copy-pasteable,
3. what breaks if it is skipped,
4. what the agent will do the moment it is done,
5. any **ordering constraint** with other human actions.

> **Real failure this prevents.** "Re-enable Confirm email" was given without
> the ordering constraint. Enabling confirmation *before* adding the production
> redirect URL sends every new user a confirmation link pointing at
> `localhost`. Two one-line tasks, and the order is load-bearing.

### 1.3 · Capability probing (MUST)

Before planning around a capability, **exercise it once**. Do not infer it from
documentation, from a similar tool, or from a previous session.

> **Real failures.** (a) Ref deletion returned `403` from this environment — a
> whole branch-cleanup plan was written before discovering the agent could not
> execute it. (b) "Move the FastAPI service to Supabase Edge Functions" is
> impossible as stated: Edge Functions run Deno, and `backend/` is 2,272 lines
> of Python. Both were one command away from being known.

---

## 2 · The phase loop

Every phase — including ones already completed — runs these six stages in
order. **A stage MUST NOT begin until the previous stage's exit condition is
true.**

```
0 Premise  →  1 Slice  →  2 Ground  →  3 Build  →  4 Prove  →  5 Close
   ↑                                                              │
   └──────────────── revise this document ────────────────────────┘
```

### Stage 0 · Premise check *(agent; ~15 min; the highest-leverage stage)*

Before slicing anything, the agent MUST test the request's premises and report
any that fail.

**Checks:**
- **Does the asked-for thing serve the stated goal?** Restate the goal in one
  sentence and ask whether the request is the shortest path to it.
- **Do the numbers hold?** Multiply any claimed advantage by real volume.
- **Does the platform support the plan?** Runtime, language, limits, quotas.
- **Is any input document asserting something no longer true?**

**Exit:** premises confirmed, or failures reported with the corrected premise.

> **Real saves.** (a) "Build the share link so I can onboard 3 users" — onboarding
> three users needed *neither* the share link nor team visibility; each just
> signs up, and RLS already isolates them. Two security models went unbuilt.
> (b) A "~10× cheaper" model option was worth **~$10/month** at actual volume,
> against a per-run price already 90% optimised by provider-specific caching and
> batch discounts. (c) The plan document still specified Clerk, Railway/Render/Fly,
> and a Phase-1 TimescaleDB conversion — all superseded.

**Rule: a failed premise is reported in one or two sentences, then the agent
proceeds with the corrected version or asks a single scoped question. It does
not stall, and it does not silently build the wrong thing.**

### Stage 1 · Slice *(agent proposes, human ratifies)*

- Stories MUST be INVEST-shaped and **each MUST have exactly one acceptance
  test** written before any code. No test, no story.
- Every story MUST leave something a user would pay for. Infrastructure with no
  user-visible capability attached is **out of scope by default**.
- Anything too fuzzy to estimate becomes a **spike**, not a story.
- The slice MUST name which stories are **held back** and why. A phase that
  builds everything available has not been sliced.

**Exit:** a committed story table with statuses, plus an explicit hold list.

> **Real application.** Phase 2 opened at P1–P3 with P4–P7 (tiering-as-gate,
> quotas, Stripe, garages) explicitly on hold, because quotas and billing are
> infrastructure for demand that has not been confirmed.

### Stage 2 · Ground *(agent; blocking)*

Nothing is built on assumption. This stage produces the **truth artefacts** the
rest of the phase is checked against.

- **Real input, sanitized, committed.** A fixture MUST be able to express the
  behaviours the phase implements. A fixture that structurally cannot is a
  liability, not a safety net.
- **A reference implementation, where correctness is non-obvious**, plus
  **golden masters generated from exactly the committed bytes** — with a
  **committed generator**.
- **Format/protocol findings written down** at byte level where relevant.

**Exit:** fixture + golden masters + generator committed and green in CI.

> **Real failure this stage exists to prevent.** The Phase-1 fixture had every
> channel record's sample-count field overwritten to 300 while all telemetry
> bytes remained — 849 KB *and* single-lap. The truncation bought no space and
> cost the ability to test lap logic, which is how it hid two bugs that reached
> production. And the golden masters had **no committed generator** for months,
> so "generated from exactly these bytes" was a promise, not a check.

### Stage 3 · Build *(agent owns; human unblocks)*

- **Pure core, effects at the edges.** Domain logic MUST be importable without
  DB, network, clock, or UI. (Practical test: can a unit test import it without
  a config file?)
- **New dependency = licence check + weight measurement, before adoption.**
  Build once with and once without; diff the output.
- **Every unreliable or unverifiable value is flagged in the UI, never hidden
  and never silently defaulted.**
- **Never fake a capability.** If the data cannot support a claim, show the
  honest lesser claim.
- Human-only actions surfaced in Stage 0/1 are requested **as soon as they
  block**, in §1.2 format, and the agent continues on everything they do not
  block.

**Exit:** feature complete against its acceptance test, all standing gates green
locally.

> **Real application.** Sentry's SDK doubled the bundle (461.64 → 938.82 kB), so
> it went behind a dynamic import — free when unconfigured. Progression measures
> gap to the driver's *own* best rather than inventing an "ideal lap" library
> that does not exist.

### Stage 4 · Prove *(agent; the stage most often skipped, and the most valuable)*

**A passing test suite is not evidence about the thing users get.** Every phase
MUST clear all five proofs that apply to it. See §4.

**Exit:** all applicable proofs executed and their results recorded — including
anything they found.

### Stage 5 · Close *(agent writes, human confirms)*

- `WORKING_PLAN.md` §0 **and** §5 updated in the *same* change as the work.
- A phase-closing **retrospective** naming the pattern across the phase's
  misses, not just a list of them.
- `docs/build-breadcrumbs.md` gains the portable method.
- **This document revised**, §11 changelog appended.
- Explicit statement of what is *not* proven.

**Exit:** the tracker is true at a glance, and a stranger could resume from
written state alone.

---

## 3 · Standing gates (the ring ladder)

Gates promote **inward**: an outer ring is not evaluated until the inner one is
green. A violated invariant is a **stop**, not a warning.

| Ring | Asserts | Why it exists |
| --- | --- | --- |
| **0 · Fixture integrity** | Safe test data present; no real PII anywhere in the tree; served copies byte-identical | No test is trustworthy on bad data, and the repo must be publishable |
| **1 · Reference truth** | The verified implementation's suite passes; golden masters reproduce from the committed fixture | The port is checked against the reference, never against itself |
| **2 · Contract** | Structure, routing, and cost invariants against canned responses | Non-deterministic output cannot be asserted; its *shape* can |
| **3 · Tenancy** | Isolation enforced **in the database**, not the app; cross-tenant read returns zero rows | With a direct-to-database client, RLS *is* the API boundary |
| **4 · Cross-runtime parity** | The shipped implementation matches the reference value-for-value | A silent divergence is worse than no port |
| **5 · Deployable artifact** | A misconfigured build **fails**; a configured build contains real product above a size floor | Rings 0–4 test *source*. They were all green while the production bundle contained no application at all |

**Two rules learned the hard way:**

1. **A gate protects only what it has been merged into.** Ring 5 existed on a
   branch while production served a hollow bundle built from `main`.
2. **A check that identifies its subject by position silently changes meaning.**
   `find dist/assets -name '*.js' | head -1` was correct until a second chunk
   appeared. Identify by name.

**Required-check drift:** branch protection matches required checks on the
**literal job name**. Renaming a CI job silently drops that gate while
everything still shows green. Renaming a job and updating the ruleset are **one
change**.

---

## 4 · The five proofs

Ordered by how often they found something real. Each is a distinct *kind* of
evidence; passing one says nothing about the others.

1. **Real input.** Run genuine user data through the real path. *(Found: a crash
   on real-size files; an out-lap reported as a lap time the driver never set;
   nine distinct channel sample rates that no synthetic fixture had.)*
2. **The artifact.** Inspect what gets shipped, not what gets compiled. Assert
   it contains the product and clears a size floor. *(Found: a green build
   emitting 198.70 kB of library and zero application.)*
3. **The database.** Query production after an acceptance walkthrough. *(Found:
   a demo session advertising a fastest lap absent from its own trace, seen by
   every new account; a mismatched three-file set relabelled to the wrong car.)*
4. **The rendered surface.** Mount the component and look at it. *(Found: every
   first upload awarded the top tier; two-session sparklines rendering as
   full-width slabs — the second invisible to any text assertion.)*
5. **The deployed thing.** Fetch the live URL and verify behaviour end to end.
   *(If the environment cannot reach it, say so and hand the human an exact
   check — do not infer success from a green deploy.)*

**Anomaly rule (MUST).** Unchanged output from changed input is a defect until
proven otherwise. The hollow bundle was found because a bundle hash did not move
across a substantial source edit — not by a test.

**Negative-case rule (MUST).** Every new permission or allowance gets a paired
test proving it does **not** reach further. An UPDATE policy without a
cross-tenant-denial test is an untested widening of the security boundary.

**Teeth rule (MUST).** Before landing a new gate, verify it **fails without its
fix**. A gate that passes in both states launders an assumption into evidence.

---

## 5 · Decision protocol

Applies to anything hard to reverse: dependencies, providers, schema, security
boundaries, hosting.

1. **Write the decision down before acting** — options, the recommendation, and
   the reason. Decisions that live only in chat are lost.
2. **Name the bias.** Whoever holds a preference says so. It determines which
   safeguard the decision needs.
   > A stated bias toward a cost advantage is what made a **blind** A/B an
   > obvious requirement rather than an imposition.
3. **Fix the decision rule in advance**, before seeing results.
4. **Never assert an unverifiable number.** If a figure cannot be checked from
   the working environment, leave a named blank and a pointer to the
   authoritative source. A stale number in a decision document is worse than no
   number.
5. **Isolate the choice behind a config seam** so deferring is a real option
   rather than a delay.
6. **Standing bars may be amended, never quietly.** A change that breaches one
   needs explicit owner sign-off and a written amendment.
   > A public share link cannot exist without amending "tenant isolation lives
   > in the database, keyed on `auth.uid()`". That is a sign-off, not a ticket.

---

## 6 · Branch and merge discipline

- Branch from **current** `origin/main`. Always fetch first.
- One logical change per branch. Name after the change, never the author.
- **Never stack new commits on already-merged history.** After a squash merge,
  restart the branch from `main`.
  > Violated once, in this session: P0 was built on top of the already-merged P1
  > commit. The PR came back `dirty` with no gates run. Cost: a re-branch, a
  > cherry-pick, and a full re-verification.
- Squash merges make `git branch --contains` useless. Determine merged-ness by
  **content** — `git merge-tree` answers "would merging change `main`?".
- Every push to the protected branch clears every gate, or it does not push.

---

## 7 · Documentation duties

- **Record the *why*, not the *what*.** The diff shows what changed.
- **Correct superseded documents inline, plus a banner** — do not rewrite them.
  The original reasoning is evidence about how the decision was made; a plan
  that silently matches present reality teaches nothing.
- **Summary rows and detail rows change together.** A status block contradicting
  the row three lines below it is worse than no status block.
  > This happened twice, one commit apart, in the same file.
- **Documentation written for one context does not stay correct.** A deploy guide
  recommending "Confirm email off" was sound for a private demo and became
  advice to leave a public site open.
- **State limits where the claim is made.** "Redaction is a denylist and cannot
  catch an arbitrary name" belongs next to the redaction, not in a footnote.

---

## 8 · Anti-pattern catalogue

Every entry is a real incident from Phases 0–1.

| Anti-pattern | What it looked like | Rule |
| --- | --- | --- |
| **Friendly-environment proof** | Timezone bug invisible because the container runs UTC | Assert the *wrong* answer explicitly so a regression cannot hide |
| **Fixture that cannot fail** | Single-lap fixture for multi-lap logic | The fixture must be able to express what the code claims |
| **Self-validating port** | Golden masters risk being regenerated from the port | The reference generates truth; the port is checked against it |
| **Positional identification** | `find … \| head -1` picking the wrong chunk | Identify by name, never by position |
| **Cross-source id trust** | `lap.lap_no === session.fastest_lap_no` where the two come from different files | Verify the referenced record exists before trusting the match |
| **Atomicity mistaken for coherence** | Three files present, one from a different car | Presence is not consistency; cross-check sources against each other |
| **Silent capability assumption** | "Move FastAPI to Edge Functions" (Deno) | Probe the runtime before scoping |
| **Headline-cost decision** | "10× cheaper" worth ~$10/month | Multiply by real volume first |
| **Retry on a non-retryable fault** | A "Try again" button on a full disk | Offer retry only where retrying can work |
| **Confident wrong diagnosis** | Claiming "your project is paused" when unknowable | Say the honest superset |
| **Temporary convenience left on** | Email confirmation disabled for a demo, still off when public | A relaxed setting needs an owner and an expiry |
| **Stale tracker** | Blocker rows naming resolved blockers and deleted branches | Update summary and detail together |

---

## 9 · Retrofit: how Phases 0 and 1 map to this process

Both phases are complete. Recorded here so the procedure is anchored in
something real, and so the next application can follow the same arc.

### Phase 0 — Discovery & Grounding

| Stage | What it was |
| --- | --- |
| Premise | Is the launch-blocking unknown a *research* problem or an *integration* problem? (It was research: a binary format.) |
| Slice | One spike: decode the format against real files. |
| Ground | Byte-level findings documented; reference parsers written and unit-tested against real exports; sanitized fixture + golden masters produced. |
| Build | Prototypes only — UI shells and a reference backend scaffold. Nothing user-facing. |
| Prove | Real input: decode ranges validated physically (speed, RPM against the rev limit, temperatures). |
| Close | Findings and inventory written down; the launch blocker declared cleared. |

**Exit that mattered:** the phase ended when the *unknown* was gone, not when
code existed.

### Phase 1 — Launch

| Stage | What it was |
| --- | --- |
| Premise | Ship telemetry first, defer the AI; on a $0 stack. Confirmed against cost and scope. |
| Slice | S1–S8, one acceptance test each, agent explicitly dark. |
| Ground | Reference-implementation port verified by golden masters; ephemeral-Postgres RLS harness before any migration shipped. |
| Build | Auth spine → schema + RLS → parser port → UI → progression → delta → deploy. |
| Prove | All five proofs — and each one found something the others missed. |
| Close | Retrospective naming the single pattern behind six defects; backlog corrected; this document created. |

**Numbers:** 13 days · 34 commits · 149 frontend tests · 125 reference tests ·
6 rings · ~4,200 lines of non-test source · $0/month · 6 defects reached `main`
or production, every one traceable to a check passing in a friendlier
environment than the one that mattered.

---

## 10 · Per-phase checklists

### Opening a phase

- [ ] Stage 0 premise check run; failures reported
- [ ] Superseded assumptions in inherited documents corrected
- [ ] Stories sliced, one acceptance test each, hold list explicit
- [ ] Human-Only Action Register scanned; blockers surfaced **now**
- [ ] Cost posture stated (what this phase starts spending)
- [ ] Fixture confirmed able to express the phase's behaviours

### Before requesting a human action

- [ ] Exact path, exact values, consequence of skipping, next agent step
- [ ] Ordering constraints against other human actions stated
- [ ] Verified the agent genuinely cannot do it

### Before opening a PR

- [ ] Branch cut from current `origin/main`, not stacked on merged history
- [ ] All standing gates green locally
- [ ] New gates verified to fail without their fix
- [ ] New permissions have a paired negative test
- [ ] PII guard run on anything derived from real data
- [ ] Tracker summary **and** detail rows updated together

### Closing a phase

- [ ] Acceptance test of every story demonstrably passed
- [ ] All five proofs executed; findings recorded
- [ ] Retrospective written, naming the *pattern* across misses
- [ ] Breadcrumbs gained the portable method
- [ ] **This document revised; §11 changelog appended**
- [ ] Pursue Perfection closed: what the phase taught fed back into the value
      definition, the stream map and the standard work — not just recorded here
- [ ] What is *not* proven stated plainly

---

## 11 · Revision log

The maintenance rule in the header is enforced here. One row per phase close.

| Version | Date | Phase closed | What changed in this document |
| --- | --- | --- | --- |
| 1.0 | 21 Aug 2026 | Phase 1 — Launch (Tier 1 Pilot) | Created. Derived from Phases 0–1: the human/agent asymmetry (§1), the six-stage loop (§2), the ring ladder with the merged-into and positional-identification rules (§3), the five proofs plus the anomaly, negative-case and teeth rules (§4), the decision protocol including bias-naming and unverifiable-number handling (§5), and the anti-pattern catalogue (§8) — every entry a real incident. |
| — | *(pending)* | Phase 2 — Intelligence | Expected additions: a proof for non-deterministic output (how to judge a generated debrief without asserting its text); cost-per-run observability as a standing gate; the reject-vs-flag rule for incoherent inputs; whatever the server-side move actually teaches. |
