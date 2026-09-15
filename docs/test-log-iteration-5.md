# Iteration 5 — test log

One block per session, appended as they happen. Plan and probe definitions:
`docs/iteration-5-test-plan.md`. **Pre-stamped worksheet to write in while
testing — one block per day, already carrying what that day is for:
`docs/iteration-5-capture-sheet.md`.**

| Window | Value |
| --- | --- |
| **Day 0** | 14 Sep 2026 |
| **Classes available** | **All five** — Hypercar, LMGT3, LMP2, LMP3, GTE (confirmed by owner, Day 0) |
| **Ingest freeze** | In force from Day 1. `lib/ingest.js`, `motec/`, `lib/resample.js`, `lib/cornerDetect.js` — **no changes for 14 days.** UI changes allowed. |
| **Backfill (T7)** | Held until Day 15, deliberately |
| **Build at window open** | record the header SHA in the Day 1 block |

**Keep each block under three minutes to write.** A capture ritual that takes
twenty minutes gets skipped by day 4, and then the iteration has no evidence.

Question tags: `HAVE` (presentation gap) · `PARSE` (channel exists, unsurfaced) ·
`DERIVE` (computable, uncomputed) · `AGENT` (needs reasoning, Phase 2) ·
`EXTERNAL` (data we do not hold).

---

## Template — copy this

```markdown
## S00 · YYYY-MM-DD · <car> @ <track> · <session type> · acct <1-4>

- PREDICTION (before driving):
- OUTCOME:                          HIT / MISS (driver miss | product miss)
- TIME TO INSIGHT:
- CHANGE MADE THIS SESSION:         notes | upload | delete | units | percentiles
  - time:            attempts:      stuck after reload/signout:      reversible:
- WRONG TURNS:                      n —
- QUESTIONS:
  - ""                              [TAG]
- DEFECTS:
- BUILD:                            <sha from header marker>
```

---

## Running tallies

Updated at each review (day 7, day 14).

| Metric | Day 7 | Day 14 |
| --- | --- | --- |
| Sessions logged | | |
| Car classes covered | | |
| Tracks covered (of roster) | | |
| Combos with ≥2 sessions | | |
| Longest unbroken stint (laps) | | |
| Accounts with a full end-to-end run | / 4 | / 4 |
| Prediction hit-rate | | |
| Median time to insight | | |
| Questions logged | | |
| — of which `AGENT` | | |
| Wrong turns (total) | | |

### D3 · the four change surfaces

| Surface | Evaluated? | Time | Stuck? | Notes |
| --- | --- | --- | --- | --- |
| Session notes (corner / straight) | | | | |
| Upload + delete | | | | |
| Units imperial ↔ SI | | | | |
| Progression percentiles | | | | |

### D6 · per-account

| Acct | Full run? | Isolation queried from this side? | Prefs held? | Notes |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |

---

## Sessions

<!-- Append new session blocks below this line, newest last. -->

## S00 · 2026-09-14 · Day 0 — setup, no scored driving

Week 0 closed and verified on production before the window opens:

- **Build marker** — shipped (W0.1). Header SHA + per-session ingest stamp.
- **Units toggle** — shipped (W0.2), converting at the display edge.
- **Track Notes** — shipped (W0.3). Corner note and trace note both saved on
  production 14 Sep; the T1 note anchored to the same span as one written on
  28 Aug, across a re-upload and a detector change.
- **Schema + drift detector** — ledger repaired, `applied_migrations()` live,
  client comparison returns OK. The banner is silent because it agrees.
- **Leaked-password protection** — on, confirmed by advisor.
- **Classes** — all five available. No open risk on the virtual-energy branch.

### Pre-flight: the virtual-energy branch (do this before Day 1)

The one decode path that has never met a real file. Run it now, while ingest is
still unfrozen and a failure is legal to fix.

- [ ] Export one **Hypercar or LMGT3** session from LMU (`.ld` + `.ldx` + `.svm`)
- [ ] Upload it. Does ingest complete without error?
- [ ] Open the session. Does the setup panel show an **energy** figure rather
      than a fuel figure, and does it read plausibly?
- [ ] Do the corner count and lap times look sane for that circuit?
- [ ] **Delete the session** — this is a pre-flight, not a scored run, and it
      must not enter the matrix
- [ ] Result: PASS / FAIL — ______________________________________________

**If it FAILS:** stop, log the error verbatim here, and do not start Day 1. The
fix is legal today and illegal from tomorrow.

---
