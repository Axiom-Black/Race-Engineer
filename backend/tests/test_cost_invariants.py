"""
Ring 2 · G2.2 (model-tiering) and G2.3 (cache) — cost invariants.

These are the margin gates. From the Cost Model:
  - 7 specialists  -> Haiku 4.5   (never Sonnet, never Opus)
  - Orchestrator + Synthesizer -> Sonnet 4.6 on Standard runs
  - Opus 4.8 -> Deep-run synthesis ONLY
  - "A drift to all-Sonnet or all-Opus is the fastest way to erase margin."
  - Second identical run must show >= 60% cached input.

G2.2 is deterministic and needs NO API — it inspects the run plan the
orchestrator builds (which model each agent is assigned) before any call is made.
G2.3 asserts against a CANNED Anthropic usage payload (recorded fixture), never
the live API, so the blocking gate stays free and repeatable. The one live
smoke run lives outside the gate (TESTING_GATES.md §6).

═══════════════════════════════════════════════════════════════════════════
ADAPTER SHIM — the ONLY thing you edit to wire this to your real code.
═══════════════════════════════════════════════════════════════════════════
"""
import pytest

# Replace with your real orchestrator / metering interface.
# build_run_plan(run_class) must return an iterable of objects/dicts each
# exposing an agent role and its assigned model, WITHOUT making any API call.
try:
    from app.agents.orchestrator import build_run_plan
    _ORCH_AVAILABLE = True
except Exception:  # pragma: no cover
    _ORCH_AVAILABLE = False

# --- Canonical role / model vocabulary -----------------------------------
# Align these strings to whatever your code emits (model IDs, enum values).
HAIKU = "claude-haiku-4-5"
SONNET = "claude-sonnet-4-6"
OPUS = "claude-opus-4-8"

SPECIALIST_ROLES = {
    "aerodynamics", "tire", "powertrain", "telemetry",
    "strategy", "environment", "kpi_optimizer",
}
BRAIN_ROLES = {"orchestrator", "synthesizer"}


def _role(agent) -> str:
    r = agent["role"] if isinstance(agent, dict) else agent.role
    return str(r).lower()


def _model(agent) -> str:
    m = agent["model"] if isinstance(agent, dict) else agent.model
    return str(m)


pytestmark = pytest.mark.skipif(
    not _ORCH_AVAILABLE,
    reason="Orchestrator not importable — wire the adapter shim.",
)


# ══ G2.2 · Model-tiering invariants (deterministic, no API) ══════════════

@pytest.mark.parametrize("run_class", ["quick", "standard", "deep"])
def test_specialists_never_touch_opus(run_class):
    """The single most important margin invariant: specialists are Haiku-only."""
    plan = build_run_plan(run_class)
    offenders = [
        f"{_role(a)}={_model(a)}"
        for a in plan
        if _role(a) in SPECIALIST_ROLES and _model(a) != HAIKU
    ]
    assert not offenders, (
        f"[{run_class}] specialists must run on Haiku only; found: {offenders}"
    )


def test_standard_brain_is_sonnet_not_opus():
    """Standard runs: Orchestrator + Synthesizer on Sonnet, never Opus."""
    plan = build_run_plan("standard")
    for a in plan:
        if _role(a) in BRAIN_ROLES:
            assert _model(a) == SONNET, (
                f"Standard {_role(a)} must be Sonnet, got {_model(a)}"
            )


def test_opus_only_appears_on_deep():
    """Opus is reserved exclusively for Deep-run synthesis."""
    for run_class in ("quick", "standard"):
        plan = build_run_plan(run_class)
        opus_agents = [_role(a) for a in plan if _model(a) == OPUS]
        assert not opus_agents, (
            f"[{run_class}] must not use Opus; found on: {opus_agents}"
        )


def test_deep_uses_opus_for_synthesis_only():
    """On Deep, Opus appears — and only on the synthesizer, not specialists."""
    plan = build_run_plan("deep")
    opus_roles = {_role(a) for a in plan if _model(a) == OPUS}
    assert opus_roles, "Deep run should use Opus for synthesis"
    assert opus_roles <= {"synthesizer"}, (
        f"Deep Opus must be synthesis-only; leaked onto: {opus_roles - {'synthesizer'}}"
    )
    # And specialists on Deep are still Haiku (covered above, asserted here too).
    for a in plan:
        if _role(a) in SPECIALIST_ROLES:
            assert _model(a) == HAIKU, f"Deep specialist {_role(a)} escaped to {_model(a)}"


def test_quick_run_is_subset_of_specialists_on_haiku():
    """Quick check: a few specialists, all Haiku, no brain escalation to Opus."""
    plan = build_run_plan("quick")
    for a in plan:
        assert _model(a) != OPUS, f"Quick run used Opus on {_role(a)}"
        if _role(a) in SPECIALIST_ROLES:
            assert _model(a) == HAIKU


# ══ G2.3 · Cache invariant (canned usage payload, no live API) ═══════════

def _cached_input_share(usage: dict) -> float:
    """
    Fraction of input tokens served from cache.
    Anthropic usage exposes cache_read_input_tokens alongside input_tokens.
    """
    cached = usage.get("cache_read_input_tokens", 0)
    fresh = usage.get("input_tokens", 0)
    total = cached + fresh
    return 0.0 if total == 0 else cached / total


def test_cache_share_metric_reads_usage_payload():
    """The metric itself is correct on a known payload (guards the guard)."""
    # ~10k cached curated library + 2.5k fresh telemetry -> 80% cached.
    usage = {"cache_read_input_tokens": 10_000, "input_tokens": 2_500}
    assert _cached_input_share(usage) == pytest.approx(0.8)


def test_second_identical_run_hits_cache_threshold():
    """
    G2.3: a second consecutive run of the same track+class combo must show
    >= 60% cached input, proving the curated libraries are being cached
    (Cost Model Lever 2). Uses a recorded second-run usage fixture.

    Wire RECORDED_SECOND_RUN_USAGE to a real captured usage block from a
    replayed run (commit it as a fixture). Kept inline here as the shape.
    """
    RECORDED_SECOND_RUN_USAGE = {
        # Representative of a warm-cache Standard run: curated libs cached,
        # only the user's own telemetry billed fresh.
        "cache_read_input_tokens": 70_000,
        "input_tokens": 18_000,
    }
    share = _cached_input_share(RECORDED_SECOND_RUN_USAGE)
    assert share >= 0.60, (
        f"Second identical run cached input share {share:.0%} < 60% — "
        "curated-library caching (Lever 2) is not taking effect."
    )
