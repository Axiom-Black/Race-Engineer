"""
Session routes.

POST /sessions/          — create a session (manual lap times or file upload)
GET  /sessions/          — list sessions for the authenticated user
GET  /sessions/{id}      — session detail + computed metrics
POST /sessions/{id}/notes — add a note to a session
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.analysis.lap_analysis import LapMetrics, TierThresholds, classify_tier, compute_metrics
from app.db.session import get_db
from app.models import LapTime, Session, SessionNote

router = APIRouter()


# ── Request / Response schemas ────────────────────────────────────

class SessionCreate(BaseModel):
    simulator_id: int
    car_class_id: int
    circuit_id: int
    session_type: str = Field(pattern="^(Testing|Practice|Qualifying|Race)$")
    session_date: datetime
    lap_times: list[float] = Field(min_length=1, description="Lap times in seconds")


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    agent_tag: str | None = Field(default=None, max_length=20)


class MetricsResponse(BaseModel):
    session_id: uuid.UUID
    session_type: str
    lap_count: int
    ideal: float | None
    best: float
    worst: float
    mean: float
    median: float
    std_dev: float
    best_s3: float | None
    best_s5: float | None
    best_s7: float | None
    best_s10: float | None
    gap_to_ideal: float | None
    tier: str
    closeness_pct: float


# ── Routes ────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    # TODO: replace with real Clerk auth dependency
    # current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Create a session and persist its lap times."""
    # Placeholder user_id until auth is wired
    placeholder_user_id = uuid.UUID("00000000-0000-0000-0000-000000000001")

    session = Session(
        user_id=placeholder_user_id,
        simulator_id=body.simulator_id,
        car_class_id=body.car_class_id,
        circuit_id=body.circuit_id,
        session_type=body.session_type,
        session_date=body.session_date,
    )
    db.add(session)
    await db.flush()   # get session.id before inserting lap times

    for i, lap_time_s in enumerate(body.lap_times, start=1):
        db.add(LapTime(
            session_id=session.id,
            lap_number=i,
            lap_time_s=lap_time_s,
        ))

    return {"id": str(session.id)}


@router.get("/{session_id}/metrics", response_model=MetricsResponse)
async def get_session_metrics(
    session_id: uuid.UUID,
    ideal: float | None = None,
    tier_elite: float = 0.5,
    tier_competitive: float = 1.5,
    tier_developing: float = 3.0,
    db: AsyncSession = Depends(get_db),
) -> MetricsResponse:
    """Return computed lap metrics and tier classification for a session."""
    # Load lap times
    result = await db.execute(
        select(LapTime)
        .where(LapTime.session_id == session_id)
        .order_by(LapTime.lap_number)
    )
    laps = result.scalars().all()

    if not laps:
        raise HTTPException(status_code=404, detail="Session not found or has no laps")

    session_result = await db.execute(select(Session).where(Session.id == session_id))
    session = session_result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    lap_times = [lap.lap_time_s for lap in laps]
    thresholds = TierThresholds(elite=tier_elite, competitive=tier_competitive, developing=tier_developing)

    m: LapMetrics = compute_metrics(lap_times, ideal=ideal)
    tier = classify_tier(m.gap_to_ideal, thresholds)

    return MetricsResponse(
        session_id=session_id,
        session_type=session.session_type,
        lap_count=len(laps),
        ideal=m.ideal,
        best=m.best,
        worst=m.worst,
        mean=m.mean,
        median=m.median,
        std_dev=m.std_dev,
        best_s3=m.best_s3,
        best_s5=m.best_s5,
        best_s7=m.best_s7,
        best_s10=m.best_s10,
        gap_to_ideal=m.gap_to_ideal,
        tier=tier.name,
        closeness_pct=tier.closeness_pct,
    )


@router.post("/{session_id}/notes", status_code=status.HTTP_201_CREATED)
async def add_note(
    session_id: uuid.UUID,
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Add a note to a session, optionally tagged with a contributing agent."""
    note = SessionNote(
        session_id=session_id,
        body=body.body,
        agent_tag=body.agent_tag,
    )
    db.add(note)
    return {"id": str(note.id)}
