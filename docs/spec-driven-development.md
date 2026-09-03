# Spec-Driven Development — how it works here

> **Adopted 3 Sep 2026.** Trigger: the Spec Kit workflow (constitution → spec →
> plan → tasks → implement → validate). Worked example, built the same day:
> `docs/specs/001-note-visibility/`.

---

## The idea, in one line

**Define what should be built before the agent writes code**, so the agent is
implementing a decision instead of inventing one.

The failure it removes is not bad code. It is an agent — or a human — filling
silence with plausible invention: an edge case nobody asked for, an architecture
decision made in passing, a feature that grew a wing on the way through. Silence
in a prompt gets filled. A spec is how you fill it first.

## What we adopt, and what we deliberately do not

**We adopt the four artifacts and the ordering.** They are the substance.

**We do not install the Spec Kit CLI** (`specify init`). Three reasons, stated so
this can be re-decided rather than re-derived:

1. It scaffolds a `constitution` under its own memory directory. **We already have
   one, and ours is better**: three layers, versioned, with an amendment protocol
   and named anti-patterns (below). A second, thinner rules file would compete
   with it, and the losing copy would be the one an agent happened to read.
2. It assumes its own slash-commands and agent layout. Our repo has settled
   conventions (`CONTRIBUTING.md`, `TESTING_GATES.md`, the ring ladder) that the
   scaffold does not know about.
3. It is a dependency and a toolchain for something that is, honestly, four
   markdown files and the discipline to write them in order.

**So: the workflow, not the wrapper.** If the CLI later earns its place, the
artifacts are already in its shape.

## Our constitution already exists — it is three layers

Spec Kit's "constitution" is one file. Ours is a stack, and the order matters:

| Layer | Artifact | Decides |
| --- | --- | --- |
| Product governance | **Build Governance** (`.claude/skills/axiomblack-build-governance/`) | *whether* and *in what order* work is done |
| Engineering standard | **DE Codex** (`.claude/skills/axiomblack-de-codex/`) | *how* the code is written |
| This build's rules | `CLAUDE.md` + `WORKING_PLAN.md` §4 standing bars | the invariants specific to ByteCraft Racing |

A spec cites these; it never restates them. Restating is how two copies of a rule
become one rule and one future contradiction.

## The four artifacts

Per feature, in `docs/specs/NNN-slug/`, numbered in the order they were started:

**1 · `spec.md` — WHAT, and WHAT NOT.**
Goals, **non-goals**, numbered functional requirements, and acceptance criteria in
Given–When–Then. It names the pull signal and the matrix quadrant that put it
ahead of other work (Build Governance v1.1). It does not contain a single
implementation decision.

> **The non-goals are the half that earns this.** Everything else we already had
> in some form — the tracker's "no test, no story" rule was already acceptance
> criteria by another name. What we never wrote down was the boundary, and an
> agent with no boundary *will* overbuild: it is the most reliable failure mode
> there is. Spec 001's non-goals blocked four plausible, unasked-for features.

**2 · `plan.md` — HOW.**
The technical approach, and a **constitution check** table showing the plan against
each rule it could violate. Written *before* code, which is the actual change in
habit: the reasoning used to arrive in the commit message, i.e. after the design
was already fixed and unreviewable.

**3 · `tasks.md` — IN WHAT ORDER.**
Small ordered steps, pure logic before wiring, each naming the requirement it
serves and how it is checked. Committed rather than held in a session's todo list,
so the sequence survives a context loss or a handoff.

**4 · Implement, then validate.**
Code the tasks in order. Then the gates — and per breadcrumb A19, **break each new
rule deliberately and watch its own test go red**, because a green suite proves
only that the suite ran.

## When a spec is required — and when it is waste

Mandating three markdown files for a typo would be the exact "big batch that sits
waiting" that Create Flow forbids. So:

**Write the full set when the change** touches more than one surface · changes a
rule a driver can observe · touches the database schema · or has a non-obvious
boundary that an agent could overshoot.

**Skip it when the change** is a copy fix, a dependency bump, a lint or formatting
pass, or a one-file fix whose acceptance test is a single obvious assertion. Log
those in `WORKING_PLAN.md` §5 as before.

**When in doubt, write the spec.** It is an hour; the units defect that shipped
behind 661 green tests cost more than that in one exchange.

## How it meets the process we already run

`docs/agentic-delivery-process.md` has six stages. Spec-driven development is not
a replacement — it is what two of those stages *produce*:

| Stage | Artifact it now produces |
| --- | --- |
| Premise | the spec's pull signal + matrix quadrant |
| Slice | `spec.md` (goals, non-goals, requirements) |
| Ground | `plan.md` (approach + constitution check) |
| Build | `tasks.md`, worked in order |
| Prove | the gates, plus the deliberate breaks |
| Close | `WORKING_PLAN.md` §0/§5 + a breadcrumb trail entry |

## Template

Copy `docs/specs/001-note-visibility/` — it is the reference implementation of this
document, including a spec whose own R10 turned out to be wrong (it claimed every
existing test would pass unchanged; one had pinned the behaviour being removed, and
was rewritten to the new rule with its original claim intact). **That correction is
left in the file on purpose.** A spec is a decision record, not a press release; the
value of writing it down beforehand is precisely that you can later see where it was
wrong.
