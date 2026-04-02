import asyncio
import json
import logging
import re

from .config import settings

log = logging.getLogger(__name__)


async def ask_claude(
    prompt: str,
    system_prompt: str | None = None,
    timeout: int = 120,
    retries: int = 2,
) -> str:
    cmd = [settings.claude_bin, "-p", prompt, "--output-format", "text", "--model", settings.claude_model]
    if system_prompt:
        cmd += ["--system-prompt", system_prompt]

    for attempt in range(retries + 1):
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            if proc.returncode != 0:
                err = stderr.decode().strip()
                log.warning("claude exit %d (attempt %d): %s", proc.returncode, attempt, err)
                if attempt < retries:
                    await asyncio.sleep(2)
                    continue
                raise RuntimeError(f"claude failed: {err}")

            return stdout.decode().strip()

        except asyncio.TimeoutError:
            log.warning("claude timed out (attempt %d)", attempt)
            try:
                proc.kill()
            except Exception:
                pass
            if attempt < retries:
                continue
            raise RuntimeError("claude timed out")

    raise RuntimeError("claude failed after retries")


async def ask_claude_json(
    prompt: str,
    system_prompt: str | None = None,
    timeout: int = 120,
) -> dict:
    raw = await ask_claude(prompt, system_prompt, timeout)
    return _extract_json(raw)


def _extract_json(text: str) -> dict:
    fence = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    brace = text.find("{")
    bracket = text.find("[")
    if brace == -1 and bracket == -1:
        raise ValueError(f"No JSON found in response: {text[:200]}")

    start = min(x for x in (brace, bracket) if x >= 0)
    open_char = text[start]
    close_char = "}" if open_char == "{" else "]"

    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == open_char:
            depth += 1
        elif ch == close_char:
            depth -= 1
        if depth == 0:
            return json.loads(text[start : i + 1])

    raise ValueError(f"Unbalanced JSON in response: {text[:200]}")
