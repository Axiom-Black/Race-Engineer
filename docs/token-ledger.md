# Token ledger — what this build costs to make

> **Opened 15 Sep 2026.** Until then the build had no measurement of its own
> cost, and the best available answer was a range spanning **$340 to $1,520** —
> not a number anyone can act on. This file is the record that fixes that.
>
> **Run `python3 scripts/token_report.py` at the end of every session and append
> the row.** The script measures; this file is what survives, because a cloud
> session gets a fresh container and only the *current* transcript is on disk.
> An unappended session is a session that cannot be counted, ever.

---

## What the numbers mean — read once, then trust the table

**These are API-list-equivalent figures, not necessarily money spent.** Claude
Code run on a subscription draws against plan limits rather than per-token
billing. Where that is the case, the figures below are what the same work would
have cost bought by the token — genuinely useful for judging efficiency and for
costing *future* agent runs, and not the same claim as "we paid this."

Never quote one as the other. The distinction is exactly the one the hosting
premise got wrong for a month (`CLAUDE.md`, corrected 14 Sep): a share of an
existing bill is not zero, and a notional cost is not an invoice.

**Rate card:** Opus 5 at $5/$25 per MTok, cache read $0.50, cache writes
**1.25× at the 5-minute TTL and 2× at the 1-hour TTL**. Verified 14 Sep 2026.
The TTL split is deliberate and load-bearing — a single blended write rate makes
the cheaper one the silent default, which is the defect PR #50 carried and this
repo corrected the same day.

---

## Baseline — the build to 15 Sep 2026

| | |
| --- | --- |
| **Assumed cost to date** | **$1,500** — the owner's decision, 15 Sep: take the worst case and work down from it rather than flatter the number |
| Estimate range it came from | $340 (best) · ~$1,190 (two independent anchors agreed) · $1,520 (worst) |
| What is actually measured | **one session**, 2–15 Sep. Every earlier transcript is gone with its container. |
| Repo at baseline | 98 commits, 13 Aug → 14 Sep · 21,045 lines of code · 4,478 lines of docs |

The estimate is carried as **$1,500 and labelled an assumption, not a
measurement.** Everything below this line is measured, and the two must not be
added together as if they were the same kind of number.

---

## Sessions

| Session | Span | Msgs | Output tok | Cache read | Cost | $/1M out | Cached % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `1937740f` | 2026-09-02 → 09-15 | 396 | 268,019 | 163,883,606 | **$121.82** | $455 | 98.0% |

<!-- One row per session, keyed on the session id. Generate with:
     python3 scripts/token_report.py --ledger-row

     REPLACE the row for a session already listed; do not append a second one.
     A session measured mid-flight and again at close is the SAME session, and
     two rows double-count it. The row above was first written at $116.40 with
     370 messages and replaced at close — it is one session, not two. -->

**Running total measured: $121.82.** Against a $1,500 assumed baseline, the
build to date sits at roughly **$1,622 API-equivalent**, of which 8% is measured
and 92% is estimate. That ratio improves with every appended row and is itself
worth watching — an estimate that never shrinks is an estimate nobody is testing.

**The report measures a transcript that is still growing.** Two runs four
minutes apart on this session returned $121.76 and $121.82 — the second run
billed for reading the first. The drift is fractions of a percent and does not
matter for the decision the ledger informs, but it means a session's figure is
**as at the moment it was taken**, never a closed total, and re-running will
always nudge it up. Take the row once, at close.

---

## What the first measurement actually found

**98.0% of every input token was a cache read.** Not fresh context, not new
files — the conversation re-reading itself. The single number that captures it:

> **Effective cost per 1M output tokens: $455, against a $25 list rate.**
> An **18.2× context multiplier.**

Output is the work. Everything above it is the cost of carrying the conversation
to the point where the work could be produced.

### Where the money went

| | Cost | Share |
| --- | --- | --- |
| Cache read | $81.89 | 67% |
| Cache write | $33.16 | 27% |
| Output | $6.70 | 6% |
| Fresh input | $0.00 | 0% |

**The thing we actually produced is 6% of the bill.** Two thirds is re-reading.

### Caching is not the problem — it is the only reason this is affordable

Uncached, the same work would have cost **$842.35**. Caching saved **$720.59,
or 86%**. The 18.2× multiplier is what remains *after* an 86% saving; without
it the multiplier would be roughly 126×.

So the lever is not "cache more". It is **carry less**.

---

## Efficiency levers, in the order they are worth pulling

**1 · Session length is the dominant variable, and it is not close.**
A long thread pays for its entire history on every turn. This session averaged
**423,115 input tokens per message** — four hundred thousand tokens re-read to
produce a few hundred. The 14 Sep spike ($79 of the $122, 248 messages) is the
whole effect in one day: the longer the thread ran, the more each additional
message cost, regardless of how small it was.

The 15 Sep tail is the same lesson in miniature and worth pricing separately:
**42 messages cost $19.19**, at **$0.46 each** against the session average of
$0.31. Those messages did less work than the ones on 3 Sep, which cost $0.21
each — they were simply carrying more history. Same agent, same model, same kind
of task, **more than double the unit cost**, entirely because of where in the
thread they fell.

The fix costs nothing and loses nothing: **split at natural boundaries.** A
finished feature, a merged PR, a closed blocker. Each new session restarts the
context from the tracker rather than from the transcript — which is precisely
what `WORKING_PLAN.md` §0/§5 exist for, and is the reason the session ritual
insists on them.

**2 · The 1-hour cache TTL earned its 2× — check that it still does.**
3.27M of the 3.34M cache writes were at the 1-hour TTL, costing $32.7 of the
$33.16. At the 5-minute rate they would have cost $20.5. The premium bought
cache survival across gaps in a session spanning 13 calendar days with long
idle periods, and against $721 of savings it was plainly worth it. **In a short,
continuous session it would not be** — the default TTL keeps a busy cache warm
by itself, and the 1-hour write is then pure premium.

**3 · Model choice is the smallest lever here, not the largest.**
Output is 6% of spend, so even a free model would cut ~6%. Dropping a tier for
routine steps is the *last* thing to reach for, not the first — and the tiering
already specified in `docs/ai-cost-model.md` is about the Phase 2 agent runs,
which is a different workload with a different shape.

**4 · Tool output lands in the context and is paid for on every later turn.**
A large `git log`, an unfiltered file read, a 55 KB search result — each is
cheap once and then re-read for the rest of the session. Prefer targeted reads
and filtered output. This is not frugality for its own sake: it is the same
number as lever 1, seen from the other end.

---

## Open questions this ledger should answer

Not yet answerable — recorded so they are not rediscovered.

- **Does the multiplier fall when sessions are split?** The prediction is yes,
  and roughly linearly with turn count. Two or three shorter sessions logged
  here will settle it. **Pre-committed so it cannot be graded generously later.**
  The within-session gradient is already consistent with it — $0.21/message on
  3 Sep against $0.46 on 15 Sep — but that is the *same* session getting more
  expensive, not a split one getting cheaper, and it is not the test. The test
  is the next session's row. **The prediction is that a session opened fresh
  from the tracker lands nearer $0.21 than $0.46; if it does not, the "split at
  boundaries" advice in `CLAUDE.md` is wrong and comes out.**
- **What does a Phase 2 agent run cost against this baseline?** The cost model
  estimates $0.18/run on a warm cache. When the agent wakes, its real runs
  belong in this ledger next to the build cost, because the two are charged to
  the same account and only one of them is currently measured.
- **Is any of this actually billed?** If the build runs on a subscription the
  answer is no, and these figures are notional throughout. Confirmable from the
  Admin API usage and cost reports (`/v1/organizations/usage_report/messages`,
  `/cost_report`) — owner-side, needs an admin credential.
