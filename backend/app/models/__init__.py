"""
ORM models — ByteCraft Racing.

Design notes (Clean Architecture — Entities layer):
- Entities contain identity and pure business data only.
- No business logic lives here; that belongs in services/use-cases.
- TimescaleDB hypertables (lap_times, telemetry_channels, agent_runs) are
  declared as regular SQLAlchemy tables; the hypertable conversion is handled
  in the Alembic migration (see migrations/versions/).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


# ── Plans & tenancy ────────────────────────────────────────────────

class Plan(Base):
    """
    Subscription plan. Defines monthly run allowances per run class.
    Mirrors app.services.metering.PLAN_ALLOWANCES — keep in sync.
    """
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True)  # rookie|driver|engineer|garage|paddock
    quick_limit: Mapped[int] = mapped_column(Integer)       # -1 = unlimited
    standard_limit: Mapped[int] = mapped_column(Integer)
    deep_limit: Mapped[int] = mapped_column(Integer)
    seats_max: Mapped[int] = mapped_column(Integer, default=1)  # >1 only meaningful for garage/paddock
    can_purchase_credits: Mapped[bool] = mapped_column(Boolean, default=False)


class Garage(Base):
    """
    A team account (2-50 seats). Quota is pooled across all members —
    see app.services.metering for pooled-allowance enforcement.
    """
    __tablename__ = "garages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    admin_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", use_alter=True))
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["User"]] = relationship(back_populates="garage", foreign_keys="User.garage_id")
    plan: Mapped["Plan"] = relationship()


# ── Identity ──────────────────────────────────────────────────────

class User(Base):
    """
    Driver account.
    role: "driver" | "garage_admin" | "product_admin" — enforced server-side
          via the Clerk JWT claim, never trusted from client state.
    garage_id is null for solo drivers; set for garage members and the
    garage's own admin. plan_id is always set — solo users have their own
    plan, garage members inherit the garage's plan at the application layer.
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(20), default="driver")
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"))
    garage_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("garages.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    plan: Mapped["Plan"] = relationship()
    garage: Mapped["Garage | None"] = relationship(back_populates="members", foreign_keys=[garage_id])
    sessions: Mapped[list["Session"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notes: Mapped[list["UserTrackNote"]] = relationship(back_populates="user", cascade="all, delete-orphan")


# ── Reference data (ByteCraft-controlled) ─────────────────────────

class Simulator(Base):
    __tablename__ = "simulators"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    telemetry_format: Mapped[str] = mapped_column(String(40))  # "motec_ld"


class CarClass(Base):
    __tablename__ = "car_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    simulator_id: Mapped[int] = mapped_column(ForeignKey("simulators.id"))
    category: Mapped[str] = mapped_column(String(40))   # Hypercar, LMP2, GTE …
    name: Mapped[str] = mapped_column(String(120))      # GTE — Ferrari 488 GTE Evo


class Circuit(Base):
    __tablename__ = "circuits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    simulator_id: Mapped[int] = mapped_column(ForeignKey("simulators.id"))
    name: Mapped[str] = mapped_column(String(120))
    layout: Mapped[str | None] = mapped_column(String(80))   # None = default layout
    corner_count: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (UniqueConstraint("simulator_id", "name", "layout"),)


class IdealTarget(Base):
    """ByteCraft-published ideal lap time per scenario."""
    __tablename__ = "ideal_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    simulator_id: Mapped[int] = mapped_column(ForeignKey("simulators.id"))
    car_class_id: Mapped[int] = mapped_column(ForeignKey("car_classes.id"))
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    session_type: Mapped[str] = mapped_column(String(20))   # Testing | Practice | Qualifying | Race
    lap_time_s: Mapped[float] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("simulator_id", "car_class_id", "circuit_id", "session_type"),)


class PublishedCornerNote(Base):
    """ByteCraft-published corner dossier entry. Read-only to drivers."""
    __tablename__ = "published_corner_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    car_class_id: Mapped[int] = mapped_column(ForeignKey("car_classes.id"))
    corner_number: Mapped[int] = mapped_column(Integer)
    corner_name: Mapped[str] = mapped_column(String(80))
    published: Mapped[bool] = mapped_column(Boolean, default=False)

    # Dossier zones (nullable until published)
    entry_speed: Mapped[str | None] = mapped_column(String(40))
    gear: Mapped[str | None] = mapped_column(String(20))
    position_entry: Mapped[str | None] = mapped_column(Text)
    position_apex: Mapped[str | None] = mapped_column(Text)
    position_exit: Mapped[str | None] = mapped_column(Text)
    risks: Mapped[str | None] = mapped_column(Text)

    # Tire load (FL / FR / RL / RR) stored as JSON {"FL":"High","FR":"Med",...}
    tire_load: Mapped[dict | None] = mapped_column(JSON)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("circuit_id", "car_class_id", "corner_number"),)


# ── User-owned data ───────────────────────────────────────────────

class Session(Base):
    """One on-track session uploaded by a driver."""
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    simulator_id: Mapped[int] = mapped_column(ForeignKey("simulators.id"))
    car_class_id: Mapped[int] = mapped_column(ForeignKey("car_classes.id"))
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    session_type: Mapped[str] = mapped_column(String(20))   # Testing | Practice | Qualifying | Race
    session_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Raw upload paths (S3/R2 keys). A session is not usable by the agents
    # until all three are present and ingest_status == "complete" — see
    # app/ingest/. Trackability requirement: telemetry and setup are
    # uploaded together and linked at the session level, never separately.
    motec_ld_path: Mapped[str | None] = mapped_column(String(512))
    motec_ldx_path: Mapped[str | None] = mapped_column(String(512))
    setup_svm_path: Mapped[str | None] = mapped_column(String(512))
    ingest_status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending | parsing | complete | failed
    ingest_error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="sessions")
    lap_times: Mapped[list["LapTime"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    notes: Mapped[list["SessionNote"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    agent_runs: Mapped[list["AgentRun"]] = relationship(back_populates="session", cascade="all, delete-orphan")
    setup: Mapped["Setup | None"] = relationship(back_populates="session", cascade="all, delete-orphan", uselist=False)

    __table_args__ = (
        Index("ix_sessions_user_combo", "user_id", "simulator_id", "car_class_id", "circuit_id", "session_type"),
    )


class Setup(Base):
    """
    Parsed .svm car setup, one-to-one with its session.
    Source: app.ingest.setup.parse_setup(). raw_parsed preserves every key
    the parser saw, including ones not yet mapped to a named column —
    nothing from the uploaded file is silently discarded.

    energy_type discriminates which of fuel_load_kg / virtual_energy_pct
    is authoritative — Hypercar and LMGT3 run Virtual Energy, LMP2/LMP3/GTE
    use raw fuel capacity. Agents must branch on this field, never assume.
    """
    __tablename__ = "setups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"), unique=True)

    front_wing_angle: Mapped[float | None] = mapped_column(Float)
    rear_wing_angle: Mapped[float | None] = mapped_column(Float)
    ride_height_front: Mapped[float | None] = mapped_column(Float)
    ride_height_rear: Mapped[float | None] = mapped_column(Float)
    spring_front: Mapped[float | None] = mapped_column(Float)
    spring_rear: Mapped[float | None] = mapped_column(Float)
    arb_front: Mapped[float | None] = mapped_column(Float)
    arb_rear: Mapped[float | None] = mapped_column(Float)
    damper_bump_front: Mapped[float | None] = mapped_column(Float)
    damper_bump_rear: Mapped[float | None] = mapped_column(Float)
    damper_rebound_front: Mapped[float | None] = mapped_column(Float)
    damper_rebound_rear: Mapped[float | None] = mapped_column(Float)
    brake_bias_pct: Mapped[float | None] = mapped_column(Float)
    brake_pressure_pct: Mapped[float | None] = mapped_column(Float)
    diff_power_pct: Mapped[float | None] = mapped_column(Float)
    diff_coast_pct: Mapped[float | None] = mapped_column(Float)
    tire_pressure_fl: Mapped[float | None] = mapped_column(Float)
    tire_pressure_fr: Mapped[float | None] = mapped_column(Float)
    tire_pressure_rl: Mapped[float | None] = mapped_column(Float)
    tire_pressure_rr: Mapped[float | None] = mapped_column(Float)

    energy_type: Mapped[str] = mapped_column(String(20), default="fuel")  # fuel | virtual_energy
    fuel_load_kg: Mapped[float | None] = mapped_column(Float)
    virtual_energy_pct: Mapped[float | None] = mapped_column(Float)

    gear_ratios: Mapped[list[float] | None] = mapped_column(JSON)
    raw_parsed: Mapped[dict | None] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship(back_populates="setup")


class LapTime(Base):
    """
    Individual lap times per session.
    TimescaleDB hypertable — partitioned on recorded_at.
    Alembic migration calls: SELECT create_hypertable('lap_times', 'recorded_at');
    """
    __tablename__ = "lap_times"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"))
    lap_number: Mapped[int] = mapped_column(Integer)
    lap_time_s: Mapped[float] = mapped_column(Float)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship(back_populates="lap_times")

    __table_args__ = (
        Index("ix_lap_times_session_lap", "session_id", "lap_number"),
    )


class TelemetryChannel(Base):
    """
    High-frequency MoTeC channel data.
    TimescaleDB hypertable — partitioned on recorded_at.
    Alembic migration calls: SELECT create_hypertable('telemetry_channels', 'recorded_at');

    channel examples: speed_kmh, throttle_pct, brake_pct, lat_g, long_g, vert_g,
                      steering_deg, fl_temp, fr_temp, rl_temp, rr_temp,
                      fl_press, fr_press, rl_press, rr_press
    """
    __tablename__ = "telemetry_channels"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"))
    lap_number: Mapped[int] = mapped_column(Integer)
    channel: Mapped[str] = mapped_column(String(60))
    value: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_telemetry_session_channel", "session_id", "channel", "recorded_at"),
    )


class SessionNote(Base):
    """Driver-written note on a session, optionally tagged with a contributing agent."""
    __tablename__ = "session_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sessions.id"))
    body: Mapped[str] = mapped_column(Text)
    agent_tag: Mapped[str | None] = mapped_column(String(20))  # AERO | TIRE | TEL | STR …
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["Session"] = relationship(back_populates="notes")


class UserTrackNote(Base):
    """
    Driver-written track note using the ByteCraft corner template.
    Scoped per user × circuit × car_class.
    """
    __tablename__ = "user_track_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    circuit_id: Mapped[int] = mapped_column(ForeignKey("circuits.id"))
    car_class_id: Mapped[int] = mapped_column(ForeignKey("car_classes.id"))
    corner_number: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="notes")


# ── Agent runs (audit trail) ──────────────────────────────────────

class AgentRun(Base):
    """
    Records every agent orchestration run — inputs, outputs, and timing.
    TimescaleDB hypertable — partitioned on started_at.
    Alembic migration calls: SELECT create_hypertable('agent_runs', 'started_at');
    """
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sessions.id"), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    mode: Mapped[str] = mapped_column(String(20))       # brief | debrief | monitor
    run_class: Mapped[str] = mapped_column(String(10), default="standard")  # quick | standard | deep
    agents_engaged: Mapped[list[str]] = mapped_column(JSON)
    orchestrator_summary: Mapped[str | None] = mapped_column(Text)
    kpis: Mapped[list | None] = mapped_column(JSON)
    guidance: Mapped[str | None] = mapped_column(Text)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)  # from app.services.metering.compute_run_cost
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    session: Mapped["Session | None"] = relationship(back_populates="agent_runs")

    __table_args__ = (
        Index("ix_agent_runs_user_started", "user_id", "started_at"),
    )
