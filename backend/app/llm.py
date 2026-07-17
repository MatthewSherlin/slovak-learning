"""LLM client for Slovak learning — Anthropic by default, OpenRouter optional."""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from typing import Awaitable, Callable, TypeVar

import anthropic
import httpx

from .config import settings

log = logging.getLogger(__name__)

T = TypeVar("T")


class LLMError(Exception):
    """The LLM call failed or returned an unusable response.

    Deliberately NOT a ValueError: the API layer maps ValueError to 404
    (session not found) and LLMError to 502 (upstream AI failure).
    """


class _TransientLLMError(Exception):
    """Internal: a retryable failure (rate limit, connection, 5xx)."""


_MAX_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1.0  # seconds; doubled per attempt, tests set this to 0

_client: anthropic.AsyncAnthropic | None = None
_http: httpx.AsyncClient | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        kwargs = {}
        if settings.anthropic_api_key:
            kwargs["api_key"] = settings.anthropic_api_key
        _client = anthropic.AsyncAnthropic(**kwargs)
    return _client


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=60.0)
    return _http


async def _with_retries(call: Callable[[], Awaitable[T]]) -> T:
    """Run an LLM call, retrying transient failures with exponential backoff."""
    delay = _RETRY_BASE_DELAY
    for attempt in range(_MAX_ATTEMPTS):
        try:
            return await call()
        except _TransientLLMError as e:
            if attempt == _MAX_ATTEMPTS - 1:
                raise LLMError(f"LLM unavailable after {_MAX_ATTEMPTS} attempts: {e}") from e
            log.warning("Transient LLM failure (attempt %d): %s", attempt + 1, e)
            await asyncio.sleep(delay + random.uniform(0, delay / 2 if delay else 0))
            delay *= 2
    raise LLMError("unreachable")


async def _anthropic_chat(
    messages: list[dict], system_prompt: str | None, max_tokens: int
) -> str:
    """Single Anthropic API call, mapping failures to LLM error types."""
    client = _get_client()
    kwargs: dict = {
        "model": settings.anthropic_model,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    if system_prompt:
        kwargs["system"] = system_prompt
    try:
        response = await client.messages.create(**kwargs)
    except (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.InternalServerError) as e:
        raise _TransientLLMError(str(e)) from e
    except anthropic.APIError as e:
        raise LLMError(f"Anthropic API error: {e}") from e
    if not response.content:
        raise LLMError("Empty response from LLM")
    return response.content[0].text


def _parse_openrouter_response(data: dict) -> str:
    """Extract message text from an OpenAI-style chat completion payload."""
    if "error" in data:
        raise LLMError(f"OpenRouter error: {data['error'].get('message', data['error'])}")
    choices = data.get("choices") or []
    if not choices:
        raise LLMError("Empty response from LLM")
    content = choices[0].get("message", {}).get("content")
    if not content:
        raise LLMError("Empty response from LLM")
    return content


async def _openrouter_chat(
    messages: list[dict], system_prompt: str | None, max_tokens: int
) -> str:
    """Single OpenRouter (OpenAI-compatible) API call."""
    payload_messages = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)
    try:
        resp = await _get_http().post(
            f"{settings.openrouter_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            json={
                "model": settings.openrouter_model,
                "max_tokens": max_tokens,
                "messages": payload_messages,
            },
        )
    except httpx.TransportError as e:
        raise _TransientLLMError(str(e)) from e
    if resp.status_code == 429 or resp.status_code >= 500:
        raise _TransientLLMError(f"OpenRouter HTTP {resp.status_code}")
    if resp.status_code != 200:
        raise LLMError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:200]}")
    return _parse_openrouter_response(resp.json())


async def _chat(messages: list[dict], system_prompt: str | None, max_tokens: int) -> str:
    """Route to the configured provider, with retries."""
    if settings.llm_provider == "openrouter":
        return await _with_retries(lambda: _openrouter_chat(messages, system_prompt, max_tokens))
    return await _with_retries(lambda: _anthropic_chat(messages, system_prompt, max_tokens))


async def ask(prompt: str, system_prompt: str | None = None, max_tokens: int = 4096) -> str:
    """Send a prompt to the LLM and return the text response."""
    return await _chat([{"role": "user", "content": prompt}], system_prompt, max_tokens)


async def ask_messages(
    messages: list[dict],
    system_prompt: str,
    max_tokens: int = 1024,
) -> str:
    """Send a multi-turn conversation to the LLM using messages format."""
    return await _chat(messages, system_prompt, max_tokens)


def _repair_json(text: str) -> str:
    """Attempt to fix common LLM JSON issues like unescaped quotes in strings."""
    # Fix unescaped inner quotes within JSON string values.
    # Walk character-by-character tracking whether we're inside a JSON string.
    result: list[str] = []
    in_string = False
    i = 0
    while i < len(text):
        ch = text[i]
        if not in_string:
            result.append(ch)
            if ch == '"':
                in_string = True
        else:
            if ch == '\\':
                # Escaped character — keep as-is
                result.append(ch)
                if i + 1 < len(text):
                    i += 1
                    result.append(text[i])
            elif ch == '"':
                # Is this the closing quote or an unescaped inner quote?
                # Look ahead: if the next non-whitespace is a structural char
                # (: , } ] or end), it's a real closing quote.
                rest = text[i + 1:].lstrip()
                if not rest or rest[0] in ':,}]':
                    result.append(ch)
                    in_string = False
                else:
                    # Unescaped inner quote — escape it
                    result.append('\\"')
            elif ch == '\n':
                # Newlines inside strings must be escaped
                result.append('\\n')
            else:
                result.append(ch)
        i += 1
    return ''.join(result)


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling fenced blocks and partial JSON."""
    # Try fenced code block first
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if match:
        candidate = match.group(1).strip()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # Try raw JSON parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Try to find JSON object boundaries
    start = text.find("{")
    if start == -1:
        raise LLMError(f"No JSON found in response: {text[:200]}")

    last_brace = text.rfind("}")
    if last_brace <= start:
        raise LLMError(f"No JSON found in response: {text[:200]}")

    candidate = text[start : last_brace + 1]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Attempt to repair malformed JSON (unescaped quotes, raw newlines)
    try:
        return json.loads(_repair_json(candidate))
    except json.JSONDecodeError:
        pass

    raise LLMError(f"Failed to extract JSON from response: {text[:300]}")


async def ask_json(prompt: str, system_prompt: str | None = None) -> dict:
    """Send a prompt to the LLM and parse the JSON response.

    If the first response isn't parseable JSON, retries once with an
    explicit JSON-only instruction before giving up.
    """
    raw = await ask(prompt, system_prompt)
    try:
        return _extract_json(raw)
    except LLMError:
        log.warning("Unparseable JSON response, retrying with stricter instruction")
        strict_prompt = (
            f"{prompt}\n\nRespond with ONLY valid JSON. "
            "No prose, no markdown fences, no explanations."
        )
        raw = await ask(strict_prompt, system_prompt)
        return _extract_json(raw)
