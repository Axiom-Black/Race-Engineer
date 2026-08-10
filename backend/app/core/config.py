"""
Application configuration.

Clean Architecture: all environment-specific values are gathered here at the boundary.
No other module reads os.environ directly.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "change-me"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://bytecraft:bytecraft@localhost:5432/bytecraft_racing"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Anthropic
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL_ORCHESTRATOR: str = "claude-sonnet-4-6"
    ANTHROPIC_MODEL_SPECIALIST: str = "claude-haiku-4-5-20251001"
    ANTHROPIC_MODEL_SYNTHESIZER: str = "claude-sonnet-4-6"

    # Auth
    CLERK_SECRET_KEY: str = ""
    CLERK_PUBLISHABLE_KEY: str = ""

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def split_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


settings = Settings()
