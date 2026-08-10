"""
ByteCraft Racing — Race Engineering Agent
Backend entrypoint.

Architecture: FastAPI + SQLAlchemy (async) + TimescaleDB
Standards:    Clean Architecture — framework is a detail, routed to the boundary.
              Clean Code        — main module composes the application; it does not contain logic.
"""

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine
from app.models import Base  # noqa: F401 — import all models so Alembic sees them

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    """Startup / shutdown boundary — database pool open → yield → close."""
    logger.info("startup", env=settings.APP_ENV)
    async with engine.begin() as conn:
        # In production, Alembic manages schema. This guard is for local dev only.
        if settings.APP_ENV == "development":
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()
    logger.info("shutdown")


app = FastAPI(
    title="ByteCraft Racing — Race Engineering Agent",
    version="0.1.0",
    docs_url="/docs" if settings.APP_ENV != "production" else None,
    redoc_url="/redoc" if settings.APP_ENV != "production" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.APP_ENV}
