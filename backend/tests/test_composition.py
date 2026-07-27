# backend/tests/test_composition.py
"""Tests for deterministic vocab session composition."""

from __future__ import annotations

from app.composition import (
    build_exclusion_list,
    build_vocab_plan,
    filter_new_questions,
    filter_weak,
    normalize_word,
)


def _w(slovak: str, english: str = "", seen: int = 4, correct: int = 1) -> dict:
    return {"slovak": slovak, "english": english, "times_seen": seen, "times_correct": correct}


class TestNormalizeWord:
    def test_strips_diacritics_and_case(self):
        assert normalize_word("Mäso") == "maso"
        assert normalize_word("čaj ") == "caj"

    def test_plain_word_unchanged(self):
        assert normalize_word("voda") == "voda"


class TestFilterWeak:
    def test_keeps_below_threshold(self):
        words = [_w("hrad", seen=4, correct=1), _w("voda", seen=4, correct=4)]
        assert [w["slovak"] for w in filter_weak(words)] == ["hrad"]

    def test_unseen_words_dropped(self):
        assert filter_weak([_w("x", seen=0, correct=0)]) == []


class TestBuildVocabPlan:
    def test_caps_review_at_4_and_reinforce_at_2(self):
        due = [_w(f"d{i}") for i in range(6)]
        weak = [_w(f"w{i}") for i in range(5)]
        plan = build_vocab_plan(due, weak, total=10)
        assert len(plan["review"]) == 4
        assert len(plan["reinforce"]) == 2
        assert plan["new_count"] == 4

    def test_weak_words_already_due_not_duplicated(self):
        due = [_w("hrad")]
        weak = [_w("hrad"), _w("veža")]
        plan = build_vocab_plan(due, weak, total=10)
        assert [w["slovak"] for w in plan["reinforce"]] == ["veža"]
        assert plan["new_count"] == 8

    def test_empty_history_all_new(self):
        plan = build_vocab_plan([], [], total=10)
        assert plan["review"] == [] and plan["reinforce"] == []
        assert plan["new_count"] == 10


class TestBuildExclusionList:
    def test_excludes_seen_words_minus_plan(self):
        all_vocab = [_w("hrad"), _w("voda"), _w("čaj")]
        exclusions = build_exclusion_list(all_vocab, plan_words=[_w("hrad")])
        assert exclusions == ["voda", "čaj"]

    def test_caps_at_150(self):
        all_vocab = [_w(f"slovo{i}") for i in range(200)]
        assert len(build_exclusion_list(all_vocab, plan_words=[])) == 150


class TestFilterNewQuestions:
    def test_drops_excluded_sk_word(self):
        qs = [{"word": "Voda", "direction": "sk-en", "choices": ["water", "a", "b", "c"], "correctIndex": 0}]
        assert filter_new_questions(qs, plan_words=[], exclusions=["voda"]) == []

    def test_drops_excluded_word_hidden_in_correct_choice(self):
        # en-sk: "word" is English, the excluded Slovak word is the correct choice
        qs = [{"word": "water", "direction": "en-sk", "choices": ["voda", "x", "y", "z"], "correctIndex": 0}]
        assert filter_new_questions(qs, plan_words=[], exclusions=["voda"]) == []

    def test_planned_review_words_exempt(self):
        qs = [{"word": "voda", "direction": "sk-en", "choices": ["water", "a", "b", "c"], "correctIndex": 0}]
        kept = filter_new_questions(qs, plan_words=[_w("voda", "water")], exclusions=["voda"])
        assert len(kept) == 1

    def test_diacritic_insensitive_match(self):
        qs = [{"word": "maso", "direction": "sk-en", "choices": ["meat", "a", "b", "c"], "correctIndex": 0}]
        assert filter_new_questions(qs, plan_words=[], exclusions=["mäso"]) == []

    def test_unrelated_question_kept(self):
        qs = [{"word": "kniha", "direction": "sk-en", "choices": ["book", "a", "b", "c"], "correctIndex": 0}]
        assert len(filter_new_questions(qs, plan_words=[], exclusions=["voda"])) == 1
