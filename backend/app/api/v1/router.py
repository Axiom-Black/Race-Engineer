"""
API v1 router.

Clean Architecture: this module is the boundary between HTTP (detail) and
use-cases (policy). Each route file handles one domain only.
"""

from fastapi import APIRouter

from app.api.v1.routes import agents, sessions, users

api_router = APIRouter()

api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(agents.router, prefix="/agents", tags=["agents"])
