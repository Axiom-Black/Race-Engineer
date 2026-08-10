"""
Unit tests for app.analysis.lap_analysis.

Clean Agile (§5.1 TDD): tests written alongside production code.
Clean Code (FIRST): Fast, Independent, Repeatable, Self-validating, Timely.
Each test covers one behaviour.
"""

import pytest

from app.analysis.lap_analysis import (
    LapMetrics,
    TierThresholds,
    classify_tier,
    compute_metrics,
    compute_trend,
    consistency_score,
    fmt,
)


# ── fmt ───────────────────────────────────────────────────────────

class TestFmt:
    def test_formats_whole_minute(self) -> None:
        assert fmt(60.0) == "1:00.000"

    def test_formats_sub_minute(self) -> None:
        assert fmt(90.500) == "1:30.500"

    def test_formats_none(self) -> None:
        assert fmt(None) == "—"

    def test_formats_lmu_gt3_lap(self) -> None:
        assert fmt(230.5) == "3:50.500"


# ── compute_metrics ───────────────────────────────────────────────

class TestComputeMetrics:
    def test_raises_on_empty(self) -> None:
        with pytest.raises(ValueError):
            compute_metrics([])

    def test_single_lap(self) -> None:
        m = compute_metrics([232.1])
        assert m.best == pytest.approx(232.1)
        assert m.worst == pytest.approx(232.1)
        assert m.mean == pytest.approx(232.1)
        assert m.best_s3 is None
        assert m.best_s5 is None

    def test_best_and_worst(self) -> None:
        laps = [234.5, 232.8, 232.1, 231.9, 232.4]
        m = compute_metrics(laps)
        assert m.best == pytest.approx(231.9)
        assert m.worst == pytest.approx(234.5)

    def test_mean_accuracy(self) -> None:
        laps = [230.0, 232.0, 234.0]
        m = compute_metrics(laps)
        assert m.mean == pytest.approx(232.0)

    def test_gap_to_ideal_positive(self) -> None:
        m = compute_metrics([232.5], ideal=230.5)
        assert m.gap_to_ideal == pytest.approx(2.0)

    def test_gap_to_ideal_none_when_no_ideal(self) -> None:
        m = compute_metrics([232.5])
        assert m.gap_to_ideal is None

    def test_best_s3_with_enough_laps(self) -> None:
        laps = [234.0, 232.0, 231.0, 231.5, 232.0]
        m = compute_metrics(laps)
        assert m.best_s3 is not None
        assert m.best_s3 < m.mean

    def test_best_s5_none_when_insufficient_laps(self) -> None:
        m = compute_metrics([234.0, 232.0, 231.0, 231.5])
        assert m.best_s5 is None

    def test_returns_lapmetrics_type(self) -> None:
        m = compute_metrics([230.0, 231.0])
        assert isinstance(m, LapMetrics)


# ── compute_trend ─────────────────────────────────────────────────

class TestComputeTrend:
    def test_single_session_returns_stable(self) -> None:
        t = compute_trend([232.0])
        assert t.direction == "stable"
        assert t.session_delta is None

    def test_improving_trend(self) -> None:
        # laps decreasing = improving
        t = compute_trend([235.0, 234.0, 233.0, 232.0, 231.0])
        assert t.direction == "improving"
        assert t.slope < 0

    def test_regressing_trend(self) -> None:
        t = compute_trend([231.0, 232.0, 233.0, 234.0, 235.0])
        assert t.direction == "regressing"
        assert t.slope > 0

    def test_session_delta_is_last_minus_previous(self) -> None:
        t = compute_trend([234.0, 232.0])
        assert t.session_delta == pytest.approx(-2.0)

    def test_r_squared_in_unit_interval(self) -> None:
        t = compute_trend([235.0, 234.0, 233.0, 232.0])
        assert 0.0 <= t.r_squared <= 1.0


# ── consistency_score ─────────────────────────────────────────────

class TestConsistencyScore:
    def test_identical_laps_score_one(self) -> None:
        assert consistency_score([232.0, 232.0, 232.0]) == pytest.approx(1.0)

    def test_high_variance_score_near_zero(self) -> None:
        # std_dev of ~3 s → score ≈ 0
        laps = [229.0, 232.0, 235.0]
        assert consistency_score(laps) < 0.2

    def test_single_lap_score_one(self) -> None:
        assert consistency_score([232.0]) == pytest.approx(1.0)

    def test_score_in_unit_interval(self) -> None:
        laps = [230.0, 231.0, 240.0, 228.0]
        score = consistency_score(laps)
        assert 0.0 <= score <= 1.0


# ── classify_tier ─────────────────────────────────────────────────

class TestClassifyTier:
    def test_unranked_when_no_gap(self) -> None:
        r = classify_tier(None)
        assert r.name == "UNRANKED"
        assert r.closeness_pct == pytest.approx(0.0)

    def test_elite_at_or_below_threshold(self) -> None:
        t = TierThresholds(elite=0.5, competitive=1.5, developing=3.0)
        assert classify_tier(0.5, t).name == "ELITE"
        assert classify_tier(0.0, t).name == "ELITE"

    def test_competitive_band(self) -> None:
        t = TierThresholds(elite=0.5, competitive=1.5, developing=3.0)
        assert classify_tier(1.0, t).name == "COMPETITIVE"

    def test_developing_band(self) -> None:
        t = TierThresholds(elite=0.5, competitive=1.5, developing=3.0)
        assert classify_tier(2.5, t).name == "DEVELOPING"

    def test_foundation_beyond_developing(self) -> None:
        t = TierThresholds(elite=0.5, competitive=1.5, developing=3.0)
        assert classify_tier(5.0, t).name == "FOUNDATION"

    def test_closeness_pct_at_gap_zero(self) -> None:
        r = classify_tier(0.0, TierThresholds(developing=3.0))
        assert r.closeness_pct == pytest.approx(100.0)

    def test_closeness_pct_at_developing_threshold(self) -> None:
        r = classify_tier(3.0, TierThresholds(developing=3.0))
        assert r.closeness_pct == pytest.approx(0.0)

    def test_closeness_clamped_at_zero_for_large_gap(self) -> None:
        r = classify_tier(10.0, TierThresholds(developing=3.0))
        assert r.closeness_pct == pytest.approx(0.0)

    def test_custom_thresholds_respected(self) -> None:
        # GTE-tight thresholds
        t = TierThresholds(elite=0.3, competitive=0.8, developing=2.0)
        assert classify_tier(0.5, t).name == "COMPETITIVE"
        assert classify_tier(0.2, t).name == "ELITE"
