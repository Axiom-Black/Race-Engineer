---
name: axiomblack-de-codex
description: >
  The Axiom Black Codex ("DE Codex" — the AxiomBlack Design & Engineering standard). The mandatory,
  language-agnostic engineering standard for ALL software Axiom Black designs, writes, reviews, or ships.
  A LIVING STANDARD: consult it at the start of and throughout software work, not only when asked.
  ALWAYS trigger when the task involves writing, editing, reviewing, refactoring, or architecting code;
  designing a system, data model, schema, or API; writing tests, CI, or acceptance criteria; parsing or
  decoding a file format; building a parser, agent, pipeline, or service; a cost/performance tradeoff; or
  handing work off to another agent or session. Also trigger on "our standards", "the Codex", "coding
  standards", "code review", "architecture", "clean code", or "how we build". Trigger proactively at the
  START of any coding or system-design task even if standards are not named; conforming to the Codex is
  the default. When in doubt on a software task, load this skill. Overrides generic coding-style defaults.
---

# The Axiom Black Codex — Engineering Standard

This skill is Axiom Black's binding engineering standard for all software work. It exists so that
any worker — a human, or a Claude agent in any session — produces code that looks and behaves as
though it came from a single disciplined mind, across every project and handoff.

## How to use this skill

The Codex is **two-tier by design**, and this skill mirrors that structure onto progressive disclosure:

1. **Tier 1 — The Standard (below).** The complete normative surface: thirty-two laws in six Canons.
   This is loaded whenever the skill triggers. **Read it in full at the start of a software task**,
   and keep it in working context. It is short on purpose — a standard you cannot hold in your head
   is one you will not follow.

2. **Tier 2 — The Commentary (`references/commentary.md`).** For each law: why it exists, the real
   war story that earned it, the principle-level example, and how it is enforced. **Do not preload it.**
   When a specific law is in tension with the task in front of you — you are unsure how to apply it, or
   why it matters — read only that law's entry, then return to work. Load `references/commentary.md`
   on demand, not front to back.

3. **Amendment (`references/amendment.md`).** Read this only when adding or changing a law — that is,
   when a project has taught a lesson worth encoding, or reality has contradicted an existing law.

### Operating protocol for a software task

- **At the start:** load Tier 1. Let it shape the design before the first line, not after.
- **During:** when a decision touches a law, apply the law. If the *why* is unclear, consult that
  law's Commentary entry (Tier 2) — not the whole file.
- **When you disagree with a law:** that is allowed and important. Per Canon I, the Codex answers to
  evidence. If a law demonstrably produces a worse outcome here, note it, follow the better path, and
  flag it for amendment (see Amendment). Do not silently ignore a law.
- **At handoff:** satisfy Canon VI. Leave a clean seam, mark provenance, record the why. The next
  agent inherits your context only through what you leave written down.
- **Precedence:** where this Codex conflicts with generic coding-style habits, the Codex wins. Where
  it conflicts with a hard safety, security, or legal requirement, that requirement wins and the
  conflict is flagged.

---

# TIER 1 · THE STANDARD

## Canon I — Ground Truth
*How we know what is true. The foundation; every other Canon rests on it.*

- **I.1** Verify against reality, never against specification alone.
- **I.2** A test that passes on the common case does not prove the rule correct. Test the cases whose right answer you already know independently.
- **I.3** Cross-validate: a value confirmed by two independent sources is trustworthy; a value from one is a hypothesis.
- **I.4** Flag unreliable data. Never hide it, never fabricate a plausible substitute.
- **I.5** Resolve disputes by evidence, not by authority or seniority of the source.
- **I.6** Know where truth actually lives. Do not read a value from a convenient place if the authoritative place is elsewhere.

## Canon II — Architecture
*How the system is shaped. Dependencies, boundaries, and the single source of truth.*

- **II.1** Dependencies point inward, toward policy. High-level rules never depend on low-level details.
- **II.2** Details live at the boundary. A format, vendor, framework, or database is a detail — quarantine it in one module and let nothing leak past.
- **II.3** The structure of the system announces what it does, not what it is built with.
- **II.4** One source of truth per fact. If a fact lives in two places, they will disagree, and you will ship the disagreement.
- **II.5** A derived value recomputes when its inputs change. Never freeze a computed result and let it drift from what it claims to represent.
- **II.6** Isolate what will change from what will not, so replacing a part does not require rebuilding the whole.

## Canon III — Craft
*How code is written. The line-level discipline.*

- **III.1** Names reveal intent. A reader should not have to trace a value to learn what it is.
- **III.2** A unit of code does one thing at one level of abstraction.
- **III.3** Remove duplication of knowledge — but do not merge two things that merely look alike today and will diverge tomorrow.
- **III.4** Delete dead code. Version control remembers it; your readers should not have to.
- **III.5** Separate asking from doing. A function either answers a question or changes the world, not both.
- **III.6** Keep the core pure. Push side effects — I/O, time, randomness — to the edges so the center is testable in isolation.
- **III.7** Fail honestly and loudly. A hidden failure is a debt with compounding interest.

## Canon IV — Process
*How work moves from idea to shipped.*

- **IV.1** The definition of done is an acceptance test that passes. Not "it runs." Not "it looks right."
- **IV.2** Design is the simplest thing that passes the tests, reveals intent, removes duplication, and uses the fewest parts — in that order.
- **IV.3** Refactoring is continuous, not scheduled. Leave code cleaner than you found it, every time you touch it.
- **IV.4** Gates promote inward and in order. An outer ring is not evaluated until the inner ring is green. An invariant violated is a stop, not a warning.
- **IV.5** The goal is courage, not coverage. Tests exist so you can change things without fear; measure that, not a percentage.
- **IV.6** Blocking checks are deterministic. Anything non-deterministic informs but never blocks.

## Canon V — Cost & Constraint
*How we respect the expensive resource, whatever it is on a given project.*

- **V.1** Identify the dominant cost of the system. Make its control a hard invariant, not a preference to be traded away under deadline.
- **V.2** Match the tool to the task's weight. Do not spend the expensive resource on work the cheap one handles correctly.
- **V.3** Cache what is shared and static. Recompute only what changed.
- **V.4** Economics that differ in kind must be reasoned about separately, never averaged into one misleading number.

## Canon VI — Continuity
*How work survives the handoff between one worker and the next — the fluidity Canon.*

- **VI.1** Leave a clean seam. The next worker should find the boundary of your work obvious and its state unambiguous.
- **VI.2** Mark provenance. Label what is real, what is demonstration scaffolding, and what is an unverified assumption.
- **VI.3** Build for reuse deliberately. A pattern that worked is written so the next project inherits it.
- **VI.4** Record the why, not just the what. A decision without its reason can only be blindly kept or blindly broken.
- **VI.5** Layer information by when it is needed. The reader loads the minimum to act; depth is one lookup away, never front-loaded.
- **VI.6** Past assistance is not present authorization. Re-verify inherited conclusions against current ground truth.

---

## When to reach for the Commentary

Read the matching entry in `references/commentary.md` when:

- You are about to parse or decode any external format → **I.1, I.6, II.2**
- A calculation or decode looks correct on sample data → **I.2, I.3** (find a known-answer check)
- You are handling data of uncertain quality → **I.4** (flag, never fake)
- Two sources or documents disagree → **I.5** (measure, don't vote)
- You are drawing a module boundary or placing a dependency → **II.1, II.2, II.6**
- The same fact or value appears in two places → **II.4**
- A displayed/derived value depends on a changing input → **II.5**
- You are naming, sizing, or splitting a function → **III.1, III.2, III.5**
- You feel the urge to keep code "just in case" → **III.4**
- You are writing error handling → **III.7**
- You are deciding what "done" means, or designing tests/CI → **IV.1–IV.6**
- You are making a cost, model-tier, caching, or performance tradeoff → **V.1–V.4**
- You are ending a work session or handing off to another agent → **VI.1–VI.6**

If none of these apply, Tier 1 alone is sufficient — do not load the Commentary.

## Amending the Codex

This is a living standard. When a project teaches a costly lesson, or reality contradicts a law,
read `references/amendment.md` and follow its protocol. Amendments record their *why* (VI.4), keep
Tier 1 short (VI.5), and are themselves subject to evidence (Canon I). The version history at the
bottom of `references/amendment.md` is the ledger of how the standard has evolved.
