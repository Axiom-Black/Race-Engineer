---
name: axiomblack-build-governance
description: >
  The Axiom Black Build Governance standard — the five Lean principles (Define Value, Map the Value
  Stream, Create Flow, Establish Pull, Pursue Perfection) governing HOW every Axiom Black build is run: what to build, in what order, and why. The product-governance layer ABOVE the
  engineering Codex (which governs how code is written). A LIVING STANDARD: consult it whenever shaping
  or steering a build. ALWAYS trigger when the task involves planning a project, product, or release; writing or prioritizing a roadmap, backlog, phase plan, or sprint; defining scope, KPIs, or acceptance criteria; deciding what to build next or whether to build it at all; cutting scope; or mapping a workflow to
  remove waste. Also trigger on "value", "roadmap",
  "backlog", "prioritization", "MVP", "scope", "governance", or "what should we build". Trigger
  proactively at the START of any build-planning task even if Lean is not named. For code-level rules
  use axiomblack-de-codex instead; this governs the build process, that governs the code.
---

# Axiom Black Build Governance — The Five Principles

This skill is Axiom Black's binding standard for **how a build is run as a value-delivery process**.
It governs *what* to build, *in what order*, and *why* — the product and project altitude.

It has a sibling: **`axiomblack-de-codex`** governs *how the code itself is engineered* (architecture,
craft, tests). Keep the two straight — this skill decides what work is worth doing; the Codex decides
how that work is done well. When both apply, this one shapes the plan and the Codex shapes the build.

## How to use this skill

Structured two-tier, like the Codex, so you load only what the moment needs:

1. **Tier 1 — The Five Principles + the decisions they force (below).** Loaded whenever the skill
   triggers. Read it at the start of any build-planning task. Each principle is paired with the
   concrete decision it forces, because a principle you cannot act on is decoration.
2. **Tier 2 — The Commentary (`references/commentary.md`).** For each principle: what it means, the
   waste it removes, how it shows up in an Axiom Black build, the anti-patterns it forbids, and how
   adherence is checked. Read the relevant entry on demand — do not preload the file.
3. **Amendment (`references/amendment.md`).** Read only when adding to or changing the standard.

### Operating protocol for a build-planning task

- **At the start:** load Tier 1. Run the build through the five principles before committing a plan.
- **During:** when a planning decision touches a principle, apply the decision it forces. If the
  *why* is unclear, read that principle's Commentary entry.
- **Precedence:** this skill governs the *process*; the Codex governs the *code*. Where a planning
  choice would force an engineering compromise, name the tension — do not silently trade quality for
  scope (that is a Pursue-Perfection violation, and a Codex violation).
- **At handoff:** the plan you leave must make value, sequence, and rationale explicit (Principle 1
  and 5), so the next worker inherits *why*, not just *what*.

---

# TIER 1 · THE FIVE PRINCIPLES

Each principle states the idea, then the **decision it forces** at build time. The forced decision is
the operational part — it is what an agent or a human actually does differently because of the principle.

## 1 — Define Value
*Find out what the customer wants and is willing to pay for. Set KPIs to measure progression toward the goal.*

- **Forces:** No work is planned without a named customer and the value they would pay for, stated
  first. Every objective carries a KPI that measures progress toward it — if you cannot name the
  metric, you have not defined the value. Value is defined from the customer's side, never the
  builder's convenience.

## 2 — Map the Value Stream
*Look at every step in the process and remove the ones that do not add value. Produce an action plan for improvement.*

- **Forces:** Before building, lay out the full sequence of steps from idea to delivered value, and
  mark each as value-adding or waste. Waste is cut or an action plan is written to remove it. A step
  that survives the map must justify the value it adds; "we've always done it" is not a justification.

## 3 — Create Flow
*Make the remaining work steps move smoothly, without delays or blocks. Create standard work.*

- **Forces:** Sequence work so it moves without stalls, handoff gaps, or blocking dependencies; a
  blocker is surfaced and cleared, never worked around silently. Recurring work is captured as
  standard, reusable procedure (a template, a checklist, a gate) so it is not reinvented each time.
- **Standard work for sequencing:** the **80/20 Prioritization Matrix** is the org's standing gate for
  what moves first. Score each candidate on **potential impact** and **feasibility**, then act on the
  quadrant: *Do it now!* (high impact, high feasibility) · *Start planning now* (high impact, low
  feasibility — the blocker is named and worked, not parked) · *Quick wins* (low impact, high
  feasibility — filler, never a queue-jumper) · *Review only if you have time* (low, low).
  Low feasibility is a **blocker to clear**, not a reason to skip the item.

## 4 — Establish Pull
*Make products or services only when the customer asks for them.*

- **Forces:** Build backlog items only when they are pulled into active work by real, present demand —
  not on speculation about future need. The backlog is parked until pulled; scope is added by demand,
  not by anticipation. Do not build ahead of the pull signal.
- **Ordering what has been pulled:** demand decides *whether*; the 80/20 Prioritization Matrix
  (Principle 3) decides *in what order*. Rank pulled items by impact × feasibility and state each
  item's quadrant when it enters active work. Impact outranks feasibility: an easy low-impact item
  never goes ahead of a hard high-impact one — it waits, or it fills a gap while the hard one unblocks.

## 5 — Pursue Perfection
*Keep improving the system over and over to remove all waste.*

- **Forces:** Improvement is continuous, not a phase. Each cycle removes waste the last one exposed,
  and quality is never traded for short-term speed (the only way to go fast is to go well). What was
  learned is fed back into the value definition, the stream map, and the standard work — the loop
  closes, it does not just end.

---

## When to reach for the Commentary

Read the matching entry in `references/commentary.md` when:

- You are starting a project/product and need to establish what "value" even is → **Principle 1**
- You are setting objectives or reporting progress and need the right metric → **Principle 1 (KPIs)**
- You are designing or auditing a workflow, pipeline, or process → **Principle 2**
- You suspect a step is busywork but are not sure how to judge it → **Principle 2**
- Work keeps stalling, blocking, or waiting on handoffs → **Principle 3**
- You are about to write a reusable template, checklist, or gate → **Principle 3 (standard work)**
- You are scoring or ordering candidates and want the quadrants spelled out → **Principle 3 (the matrix)**
- You are tempted to build something because it "will be needed later" → **Principle 4**
- You are prioritizing a backlog or deciding what is next → **Principle 4**
- You are closing out a cycle, retro, or release → **Principle 5**
- Someone proposes trading quality for a deadline → **Principle 5**

If none apply, Tier 1 is sufficient — do not load the Commentary.

## Relationship to the rest of Axiom Black governance

- **This skill (Build Governance)** — *what* to build, in what order, why. Product/project altitude.
- **`axiomblack-de-codex` (the Codex)** — *how* the code is engineered. Line/system altitude.
- **Working Plan / Phase Plan / PMPdM** — the operational trackers that *execute* against both.

These three layers agree by construction: Establish Pull is why the Working Plan runs a
pull-based Now/Next/Later backlog; Pursue Perfection is why the Codex refactors continuously;
Define Value is why every phase has acceptance criteria tied to a KPI.

## Amending this standard

A living standard. When a build teaches a lesson worth encoding, or reality contradicts a forced
decision, read `references/amendment.md` and follow its protocol. Amendments record their *why*,
keep Tier 1 short, and are themselves subject to evidence. The version ledger there is the record
of how this standard has evolved.
