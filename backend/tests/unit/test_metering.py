"""
Unit tests for app.services.metering.

Every quota rule, cost formula, and plan allowance from the cost model
is tested independently here. No I/O, no database.

Clean Agile (§5.1 TDD): tests exist before the database integration is wired.
Clean Code (FIRST): Fast, Independent, Repeatable, Self-validating, Timely.
"""

import pytest

from app.services.metering import (
    BATCH_DISCOUNT,
    MODEL_ASSIGNMENT_INVARIANT_DEEP_USES_OPUS,
    PLAN_ALLOWANCES,
    RUN_CONFIGS,
    BatchDiscount,
    Model,
    MonthlyUsage,
    Plan,
    PlanAllowance,
    QuotaExceededError,
    RunClass,
    RunConfig,
    TokenUsage,
    check_quota,
    compute_run_cost,
    estimate_run_cost,
)


# ── RunConfig — model tiering invariants ─────────────────────────

class TestRunConfigModelTiering:
    """
    The cost model's most important structural rule:
    specialists always Haiku; only Deep escalates synthesizer to Opus.
    'Specialists never run on Opus. This single decision is a 5-25x cost spread.'
    """

    def test_all_run_classes_use_haiku_for_specialists(self) -> None:
        for run_class, config in RUN_CONFIGS.items():
            assert config.specialist_model == Model.HAIKU, (
                f"{run_class.value} must use Haiku for specialists"
            )

    def test_only_deep_uses_opus_for_synthesizer(self) -> None:
        assert RUN_CONFIGS[RunClass.DEEP].synthesizer_model == Model.OPUS

    def test_quick_and_standard_do_not_use_opus(self) -> None:
        assert RUN_CONFIGS[RunClass.QUICK].synthesizer_model != Model.OPUS
        assert RUN_CONFIGS[RunClass.STANDARD].synthesizer_model != Model.OPUS

    def test_quick_uses_haiku_for_orchestrator(self) -> None:
        """Quick checks use Haiku everywhere — minimum cost."""
        config = RUN_CONFIGS[RunClass.QUICK]
        assert config.orchestrator_model == Model.HAIKU

    def test_standard_and_deep_use_sonnet_for_orchestrator(self) -> None:
        assert RUN_CONFIGS[RunClass.STANDARD].orchestrator_model == Model.SONNET
        assert RUN_CONFIGS[RunClass.DEEP].orchestrator_model == Model.SONNET

    def test_quick_caps_at_3_specialists(self) -> None:
        """Quick = 3 specialists per cost model."""
        assert RUN_CONFIGS[RunClass.QUICK].max_specialists == 3

    def test_standard_and_deep_engage_more_specialists(self) -> None:
        assert RUN_CONFIGS[RunClass.STANDARD].max_specialists > 3
        assert RUN_CONFIGS[RunClass.DEEP].max_specialists > 3

    def test_quick_is_synchronous(self) -> None:
        """Quick checks need instant feedback; no Batch API."""
        assert RUN_CONFIGS[RunClass.QUICK].use_batch_api is False

    def test_standard_and_deep_use_batch_api(self) -> None:
        """Post-session analysis is not latency-critical — route through Batch API."""
        assert RUN_CONFIGS[RunClass.STANDARD].use_batch_api is True
        assert RUN_CONFIGS[RunClass.DEEP].use_batch_api is True


# ── Plan allowances ───────────────────────────────────────────────

class TestPlanAllowances:
    """
    'Meter the expensive, free the cheap.
     Only Quick checks should ever be unlimited.'
    """

    def test_rookie_deep_runs_gated_entirely(self) -> None:
        """'Gate Deep entirely' on free tier."""
        assert PLAN_ALLOWANCES[Plan.ROOKIE].deep_per_month == 0

    def test_rookie_cannot_purchase_credits(self) -> None:
        assert PLAN_ALLOWANCES[Plan.ROOKIE].can_purchase_credits is False

    def test_paid_plans_can_purchase_credits(self) -> None:
        for plan in [Plan.DRIVER, Plan.ENGINEER, Plan.GARAGE, Plan.PADDOCK]:
            assert PLAN_ALLOWANCES[plan].can_purchase_credits is True

    def test_driver_and_above_get_unlimited_quick(self) -> None:
        """'Only Quick checks should ever be unlimited.'"""
        for plan in [Plan.DRIVER, Plan.ENGINEER, Plan.GARAGE, Plan.PADDOCK]:
            assert PLAN_ALLOWANCES[plan].quick_per_month == -1

    def test_rookie_quick_capped_at_12(self) -> None:
        assert PLAN_ALLOWANCES[Plan.ROOKIE].quick_per_month == 12

    def test_rookie_standard_capped_at_1(self) -> None:
        assert PLAN_ALLOWANCES[Plan.ROOKIE].standard_per_month == 1

    def test_paddock_has_unlimited_all_run_classes(self) -> None:
        p = PLAN_ALLOWANCES[Plan.PADDOCK]
        assert p.quick_per_month == -1
        assert p.standard_per_month == -1
        assert p.deep_per_month == -1


# ── Quota enforcement ─────────────────────────────────────────────

class TestCheckQuota:

    def test_passes_when_under_limit(self) -> None:
        usage = MonthlyUsage(quick_used=5, standard_used=0, deep_used=0)
        check_quota(usage, Plan.ROOKIE, RunClass.QUICK)  # should not raise

    def test_raises_when_at_limit(self) -> None:
        usage = MonthlyUsage(quick_used=12, standard_used=0, deep_used=0)
        with pytest.raises(QuotaExceededError) as exc_info:
            check_quota(usage, Plan.ROOKIE, RunClass.QUICK)
        assert exc_info.value.run_class == RunClass.QUICK
        assert exc_info.value.plan == Plan.ROOKIE

    def test_raises_when_over_limit(self) -> None:
        usage = MonthlyUsage(quick_used=0, standard_used=5, deep_used=0)
        with pytest.raises(QuotaExceededError):
            check_quota(usage, Plan.ROOKIE, RunClass.STANDARD)

    def test_unlimited_never_raises(self) -> None:
        """Quick is unlimited on Driver and above — never blocked."""
        usage = MonthlyUsage(quick_used=9999, standard_used=0, deep_used=0)
        check_quota(usage, Plan.DRIVER, RunClass.QUICK)  # should not raise

    def test_deep_always_raises_for_rookie(self) -> None:
        """Rookie deep allowance is 0 — first run blocked."""
        usage = MonthlyUsage(quick_used=0, standard_used=0, deep_used=0)
        with pytest.raises(QuotaExceededError):
            check_quota(usage, Plan.ROOKIE, RunClass.DEEP)

    def test_engineer_deep_allowance_exhausts(self) -> None:
        usage = MonthlyUsage(quick_used=0, standard_used=0, deep_used=3)
        with pytest.raises(QuotaExceededError):
            check_quota(usage, Plan.ENGINEER, RunClass.DEEP)

    def test_engineer_deep_still_passes_within_allowance(self) -> None:
        usage = MonthlyUsage(quick_used=0, standard_used=0, deep_used=2)
        check_quota(usage, Plan.ENGINEER, RunClass.DEEP)  # should not raise


# ── Cost computation ──────────────────────────────────────────────

class TestComputeRunCost:

    def test_output_cost_exceeds_input_cost(self) -> None:
        """'Output is the cost driver (5x input).'"""
        usage = TokenUsage(input_tokens=1000, output_tokens=1000)
        cost = compute_run_cost(usage, Model.SONNET, batch=False)
        assert cost.output_cost_usd > cost.input_cost_usd

    def test_output_is_five_times_input_rate_for_sonnet(self) -> None:
        """Sonnet 5: $2 input, $10 output — the 5x ratio holds across the tier."""
        usage = TokenUsage(input_tokens=1_000_000, output_tokens=1_000_000)
        cost = compute_run_cost(usage, Model.SONNET, batch=False)
        assert cost.output_cost_usd == pytest.approx(cost.input_cost_usd * 5, rel=0.01)

    def test_batch_api_halves_total_cost(self) -> None:
        """'Batch API applies a further -50% to all tokens.'"""
        usage = TokenUsage(input_tokens=10_000, output_tokens=2_500)
        sync_cost = compute_run_cost(usage, Model.SONNET, batch=False)
        batch_cost = compute_run_cost(usage, Model.SONNET, batch=True)
        assert batch_cost.total_usd == pytest.approx(sync_cost.total_usd * 0.5, rel=0.01)

    def test_cache_read_is_90_percent_cheaper_than_input(self) -> None:
        """'Cache hits cost 10% of base input.'"""
        usage_fresh = TokenUsage(input_tokens=10_000, output_tokens=0)
        usage_cached = TokenUsage(input_tokens=0, output_tokens=0, cache_read_tokens=10_000)
        fresh_cost = compute_run_cost(usage_fresh, Model.SONNET, batch=False)
        cached_cost = compute_run_cost(usage_cached, Model.SONNET, batch=False)
        assert cached_cost.cache_read_cost_usd == pytest.approx(fresh_cost.input_cost_usd * 0.1, rel=0.01)

    def test_haiku_cheaper_than_sonnet_same_tokens(self) -> None:
        usage = TokenUsage(input_tokens=10_000, output_tokens=2_500)
        haiku_cost = compute_run_cost(usage, Model.HAIKU, batch=False)
        sonnet_cost = compute_run_cost(usage, Model.SONNET, batch=False)
        assert haiku_cost.total_usd < sonnet_cost.total_usd

    def test_zero_tokens_returns_zero_cost(self) -> None:
        cost = compute_run_cost(TokenUsage(), Model.HAIKU, batch=False)
        assert cost.total_usd == pytest.approx(0.0)

    def test_batch_flag_recorded_on_result(self) -> None:
        usage = TokenUsage(input_tokens=1000, output_tokens=500)
        assert compute_run_cost(usage, Model.HAIKU, batch=True).batch_discount_applied is True
        assert compute_run_cost(usage, Model.HAIKU, batch=False).batch_discount_applied is False

    # ── Cache writes (added 27 Aug 2026) ──────────────────────────
    #
    # compute_run_cost used to sum input + output + cache_read only, so
    # cache_write_tokens was accepted and silently billed at zero. These pin
    # the fix. Each one goes red if the cache_write term is deleted.

    def test_cache_write_is_billed_at_all(self) -> None:
        """The regression that existed: writes cost something."""
        usage = TokenUsage(cache_write_tokens=10_000)
        cost = compute_run_cost(usage, Model.SONNET, batch=False)
        assert cost.cache_write_cost_usd > 0
        assert cost.total_usd > 0

    def test_cache_write_costs_125_percent_of_input(self) -> None:
        """Writes bill at 1.25x input — not 1x, which the old comment claimed."""
        written = TokenUsage(cache_write_tokens=10_000)
        fresh = TokenUsage(input_tokens=10_000)
        write_cost = compute_run_cost(written, Model.SONNET, batch=False)
        fresh_cost = compute_run_cost(fresh, Model.SONNET, batch=False)
        assert write_cost.cache_write_cost_usd == pytest.approx(
            fresh_cost.input_cost_usd * 1.25, rel=0.01
        )

    def test_cache_write_costs_more_than_cache_read(self) -> None:
        """A write is the expensive half of caching; a read is the payoff."""
        usage = TokenUsage(cache_read_tokens=10_000, cache_write_tokens=10_000)
        cost = compute_run_cost(usage, Model.OPUS, batch=False)
        assert cost.cache_write_cost_usd > cost.cache_read_cost_usd

    def test_cache_write_included_in_total(self) -> None:
        """Total is the sum of all four components, not three of them."""
        usage = TokenUsage(
            input_tokens=1_000, output_tokens=2_000,
            cache_read_tokens=3_000, cache_write_tokens=4_000,
        )
        c = compute_run_cost(usage, Model.HAIKU, batch=False)
        assert c.total_usd == pytest.approx(
            c.input_cost_usd + c.output_cost_usd
            + c.cache_read_cost_usd + c.cache_write_cost_usd,
            rel=1e-9,
        )

    def test_batch_discount_applies_to_cache_writes_too(self) -> None:
        usage = TokenUsage(cache_write_tokens=10_000)
        sync = compute_run_cost(usage, Model.SONNET, batch=False)
        batched = compute_run_cost(usage, Model.SONNET, batch=True)
        assert batched.total_usd == pytest.approx(sync.total_usd * 0.5, rel=0.01)

    # ── Rate card (re-verified 27 Aug 2026) ───────────────────────

    def test_sonnet_is_cheaper_than_it_was_on_4_6(self) -> None:
        """Sonnet 5 is $2/$10; the retired 4.6 pin was $3/$15."""
        usage = TokenUsage(input_tokens=1_000_000, output_tokens=1_000_000)
        cost = compute_run_cost(usage, Model.SONNET, batch=False)
        assert cost.input_cost_usd == pytest.approx(2.00, rel=0.001)
        assert cost.output_cost_usd == pytest.approx(10.00, rel=0.001)

    def test_model_ids_are_not_date_suffixed(self) -> None:
        """A snapshot suffix on a model ID is drift waiting to happen."""
        for m in Model:
            assert not any(part.isdigit() and len(part) == 8 for part in m.value.split("-")), m.value


# ── Estimate run cost ─────────────────────────────────────────────

class TestEstimateRunCost:
    """
    Validate planning-grade estimates against the cost model's published figures:
      Quick sync ~$0.04, Standard sync ~$0.18, Deep sync ~$0.26
      Standard batch ~$0.10, Deep batch ~$0.14
    Values are estimates; tolerance is ±50% of the model's figure.
    """

    def test_quick_sync_within_model_range(self) -> None:
        est = estimate_run_cost(RunClass.QUICK, batch=False)
        assert 0.01 <= est <= 0.08, f"Quick sync estimate {est} outside expected range"

    def test_standard_sync_within_model_range(self) -> None:
        est = estimate_run_cost(RunClass.STANDARD, batch=False)
        assert 0.09 <= est <= 0.27, f"Standard sync estimate {est} outside expected range"

    def test_deep_sync_within_model_range(self) -> None:
        est = estimate_run_cost(RunClass.DEEP, batch=False)
        assert 0.13 <= est <= 0.39, f"Deep sync estimate {est} outside expected range"

    def test_batch_is_cheaper_than_sync_for_standard(self) -> None:
        assert estimate_run_cost(RunClass.STANDARD, batch=True) < estimate_run_cost(RunClass.STANDARD, batch=False)

    def test_deep_costs_more_than_standard(self) -> None:
        assert estimate_run_cost(RunClass.DEEP, batch=False) > estimate_run_cost(RunClass.STANDARD, batch=False)

    def test_quick_costs_less_than_standard(self) -> None:
        assert estimate_run_cost(RunClass.QUICK, batch=False) < estimate_run_cost(RunClass.STANDARD, batch=False)
