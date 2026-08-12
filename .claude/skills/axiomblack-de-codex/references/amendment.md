# The Axiom Black Codex — Amendment Protocol & Version Ledger

> Read this file only when adding or changing a law. This is how a living standard stays alive
> without decaying into either dogma (never changed) or chaos (changed carelessly).

---

## Why amendment is a first-class part of the standard

A standard that cannot change becomes wrong the first time reality moves, and is then either
blindly obeyed (harmful) or quietly ignored (worse — it teaches everyone that the standard is
theater). A standard that changes carelessly is no standard at all. The amendment protocol is the
narrow, deliberate path between those failures.

Per **Canon I (Ground Truth)**, the Codex is itself subject to evidence. A law is not sacred because
it is written here; it is here because it earned its place, and it stays only as long as it keeps
earning it.

---

## When to amend

**Add a law** when a project teaches a lesson costly enough to be worth preventing forever, and no
existing law already covers it. The bar is deliberately high: the best laws in this Codex were each
paid for by a specific, real mistake. A law that cannot point to a concrete failure it prevents is a
platitude, and platitudes dilute the standard — every weak law makes the strong ones easier to ignore.

**Amend a law** when reality contradicts it: the law, applied faithfully, is observed to produce a
worse outcome than ignoring it would. This is evidence, not preference — "I'd rather not" is not
grounds; "here is the case where following it made the system worse" is.

**Retire a law** when the condition that justified it no longer exists, or when it has been
generalized into another law. Retirement is recorded, not silent — a reader who learned the old law
must be able to find out what happened to it.

**Do not amend** for a single inconvenient case. The first response to friction is to apply the law
and consult its Commentary. Amendment is for demonstrated, repeatable wrongness, not for one hard day.

---

## How to amend

1. **State the trigger.** What concretely happened — the project, the decision, the outcome — that
   shows the change is needed. Cite the evidence (Canon I). No trigger, no amendment.
2. **Write or edit the law** in Tier 1 (the skill body, `SKILL.md`). Keep it one imperative line.
3. **Write or edit the Commentary entry** in `references/commentary.md`: the reason, the story that
   earned it, the principle, and how it is enforced. A law without a Commentary entry is incomplete.
4. **Keep Tier 1 short (Canon VI.5).** If adding a law pushes the Standard past what a reader can
   hold in their head, the growth is a signal to *refactor* — group related laws, generalize two
   into one, or retire a weak one — not to let the list sprawl. Depth goes in the Commentary; the
   law list stays scannable.
5. **Record the why (Canon VI.4)** in the version ledger below: what changed, and the reasoning, so
   a future reader can judge whether the reason still holds. A change without its reason cannot be
   safely revisited later — only blindly kept or blindly broken.
6. **Bump the version.** Minor version for a clarified Commentary entry or a reworded law; major
   version for an added, retired, or materially changed law.

---

## How an agent should treat a law it disagrees with

This matters as much as the formal protocol, because most friction happens mid-task, not in a
deliberate amendment session.

- **Never silently ignore a law.** Silent divergence is how a standard dies — invisibly, one
  expedient shortcut at a time.
- **If a law is clearly wrong for the case in front of you:** apply the better path, and leave a
  visible note — in the code, the PR, or the handoff — stating which law you diverged from, why, and
  that it is a candidate for amendment. That note is the seam (Canon VI.1) that lets a human decide
  whether this is a one-off exception or a real amendment.
- **If you are merely unsure:** consult the law's Commentary entry before diverging. Most apparent
  conflicts dissolve once the *why* is understood.
- **Escalate patterns, not instances.** One divergence is an exception. The third time the same law
  is diverged from for the same reason, it is evidence — open an amendment.

---

## Version ledger

Record every change here, newest first. Each entry: version, date, what changed, and **why**.

| Version | Date | Change | Why |
| --- | --- | --- | --- |
| 1.0 | 2026 | Initial Codex ratified: six Canons (Ground Truth, Architecture, Craft, Process, Cost & Constraint, Continuity), thirty-two laws, full Commentary. | Codified the engineering discipline earned across Axiom Black's build work into a single living standard, so it survives across projects and across agent/human handoffs rather than living only in individual memory. |

<!--
Amendment entry template (copy, fill, place at top of the ledger):

| X.Y | YYYY-MM-DD | Added/Amended/Retired law N.M: <one line> | <the concrete trigger and reasoning> |

Then update the corresponding law in SKILL.md (Tier 1) and its entry in references/commentary.md.
-->
