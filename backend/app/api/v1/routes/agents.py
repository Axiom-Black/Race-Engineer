"""
Agent orchestration route.

POST /agents/run — run the Race Engineering Agent over a session.

Clean Architecture: this route is the delivery mechanism (detail).
The orchestration logic lives in app.agents, not here.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.agents.orchestrator import OrchestratorInput, run_race_engineer
from app.db.session import get_db
from app.models import AgentRun, LapTime, Session

router = APIRouter()


class AgentRunRequest(BaseModel):
    session_id: uuid.UUID
    mode: str = Field(pattern="^(brief|debrief|monitor)$", default="brief")
    driver_notes: str = ""
    ideal_lap_s: float | None = None
    tier_elite: float = 0.5
    tier_competitive: float = 1.5
    tier_developing: float = 3.0


class AgentRunResponse(BaseModel):
    run_id: uuid.UUID
    orchestrator_summary: str
    agents_engaged: list[str]
    kpis: list[dict]
    guidance: str
    input_tokens: int
    output_tokens: int


@router.post("/run", response_model=AgentRunResponse)
async def run_agent(
    body: AgentRunRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentRunResponse:
    """
    Engage the Race Engineering Agent for a session.
    Orchestrator selects relevant specialists, runs them in parallel,
    collates KPIs, and returns synthesised driver guidance.
    """
    # Load session + lap times
    session_result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = session_result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    laps_result = await db.execute(
        select(LapTime)
        .where(LapTime.session_id == body.session_id)
        .order_by(LapTime.lap_number)
    )
    laps = [row.lap_time_s for row in laps_result.scalars().all()]
    if not laps:
        raise HTTPException(status_code=422, detail="Session has no lap times")

    inp = OrchestratorInput(
        session_id=str(body.session_id),
        simulator="LeMans Ultimate",         # TODO: load from session → simulator join
        car_class="",                         # TODO: load from session → car_class join
        circuit="",                           # TODO: load from session → circuit join
        session_type=session.session_type,
        mode=body.mode,
        lap_times=laps,
        ideal_lap_s=body.ideal_lap_s,
        driver_notes=body.driver_notes,
    )

    result = await run_race_engineer(inp)

    # Persist the run
    run = AgentRun(
        session_id=body.session_id,
        user_id=uuid.UUID("00000000-0000-0000-0000-000000000001"),   # placeholder
        mode=body.mode,
        agents_engaged=result.agents_engaged,
        orchestrator_summary=result.orchestrator_summary,
        kpis=result.kpis,
        guidance=result.guidance,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    db.add(run)
    await db.flush()

    return AgentRunResponse(
        run_id=run.id,
        orchestrator_summary=result.orchestrator_summary,
        agents_engaged=result.agents_engaged,
        kpis=result.kpis,
        guidance=result.guidance,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
