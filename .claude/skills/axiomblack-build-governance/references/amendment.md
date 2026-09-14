# Axiom Black Build Governance — Amendment Protocol & Version Ledger

> Read this file only when adding to or changing the standard. This is how a living standard stays
> alive without decaying into dogma (never changed) or chaos (changed carelessly).

---

## Why amendment is first-class

A build-governance standard that cannot change becomes wrong the moment the business or the market
moves, and is then either blindly obeyed or quietly ignored — both fatal. A standard that changes
carelessly is no standard at all. This protocol is the deliberate path between those failures.

The five Lean principles themselves are stable canon and are not expected to change — they are
decades-proven. What evolves is the layer beneath them: the **decisions they force**, the anti-patterns,
and how adherence is checked, as Axiom Black builds teach what works. In the rare case a forced
decision is observed to produce worse outcomes, it is the forced decision that is wrong, not the
principle — amend the decision, keep the principle.

---

## When to amend

**Refine a forced decision or check** when a build shows the current operational translation of a
principle is too strict, too loose, or ambiguous in practice. This is the common case.

**Add an anti-pattern** when a build falls into a specific trap worth naming so the next one avoids it.
Named traps are cheap insurance; the best ones come from a real, costly mistake.

**Do not amend the five principles themselves** except with extraordinary justification. They are the
adopted canon. Amendment energy goes into how they are *applied*, not into rewriting Lean.

**Do not amend** for a single inconvenient case. First apply the principle and consult its Commentary.
Amendment is for demonstrated, repeatable friction, not one hard planning session.

---

## How to amend

1. **State the trigger.** What concretely happened in a build — the decision, the outcome — that shows
   the change is needed. Cite the evidence. No trigger, no amendment.
2. **Edit the forced decision** in Tier 1 (`SKILL.md`), and/or the anti-patterns and checks in
   `references/commentary.md`. Keep Tier 1's forced decisions to a tight, actionable few lines each.
3. **Keep Tier 1 short.** If it sprawls, the growth is a signal to sharpen wording, not to pile on.
   Depth belongs in the Commentary; the principles-and-decisions list stays scannable.
4. **Record the why** in the version ledger below: what changed and the reasoning, so a future reader
   can judge whether the reason still holds.
5. **Bump the version.** Minor for a clarified check or anti-pattern; major for a materially changed
   forced decision or a new one.

---

## How an agent should treat a forced decision it disagrees with

- **Never silently ignore one.** Silent divergence is how a standard dies invisibly.
- **If a forced decision is clearly wrong for the case in front of you:** take the better path and
  leave a visible note — in the plan, the PR, or the handoff — stating which decision you diverged
  from, why, and that it is a candidate for amendment. That note is the seam that lets a human decide
  whether it is a one-off or a real amendment.
- **If you are merely unsure:** consult the principle's Commentary entry before diverging.
- **Escalate patterns, not instances.** The third divergence from the same decision for the same
  reason is evidence — open an amendment.

---

## Version ledger

Newest first. Each entry: version, date, what changed, and **why**.

| Version | Date | Change | Why |
| --- | --- | --- | --- |
| 1.1 | 2026-09-02 | Adopted the **80/20 Prioritization Matrix** (potential impact × feasibility → *Do it now!* / *Start planning now* / *Quick wins* / *Review only if you have time*) as standing standard work under **Principle 3 — Create Flow**, and as the ordering rule for pulled items under **Principle 4 — Establish Pull**. Tier 1 gains one forced-decision clause under each; the Commentary gains the quadrant table, the readiness-vs-difficulty distinction, and four anti-patterns. No principle changed. | Trigger: the ByteCraft Racing build produced seven merged PRs in a single day (2 Sep 2026, #51–#57) of which four were fixes to work already reported done — the units conversion that only ever reached one tab, and three successive causes of the same "cannot save the note" report. Separately, a whole Week 0 block had to be inserted mid-iteration because acceptance criterion D3 turned out to be unmeasurable as written. Neither was an engineering failure; both were items started before they were feasible, which Establish Pull cannot catch (demand for all of them was real and present) and which Create Flow's blocker clause did not catch either, because nothing forced feasibility to be *scored* before work began. The matrix supplies the missing scoring step and gives low readiness an action — "start planning now" — instead of a silent park. Recorded as minor: it refines how two existing forced decisions are applied rather than adding a principle. |
| 1.0 | 2026 | Initial standard ratified: the five Lean principles (Define Value, Map the Value Stream, Create Flow, Establish Pull, Pursue Perfection), each paired with the build-time decision it forces, full Commentary, and the ordering rationale. Adopted as the universal build-governance layer above the engineering Codex. | Captured the value-delivery discipline the org had been practicing informally (pull-based backlog, phased gates, continuous refactor) as an explicit, living standard, so every application build is run the same way and the reasoning survives across projects and agent/human handoffs. |

<!--
Amendment entry template (copy, fill, place at top of the ledger):

| X.Y | YYYY-MM-DD | Refined/Added <principle N>: <one line> | <concrete trigger and reasoning> |

Then update the forced decision in SKILL.md (Tier 1) and/or the entry in references/commentary.md.
-->
