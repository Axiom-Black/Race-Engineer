# Operating checklists

Four checkpoints. Work through the relevant one item by item — the value is in the
items that are annoying to check, because those are the ones that were skipped when
the incidents in `anti-patterns.md` happened.

---

## Opening a phase

- [ ] Stage 0 premise check run, and any failures **reported before planning**
- [ ] Superseded assumptions in inherited documents corrected — with a
      superseded-assumptions banner, not a silent rewrite
- [ ] Stories sliced: independent, small, one acceptance test each
- [ ] Hold list explicit — what is deliberately **not** in this phase, and why
- [ ] Human-Only Action Register scanned; blockers surfaced **now**, not when hit
- [ ] Cost posture stated: what this phase starts spending, at what volume
- [ ] Fixtures confirmed *able to express* the behaviours the phase will claim

## Before requesting a human action

- [ ] Verified the agent genuinely cannot do it (probe once — do not infer)
- [ ] Exact navigation path given
- [ ] Exact values given, copy-pasteable
- [ ] Consequence of skipping it stated
- [ ] What the agent does the moment it is done stated
- [ ] Ordering constraints against other human actions stated
- [ ] Entered in the Human-Only Action Register, not just in chat

## Before opening a PR

- [ ] Branch cut from a freshly fetched protected branch, **not stacked on merged
      history** (`git merge-tree`, not `--contains`)
- [ ] All standing gates green locally, with the **actual numbers** to report
- [ ] Any new gate verified to fail without its fix
- [ ] Any new permission paired with a negative test proving what it denies
- [ ] PII guard run over anything derived from real data
- [ ] Tracker summary **and** detail rows updated together
- [ ] Anything that could not be verified in this environment named as unverified

## Closing a phase

- [ ] Acceptance test of every story demonstrably passed — not "should pass"
- [ ] All five proofs executed; findings recorded
- [ ] Retrospective written, naming the **pattern** across the misses, not just the
      misses
- [ ] Portable methods promoted into the build breadcrumbs / reusable notes
- [ ] Decision log current
- [ ] **This standard revised, and a row appended to its revision log**
- [ ] What is *not* proven stated plainly — especially "not yet proven against real
      users" while there are none

---

## The question that catches the most

Before reporting completion, ask: **did this check run where the user is, or only
where I am?** Every production defect in one real phase — all six — came from a check
that passed in a friendlier environment than the one that mattered.
