# Plan 001 — Notes surface where the car is

Implements `spec.md`. Validated against the constitution below before any code.

## The one design decision

**Put the rule in `lib/notes.js` as a pure predicate, and let all three consumers
call it.** The panel, the map marks, and (later) any other surface must not each
own a copy of "is the car at this note".

```
isAtDistance({dStart, dEnd}, d, tol = GROUP_TOLERANCE) → boolean
stacksForLap(notes, corners, tol) → [{ anchorMid, dStart, dEnd, notes, corner|null }]
stacksAtDistance(stacks, d, tol)  → the subset at d
```

`stacksForLap` is the new primitive and **`attachToCorners` becomes a thin wrapper
over it**, keeping its `{attached, loose}` shape and its existing tests. That is
the point rather than a tidy-up: the spec names the root cause as two collections
with different meanings deciding what a driver sees, so the fix is one list of
stacks that each *know* whether they matched a corner. Corner attachment becomes an
attribute, not a category.

Why a predicate over a span rather than a distance-to-midpoint: a corner note's
anchor is the corner's whole span (60–180 m at COTA). Measuring to the midpoint
would make a note vanish while the car is demonstrably still in the corner it is
about. Inside-the-span is the honest test; the tolerance is the pad on either end.

## Why the tolerance is `GROUP_TOLERANCE` and not a new constant

Two notes within 0.012 of a lap are declared *one stack* — the same place. If
visibility used a different number, two notes in one stack could disagree about
whether they are at the cursor, which is incoherent by construction. Reusing the
constant makes that impossible rather than unlikely. (Standing bar: a *fraction*,
never a metre count — 0.012 is ~66 m at COTA and ~161 m at Le Mans, which is the
intended behaviour, since a place on a longer circuit is coarser.)

## Component wiring

`TrackNotes` currently receives `activeCorner` / `cursorD` **overloaded**: when a
click has picked a place, `SessionReport` passes the *picked* corner and distance
through those same props. That is why the panel cannot show the live tracker and a
held pin at once, which R5 requires.

Rather than re-cut the contract (30 passing tests depend on it, and R10 says they
pass unchanged), add two **additive, optional** props:

| Prop | Meaning |
| --- | --- |
| `activeCorner`, `cursorD` | the **anchor place** — where a new note would go. Unchanged. |
| `liveD` | the **reading place** — where the cursor/tracker is *now*. New, optional. |

A `liveCorner` prop was planned here alongside `liveD` and **dropped during
implementation**: R3 makes visibility blind to corner attachment, so nothing read
it. Lint caught it as an unused parameter. Left in the record because an unused
prop is a promise a component does not keep, and the plan being wrong about one
prop is cheaper to see than to hide.

When nothing is pinned they are the same value, so the props are redundant exactly
when redundancy is harmless. Reading position is `liveD ?? cursorD`, so a caller
that never passes them keeps today's behaviour.

Visible stacks = `stacksAtDistance(stacks, readingD)` ∪ (pinned ? the pinned
stack : ∅), de-duplicated on `anchorMid`.

## Replay

No code. The transport advances `cursor`; `SessionReport` derives `liveD` from the
distance axis; the predicate does the rest. If this section ever needs an
implementation, R4 has been violated and the seam is wrong.

## The discoverability half (R7)

Gating trace notes on position removes something a driver has today, so the panel
gains an **ALL NOTES AT THIS TRACK (n)** section, collapsed, in lap order, each
stack labelled by `T<n>` or its distance. This is the one piece beyond the literal
report; without it the change is a net loss of capability. It reuses `stacksForLap`
and `anchorLabel` — no new rendering primitives.

## Map (R9)

`SessionReport` already builds `noteMarks`; each mark gains `active`, computed with
the same predicate. `CircuitMap` draws an active mark with the pink fill and a
larger radius the corner badges already use for `activeCorner`. No new prop shape,
no second rule.

## Constitution check

| Rule | How this conforms |
| --- | --- |
| Standing bar — thresholds are fractions | Reuses `GROUP_TOLERANCE`, a lap fraction. No metres, no pixels, no sample counts. |
| Standing bar — unreliable data flagged, never hidden | "No corner detected here on this lap" survives as a label (R8), not as a category of note. |
| Standing bar — tenant isolation in the database | Untouched: read-side rendering only, RLS unchanged. |
| DE Codex — logic out of components | The rule is a pure function in `lib/notes.js`, tested without a DOM. |
| DE Codex — one source of truth | Three consumers, one predicate; `attachToCorners` reduced to a wrapper instead of a parallel rule. |
| Build Governance P3 — no silent workaround | The overloaded props are named as the obstacle and worked around *visibly*, in the table above, rather than quietly. |
| Build Governance P4 — no building ahead of pull | Three tempting extensions are parked in the spec's "Out of scope". |
| `d` is the only position | Every comparison is on distance fractions; no `i / (n - 1)`. |

## Risks

1. **A wide corner span plus the tolerance could pad two adjacent corners into each
   other** at a tight circuit. Mitigation: the span comes from the detector's own
   corner window, which is already bounded by the corner; the tolerance is smaller
   than the smallest COTA corner-to-corner gap. Accepted, and it fails *visibly*
   (two stacks shown) rather than silently.
2. **Notes stacked near start/finish** could appear at both d≈0 and d≈1. Not
   introduced by this change (`groupByProximity` has the same seam) and out of
   scope; no wrap-around handling is added, and the spec does not claim any.
