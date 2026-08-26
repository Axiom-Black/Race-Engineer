# LMU track roster — with the properties that decide coverage

> **Owner supplies the roster.** Iteration 5's schedule is sorted against this
> list (`docs/iteration-5-test-plan.md` §2). Rows are filled in as tracks are
> confirmed; the property columns are what make the list useful for choosing
> *which* track to drive on a given day.

## Why the properties matter more than the names

A track is a test case. What makes it a *different* test case from the last one
is not its name — it is the code path it stresses. These five columns are the
ones that decide that, and they are the reason the schedule is not just "drive
somewhere new".

| Column | What it stresses | Why we care |
| --- | --- | --- |
| **Length (km)** | Trace resolution per kilometre | A 3 km lap and a 13 km lap both get 400 points. The importance-weighted resampler is supposed to make that survivable; nothing has tested it. |
| **Longest straight** | `lib/resample.js` allocation | A very long straight is where the resampler is meant to spend almost nothing. If it starves the straight too hard the map's geometry visibly cuts. |
| **Corner count (official)** | `lib/cornerDetect.js` | The only external ground truth we have for the detector. COTA's 20 is currently the *entire* evidence base. |
| **Corner density** (corners/km) | Detector + the 400-point budget + map legibility | High density is where badges crowd and where the detector must split rather than merge. |
| **Elevation / banking** | `G Force Vert`, ride-height channels | Completely unexercised. Both are decoded and neither has ever been read against a track known to have gradient. |

Two further axes that are session-level rather than track-level, tracked in the
test log instead: **wet/dry** and **day/night**.

## Roster

Fill `Corners` from the circuit's official numbering — that is the number the
detector is measured against, and the one place an outside source is the arbiter.
Leave a cell blank rather than guessing; a guessed ground truth is worse than
none, because it will be quoted later as if it were measured.

| # | Track | Length (km) | Longest straight | Corners (official) | Corners/km | Elevation / banking | Driven (session IDs) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Circuit of the Americas | 5.513 | ~1.2 km (back straight) | 20 | 3.6 | Significant — T1 climb | S01 *(fixture + first upload)* |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |

> COTA's row is filled from the export we already hold plus the circuit's
> published figures. Everything else awaits the roster.

## Coverage targets for Iteration 5

Chosen so the matrix covers the *properties*, not a track count:

- [ ] The **longest** track on the roster
- [ ] The **shortest** track on the roster
- [ ] The **highest corner density** on the roster
- [ ] The **longest single straight** on the roster
- [ ] One with **real elevation change**
- [ ] COTA, as the control

One track can satisfy several targets — that is the point of listing targets
rather than a number. Six ticks might take three tracks or six.
