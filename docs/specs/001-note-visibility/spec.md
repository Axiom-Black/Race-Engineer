# Spec 001 — Notes surface where the car is

| Field | Value |
| --- | --- |
| **Status** | Draft → **Accepted** 3 Sep 2026 |
| **Matrix quadrant** | **Do it now!** — high impact (notes are a D3 surface under test in the window, and half of them are unreadable during a replay), high feasibility (one component, one pure helper, no schema, existing tests to extend) |
| **Pull signal** | Owner report, 3 Sep 2026, driving the live app |
| **Constitution** | Axiom Black DE Codex · Build Governance v1.1 · `WORKING_PLAN.md` §4 standing bars |
| **Touches schema** | No |

---

## The report, verbatim

> "On the Track Map, the Corner Notes save differently than the Trace Notes. When
> the cursor is in play, the trace notes are always show, while the corner notes
> are only shown when at the point tagged on the Map. I want in both cases the
> notes to show-up if the cursor hovers on that point on the track or if the
> during the play the moving tracker passes that point."

## What is actually wrong

`TrackNotes.jsx` decides visibility twice, with rules of different *kinds*:

- **Corner-attached notes** render inside `{here && …}`, and `here` is derived from
  `targetCorner` — so a note is visible only while the cursor sits inside a
  *detected corner*, and only that corner's stack.
- **Trace notes** render inside `{loose.length > 0 && …}` — every one of them, all
  the time, regardless of where the cursor is.

So it is not that one is gated too tightly and the other too loosely. One is
selected **by cursor position**; the other is **not selected at all**. Whichever
behaviour is preferred, having both is the defect.

The deeper cause is that `attachToCorners` returns two collections with different
meanings — a `Map` keyed by corner number and a bare list — and the panel let that
*implementation* split decide what a driver sees. A note's identity is a place on
the road (`lib/notes.js` decision 1); whether today's detector happens to call
that place a corner is a rendering detail and must not change the reading rule.

## Goal

**One rule decides visibility, for every note: is the live track position at this
note's place?** Corner-attached and trace notes are the same thing to a driver.

Because hover-scrub and replay both drive the same `cursor`, "the tracker passes
that point" needs no second mechanism — it falls out for free, which is the tell
that this is the right seam.

## Non-goals

Stated because an agent (or I) will otherwise widen this on the way through:

- **No schema change and no migration.** Visibility is a read concern.
- **No change to anchoring, keying, or saving** — `anchorKey`, `buildNoteRow`, the
  unique key, the revise-within-a-session rule all stand.
- **No change to `pickForSession`.** *Which* note inside a stack is shown stays
  ranked on car → conditions → recency. This spec decides *whether* a stack shows.
- **No change to pin/pick semantics for writing.** The pin exists so the pointer
  can leave the map without re-pointing the note; that stays exactly as is.
- **No pixel or metre tolerance.** Fractions only, per the standing bar.
- **No map popovers, tooltips, or note editing from the map**, no auto-scrolling the
  panel, no sound, no animation on pass.
- **Corner numbering does not become an identity.** It remains a label.
- **No "notes ahead of the car" preview** during replay. Tempting; not asked for.

## Functional requirements

**R1 · At-the-cursor is proximity in lap distance.** A stack is at the cursor when
the cursor's distance fraction lies inside `[dStart, dEnd]`, or within
`GROUP_TOLERANCE` of that span.

**R2 · The tolerance is the grouping tolerance, not a new constant.** Reusing
`GROUP_TOLERANCE` (0.012 of a lap ≈ 66 m at COTA) is deliberate: it is the same
number that decides two notes are about *one place*. A separate visibility
tolerance would permit the incoherent state where two notes are grouped into one
stack but only one of them is "here".

**R3 · Selection is blind to corner attachment.** The rule runs over all notes at
the track. Whether a stack also matched a detected corner changes only its
*label*, never whether it appears.

**R4 · Replay uses no separate rule.** The transport advances `cursor`; `cursorD`
follows; R1 applies. (If this requires new code, the design is wrong.)

**R5 · A held pin shows its own place too.** While a note is pinned or picked, the
pinned stack is visible *in addition* to the live one — a driver revising T20
must see what they already wrote about T20 while the tracker moves on.

**R6 · Nothing at the cursor renders nothing.** No empty shell, no "no notes here"
row on every straight.

**R7 · Gating must not cost discoverability.** Trace notes are visible
unconditionally today; making them positional removes a driver's ability to simply
*see their notes*. So the panel also carries the complete list for the track, in
lap order, collapsed behind a count, each entry labelled with its place.

**R8 · Each stack is labelled by what it is.** `T7` when it attached to a detected
corner; the distance label otherwise. "No corner detected here on this lap" stays
available as an explanation, because it is honest and is not an error.

**R9 · The map agrees with the panel.** The note mark for a stack at the cursor is
drawn highlighted, the way a corner badge lights when the cursor is inside it.
Same rule, same instant, two places.

## Acceptance criteria

Given–When–Then, each one a test that fails before the change:

1. **Corner note surfaces on hover.**
   *Given* a note anchored inside detected corner T5, *when* the cursor is at T5's
   distance, *then* its body is in the panel. *(passes today)*
2. **Corner note surfaces as the tracker passes.**
   *Given* the same note, *when* the cursor advances to T5's distance with no
   corner object supplied for the cursor position (replay drives distance, and a
   lap re-detected differently may not call T5 a corner), *then* its body is in
   the panel. *(fails today — gated on `targetCorner`)*
3. **Trace note surfaces on hover.**
   *Given* a note on a straight at d = 0.60, *when* the cursor is at 0.60, *then*
   its body is in the panel. *(passes today, for the wrong reason)*
4. **Trace note is NOT shown from elsewhere on the lap.**
   *Given* the same note, *when* the cursor is at d = 0.10, *then* its body is not
   in the "here" block. *(fails today — always rendered)*
5. **Corner note is NOT shown from elsewhere on the lap.**
   *Given* the T5 note, *when* the cursor is at d = 0.60, *then* its body is not in
   the "here" block. *(passes today)*
6. **Both kinds behave identically.** The same cursor sweep over a lap holding one
   corner note and one trace note shows each exactly while the cursor is at it —
   asserted as one test over both, so the two rules cannot drift apart again.
7. **A held pin keeps its place visible.**
   *Given* a note at T20 and a pin at T20, *when* the cursor moves to d = 0.10,
   *then* the T20 note is still shown.
8. **Every note stays reachable.**
   *Given* three notes spread around the lap and a cursor at none of them, *when*
   the driver opens the full list, *then* all three bodies are present, each with
   its place label.
9. **The map highlights the mark at the cursor.**
   *Given* a note mark at the cursor's distance, *then* that mark renders in its
   active form and the others do not.
10. **No regression in writing.** The existing 30 panel tests pass unchanged —
    pinning, revising, deleting, orphan provenance, save payloads.

    > **This requirement was wrong, and is left here rather than edited away.**
    > 29 of the 30 passed untouched. One — *"renders a note with no detected
    > corner, on the trace rather than as an error"* — asserted the note was
    > visible with the cursor at T5, which **is** the reported defect seen from
    > the other side. It was rewritten to hold the cursor at the note's own place;
    > its original claim (a note the detector no longer calls a corner is not an
    > error) survives intact and is still asserted. A spec is a decision record,
    > so the value of having written it first is being able to see where it was
    > wrong.

11. **Revising works on a straight** (found while implementing, fixed by the same
    unification): `mine` was read from the corner-keyed map, so a second note at
    the same place in the same session read as *new* anywhere outside a detected
    corner — and would then have collided on the unique key.

## Out of scope, parked (not pulled)

- Notes visible on the Instruments tab's distance plots.
- A lap-strip note gutter under the trace plots.
- "Next note in N metres" during replay.

---

*Spec-driven development: this file says **what** and **what not**. `plan.md` says
**how**. `tasks.md` says **in what order**. Nothing was coded before all three
existed — see `docs/spec-driven-development.md`.*
