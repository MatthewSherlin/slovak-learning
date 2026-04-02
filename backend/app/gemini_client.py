"""Gemini API client — free tier, no SDK dependency, just HTTP calls."""

import asyncio
import json
import logging
import re
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from .config import settings

log = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


def _call_gemini_sync(
    prompt: str,
    system_prompt: str | None = None,
) -> str:
    body: dict = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 2048,
        },
    }

    if system_prompt:
        body["systemInstruction"] = {"parts": [{"text": system_prompt}]}

    url = f"{GEMINI_URL}?key={settings.gemini_api_key}"
    data = json.dumps(body).encode()
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")

    try:
        with urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        log.error("Gemini API error %d: %s", e.code, error_body)
        raise RuntimeError(f"Gemini API error: {e.code}")

    try:
        return result["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        log.error("Unexpected Gemini response: %s", json.dumps(result)[:500])
        raise RuntimeError("Failed to parse Gemini response")


async def ask_gemini(
    prompt: str,
    system_prompt: str | None = None,
    timeout: int = 120,
    retries: int = 2,
) -> str:
    loop = asyncio.get_event_loop()
    for attempt in range(retries + 1):
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, _call_gemini_sync, prompt, system_prompt),
                timeout=timeout,
            )
            return result.strip()
        except asyncio.TimeoutError:
            log.warning("Gemini timed out (attempt %d)", attempt)
            if attempt < retries:
                await asyncio.sleep(1)
                continue
            raise RuntimeError("Gemini timed out")
        except Exception as e:
            log.warning("Gemini error (attempt %d): %s", attempt, e)
            if attempt < retries:
                await asyncio.sleep(1)
                continue
            raise

    raise RuntimeError("Gemini failed after retries")


async def ask_gemini_json(
    prompt: str,
    system_prompt: str | None = None,
    timeout: int = 120,
) -> dict:
    raw = await ask_gemini(prompt, system_prompt, timeout)
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
