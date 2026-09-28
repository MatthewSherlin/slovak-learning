"""Prompts must separate what we write from how we judge what learners type."""

from __future__ import annotations

from app import prompts

GRADING_PROMPTS = [
    prompts.TRANSLATION_EVALUATE_PROMPT,
    prompts.CONVERSATION_TURN_PROMPT,
]

GENERATION_PROMPTS = [
    prompts.VOCAB_BATCH_PROMPT,
    prompts.GRAMMAR_LESSON_PROMPT,
    prompts.TRANSLATION_BATCH_PROMPT,
    prompts.FILL_BLANK_BATCH_PROMPT,
    prompts.ERROR_CORRECTION_BATCH_PROMPT,
]


def test_grading_prompts_carry_the_tolerance_rules():
    for p in GRADING_PROMPTS:
        assert prompts.GRADING_TOLERANCE in p


def test_generation_prompts_carry_the_accuracy_rules():
    for p in GENERATION_PROMPTS:
        assert prompts.GENERATION_ACCURACY in p


def test_no_prompt_calls_an_unaccented_word_wrong():
    for name in dir(prompts):
        value = getattr(prompts, name)
        if isinstance(value, str) and name.isupper():
            assert "is a WRONG word" not in value
            assert "watch the diacritics" not in value.lower()


def test_old_shared_block_is_gone():
    assert not hasattr(prompts, "ACCURACY")


def test_quote_escaping_workaround_is_gone():
    assert 'escaped as \\"' not in prompts.GRAMMAR_LESSON_PROMPT


def test_error_correction_never_uses_accent_mistakes():
    assert "never a missing or wrong diacritic" in prompts.ERROR_CORRECTION_BATCH_PROMPT


def test_grammar_choices_never_differ_only_in_accents():
    assert (
        "When an exercise has choices, no two choices differ only in diacritics, "
        "capitalisation or punctuation."
    ) in prompts.GRAMMAR_LESSON_PROMPT
