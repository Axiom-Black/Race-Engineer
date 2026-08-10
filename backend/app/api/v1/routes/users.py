"""Users route — placeholder until Clerk auth is integrated."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/me")
async def me() -> dict[str, str]:
    """Return the current user profile. TODO: wire Clerk JWT."""
    return {"status": "auth not yet integrated"}
