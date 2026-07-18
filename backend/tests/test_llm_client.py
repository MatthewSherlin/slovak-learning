"""Tests for the LLM client — provider routing, retries, and JSON robustness."""

from __future__ import annotations

import pytest

from app import llm
from app.config import Settings, settings
from app.llm import LLMError, _parse_openrouter_response


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    """No real backoff sleeps in tests."""
    monkeypatch.setattr(llm, "_RETRY_BASE_DELAY", 0.0)


# ── Retry behavior ───────────────────────────────────────────────────


@pytest.mark.asyncio
class TestRetries:
    async def test_transient_error_retried_then_succeeds(self):
        attempts = 0

        async def flaky():
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise llm._TransientLLMError("rate limited")
            return "success"

        result = await llm._with_retries(flaky)
        assert result == "success"
        assert attempts == 3

    async def test_persistent_transient_error_becomes_llm_error(self):
        attempts = 0

        async def always_fails():
            nonlocal attempts
            attempts += 1
            raise llm._TransientLLMError("still down")

        with pytest.raises(LLMError):
            await llm._with_retries(always_fails)
        assert attempts == 3  # initial + 2 retries

    async def test_non_transient_error_not_retried(self):
        attempts = 0

        async def hard_fail():
            nonlocal attempts
            attempts += 1
            raise LLMError("bad request")

        with pytest.raises(LLMError):
            await llm._with_retries(hard_fail)
        assert attempts == 1


# ── ask_json retry-on-parse-failure ──────────────────────────────────


@pytest.mark.asyncio
class TestAskJsonRetry:
    async def test_retries_once_with_stricter_prompt_on_bad_json(self, monkeypatch):
        calls: list[str] = []

        async def fake_ask(prompt, system_prompt=None, max_tokens=4096):
            calls.append(prompt)
            if len(calls) == 1:
                return "Sorry, here's your data but I forgot the JSON"
            return '{"ok": true}'

        monkeypatch.setattr(llm, "ask", fake_ask)
        result = await llm.ask_json("give me data")
        assert result == {"ok": True}
        assert len(calls) == 2
        assert "ONLY valid JSON" in calls[1]

    async def test_gives_up_after_second_bad_response(self, monkeypatch):
        async def fake_ask(prompt, system_prompt=None, max_tokens=4096):
            return "still not json"

        monkeypatch.setattr(llm, "ask", fake_ask)
        with pytest.raises(LLMError):
            await llm.ask_json("give me data")

    async def test_good_json_first_try_no_retry(self, monkeypatch):
        calls: list[str] = []

        async def fake_ask(prompt, system_prompt=None, max_tokens=4096):
            calls.append(prompt)
            return '{"questions": []}'

        monkeypatch.setattr(llm, "ask", fake_ask)
        result = await llm.ask_json("give me data")
        assert result == {"questions": []}
        assert len(calls) == 1


# ── OpenRouter response parsing ──────────────────────────────────────


class TestOpenRouterParsing:
    def test_parses_chat_completion(self):
        data = {"choices": [{"message": {"content": "Ahoj!"}}]}
        assert _parse_openrouter_response(data) == "Ahoj!"

    def test_empty_choices_raises(self):
        with pytest.raises(LLMError):
            _parse_openrouter_response({"choices": []})

    def test_missing_content_raises(self):
        with pytest.raises(LLMError):
            _parse_openrouter_response({"choices": [{"message": {}}]})

    def test_error_payload_raises_with_message(self):
        data = {"error": {"message": "Insufficient credits"}}
        with pytest.raises(LLMError, match="Insufficient credits"):
            _parse_openrouter_response(data)


# ── Provider routing ─────────────────────────────────────────────────


@pytest.mark.asyncio
class TestProviderRouting:
    async def test_openrouter_provider_routes_to_openrouter(self, monkeypatch):
        captured: dict = {}

        async def fake_openrouter(messages, system_prompt, max_tokens):
            captured["messages"] = messages
            captured["system"] = system_prompt
            return "routed"

        monkeypatch.setattr(settings, "llm_provider", "openrouter")
        monkeypatch.setattr(llm, "_openrouter_chat", fake_openrouter)

        result = await llm.ask("Hello", system_prompt="Be brief")
        assert result == "routed"
        assert captured["messages"] == [{"role": "user", "content": "Hello"}]
        assert captured["system"] == "Be brief"

    async def test_anthropic_is_default_provider(self):
        # Test the code-level default, independent of any local .env override
        # (a deployed .env may legitimately set SLOVAK_LLM_PROVIDER=openrouter).
        assert Settings.model_fields["llm_provider"].default == "anthropic"
