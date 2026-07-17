import os
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
    anthropic_model: str = "claude-haiku-4-5-20251001"

    # LLM provider: "anthropic" (default) or "openrouter"
    llm_provider: str = "anthropic"
    openrouter_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("OPENROUTER_API_KEY", "SLOVAK_OPENROUTER_API_KEY"),
    )
    openrouter_model: str = "google/gemini-2.5-flash"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"

    db_path: Path = Path(__file__).resolve().parent.parent / "data" / "slovak.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://nilrehsttam.github.io",
        "https://matthewsherlin.github.io",
    ]

    # extra="ignore": unrelated keys in .env must not crash startup
    model_config = {"env_prefix": "SLOVAK_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
