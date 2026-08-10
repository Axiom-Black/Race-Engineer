"""
Race Engineering Agent — orchestrator.

Mirrors the React agent flow, now running on the backend where:
- Model selection (orchestrator vs specialist) is enforced by config.
- Token usage is tracked for cost monitoring.
- Specialist agents run in parallel via asyncio.gather.

Clean Architecture: this module knows nothing about HTTP or the database.
It takes an OrchestratorInput, returns an OrchestratorResult.
Clean Code: one function per responsibility; no side effects.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field

import anthropic

from app.analysis.lap_analysis import compute_metrics, fmt
from app.core.config import settings
from app.services.metering import RUN_CONFIGS, RunClass

# Lazy-initialised Anthropic client (one per process)
_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


# ── Domain agent definitions ──────────────────────────────────────

DOMAIN_AGENTS: dict[str, str] = {
    "aero": (
        "You are the Aerodynamics Agent for ByteCraft Racing. "
        "Report on wing/ride-height settings, aero efficiency, and the downforce-vs-drag "
        "trade-off for this car class and track. "
        "Return exactly 3 findings, each on its own line starting with '• ' and a bold '**label:**'."
    ),
    "tire": (
        "You are the Tire Agent for ByteCraft Racing. "
        "Report on compound selection, wear rate, tire and brake temperatures, and slip behaviour. "
        "Return exactly 3 findings, each on its own line starting with '• ' and a bold '**label:**'."
    ),
    "powertrain": (
        "You are the Powertrain Agent for ByteCraft Racing. "
        "Report on fuel mixture settings, hybrid/electric deployment and harvest strategy, "
        "and their influence on lap performance. "
        "Return exactly 3 findings, each on its own line starting with '• ' and a bold '**label:**'."
    ),
    "telemetry": (
        "You are the Telemetry Agent for ByteCraft Racing. "
        "Report on braking points, longitudinal/lateral acceleration traces, speed and "
        "wheel-rotation patterns, and how these interact across the lap. "
        "Return exactly 3 findings, each on its own line starting with '• ' and a bold '**label:**'."
    ),
    "strategy": (
        "You are the Strategy Agent for ByteCraft Racing. "
        "Build session run-plans, lap-time targets and stint/strategy guidance for the given "
        "session type, calibrated against the user's baseline. "
        "Return exactly 3 findings, each on its own line starting with '• ' and a bold '**label:**'."
    ),
    "environment": (
        "You are the Environment Agent for ByteCraft Racing. "
        "Report on how weather, time of day and track condition influence performance and "
        "setup direction. "
        "Return exactly 3 findings, each on its own line starting with '• ' and a bold '**label:**'."
    ),
}


# ── I/O contracts ─────────────────────────────────────────────────

@dataclass
class OrchestratorInput:
    session_id: str
    simulator: str
    car_class: str
    circuit: str
    session_type: str
    mode: str
    lap_times: list[float]
    run_class: RunClass = RunClass.STANDARD   # Quick | Standard | Deep
    ideal_lap_s: float | None = None
    driver_notes: str = ""


@dataclass
class OrchestratorResult:
    orchestrator_summary: str
    agents_engaged: list[str]
    specialist_reports: dict[str, str] = field(default_factory=dict)
    kpis: list[dict] = field(default_factory=list)
    guidance: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


# ── Helper: single Claude call ────────────────────────────────────

async def _call(
    system: str,
    user: str,
    model: str,
    max_tokens: int = 800,
) -> tuple[str, int, int]:
    """
    Call the Anthropic API.
    Returns (text, input_tokens, output_tokens).
    """
    response = await _get_client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(b.text for b in response.content if hasattr(b, "text"))
    return text, response.usage.input_tokens, response.usage.output_tokens


def _safe_json(raw: str) -> dict | list:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        cleaned = raw.replace("```json", "").replace("```", "").strip()
        start = max(cleaned.find("{"), cleaned.find("["))
        end = max(cleaned.rfind("}"), cleaned.rfind("]"))
        return json.loads(cleaned[start : end + 1])


# ── Context builder ───────────────────────────────────────────────

def _build_context(inp: OrchestratorInput) -> str:
    m = compute_metrics(inp.lap_times, ideal=inp.ideal_lap_s)
    return (
        f"Simulator: {inp.simulator}\n"
        f"Car class: {inp.car_class}\n"
        f"Circuit: {inp.circuit}\n"
        f"Session type: {inp.session_type}\n"
        f"Mode: {inp.mode}\n"
        f"Laps: {inp.lap_times}\n"
        f"Best: {fmt(m.best)}  Worst: {fmt(m.worst)}  Average: {fmt(m.mean)}\n"
        f"Ideal target: {fmt(inp.ideal_lap_s)}  Gap: "
        f"{f'+{m.gap_to_ideal:.3f}s' if m.gap_to_ideal is not None else '—'}\n"
        f"Best 3-lap avg: {fmt(m.best_s3)}  Best 5-lap avg: {fmt(m.best_s5)}\n"
        f"Driver notes: {inp.driver_notes or 'none'}"
    )


# ── Orchestrator ──────────────────────────────────────────────────

async def run_race_engineer(inp: OrchestratorInput) -> OrchestratorResult:
    """
    Full Race Engineering Agent pipeline:
    1. Orchestrator decides which specialists to engage.
    2. Specialists run in parallel (asyncio.gather).
    3. Optimizer derives KPIs.
    4. Synthesizer produces driver guidance.
    """
    result = OrchestratorResult(orchestrator_summary="", agents_engaged=[])
    ctx = _build_context(inp)
    run_cfg = RUN_CONFIGS[inp.run_class]

    # ── Step 1: Orchestrator ─────────────────────────────────────
    orch_text, in_tok, out_tok = await _call(
        system=(
            "You are the Race Engineer Agent — orchestrator for ByteCraft Racing. "
            "Given the session context, select the relevant domain agents and assign each a task. "
            f"Available: {', '.join(DOMAIN_AGENTS.keys())}. "
            "Engage 3–5. Return ONLY valid JSON (no markdown): "
            '{"summary":"one line","agents":{"<id>":"<task>"}}'
        ),
        user=ctx,
        model=run_cfg.orchestrator_model.value,
    )
    result.input_tokens += in_tok
    result.output_tokens += out_tok

    plan = _safe_json(orch_text)
    result.orchestrator_summary = plan.get("summary", "")
    task_map: dict[str, str] = {
        k: v for k, v in plan.get("agents", {}).items() if k in DOMAIN_AGENTS
    }
    result.agents_engaged = list(task_map.keys())

    # ── Step 2: Specialists (parallel) ───────────────────────────
    selected_agents = task_map.keys()
    # Honour the run class's specialist cap (Quick=3, Standard/Deep=6)
    capped_agents = list(selected_agents)[: run_cfg.max_specialists]

    async def run_specialist(agent_id: str, task: str) -> tuple[str, str, int, int]:
        text, i, o = await _call(
            system=DOMAIN_AGENTS[agent_id],
            user=f"{ctx}\n\nYour assigned task: {task}",
            model=run_cfg.specialist_model.value,
            max_tokens=600,
        )
        return agent_id, text, i, o

    specialist_tasks = [run_specialist(aid, task_map[aid]) for aid in capped_agents]
    specialist_results = await asyncio.gather(*specialist_tasks, return_exceptions=True)

    reports: dict[str, str] = {}
    for res in specialist_results:
        if isinstance(res, Exception):
            continue
        agent_id, text, i, o = res
        reports[agent_id] = text
        result.input_tokens += i
        result.output_tokens += o
    result.specialist_reports = reports

    combined_reports = "\n\n".join(
        f"### {aid.upper()}\n{text}" for aid, text in reports.items()
    )

    # ── Step 3: Optimizer (KPIs) ─────────────────────────────────
    kpi_text, i, o = await _call(
        system=(
            "You are the Optimizer Agent for ByteCraft Racing. "
            "From the specialist reports, derive 4 performance KPIs. "
            "Return ONLY a JSON array (no markdown): "
            '[{"name":"KPI","value":"number","unit":"unit","status":"good|watch|risk","note":"<8 words"}]'
        ),
        user=f"{ctx}\n\nReports:\n{combined_reports}",
        model=run_cfg.specialist_model.value,
        max_tokens=600,
    )
    result.input_tokens += i
    result.output_tokens += o
    try:
        result.kpis = _safe_json(kpi_text)
    except Exception:
        result.kpis = []

    # ── Step 4: Synthesizer ───────────────────────────────────────
    guidance_text, i, o = await _call(
        system=(
            "You are the Synthesizer Agent for ByteCraft Racing — guide the driver on "
            "utility and TRADE-OFFS of each setup/technique decision. "
            "Use EXACTLY these ## headers: HEADLINE, DO THIS, TRADE-OFFS, CONFIDENCE."
        ),
        user=f"{ctx}\n\nSpecialist reports:\n{combined_reports}",
        model=run_cfg.synthesizer_model.value,
        max_tokens=900,
    )
    result.input_tokens += i
    result.output_tokens += o
    result.guidance = guidance_text

    return result
