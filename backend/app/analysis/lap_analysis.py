"""
Lap time numerical analysis.

Clean Code: pure functions, meaningful names, no side effects.
Clean Agile: designed for testability — every function takes plain values,
             returns plain values, has no I/O dependencies.

All times are in seconds (float). Use fmt() only at the presentation layer.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats


# ── Formatting (presentation only — never used for calculations) ──

def fmt(seconds: float | None) -> str:
    """Format a lap time in seconds to M:SS.mmm string."""
    if seconds is None or math.isnan(seconds):
        return "—"
    minutes = int(seconds // 60)
    remainder = seconds % 60
    return f"{minutes}:{remainder:06.3f}"


# ── Core metrics ──────────────────────────────────────────────────

@dataclass(frozen=True)
class LapMetrics:
    """
    Computed metrics for a single session's lap times.
    All times in seconds. None means insufficient data.
    """
    ideal: float | None
    best: float
    worst: float
    mean: float
    median: float
    std_dev: float           # consistency indicator — lower is better
    best_s3: float | None    # best rolling 3-lap average
    best_s5: float | None
    best_s7: float | None
    best_s10: float | None
    gap_to_ideal: float | None


def compute_metrics(laps: list[float], ideal: float | None = None) -> LapMetrics:
    """
    Compute the full metric set for a list of lap times.

    Args:
        laps:  List of lap times in seconds. Must be non-empty.
        ideal: ByteCraft ideal target for this scenario, or None.

    Returns:
        LapMetrics dataclass with all computed values.

    Raises:
        ValueError: if laps is empty.
    """
    if not laps:
        raise ValueError("laps must be non-empty")

    arr = np.array(laps, dtype=np.float64)
    best = float(arr.min())
    gap = float(best - ideal) if ideal is not None else None

    return LapMetrics(
        ideal=ideal,
        best=best,
        worst=float(arr.max()),
        mean=float(arr.mean()),
        median=float(np.median(arr)),
        std_dev=float(arr.std()),
        best_s3=_best_rolling(arr, 3),
        best_s5=_best_rolling(arr, 5),
        best_s7=_best_rolling(arr, 7),
        best_s10=_best_rolling(arr, 10),
        gap_to_ideal=gap,
    )


def _best_rolling(arr: np.ndarray, n: int) -> float | None:
    """Return the minimum rolling-window mean of size n, or None if insufficient data."""
    if len(arr) < n:
        return None
    rolling = pd.Series(arr).rolling(n).mean().dropna()
    return float(rolling.min())


# ── Trend analysis ────────────────────────────────────────────────

@dataclass(frozen=True)
class TrendResult:
    """
    Improvement trend across multiple sessions.
    slope < 0 means improving (lap times falling); slope > 0 means regressing.
    """
    slope: float           # seconds per session
    r_squared: float       # linearity of improvement (0–1)
    direction: str         # "improving" | "regressing" | "stable"
    session_delta: float | None   # best-lap delta: last session vs. previous


def compute_trend(best_laps_per_session: list[float]) -> TrendResult:
    """
    Compute a linear regression trend over a list of best-lap times
    (one per session, chronological order).

    Args:
        best_laps_per_session: best lap time for each session in date order.

    Returns:
        TrendResult with slope, R², direction, and last-session delta.
    """
    n = len(best_laps_per_session)
    if n < 2:
        return TrendResult(slope=0.0, r_squared=0.0, direction="stable", session_delta=None)

    x = np.arange(n, dtype=np.float64)
    y = np.array(best_laps_per_session, dtype=np.float64)

    slope, _intercept, r_value, _p_value, _stderr = stats.linregress(x, y)
    r_sq = float(r_value ** 2)

    if abs(slope) < 0.05:
        direction = "stable"
    elif slope < 0:
        direction = "improving"
    else:
        direction = "regressing"

    delta = float(y[-1] - y[-2])

    return TrendResult(
        slope=float(slope),
        r_squared=r_sq,
        direction=direction,
        session_delta=delta,
    )


# ── Consistency scoring ───────────────────────────────────────────

def consistency_score(laps: list[float]) -> float:
    """
    Normalised consistency score in [0, 1].
    1.0 = perfectly consistent (all laps identical).
    0.0 = highly inconsistent (std_dev ≥ 3 s, roughly).

    Uses coefficient of variation normalised against a 3-second threshold.
    """
    if len(laps) < 2:
        return 1.0
    arr = np.array(laps, dtype=np.float64)
    std = float(arr.std())
    return float(max(0.0, 1.0 - (std / 3.0)))


# ── Tier classification ───────────────────────────────────────────

@dataclass(frozen=True)
class TierThresholds:
    elite: float = 0.5
    competitive: float = 1.5
    developing: float = 3.0


@dataclass(frozen=True)
class TierResult:
    name: str           # ELITE | COMPETITIVE | DEVELOPING | FOUNDATION | UNRANKED
    gap_to_ideal: float | None
    closeness_pct: float   # 0–100, relative to the developing threshold


def classify_tier(gap: float | None, thresholds: TierThresholds | None = None) -> TierResult:
    """
    Classify a driver's gap-to-ideal into a named tier.

    Args:
        gap:        Best lap minus ideal target (seconds). None = no ideal set.
        thresholds: User-defined tier boundaries. Defaults to TierThresholds().

    Returns:
        TierResult with tier name and closeness percentage.
    """
    t = thresholds or TierThresholds()

    if gap is None:
        return TierResult(name="UNRANKED", gap_to_ideal=None, closeness_pct=0.0)

    pct = float(max(0.0, min(100.0, 100.0 - (gap / t.developing) * 100.0)))

    if gap <= t.elite:
        name = "ELITE"
    elif gap <= t.competitive:
        name = "COMPETITIVE"
    elif gap <= t.developing:
        name = "DEVELOPING"
    else:
        name = "FOUNDATION"

    return TierResult(name=name, gap_to_ideal=gap, closeness_pct=pct)
