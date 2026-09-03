# Tasks 001 — Notes surface where the car is

Executed in order. Foundational (pure logic) first, then the surfaces, then the
proof. Each task names the requirement it serves and how it is checked.

| # | Task | Serves | Done when |
| --- | --- | --- | --- |
| T1 | `isAtDistance(span, d, tol)` in `lib/notes.js` — inside-span or within tolerance; null-safe on both ends | R1, R2 | Unit tests: inside, on each edge, one tolerance out, past tolerance, zero-width point note, garbage input |
| T2 | `stacksForLap(notes, corners, tol)` — one lap-ordered list, each stack carrying `corner` or null | R3, root cause | Unit test: a corner note and a trace note come back in one list, in lap order, with `corner` set on exactly the first |
| T3 | Reduce `attachToCorners` to a wrapper over T2 | R3, DE Codex one-source | Its existing tests pass untouched |
| T4 | `stacksAtDistance(stacks, d, tol)` | R1, R4 | Unit test: selects only the stack at `d`, over a lap holding several |
| T5 | `TrackNotes`: read position `liveD ?? cursorD`; render every stack at it, labelled per R8 | R1, R3, R6, R8 | Acceptance 1–6 |
| T6 | `TrackNotes`: union the held pin's stack with the live one | R5 | Acceptance 7 |
| T7 | `TrackNotes`: **ALL NOTES AT THIS TRACK (n)** collapsed section | R7 | Acceptance 8 |
| T8 | `SessionReport`: pass `liveCorner` / `liveD`; mark `active` on `noteMarks` | R4, R9 | Acceptance 9 wiring |
| T9 | `CircuitMap`: draw an active note mark distinctly | R9 | Acceptance 9 |
| T10 | Delete the unconditional `loose` block | R1 | No always-on note rendering remains |
| T11 | Break each new rule deliberately and watch its own test go red | Breadcrumb A19 | Every new test fails for its own reason, logged in the trail |
| T12 | Ring 4 + lint + build; WORKING_PLAN §0/§5; breadcrumb entry | Gates | Green, tracker updated |

## Sequencing note

T1–T4 are pure and testable with no DOM, so they land before any component
changes — which means T5–T7 are wiring, not design. T11 exists as its own task
because the last three sessions all shipped a defect behind a green suite; writing
the assertion is the easy half.
