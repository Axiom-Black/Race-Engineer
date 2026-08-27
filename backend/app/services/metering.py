"""
Run metering service.

Implements the three levers from the ByteCraft AI Cost Model (June 2026):
  Lever 1 — Model tiering: Quick=Haiku, Standard=Sonnet, Deep=Opus synthesis
  Lever 2 — Prompt caching: curated libraries flagged for cache_control
  Lever 3 — Run metering: quota enforcement per plan, Batch API routing

Cost reference (Anthropic API, re-verified 27 Aug 2026, USD per million tokens):
  Haiku 4.5:  $1.00 input / $5.00 output / $0.10 cache-read
  Sonnet 5:   $2.00 input / $10.00 output / $0.20 cache-read
  Opus 5:     $5.00 input / $25.00 output / $0.50 cache-read
  Batch API:  -50% all tokens
  Cache read: -90% vs base input
  Cache WRITE: +25% vs base input (1.25x) — one-time, per cache window

Two corrections landed 27 Aug 2026 (see WORKING_PLAN §5):

  * Sonnet moved 4.6 -> 5. Sonnet 5 is $2/$10 against 4.6's $3/$15 — 33% less
    on both sides, for the model that is orchestrator on Standard AND Deep and
    synthesizer on Standard. This is the single largest line item in the most
    common run class. Opus moved 4.8 -> 5 at identical pricing ($5/$25).
  * Cache WRITES are now billed. `compute_run_cost` previously summed input +
    output + cache_read only, so `TokenUsage.cache_write_tokens` was declared
    and silently ignored — and the old comment claimed writes bill at the base
    input rate when they actually bill at 1.25x. The $0.18/run headline rests
    entirely on caching the four curated libraries, so under-billing the write
    understated the first run of every cache window in the model the pricing
    tiers are derived from.

Clean Architecture: policy (metering rules) lives here; HTTP and DB are details
injected at the boundary. This module has no FastAPI or SQLAlchemy imports.
Clean Code: one class per responsibility; no magic numbers — all constants named.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


# ── Rate card (USD per million tokens, June 2026) ─────────────────

class Model(str, Enum):
    # Bare IDs, never date-suffixed: "claude-haiku-4-5-20251001" was carrying a
    # snapshot suffix the API does not require and the invariant tests never used.
    HAIKU = "claude-haiku-4-5"
    SONNET = "claude-sonnet-5"
    OPUS = "claude-opus-5"


# Cost in USD per million tokens
INPUT_COST_PER_MTOK: dict[Model, float] = {
    Model.HAIKU:  1.00,
    Model.SONNET: 2.00,
    Model.OPUS:   5.00,
}
OUTPUT_COST_PER_MTOK: dict[Model, float] = {
    Model.HAIKU:  5.00,
    Model.SONNET: 10.00,
    Model.OPUS:   25.00,
}
CACHE_READ_COST_PER_MTOK: dict[Model, float] = {
    Model.HAIKU:  0.10,
    Model.SONNET: 0.20,
    Model.OPUS:   0.50,
}
BATCH_DISCOUNT = 0.50        # Batch API: 50% off all token costs
CACHE_READ_DISCOUNT = 0.90   # Cache read: 90% off base input cost
CACHE_WRITE_MULTIPLIER = 1.25  # Cache write: 125% of base input, one-time per window


# ── Run classes ───────────────────────────────────────────────────

class RunClass(str, Enum):
    """
    Three run classes from the cost model.
    Quick: cheap, generous allowance — the free tier's hook.
    Standard: full ten-agent run — core product experience.
    Deep: two-pass with Opus synthesis — premium/credit-gated.
    """
    QUICK = "quick"
    STANDARD = "standard"
    DEEP = "deep"


@dataclass(frozen=True)
class RunConfig:
    """
    Model assignment and agent count for a run class.
    Enforces: specialists always Haiku; only Deep escalates synthesizer to Opus.
    """
    run_class: RunClass
    specialist_model: Model
    orchestrator_model: Model
    synthesizer_model: Model
    max_specialists: int        # cap on parallel specialist calls
    use_batch_api: bool         # Standard + Deep route through Batch API


RUN_CONFIGS: dict[RunClass, RunConfig] = {
    RunClass.QUICK: RunConfig(
        run_class=RunClass.QUICK,
        specialist_model=Model.HAIKU,
        orchestrator_model=Model.HAIKU,
        synthesizer_model=Model.HAIKU,
        max_specialists=3,
        use_batch_api=False,     # Quick is synchronous — driver needs instant feedback
    ),
    RunClass.STANDARD: RunConfig(
        run_class=RunClass.STANDARD,
        specialist_model=Model.HAIKU,
        orchestrator_model=Model.SONNET,
        synthesizer_model=Model.SONNET,
        max_specialists=6,
        use_batch_api=True,      # Post-session; not latency-critical
    ),
    RunClass.DEEP: RunConfig(
        run_class=RunClass.DEEP,
        specialist_model=Model.HAIKU,
        orchestrator_model=Model.SONNET,
        synthesizer_model=Model.OPUS,   # Only place Opus is used
        max_specialists=6,
        use_batch_api=True,
    ),
}


# ── Plan allowances ───────────────────────────────────────────────

class Plan(str, Enum):
    ROOKIE = "rookie"
    DRIVER = "driver"
    ENGINEER = "engineer"
    GARAGE = "garage"
    PADDOCK = "paddock"


@dataclass(frozen=True)
class PlanAllowance:
    """
    Monthly included run counts per plan.
    -1 = unlimited. Deep always requires credits on Rookie (gated entirely).
    """
    plan: Plan
    quick_per_month: int
    standard_per_month: int
    deep_per_month: int
    can_purchase_credits: bool


PLAN_ALLOWANCES: dict[Plan, PlanAllowance] = {
    Plan.ROOKIE: PlanAllowance(
        plan=Plan.ROOKIE,
        quick_per_month=12,
        standard_per_month=1,
        deep_per_month=0,           # Deep gated entirely on free tier
        can_purchase_credits=False,
    ),
    Plan.DRIVER: PlanAllowance(
        plan=Plan.DRIVER,
        quick_per_month=-1,          # Unlimited
        standard_per_month=10,
        deep_per_month=0,            # Deep via credits only
        can_purchase_credits=True,
    ),
    Plan.ENGINEER: PlanAllowance(
        plan=Plan.ENGINEER,
        quick_per_month=-1,
        standard_per_month=30,
        deep_per_month=3,
        can_purchase_credits=True,
    ),
    Plan.GARAGE: PlanAllowance(
        plan=Plan.GARAGE,
        quick_per_month=-1,
        standard_per_month=45,       # Pooled across 3 seats
        deep_per_month=9,
        can_purchase_credits=True,
    ),
    Plan.PADDOCK: PlanAllowance(
        plan=Plan.PADDOCK,
        quick_per_month=-1,
        standard_per_month=-1,
        deep_per_month=-1,
        can_purchase_credits=True,
    ),
}


# ── Quota check ───────────────────────────────────────────────────

class QuotaExceededError(Exception):
    """Raised when a user's plan allowance for a run class is exhausted."""
    def __init__(self, run_class: RunClass, plan: Plan) -> None:
        super().__init__(
            f"Monthly {run_class.value} allowance exhausted on {plan.value} plan. "
            f"Purchase credits or upgrade to continue."
        )
        self.run_class = run_class
        self.plan = plan


@dataclass
class MonthlyUsage:
    """Snapshot of a user's run counts for the current billing month."""
    quick_used: int = 0
    standard_used: int = 0
    deep_used: int = 0


def check_quota(usage: MonthlyUsage, plan: Plan, run_class: RunClass) -> None:
    """
    Raise QuotaExceededError if the user cannot run another run of this class.
    -1 allowance = unlimited; always passes.
    """
    allowance = PLAN_ALLOWANCES[plan]

    if run_class == RunClass.QUICK:
        limit = allowance.quick_per_month
        used = usage.quick_used
    elif run_class == RunClass.STANDARD:
        limit = allowance.standard_per_month
        used = usage.standard_used
    else:
        limit = allowance.deep_per_month
        used = usage.deep_used

    if limit != -1 and used >= limit:
        raise QuotaExceededError(run_class, plan)


# ── Cost estimation ───────────────────────────────────────────────

@dataclass
class TokenUsage:
    """Actual token counts returned by the Anthropic API for one agent call."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0   # tokens served from cache (billed at the cache_read rate)
    cache_write_tokens: int = 0  # tokens written to cache (billed at 1.25x input, one-time)


@dataclass
class RunCost:
    """Computed USD cost for a completed run."""
    input_cost_usd: float = 0.0
    output_cost_usd: float = 0.0
    cache_read_cost_usd: float = 0.0
    cache_write_cost_usd: float = 0.0
    total_usd: float = 0.0
    batch_discount_applied: bool = False


def compute_run_cost(
    token_usage: TokenUsage,
    model: Model,
    batch: bool = False,
) -> RunCost:
    """
    Compute the USD cost of a single agent call given token counts and model.

    Cache-read tokens are billed at cache_read rate (not full input rate).
    Cache-WRITE tokens are billed at 1.25x the input rate — a real charge, paid
    once per cache window. Omitting it (as this function did before 27 Aug 2026)
    makes every cold run look cheaper than it is, which matters precisely
    because the whole margin case rests on caching the curated libraries.
    Fresh input tokens are billed at full input rate.
    Batch API applies a 50% discount to all token costs.
    """
    multiplier = (1 - BATCH_DISCOUNT) if batch else 1.0
    input_rate = INPUT_COST_PER_MTOK[model]

    input_cost = (token_usage.input_tokens / 1_000_000) * input_rate * multiplier
    output_cost = (token_usage.output_tokens / 1_000_000) * OUTPUT_COST_PER_MTOK[model] * multiplier
    cache_read_cost = (
        token_usage.cache_read_tokens / 1_000_000
    ) * CACHE_READ_COST_PER_MTOK[model] * multiplier
    cache_write_cost = (
        token_usage.cache_write_tokens / 1_000_000
    ) * input_rate * CACHE_WRITE_MULTIPLIER * multiplier

    total = input_cost + output_cost + cache_read_cost + cache_write_cost
    return RunCost(
        input_cost_usd=round(input_cost, 6),
        output_cost_usd=round(output_cost, 6),
        cache_read_cost_usd=round(cache_read_cost, 6),
        cache_write_cost_usd=round(cache_write_cost, 6),
        total_usd=round(total, 6),
        batch_discount_applied=batch,
    )


def estimate_run_cost(run_class: RunClass, batch: bool = False) -> float:
    """
    Planning-grade cost estimate for a run class, based on the cost model's
    token assumptions (10k cached + 2.5k fresh input + 1.2k output per specialist).
    Returns estimated total USD.

    Models a WARM cache — the steady state, where the curated libraries are
    already resident and every run pays only the cache_read rate. That is now a
    stated assumption rather than the accidental one it was before 27 Aug 2026:
    the first run of each cache window additionally pays 1.25x input on the
    written prefix, which `compute_run_cost` bills from real usage. Quote this
    figure as the marginal cost of a run, never as the cost of the first one.
    """
    # Token assumptions from the cost model methodology
    SPECIALIST_CACHED_INPUT = 10_000
    SPECIALIST_FRESH_INPUT = 2_500
    SPECIALIST_OUTPUT = 1_200
    ORCHESTRATOR_INPUT = 3_000
    ORCHESTRATOR_OUTPUT = 1_500
    SYNTHESIZER_INPUT = 11_000    # receives all specialist outputs
    SYNTHESIZER_OUTPUT = 2_500

    config = RUN_CONFIGS[run_class]
    n_specialists = config.max_specialists
    mult = (1 - BATCH_DISCOUNT) if batch else 1.0

    def token_cost(input_tok: int, output_tok: int, cache_tok: int, model: Model) -> float:
        i = (input_tok / 1_000_000) * INPUT_COST_PER_MTOK[model] * mult
        o = (output_tok / 1_000_000) * OUTPUT_COST_PER_MTOK[model] * mult
        c = (cache_tok / 1_000_000) * CACHE_READ_COST_PER_MTOK[model] * mult
        return i + o + c

    specialist_cost = n_specialists * token_cost(
        SPECIALIST_FRESH_INPUT, SPECIALIST_OUTPUT, SPECIALIST_CACHED_INPUT,
        config.specialist_model,
    )
    orchestrator_cost = token_cost(ORCHESTRATOR_INPUT, ORCHESTRATOR_OUTPUT, 0, config.orchestrator_model)
    synthesizer_cost = token_cost(SYNTHESIZER_INPUT, SYNTHESIZER_OUTPUT, 0, config.synthesizer_model)

    return round(specialist_cost + orchestrator_cost + synthesizer_cost, 4)


# ── Invariant exports (referenced by tests as living documentation) ──
# These aren't runtime checks — they make the cost model's key rules
# explicit and searchable in the codebase.

MODEL_ASSIGNMENT_INVARIANT_DEEP_USES_OPUS = (
    "DEEP run synthesizer must use Opus exclusively. "
    "Specialists must always use Haiku 4.5. "
    "Violating this is the fastest way to erase margin. "
    "— ByteCraft AI Cost Model, Lever 1"
)

# Alias used in tests for clarity
BatchDiscount = BATCH_DISCOUNT
