"""Anthropic Claude LLM client for Slovak learning."""

from __future__ import annotations

import json
import logging
import re

import anthropic

from .config import settings

log = logging.getLogger(__name__)

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        kwargs = {}
        if settings.anthropic_api_key:
            kwargs["api_key"] = settings.anthropic_api_key
        _client = anthropic.AsyncAnthropic(**kwargs)
    return _client


async def ask(prompt: str, system_prompt: str | None = None, max_tokens: int = 4096) -> str:
    """Send a prompt to Claude and return the text response."""
    client = _get_client()
    kwargs: dict = {
        "model": settings.anthropic_model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system_prompt:
        kwargs["system"] = system_prompt

    response = await client.messages.create(**kwargs)
    return response.content[0].text


async def ask_messages(
    messages: list[dict],
    system_prompt: str,
    max_tokens: int = 1024,
) -> str:
    """Send a multi-turn conversation to Claude using native messages format."""
    client = _get_client()
    response = await client.messages.create(
        model=settings.anthropic_model,
        system=system_prompt,
        messages=messages,
        max_tokens=max_tokens,
    )
    return response.content[0].text


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
        raise ValueError(f"No JSON found in response: {text[:200]}")

    last_brace = text.rfind("}")
    if last_brace <= start:
        raise ValueError(f"No JSON found in response: {text[:200]}")

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

    raise ValueError(f"Failed to extract JSON from response: {text[:300]}")


async def ask_json(prompt: str, system_prompt: str | None = None) -> dict:
    """Send a prompt to Claude and parse the JSON response."""
    raw = await ask(prompt, system_prompt)
    return _extract_json(raw)
