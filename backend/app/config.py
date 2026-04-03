import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
    anthropic_model: str = "claude-haiku-4-5-20251001"

    db_path: Path = Path(__file__).resolve().parent.parent / "data" / "slovak.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://nilrehsttam.github.io",
        "https://matthewsherlin.github.io",
    ]

    model_config = {"env_prefix": "SLOVAK_", "env_file": ".env"}


settings = Settings()
settings.db_path.parent.mkdir(parents=True, exist_ok=True)
