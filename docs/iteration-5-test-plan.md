# Iteration 5 — "Tester in the loop": a two-week evaluation

> **Status:** proposed 26 Aug 2026. Owner is both the customer (WORKING_PLAN §5,
> 26 Aug) and the tester. **No new features ship during the window** — see
> *Freeze* below. Ends with a written verdict per dimension and one pull
> decision for Iteration 6.

---

## 0 · Why this iteration exists

Iteration 4 ("First cohort") closed **unfired**: two independent drivers signed
up and never uploaded, so the pull-signal rule never got its answer. The owner
then decided he is the customer. That resolves *who* to build for and leaves
*what to build next* completely open.

Everything the product is known to do is known from **one export**: one car
(Ferrari 488 GTE Evo), one circuit (COTA), one driver, four laps. Every parser
fact, every threshold, every layout decision rests on that single file. This
iteration is where that stops being true.

**The iteration answers one question:** used properly, across real variety,
does this product help a driver go faster — and where does it fall short?

---

## 1 · Freeze, and why it is not optional

**No changes to the ingest path for the full 14 days.** That means
`lib/ingest.js`, the `motec/` parsers, `lib/resample.js`, `lib/cornerDetect.js`.

Parsing happens **client-side at upload**, so a session is permanently shaped by
the bundle that parsed it. Change ingest on day 6 and every session from days
1–5 becomes a different kind of record from days 7–14 — and the comparison
across cars and tracks, which is the entire point of the iteration, is
contaminated. That is not a hypothetical: it is exactly the failure that cost
three exchanges on 26 Aug.

Two consequences accepted deliberately:

- **A parser bug found mid-window does not get fixed mid-window.** It gets
  logged, and the affected combination gets re-driven after the fix. A silent
  data-shape change costs more than a known defect.
- **UI changes are allowed** — rendering, layout, navigation — because they do
  not alter stored data. If a page is unusable, fixing it serves the test rather
  than corrupting it.

**Day 0 exception:** the build marker (§6) lands before the clock starts. It
exists so that "which bundle parsed this?" is answerable at a glance, which is
the one thing that made the 26 Aug diagnosis take three exchanges.

**The backfill waits for day 15.** One pass at the end re-parses every session
from the raw files in Storage, so the whole window becomes internally consistent
under the final parser, and nothing needs re-uploading by hand.

---

## 2 · Coverage: name the properties, not the circuits

The point of variety is not variety. It is **first contact with the code paths a
single GTE-at-COTA export never touched.** Pick real cars and tracks that have
these properties — the properties are what break things.

### Cars — one from each row, minimum

| Property | Why it matters | Class |
| --- | --- | --- |
| **Fuel** energy scheme | The branch the fixture already exercises — the control | GTE, LMP2, LMP3 |
| **Virtual energy** scheme | A *different code branch* in `svm.js` (`VirtualEnergySetting`), never run against a real file | Hypercar, LMGT3 |
| **Much higher grip** | The corner detector's scale is self-normalising — this is where that claim meets reality | Hypercar |
| **Much lower grip / less downforce** | The other end of the same claim | LMP3 or GTE |

### Tracks — three, differing on these axes

| Property | What it stresses |
| --- | --- |
| **A very long straight** | The importance-weighted resampler (does it starve the straight?), and the detector's indifference to straight-to-corner ratio |
| **Tight and low-speed throughout** | Corner density against the 400-point budget; whether corners crowd on the map |
| **Significantly different lap length** | Trace resolution per kilometre — a 3 km lap and a 13 km lap get the same 400 points |
| **Elevation and/or banking** | `G Force Vert`, ride-height channels — completely unexercised |

### Sessions

| Type | Why |
| --- | --- |
| **Practice** | The baseline the fixture is |
| **Qualifying** | Short, one push lap, few laps — does anything assume a long run? |
| **Race** | Traffic, fuel/energy burn, pit stops — the messiest and most realistic |
| **Wet or night, if LMU offers it** | Grip is genuinely different, which is a *real-world* test of the 26 Aug robustness rework rather than a synthetic one |

> **Dependency to confirm on Day 0:** which classes and tracks you actually have
> access to. If Hypercar or LMGT3 is unavailable, the virtual-energy branch stays
> untested and that must be recorded as an open risk rather than quietly skipped.

---

## 3 · The six dimensions, and how each is actually measured

Opinions collected after the fact are unfalsifiable. Each dimension gets a
probe that produces evidence during the session.

### D1 · Utility to the driver — *measured as a prediction hit-rate*

The trap: "did it help?" answered on Sunday about Tuesday is a memory test, not
a measurement.

**Probe — before you drive, after reading the last session:** write down **one
change** you will make, and **what you expect to happen**, with a number.

> *"T11 min speed was 64; I'm braking too early. Target 72, expect −0.2s on the
> lap."*

Then drive, and record what actually happened. Two weeks of this yields a
**hit-rate**: *N of M predictions held.* That number is the honest answer to
"is this useful", and it cannot be argued with afterwards.

A miss is not a failure of the product — a wrong prediction that the data
*explains afterwards* is a hit for the product and a miss for the driver. Record
which of the two it was; that distinction is the finding.

### D2 · Ease of use — *measured with a stopwatch*

**Probe:** from opening the app to knowing the one thing you will change —
**time it.** Record the seconds. Every session.

A number that falls over 14 days means the product is learnable. A number that
stays flat means it is not, and the flatness is the finding. Note separately
anything you had to *re-learn* on a later session — that is a design defect, not
a memory problem.

### D3 · Ease of making changes — *measured as: did the data name the lever?*

> **Ambiguity flagged:** I am reading this as *the driver's* ability to turn a
> reading into a concrete change — setup or technique. If you meant *our*
> ability to change the product (dev velocity), say so and I will swap this
> probe; the plan is otherwise unaffected.

**Probe, per session, two answers:**

1. Did the data tell you **what** to change? (yes / partly / no)
2. If partly or no — **what were you missing?** One line.

The output is a list of **missing levers**, which is a far better backlog than
anything I would guess at. Expect entries like "no brake-pressure trace against
distance" or "cannot see which gear I *should* have been in".

### D4 · Decision-making without agents — *the log of unanswerable questions*

**This is the most valuable artifact of the two weeks, and it is what the agent
phase gets built from.**

**Probe:** every single time you want to know something the app cannot tell you,
write the question down **verbatim, in your own words**, and move on. Do not
tidy it. Do not turn it into a feature request.

> *"Was I losing more in the slow corners or the fast ones?"*
> *"Is my tyre falling off, or am I just driving worse by lap 8?"*
> *"Would a stiffer rear help T3–T6 or hurt T11?"*

Thirty real questions in a driver's own language **is the specification** for
what the ten agents should answer. It beats us guessing by a distance, and it
also reveals which questions need no agent at all — the ones answerable from
data already on disk with better presentation. Those are Phase 1 wins hiding in
plain sight, and they are cheaper than any agent.

**Tag each question:**

| Tag | Meaning |
| --- | --- |
| `HAVE` | Answerable from data we already store — a presentation gap |
| `PARSE` | The channel exists in the export but we do not surface it |
| `DERIVE` | Computable from what we have, but nothing computes it |
| `AGENT` | Genuinely needs reasoning across a session — Phase 2 |
| `EXTERNAL` | Needs data we do not have at all (reference laps, other drivers) |

The `HAVE` / `PARSE` / `DERIVE` piles are Iteration 6's backlog. The `AGENT`
pile is the Phase 2 brief.

### D5 · Ease of navigation — *measured as wrong turns*

**Probe:** count the times you open the wrong tab, or go back because the thing
you wanted was elsewhere. One tally mark each. Note *what you were looking for*
and *where you looked first* — where you looked first is where it belongs.

### D6 · User roles — *a design exercise, and I will not pretend otherwise*

**This dimension cannot be tested by one person, and saying otherwise would be
theatre.** One driver cannot discover what a team needs; RLS already isolates
accounts, and there is nothing multi-user to exercise.

What *can* be done honestly, on Day 13:

- **Model it against real data.** With two weeks of your own sessions on screen,
  answer: if a teammate were in this data, what should they see of yours, and
  what must they never see? Write the answer as a table of role → visible.
- **Use the three existing accounts** to sanity-check the isolation boundary
  from the *outside* — not as a team feature test, but to confirm the wall is
  where we think it is.
- **Name the first thing that would break** if a second real driver joined.

Output is a **role model on paper plus a list of unknowns** — explicitly not a
build. Anything built here would be built for a user who does not exist, which
is the exact overproduction Establish Pull forbids.

---

## 4 · The fourteen days

Week 1 is **breadth** — first contact with new code paths, where breakage lives.
Week 2 is **depth** — repeats and duration, because Progression and stint
averages are *structurally untestable* on one session per combination.

### Week 1 — breadth

| Day | Session | What it is really testing |
| --- | --- | --- |
| **0** | *(no driving)* Build marker ships. Confirm which cars/tracks you have. Create the log file. | Setup |
| **1** | **GTE @ COTA, practice** — the known combination | **The control.** Confirms nothing regressed and gives every later session something to be compared against. Also the first honest run of the D1–D5 probes. |
| **2** | Same car, **different track** | Isolates *track* variables with the car held constant — any difference is the circuit or our handling of it |
| **3** | **Different class**, back at COTA | Isolates *car* variables with the track held constant |
| **4** | **Hypercar or LMGT3** (virtual energy) | First real file through the `VirtualEnergySetting` branch. Highest single-day risk of an outright parse failure. |
| **5** | **LMP2 or LMP3** | The low-grip end of the detector's scale claim |
| **6** | **Wet or night**, any combination | Real-world test of the corner-detection robustness rework — different grip, different temperatures |
| **7** | *(no driving)* First review | Read the six days back. Triage the question log. Decide whether the Week 2 plan needs changing — it probably will. |

### Week 2 — depth

| Day | Session | What it is really testing |
| --- | --- | --- |
| **8** | **Repeat a Week-1 combination** | Progression gets its second point: trend, tier and sparkline appear for the first time on real data |
| **9** | **Repeat a different Week-1 combination** | Two combos with history — the Progression page becomes a comparison rather than a list |
| **10** | **Long run: 12+ laps, no pit** | The **10-lap stint average has never seen real data.** Also tyre degradation, and whether the run-average panel earns its space |
| **11** | **Race session** | Traffic, fuel/energy burn, a pit stop — session-type as a real dimension, and the messiest ingest case |
| **12** | **Deliberately messy**: abort a lap, pit mid-session, spin somewhere | Out-lap/in-lap classification, stint splitting on a gap, and what the corner detector does with a spin. Break it on purpose, once, while it is cheap. |
| **13** | *(no driving)* Roles exercise (D6) + navigation audit (D5) | The two dimensions that need thinking rather than driving |
| **14** | *(no driving)* **Conclude** | Verdict per dimension, question log triaged, Iteration 6 pulled |

**If a day slips, slip the day — do not skip the combination.** The matrix is
the deliverable; the calendar is a convenience. Days 1, 4, 8 and 10 are the
load-bearing ones: the control, the untested code branch, the first repeat, and
the long run.

---

## 5 · Capture: one block per session, in the repo

`docs/test-log-iteration-5.md`, appended to after each session. Versioned, no
build required, and diffable.

Keep it under three minutes to fill in. A capture ritual that takes twenty
minutes gets skipped by day 4, and then the iteration has no evidence.

```markdown
## S07 · 2026-09-02 · LMP3 @ <track> · practice

- PREDICTION (before): brake 10 m later into T4, expect min speed 95 → 102
- OUTCOME: min speed 99, lap −0.08s.  HIT (partial — gained, less than predicted)
- TIME TO INSIGHT: 2m 40s
- DID THE DATA NAME THE LEVER? partly — saw the low min speed, nothing about
  whether the car would take more entry speed
- WRONG TURNS: 2 (looked for stint averages under Performance; they are on the
  session page)
- QUESTIONS:
  - "Was I losing more in slow corners or fast ones?"            [DERIVE]
  - "Is the rear giving up by lap 8 or am I just tired?"          [AGENT]
  - "What gear should I actually be in at T4?"                    [EXTERNAL]
- DEFECTS: corner 14 badge overlaps corner 15 on this track
- BUILD: <sha from the header marker>
```

---

## 6 · Day 0 build: the build marker

The only thing built before the clock starts. Small, and it removes the exact
ambiguity that cost three exchanges on 26 Aug.

- **Commit SHA + build time in the app header**, so "which bundle am I on?" is a
  glance.
- **The parsing build recorded on each session at ingest**, and shown on the
  session page — so "which bundle parsed *this record*?" is also a glance.

The second half is the one that matters. Stale derived data currently looks
identical to a broken feature, and during a 14-day freeze that distinction is
the difference between a real finding and a wasted day.

---

## 7 · Exit criteria — what "concluded" means

The iteration is done when **all** of these are true. Not when 14 days elapse.

| # | Criterion |
| --- | --- |
| E1 | **≥ 8 sessions** logged, across **≥ 3 car classes** and **≥ 3 tracks** |
| E2 | **Both energy schemes** exercised against a real file — fuel *and* virtual energy — or the gap recorded as an open risk with the reason |
| E3 | **≥ 2 combinations** with **≥ 2 sessions each**, so Progression is proven on real history rather than on the one synthetic pair it has today |
| E4 | **≥ 1 session with a 12+ lap unbroken stint**, so the 10-lap average has real data behind it |
| E5 | **Question log ≥ 20 entries**, every one tagged. This is the Phase 2 brief. |
| E6 | **Prediction hit-rate recorded** — N of M, with each miss classified as *driver miss* or *product miss* |
| E7 | **A written verdict per dimension** (D1–D6), each ending in Do Now / Later / Never |
| E8 | **Iteration 6 pulled by the verdict**, not by this document or by anything already in the backlog |

---

## 8 · Risks, named up front

| Risk | Why it is real | Mitigation |
| --- | --- | --- |
| **Sessions do not happen** | 11 driving days in 14 is a lot of sim time alongside a build | Days 1, 4, 8, 10 are load-bearing; the rest can compress. Better 6 sessions covering the matrix than 11 that repeat one combination. |
| **A parse failure on day 4 stops the window** | The virtual-energy branch has never met a real file | Day 4 is deliberately early so there is time to react. If it fails: log it, skip to day 5, fix after day 14. |
| **The capture ritual decays** | It always does | Three minutes, in a file, no tooling. If it is being skipped by day 4, that is itself a finding about the product's own note-taking gap (backlog §6 has "session notes" parked). |
| **The tester is the builder** | Same conflict of interest the customer decision already flagged | The probes are the guard: a stopwatch, a pre-committed prediction and a verbatim question log are all hard to flatter after the fact. |
| **A UI fix mid-window changes what is being evaluated** | Allowed by the freeze, and still a confound | Log the change in the test log on the day it lands, so later sessions are not compared naively against earlier ones. |
| **20 questions is a guess** | It is | If the log hits 20 by day 6, the finding is that the gaps are large and Iteration 6 is obvious. If it struggles to 10 by day 14, that is a *good* result and should be read as one. |

---

## 9 · What this iteration explicitly does not do

- **No new features.** Not one. If something is missing, it goes in the log.
- **No agent work.** The `AGENT` pile is being *collected*, not served.
- **No team or role build.** D6 produces paper.
- **No parser or ingest changes** until day 15, however tempting.

The point of a testing iteration is to end with better information than it
started with. Building during it destroys the measurement.
