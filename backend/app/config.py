from pydantic_settings import BaseSettings
import shutil
from pathlib import Path


class Settings(BaseSettings):
    # LLM provider: "gemini" or "claude"
    llm_provider: str = "gemini"

    # Gemini settings
    gemini_api_key: str = ""

    # Claude CLI settings (fallback)
    claude_bin: str = shutil.which("claude") or "claude"
    claude_model: str = "sonnet"

    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = {"env_prefix": "SLOVAK_"}


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
