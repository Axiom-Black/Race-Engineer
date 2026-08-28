# Iteration 5 — "Tester in the loop": a two-week evaluation

> **Status:** proposed 26 Aug 2026, revised the same day against owner
> corrections (independent accounts, the LMU roster, and what D3 actually
> means). Owner is both the customer (WORKING_PLAN §5, 26 Aug) and the tester.
>
> **Two phases: a short build (Week 0, §5a) then a frozen 14-day window.** Four
> accounts, each an independent user. Ends with a written verdict per dimension
> and one pull decision for Iteration 6.

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

## 2 · Coverage: the LMU roster, with properties attached

**The owner supplied the full LMU track list (26 Aug 2026); the schedule is
sorted against it.** 14 confirmed venues, plus alternate layouts at 12 of them
and the full five-class car roster. The roster and its property columns live in
**`docs/lmu-track-roster.md`** — length, longest straight, official corner
count, corner density, elevation. Those columns are what make the list useful
for choosing *which* track to drive on a given day: a track is a test case, and
what makes it a different test case is the code path it stresses, not its name.

Coverage targets are set on the properties (longest, shortest, densest, longest
straight, real elevation, plus COTA as control) rather than on a track count —
one track can satisfy several, so six targets might take three tracks or six.

**Alternate layouts count as separate test cases**, not duplicates: a removed
chicane or a cut section changes length, corner count and corner density, which
are three of the five columns that decide coverage. **Sarthe — Mulsanne No
Chicanes** is therefore not a curiosity but the single best probe available for
whether `lib/resample.js` starves a very long straight.

The property columns are still blank, so the targets are not yet selectable up
front — but they largely fill themselves, because length, longest straight and
detected corner count are all measured at upload. Only the **official** corner
count needs an outside source. The roster names four day-1 candidates that need
no figures at all; see its §Coverage targets.

### Cars — one from each row, minimum

| Property | Why it matters | Class |
| --- | --- | --- |
| **Fuel** energy scheme | The branch the fixture already exercises — the control | GTE, LMP2, LMP3 |
| **Virtual energy** scheme | A *different code branch* in `svm.js` (`VirtualEnergySetting`), never run against a real file | Hypercar, LMGT3 |
| **Much higher grip** | The corner detector's scale is self-normalising — this is where that claim meets reality | Hypercar |
| **Much lower grip / less downforce** | The other end of the same claim | LMP3 or GTE |

### Sessions

| Type | Why |
| --- | --- |
| **Practice** | The baseline the fixture is |
| **Qualifying** | Short, one push lap, few laps — does anything assume a long run? |
| **Race** | Traffic, fuel/energy burn, pit stops — the messiest and most realistic |
| **Wet or night, if LMU offers it** | Grip is genuinely different, which is a *real-world* test of the 26 Aug robustness rework rather than a synthetic one |

> **Dependency to confirm on Day 0:** which classes you actually have access to.
> If Hypercar and LMGT3 are both unavailable, the virtual-energy branch stays
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

### D3 · Ease of making a change — *the four surfaces where a user changes something*

**Corrected 26 Aug.** This is about **how easily a user can change things in the
product** — not about acting on telemetry, and not about our dev velocity. My
first reading was wrong; the owner's is concrete, and it names four surfaces:

| Surface | State today |
| --- | --- |
| **Session notes, per corner or straight, owned by one user** | ❌ **not built** — parked in WORKING_PLAN §6 |
| **Uploading and deleting session files** | ✅ built (C0, 25 Aug) |
| **Units: imperial ↔ SI** | ❌ **not built** — everything is metric, hard-coded |
| **Percentiles / tier thresholds in Progression** | ✅ built, per user, in `localStorage` |

**Two of the four do not exist, so they cannot be evaluated.** You cannot
measure the ease of changing something that offers no way to change it. That is
what Week 0 (§5a) is for.

**Probe, per surface, four readings:**

1. **Time** to complete the change.
2. **Attempts** — did it work first try?
3. **Did it stick?** Survive a reload, a sign-out, a different browser or device.
4. **Was it reversible?** Could you put it back.

Reading 3 is the one that will find something. Tier thresholds live in
`localStorage`, so they are per *browser*, not per *account* — a driver who signs
in elsewhere silently gets the defaults back. That is a known, logged limitation;
with four independent accounts being exercised it stops being a footnote and
becomes a measurable defect. Whether it matters is exactly what this dimension
is for.

**A design constraint for the notes build, learned the hard way this week:**
**anchor a note to a distance span, never to a corner number.** Corner numbering
is *ours* and derived — the detector changed twice in three days. A note pinned
to "corner 14" is orphaned the moment the detector splits corner 13. Anchoring
to `[dStart, dEnd]` (distance fractions, exactly as the persisted corners are)
covers a corner *and* a straight with one shape, and survives both a re-parse and
a detector change. This is the same lesson as storing corners by `d` rather than
by index, and it is cheaper to get right now than to migrate later.

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

### D6 · User roles — *four independent accounts, tested independently*

**Corrected 26 Aug: each account is an independent user, and roles are tested
per account.** That upgrades this dimension from a paper exercise to real
testing, and it retires my earlier objection — for the individual role.

**What four independent accounts genuinely establish:**

- The **individual role works end-to-end, four times, on different data** — not
  once on the owner's.
- **Isolation from every side.** C4 proved one direction (one account sees 1 of
  4 sessions). Four accounts means querying the boundary from each side, which is
  what "isolated" actually claims.
- **Per-account state really is per-account:** notes, tier thresholds, units,
  demo dismissal. Four accounts is the first configuration where a leak between
  users would be *visible* rather than theoretical.
- The **`localStorage` limitation becomes measurable** — preferences are per
  browser, not per account, so signing into two accounts in one browser is the
  test that exposes it.

**What four accounts still cannot establish, and this is not pedantry:**
anything that needs a second *person* with different goals. What a coach wants
to see of a driver, what a team lead needs, invite and consent flows, whether
shared visibility is even wanted. Four logins driven by one person cannot
generate that — it is one set of goals wearing four hats. Recorded as an open
risk carried into Iteration 6, not silently skipped.

**Probe:** run the full session — sign up or sign in, upload, read, change
something, delete — on each account, and record D1–D5 separately per account.
Then query isolation from each account's side.

## 3a · Week 0 — the build that has to precede the test

**Why this exists.** D3 names four surfaces where a user changes something, and
**two of them do not exist**. You cannot measure the ease of changing a thing
that offers no way to change it, and shipping them *during* the window would
violate the freeze and contaminate every earlier session. So they are built
first, then the clock starts.

This is not scope creep — it is the direct consequence of what D3 turned out to
mean. If the timeline matters more than D3's completeness, the alternative is
stated at the bottom of this section.

| # | Build | Size | Why it gates the window |
| --- | --- | --- | --- |
| **W0.1** | **Build marker** — commit + build time in the header, and the parsing build recorded per session at ingest and shown on the session page | Small | Stale derived data currently looks identical to a broken feature. During a frozen window, that distinction is the difference between a real finding and a wasted day. It cost three exchanges on 26 Aug. |
| **W0.2** | **Units: imperial ↔ SI**, per account | Broad but shallow | Touches every number on screen, so it is a formatting seam plus a stored preference — little logic, wide reach. Also the cheapest possible test of whether per-account preferences work at all. |
| **W0.3** | **Track Notes: a per-user master, sorted by track, annotated by vehicle and conditions** | The real work | Needs a table, an RLS policy, a migration and UI on the map and report — all four **open for discussion** per the owner. Notes outlive the sessions that produced them; the source session is metadata, not ownership. First driver-authored data in the product. |

### W0.3 — Track Notes as a per-user master, owned by the driver

**Owner's design, 26 Aug, and it is better than the session-scoped version I had
been assuming.** Notes are not attached to a session. They live in a **per-user
master, sorted by track**, and each note is **annotated by vehicle and by
environment conditions**. The session a note came from is recorded as
**metadata**, not as ownership.

The consequence is the point: **deleting a session does not delete the knowledge
it produced.** A driver keeps what they learned at a circuit and can still see
which session it came from — and can tell, when that session is gone, that its
source has been removed. Notes accumulate into a track-by-track body of the
driver's own knowledge rather than being scattered across records they may later
tidy up.

That also changes what a note *is*. Session-scoped notes are an audit trail;
a per-user, per-track master annotated by car and conditions is **the driver's
own track guide, built from their own laps** — and it is the natural precursor
to the curated corner dossiers parked for Phase 3, except authored by the driver
rather than by us.

| Field | Why |
| --- | --- |
| **Track** | The sort key. A note is about a place. |
| **Anchor `[dStart, dEnd]`** | Distance span — covers a corner *and* a straight with one shape. **Never a corner number:** numbering is ours and derived, and the detector changed twice in three days, so "corner 14" is orphaned the moment corner 13 splits. Same lesson as persisting corners by `d` rather than index. |
| **Vehicle** | The same corner asks different things of a Hypercar and an LMP3 |
| **Conditions** | Wet/dry, day/night, and temperatures — a note that was true in the dry can be actively wrong in the wet, and an unlabelled note is worse than none |
| **Body** | The driver's words |
| **Source session (metadata)** | Provenance, not ownership. Survives that session's deletion as a dangling reference the UI can label rather than hide. |
| **Owner** | RLS on `auth.uid()`, per the standing bar — a note is one driver's |

**Both open questions answered by the owner, 26 Aug:**

**1 · A note REVISES within a session, and ACCUMULATES across sessions.**

Which is the right split, and it falls out of what a note is *for*. Within one
session a driver is refining a single observation — the second thing they write
about T4 replaces the first, because they have only driven it once and their
understanding of that one run improved. Across sessions they are building
knowledge: T4 in the wet and T4 in the dry are *both true*, and neither should
overwrite the other.

The mechanical consequence: **the unique key is (user, track, anchor, session)**.
Writing again within the same session updates in place; a new session inserts a
new revision alongside. The master then shows a stack per anchor, ordered by
session, each labelled with its vehicle and conditions — which is exactly the
per-corner history a driver would otherwise keep on paper.

It also answers the crowding worry for free: the map shows the **most recent
note whose conditions match the session being viewed**, with a count for the
rest. Relevance, not recency alone.

**2 · When an anchor no longer matches a detected corner, render it on the
trace at its own distance.**

The note is anchored to a place on the road, and the road did not move — only
our numbering of it did. Drawing it at its own `d` keeps it correct regardless
of what the detector does next, and keeps notes independent of a numbering that
is explicitly ours rather than the circuit's. A note that cannot be tied to a
detected corner is not an error state; it is a note beside the track.

**Still open, and genuinely for discussion:** the table shape, the RLS policy,
the migration, and where the UI sits on the map and report.

> **If the timeline matters more:** run the 14 days now against the two surfaces
> that exist (upload/delete, tier thresholds), log the other two as unevaluated,
> and build them in Iteration 6. That is a legitimate trade — it just means D3
> comes back half-answered, and D3 is the dimension most likely to produce
> immediately buildable findings.

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

**Accounts.** Sessions are spread across the four accounts rather than all
landing on one — each is an independent user (D6), so each needs its own history
for Progression to mean anything on it. Suggested split: the two repeat
combinations (days 8–9) stay on **one** account so its Progression page has real
history, and the breadth sessions distribute across the rest. Day 13's isolation
check then queries the boundary from all four sides.

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
| E9 | **All four surfaces in D3 evaluated** — or the unbuilt ones explicitly recorded as unevaluated, with the reason |
| E10 | **Each of the four accounts** has run at least one full session end-to-end (sign in → upload → read → change something → delete), with D1–D5 recorded separately |
| E11 | **Isolation queried from every account's side**, not just one — C4 proved a single direction |
| E12 | **Track roster filled** for every track driven, with official corner counts where a published figure exists (`docs/lmu-track-roster.md`) |

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

- **No features built *during* the 14-day window.** Week 0 builds the two D3
  surfaces that do not exist yet, because D3 is unmeasurable without them; after
  that the window is closed to new work. Anything else missing goes in the log.
- **No agent work.** The `AGENT` pile is being *collected*, not served.
- **No team, coach or invite features.** D6 tests the *individual* role four
  times over. Anything multi-person needs a second person with different goals,
  which four logins driven by one tester cannot supply.
- **No parser or ingest changes** between day 1 and day 14, however tempting.

The point of a testing iteration is to end with better information than it
started with. Building *during* it destroys the measurement; building the thing
being measured *before* it is just prerequisite.
