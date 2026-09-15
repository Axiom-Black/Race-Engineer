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
| `1937740f` | 2026-09-02 → 09-15 | 370 | 252,519 | 155,564,291 | **$116.40** | $461 | 97.9% |

<!-- Append one row per session. Generate with:
     python3 scripts/token_report.py --ledger-row -->

**Running total measured: $116.40.** Against a $1,500 assumed baseline, the
build to date sits at roughly **$1,616 API-equivalent**, of which 7% is measured
and 93% is estimate. That ratio improves with every appended row and is itself
worth watching — an estimate that never shrinks is an estimate nobody is testing.

---

## What the first measurement actually found

**97.9% of every input token was a cache read.** Not fresh context, not new
files — the conversation re-reading itself. The single number that captures it:

> **Effective cost per 1M output tokens: $461, against a $25 list rate.**
> An **18.4× context multiplier.**

Output is the work. Everything above it is the cost of carrying the conversation
to the point where the work could be produced.

### Where the money went

| | Cost | Share |
| --- | --- | --- |
| Cache read | $77.41 | 67% |
| Cache write | $32.30 | 28% |
| Output | $6.31 | 5% |
| Fresh input | $0.00 | 0% |

**The thing we actually produced is 5% of the bill.** Two thirds is re-reading.

### Caching is not the problem — it is the only reason this is affordable

Uncached, the same work would have cost **$796.66**. Caching saved **$680.64,
or 85%**. The 18.4× multiplier is what remains *after* an 85% saving; without
it the multiplier would be roughly 122×.

So the lever is not "cache more". It is **carry less**.

---

## Efficiency levers, in the order they are worth pulling

**1 · Session length is the dominant variable, and it is not close.**
A long thread pays for its entire history on every turn. This session averaged
**428,374 input tokens per message** — four hundred thousand tokens re-read to
produce a few hundred. The 14 Sep spike ($79 of the $116, 248 messages) is the
whole effect in one day: the longer the thread ran, the more each additional
message cost, regardless of how small it was.

The fix costs nothing and loses nothing: **split at natural boundaries.** A
finished feature, a merged PR, a closed blocker. Each new session restarts the
context from the tracker rather than from the transcript — which is precisely
what `WORKING_PLAN.md` §0/§5 exist for, and is the reason the session ritual
insists on them.

**2 · The 1-hour cache TTL earned its 2× — check that it still does.**
3.19M of the 3.26M cache writes were at the 1-hour TTL, costing $31.9 of the
$32.30. At the 5-minute rate they would have cost $19.9. The premium bought
cache survival across gaps in a session spanning 13 calendar days with long
idle periods, and against $680 of savings it was plainly worth it. **In a short,
continuous session it would not be** — the default TTL keeps a busy cache warm
by itself, and the 1-hour write is then pure premium.

**3 · Model choice is the smallest lever here, not the largest.**
Output is 5% of spend, so even a free model would cut ~5%. Dropping a tier for
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
- **What does a Phase 2 agent run cost against this baseline?** The cost model
  estimates $0.18/run on a warm cache. When the agent wakes, its real runs
  belong in this ledger next to the build cost, because the two are charged to
  the same account and only one of them is currently measured.
- **Is any of this actually billed?** If the build runs on a subscription the
  answer is no, and these figures are notional throughout. Confirmable from the
  Admin API usage and cost reports (`/v1/organizations/usage_report/messages`,
  `/cost_report`) — owner-side, needs an admin credential.
