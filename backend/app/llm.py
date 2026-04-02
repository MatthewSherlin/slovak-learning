"""Unified LLM client — routes to Gemini or Claude based on config."""

from .config import settings


async def ask(prompt: str, system_prompt: str | None = None, timeout: int = 120) -> str:
    if settings.llm_provider == "gemini" and settings.gemini_api_key:
        from .gemini_client import ask_gemini
        return await ask_gemini(prompt, system_prompt, timeout)
    else:
        from .claude_client import ask_claude
        return await ask_claude(prompt, system_prompt, timeout)


async def ask_json(prompt: str, system_prompt: str | None = None, timeout: int = 120) -> dict:
    if settings.llm_provider == "gemini" and settings.gemini_api_key:
        from .gemini_client import ask_gemini_json
        return await ask_gemini_json(prompt, system_prompt, timeout)
    else:
        from .claude_client import ask_claude_json
        return await ask_claude_json(prompt, system_prompt, timeout)
