# Model selection — DeepSeek vs Claude

**Status: decided provisionally — build Phase 2 on Claude, settle with an A/B on
real output.** Opened 9 Aug 2026 (a DeepSeek V4 comparison suggested ~10× cheaper
runs); evaluated 21 Aug 2026; the A/B runs once P3 exists.

This document exists because the owner named their own bias — a pull toward the
cost advantage — and asked for the options reviewed properly before choosing.
Naming the bias is what makes the rest of this useful.

---

## 1 · At current scale, cost is not the deciding factor

`docs/ai-cost-model.md` puts a Standard run at **$0.18** synchronous, **$0.10**
batched. Against three pilot drivers:

| Scenario | Monthly |
| --- | --- |
| 60 Standard runs, synchronous | **$10.80** |
| 60 Standard runs, batched | **$6.00** |
| Same volume, if an alternative were 10× cheaper | **~$0.60–1.08** |

The saving is roughly **$10/month**. A 10× multiplier on a number this small is
not a decision. The cost argument becomes material somewhere north of **600
runs/month** — a business that does not exist yet.

**Consequence:** choose on quality now; keep the swap cheap for later. Model
choice stays behind `RunConfig`, which is what makes deferring safe rather than
negligent.

## 2 · The 10× figure is probably overstated

The $0.18 is **already ~90% optimised**, down from ~$0.95 naive, using three
levers — two of which are provider-specific in the current design:

1. **Prompt caching at −90%** on the curated library, cached once globally. The
   cost model calls this the central lever: only per-user telemetry is billed as
   fresh input.
2. **Batch API at −50%**, available because post-session analysis is not
   latency-critical.
3. **Model tiering** — 7 of 10 agents already run on the cheapest tier
   (Haiku 4.5, $1/$5).

So the honest comparison is *optimised Claude* against *optimised alternative*,
not against a naive build. **The open question is whether DeepSeek offers
equivalent context caching and batch economics.** If it does not, most of the
headline advantage evaporates, because caching is doing the heavy lifting.

## 3 · Verified Claude rates (21 Aug 2026)

| Model | Input /1M | Output /1M | Role |
| --- | --- | --- | --- |
| Haiku 4.5 | $1.00 | $5.00 | 7 specialists |
| Sonnet 5 | $3.00 (**$2.00 intro to 2026-08-31**) | $15.00 (**$10.00 intro**) | Orchestrator + Synthesizer |
| Opus 5 | $5.00 | $25.00 | Deep-run synthesis only |

Cache reads −90%; Batch −50%. Note the Sonnet 5 introductory rate expires
**31 Aug 2026** — do not baseline long-run margins on it.

**DeepSeek figures are deliberately absent.** They could not be verified: this
environment's egress proxy blocks `api-docs.deepseek.com` (and `supabase.com`).
Quoting them from recall would put a stale number into a decision document,
which is the failure mode this file is meant to prevent. **Fill this in from the
vendor's live pricing page before the A/B.**

## 4 · The axes that decide it, in order

1. **Quality on this task.** Race engineering is domain-specific technical
   reasoning over numeric telemetry. General benchmarks do not transfer. Only
   the A/B below answers this.
2. **Context caching support.** The architecture *depends* on the curated
   library being cached at a steep discount. Without it, per-run cost rises and
   `docs/ai-cost-model.md`'s margins need rebuilding, not adjusting.
3. **Batch / async discount.** Same dependency — the model assumed −50%.
4. **Structured-output reliability.** Ten agents pass JSON between each other.
   95% schema adherence instead of 99.9% means retry logic, and retries erase
   cost savings. Measure adherence failures, not just quality.
5. **Data jurisdiction — weigh this second only to quality.** Runs send named
   driver telemetry to the model provider. DeepSeek is a Chinese company; where
   inference happens and how data is retained is a materially different legal
   posture. Le Mans Ultimate's player base is heavily European, so charging EU
   customers puts GDPR transfer obligations on Axiom Black. Anthropic offers
   zero-data-retention arrangements. **This is a legal constraint, not a
   preference, and it may settle the question regardless of quality or price.**
   Resolve it *before* any customer data reaches an alternative provider.
6. **Latency.** The Phase 2 acceptance criterion is a Standard run under 60 s.
7. **Rate limits** at the relevant spend tier.
8. **Concentration risk**, in both directions.

## 5 · The A/B protocol

Runs **after P3**, because P3 is what produces a runnable pipeline. Cost: pennies.

1. **Input:** the real COTA session already in production — 3 timed laps, a real
   out-lap, a real partial lap. Not the committed fixture, which is single-lap
   and cannot exercise multi-lap reasoning.
2. **Same prompt, both providers.** Standard run class. **3 runs each** so
   variance is visible rather than assumed.
3. **Blind the scoring.** Strip provider identity, label the outputs A and B,
   score before un-blinding. The owner's stated cost bias is exactly why this
   step is not optional.
4. **Score on:**
   - Is the diagnosis **correct** against what the telemetry shows?
   - Is it **specific enough to act on** — a driver could change something?
   - Does it **invent anything the telemetry does not support?** Weight this
     heaviest. A confident fabrication is worse than a vague answer in a product
     whose standing bar is that unreliable data is flagged, never hidden.
5. **Record per run:** input/output tokens, cached-token share, wall-clock,
   computed cost, and **schema-adherence failures**.
6. **Compare price last**, so it cannot colour the quality judgement.

**Decision rule, fixed in advance:** if quality is comparable *and* the
jurisdiction question resolves acceptably, cost decides. If quality differs
materially, quality decides. If jurisdiction does not resolve, the question is
closed regardless of the other two.

## 6 · What was decided, and what stays open

**Decided 21 Aug 2026:** build P1–P3 on Claude. Reasons, in order —

- The caching and batch assumptions are already Anthropic-shaped; changing
  provider mid-build adds risk to a phase whose goal is *working*, not *cheap*.
- ~$10/month does not justify a decision.
- The jurisdiction question needs research before an alternative provider
  touches customer data, and that work is not code.

**Open:**

- DeepSeek's live pricing, caching, and batch terms — to be filled into §3.
- The jurisdiction / data-retention answer.
- The A/B itself, once P3 exists.

**Keep model choice behind `RunConfig`.** That is what makes this a config
change later rather than a rewrite, and it is the reason deferring the decision
is a real option instead of a delay.
