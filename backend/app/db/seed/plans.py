"""
Seed data for the `plans` table.

Mirrors app.services.metering.PLAN_ALLOWANCES exactly — if you change one,
change the other. A future improvement is generating this file FROM the
metering module at migration time instead of hand-duplicating it.

Run after the initial Alembic migration:
    python -m app.db.seed.plans
"""

import asyncio

from app.db.session import AsyncSessionLocal
from app.models import Plan

PLAN_SEED = [
    {"name": "rookie",   "quick_limit": 12, "standard_limit": 1,  "deep_limit": 0,  "seats_max": 1,   "can_purchase_credits": False},
    {"name": "driver",   "quick_limit": -1, "standard_limit": 10, "deep_limit": 0,  "seats_max": 1,   "can_purchase_credits": True},
    {"name": "engineer", "quick_limit": -1, "standard_limit": 30, "deep_limit": 3,  "seats_max": 1,   "can_purchase_credits": True},
    {"name": "garage",   "quick_limit": -1, "standard_limit": 45, "deep_limit": 9,  "seats_max": 50,  "can_purchase_credits": True},
    {"name": "paddock",  "quick_limit": -1, "standard_limit": -1, "deep_limit": -1, "seats_max": 200, "can_purchase_credits": True},
]


async def seed_plans() -> None:
    async with AsyncSessionLocal() as session:
        for row in PLAN_SEED:
            session.add(Plan(**row))
        await session.commit()
    print(f"Seeded {len(PLAN_SEED)} plans.")


if __name__ == "__main__":
    asyncio.run(seed_plans())
