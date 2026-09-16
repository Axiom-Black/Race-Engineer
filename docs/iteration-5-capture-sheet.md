# Iteration 5 — capture sheet

**This is the thing you write in, and this file is CANONICAL.** One pre-stamped
block per day, already carrying what that day is for, so you never re-derive the
structure at 11pm after a stint. Definitions live in
`docs/iteration-5-test-plan.md`; the narrative log lives in
`docs/test-log-iteration-5.md`. This file is the worksheet between them.

> **There is a printable rendering of this sheet** — one page per day, screen or
> paper — at <https://claude.ai/artifact/AAPSZTm3qADVRHbCFz9uqp>. It is a
> *rendering*, not a second source. **Change this file; re-render the page.**
> Never the other way round, and never both.
>
> This repo has already logged what happens otherwise: two copies of a rule is
> one copy plus a future contradiction, and **the losing copy is whichever an
> agent reads first** (§5, 3 Sep 2026 — the reason Spec Kit's CLI was refused).
> The page is convenient precisely because it is downstream. If it ever
> disagrees with this file, this file wins and the page is stale.

> **Three minutes per block, hard.** Every field below is one line. If a block is
> taking longer, leave the field blank and write `—` — a blank is data (you
> didn't have it) and a skipped block is not. **The capture ritual decaying is
> itself a finding** (§8), so record the decay rather than hiding it.

---

## How to use this in the two minutes before you drive

Fill **PRE** only. It is two lines and it must be written *before* the car moves,
or D1 is a memory test rather than a measurement.

Everything else is filled after, with the app open.

---

## Field key — what each line feeds

| Field | Dim | Why this exact wording |
| --- | --- | --- |
| **PRE · change** | D1 | One change. Not a list — a list cannot be scored. |
| **PRE · expect** | D1 | Must carry **a number**. "Faster" is unfalsifiable. |
| **OUTCOME** | D1 | HIT / MISS, then **driver miss** or **product miss**. A wrong prediction the data explains afterwards is a HIT for the product. |
| **TIME TO INSIGHT** | D2 | App open → you know the one thing you'll change. Seconds. |
| **RE-LEARNED** | D2 | Anything you had to work out again. A design defect, not a memory problem. |
| **CHANGED** | D3 | Which of the four surfaces you touched, with its four readings. |
| **QUESTIONS** | D4 | **Verbatim, your words, untidied.** Tag each. This is the Phase 2 brief. |
| **WRONG TURNS** | D5 | Tally + *what you wanted* and *where you looked first*. Where you looked first is where it belongs. |
| **ACCT** | D6 | Which of the four accounts. Spread them. |
| **BUILD** | — | SHA from the header marker. Makes "which bundle parsed this?" a glance. |
| **DEFECTS** | — | Anything broken. Under the freeze most get logged, not fixed. |

**Question tags:** `HAVE` (we store it, we don't show it) · `PARSE` (channel
exists, unsurfaced) · `DERIVE` (computable, uncomputed) · `AGENT` (needs
reasoning — Phase 2) · `EXTERNAL` (data we don't hold at all).

**Change surfaces (D3), four readings each:** time · attempts · **did it stick
across reload / sign-out / another browser** · was it reversible. Reading 3 is
the one that will find something — tier thresholds live in `localStorage`, so
they are per *browser*, not per *account*.

---

## Block — copy this for any unscheduled session

```
## S__ · DATE · CAR @ TRACK · TYPE · acct _

PRE  · change:
PRE  · expect (with a number):

OUTCOME:                    HIT / MISS   (driver miss | product miss)
TIME TO INSIGHT:            __m __s
RE-LEARNED:
CHANGED [D3]:               notes | upload | delete | units | percentiles
   time:___  attempts:___  stuck after reload/signout? Y/N  reversible? Y/N
WRONG TURNS [D5]:           __  — wanted ______ , looked in ______ first
QUESTIONS [D4]:
   "                                                      "  [TAG]
   "                                                      "  [TAG]
DEFECTS:
BUILD:
```

**First session at a venue also gets the Andretti block (D1b):**

```
ANDRETTI [D1b] — once per venue, timed
   ANNOTATED:        __ of __ detected corners, from the app alone
   FETCHED (app knew):                    TYPED:
   COULD NOT EXPRESS (verbatim):  "                                    "
   TIME: __m __s      STALLED AT:
   Would another driver find this useful as handed over?   Y / N — why:
```

> Two outcomes are **pre-committed** so this cannot be graded generously after
> the fact: **gear-per-corner should need no typing** (`gearAtApex` is on every
> corner badge — if you type it, the defect is ours), and **camber and gradient
> cannot be derived** — that is the argument for notes existing, not a gap.

---

# The fourteen days

Each block is pre-stamped with what that day is actually testing. **If a day
slips, slip the day — do not skip the combination.** Days 1, 4, 8 and 10 are
load-bearing: the control, the untested branch, the first repeat, the long run.

---

## Day 0 · setup — no scored driving

Pre-flight, the virtual-energy branch. Run it **before Day 1**: ingest freezes
for 14 days and this is the one decode path that has never met a real file.

- [ ] Hypercar **or** LMGT3 session exported (`.ld` + `.ldx` + `.svm`)
- [ ] Uploads and ingests without error
- [ ] Setup panel shows an **energy** figure, not fuel — and it reads plausibly: ______
- [ ] Corner count and lap times sane for the circuit: ______
- [ ] **Session deleted** (pre-flight, not a scored run — it must not enter the matrix)

**RESULT: PASS / FAIL** — ________________________________________________

If FAIL, stop and report before Day 1. A failure found now is legal to fix; on
day 4 it costs both virtual-energy classes for the whole window.

---

## Day 1 · GTE @ COTA, practice — **THE CONTROL**

Testing: that nothing regressed, and giving every later session something to be
compared against. Also the first honest run of D1–D5.

```
PRE  · change:
PRE  · expect (with a number):

OUTCOME:                    HIT / MISS   (driver miss | product miss)
TIME TO INSIGHT:            __m __s          ← this is your baseline for D2
RE-LEARNED:
CHANGED [D3]:
   time:___  attempts:___  stuck? Y/N  reversible? Y/N
WRONG TURNS [D5]:           __  — wanted ______ , looked in ______ first
QUESTIONS [D4]:
   "                                                      "  [TAG]
   "                                                      "  [TAG]
DEFECTS:
ACCT: _    BUILD: ____________      ← record the SHA; this is the window's opening build
```

**ANDRETTI [D1b] — COTA is a venue, so it gets the block.** COTA is also the one
circuit we have ground truth for: **20 official corners, 20 detected.** If
coverage is below 20 here, the gap is presentation, not detection.

```
   ANNOTATED: __ of 20      FETCHED:              TYPED:
   COULD NOT EXPRESS: "                                              "
   TIME: __m __s    STALLED AT:
```

---

## Day 2 · same car (GTE), **different track**

Testing: *track* variables with the car held constant. Any difference is the
circuit or our handling of it.

```
Track chosen: ____________   why (which roster property it covers): ____________

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s     vs Day 1: ____
RE-LEARNED:
CHANGED [D3]:            time:___ attempts:___ stuck? Y/N  reversible? Y/N
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
                 "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
```

**ANDRETTI [D1b] — new venue.**

```
   ANNOTATED: __ of __     FETCHED:              TYPED:
   COULD NOT EXPRESS: "                                              "
   TIME: __m __s    STALLED AT:
   Detected corners: __    Official (if known): __    → roster [E12]
```

---

## Day 3 · **different class**, back at COTA

Testing: *car* variables with the track held constant. COTA is the control
circuit, so anything that moves is the car or our handling of it.

```
Class: ____________

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
RE-LEARNED:
CHANGED [D3]:            time:___ attempts:___ stuck? Y/N  reversible? Y/N
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
                 "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
```

**Corner count at COTA in a different class: __ of 20.** The detector's scale is
claimed self-normalising across a 27× capability range. Same track, different
grip, is the cheapest test of that claim you will run all fortnight — **if this
is not 20, say so loudly.**

---

## Day 4 · **Hypercar or LMGT3** — virtual energy · **LOAD-BEARING**

Testing: the first *scored* real file through the `VirtualEnergySetting` branch.
Day 0's pre-flight was a smoke test and was deleted; this one counts.

```
Car: ____________        Pre-flight on Day 0 was: PASS / FAIL

INGEST:             clean / warning / failed — ____________________
ENERGY FIGURE:      shown? Y/N     value: ______   plausible? Y/N
PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
RE-LEARNED:
CHANGED [D3]:            time:___ attempts:___ stuck? Y/N  reversible? Y/N
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
                 "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
```

> **If it fails here: log it, skip to Day 5, fix after Day 14.** Do not fix it
> mid-window. A silent data-shape change costs more than a known defect — every
> session before the change becomes a different kind of record from every one
> after, and the cross-car comparison that is the whole point is contaminated.
> This satisfies **E2** either way: both schemes exercised, *or* the gap recorded
> as an open risk with the reason.

---

## Day 5 · **LMP2 or LMP3** — the low-grip end

Testing: the other end of the detector's self-normalising claim. Day 4 was high
grip; this is low.

```
Car: ____________     Track: ____________

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
RE-LEARNED:
CHANGED [D3]:            time:___ attempts:___ stuck? Y/N  reversible? Y/N
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
                 "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
Detected corners: __ vs official __ (same track in another class? __)
```

---

## Day 6 · **wet or night**

Testing: real-world grip and temperature variation against the corner-detection
robustness rework. This is the first session where **conditions** on a note
actually matter — a note true in the dry can be actively wrong in the wet.

```
Conditions: wet / night / both     Car: ________  Track: ________

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
RE-LEARNED:
CHANGED [D3]:            time:___ attempts:___ stuck? Y/N  reversible? Y/N
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
                 "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________

NOTES IN THE WET: did a dry note show that should not have?   Y / N — ________
   (conditions labelling is the thing under test here, not the note text)
Corner count vs the same track dry: __ vs __
```

---

## Day 7 · **first review** — no driving

Read the six days back. This is where the Week 2 plan changes, and it probably
should.

```
Sessions logged:  __ / 6        Classes: __        Tracks: __
Questions logged: __     HAVE __  PARSE __  DERIVE __  AGENT __  EXTERNAL __
Prediction hit-rate so far:  __ of __     product misses: __
Median time to insight:  __m __s     Day 1: ____  →  Day 6: ____
   ↑ falling means learnable. FLAT IS THE FINDING.
Wrong turns total: __     most common: ________________________

Capture ritual honest check: did any block get skipped? Y/N — which, and why:
   (§8 names this: if it is decaying by day 4, that is a finding about OUR
    note-taking gap, not a discipline failure)

WEEK 2 CHANGES: ______________________________________________________
Anything in the AGENT pile that is actually HAVE on a second read? ___________
```

---

## Day 8 · **repeat a Week-1 combination** · **LOAD-BEARING**

Testing: Progression gets its second point. Trend, tier and sparkline appear on
real data for the first time. **Keep days 8–9 on one account** so its Progression
page has real history.

```
Repeating: ____________ (from Day __)       ACCT: _

PROGRESSION APPEARED?   trend Y/N    tier Y/N    sparkline Y/N
GAP TO OWN BEST shown?  Y/N      value: ______     ← this is the KPI
Is the comparison legible without explanation?  Y / N — ________________

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
CHANGED [D3] percentiles:  time:___ attempts:___ stuck? Y/N  reversible? Y/N
   ↑ do this one HERE — Progression is the only place tier thresholds mean anything
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
DEFECTS:                BUILD: __________
```

---

## Day 9 · **repeat a different Week-1 combination**

Testing: with two combos carrying history, Progression becomes a comparison
rather than a list. **[E3] needs exactly this: ≥2 combinations with ≥2 sessions.**

```
Repeating: ____________ (from Day __)       ACCT: _   (same as Day 8)

Two combos side by side — does the page compare, or just list?  ______________
PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
DEFECTS:                BUILD: __________
```

---

## Day 10 · **long run, 12+ laps, no pit** · **LOAD-BEARING**

Testing: the **10-lap stint average has never seen real data.** Also tyre
degradation over a real stint, and whether the run-average panel earns its space.

```
Laps completed unbroken: __      Pit? Y/N

10-LAP AVERAGE:  appeared? Y/N     value: ______   believable? Y/N
Does it EARN ITS SPACE?   keep / shrink / cut — why: ____________________
Tyre drop-off visible in the data?  Y/N — where did you see it: ____________
   (if you felt it but could not see it, that is a QUESTION, not a defect)

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
                 "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
```

---

## Day 11 · **race session**

Testing: traffic, fuel/energy burn, a pit stop. Session type as a real dimension,
and the messiest ingest case the product will meet.

```
Car: ________  Track: ________   Laps: __   Pit stops: __

INGEST:   clean / warning / failed — ____________________
Out-lap / in-lap classified correctly?   Y / N — ________________
Fuel or energy burn legible across the race?   Y / N
Did traffic laps distort anything (best lap, averages, corner detection)? ______

PRE  · change:                          PRE · expect:
OUTCOME:            HIT / MISS (driver | product)
TIME TO INSIGHT:    __m __s
WRONG TURNS [D5]: __ — wanted ______ , looked ______ first
QUESTIONS [D4]:  "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
```

---

## Day 12 · **deliberately messy** — break it on purpose

Testing: abort a lap, pit mid-session, spin somewhere. Out-lap/in-lap
classification, stint splitting on a gap, and what the corner detector does with
a spin. **Do this once, while it is cheap.**

```
What you did:  aborted lap __ / pitted lap __ / spun at ____________

SPIN — what did the corner detector do with it?  ____________________
   (a spin is huge sustained lateral load that is not a corner — the two-pass
    median yardstick should absorb it; if corner count jumps, that is the finding)
Corner count this lap: __     vs a clean lap: __
Stint split on the pit gap?   Y / N
Aborted lap: excluded / included / counted as a best lap (!)  ______________
Anything crash, blank, or render nonsense?  ____________________

QUESTIONS [D4]:  "                                         " [TAG]
DEFECTS:                ACCT: _    BUILD: __________
```

---

## Day 13 · **roles + navigation audit** — no driving

The two dimensions that need thinking rather than driving.

### D6 · four accounts

| Acct | Full run end-to-end? | Isolation queried **from this side**? | Prefs held? | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |

Full run = sign in → upload → read → change something → delete, **with D1–D5
recorded separately** [E10]. Isolation must be queried from *every* side [E11] —
C4 only ever proved one direction.

```
THE localStorage TEST — sign into two accounts in ONE browser:
   Did account 2 inherit account 1's units?        Y / N
   Did account 2 inherit account 1's percentiles?  Y / N
   ↑ A yes is the known limitation becoming a measurable defect. Whether it
     MATTERS is exactly what D6 exists to answer — record your reaction as a
     driver, not as the person who knows why it happens.

Notes: are they per-account?  Y / N     Demo dismissal: per-account?  Y / N
```

### D5 · navigation audit

| # | What you wanted | Where you looked first | Where it actually is |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

**Where you looked first is where it belongs.** Every row where columns 2 and 3
differ is a navigation defect with its own fix already written in column 2.

---

## Day 14 · **conclude** — no driving

A verdict per dimension. Each ends in **Do Now / Later / Never** [E7].

| Dim | Verdict — one paragraph, ending in Do Now / Later / Never |
| --- | --- |
| **D1** utility (hit-rate __ of __) | |
| **D1b** Andretti (venues run __ of __) | |
| **D2** ease of use (Day 1 ____ → Day 12 ____) | |
| **D3** ease of change (surfaces evaluated __ of 4) | |
| **D4** decisions without agents (__ questions) | |
| **D5** navigation (__ wrong turns) | |
| **D6** roles (accounts full-run __ of 4) | |

```
ITERATION 6 IS PULLED BY: ______________________________________________
   [E8] — it must come from the verdict above, NOT from this document and NOT
   from anything already sitting in the backlog. If what you pull was already
   in §6, say so explicitly: that means the fortnight told you nothing new,
   which is itself a result worth recording honestly.

QUESTION LOG TRIAGE:
   HAVE ___ → Iteration 6 backlog (cheapest wins in the product)
   PARSE ___ → Iteration 6 backlog
   DERIVE ___ → Iteration 6 backlog
   AGENT ___ → the Phase 2 brief
   EXTERNAL ___ → Phase 3 dossiers / not ours to answer
```

---

# Exit criteria tracker — tick as you go, not at the end

The iteration is done when **all** of these are true. **Not when 14 days
elapse.**

| # | Criterion | Target | Now | ✓ |
| --- | --- | --- | --- | --- |
| E1 | Sessions logged | ≥ 8 | | |
| E1 | Car classes | ≥ 3 | | |
| E1 | Tracks | ≥ 3 | | |
| E2 | Both energy schemes on a real file | fuel + virtual | | |
| E3 | Combinations with ≥ 2 sessions | ≥ 2 | | |
| E4 | Session with a 12+ lap unbroken stint | ≥ 1 | | |
| E5 | Questions logged, every one tagged | ≥ 20 | | |
| E6 | Prediction hit-rate, misses classified | N of M | | |
| E6b | Andretti test at every venue driven | all | | |
| E7 | Written verdict per dimension | 7 | | |
| E8 | Iteration 6 pulled by the verdict | — | | |
| E9 | All four D3 surfaces evaluated | 4 | | |
| E10 | Accounts with a full end-to-end run | 4 | | |
| E11 | Isolation queried from every side | 4 | | |
| E12 | Roster filled for every track driven | all | | |

**E2, E9 and E6b can be satisfied by a recorded gap** — "not run, because ___" is
a legitimate close. The others cannot.

**On E5:** twenty is a guess and is named as one. Hitting 20 by day 6 means the
gaps are large and Iteration 6 is obvious. Struggling to 10 by day 14 is a
**good** result and must be read as one — not as a failure to try hard enough.

---

# Running tallies

Update at the two reviews. Copy into `docs/test-log-iteration-5.md` when you
close the window.

| Metric | Day 7 | Day 14 |
| --- | --- | --- |
| Sessions logged | | |
| Car classes covered | | |
| Tracks covered | | |
| Combos with ≥ 2 sessions | | |
| Longest unbroken stint (laps) | | |
| Accounts with a full end-to-end run | / 4 | / 4 |
| Prediction hit-rate | | |
| — of which *product* misses | | |
| Median time to insight | | |
| Questions logged | | |
| — of which `AGENT` | | |
| Wrong turns (total) | | |
| Andretti venues run | | |

---

# The freeze, in one box — read before you "just fix" anything

**Frozen for 14 days:** `lib/ingest.js` · `motec/` · `lib/resample.js` ·
`lib/cornerDetect.js`.

**Allowed:** UI — rendering, layout, navigation. They do not alter stored data.

**A parser bug found mid-window is logged, not fixed.** The affected combination
gets re-driven after Day 14's backfill. Parsing happens client-side at upload, so
a session is permanently shaped by the bundle that parsed it: change ingest on
day 6 and days 1–5 become a different kind of record from days 7–14, and the
comparison across cars and tracks — the entire point of the fortnight — is
contaminated.

**If a UI fix does land mid-window, log it on the day**, so later sessions are
not naively compared against earlier ones. That confound is allowed; it is not
invisible.
