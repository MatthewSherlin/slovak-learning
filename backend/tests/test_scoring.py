"""Tests for deterministic answer grading and session scoring."""

from __future__ import annotations

from app.scoring import grade_answer, strip_accents


class TestStripAccents:
    def test_strips_slovak_diacritics(self):
        assert strip_accents("vidím") == "vidim"
        assert strip_accents("mäso") == "maso"
        assert strip_accents("ťažký") == "tazky"
        assert strip_accents("ľúbiť") == "lubit"

    def test_plain_ascii_unchanged(self):
        assert strip_accents("dom") == "dom"


class TestGradeAnswer:
    def test_exact_match(self):
        g = grade_answer("vidím", "vidím")
        assert g.tier == "exact"
        assert g.credit == 1.0

    def test_exact_is_case_and_whitespace_insensitive(self):
        g = grade_answer("vidím", "  VIDÍM ")
        assert g.tier == "exact"

    def test_accent_only_miss_gets_partial_credit(self):
        g = grade_answer("vidím", "vidim")
        assert g.tier == "accent"
        assert g.credit == 0.8

    def test_accent_miss_multiple_diacritics(self):
        g = grade_answer("mäso", "maso")
        assert g.tier == "accent"

    def test_wrong_answer(self):
        g = grade_answer("vidím", "vidil")
        assert g.tier == "wrong"
        assert g.credit == 0.0

    def test_empty_answer_is_wrong(self):
        g = grade_answer("vidím", "")
        assert g.tier == "wrong"


from app.scoring import compute_category_scores, compute_session_score


def _vocab_ex(credits, questions=None):
    n = len(credits)
    qs = questions or [
        {"word": f"w{i}", "direction": "sk-en" if i % 2 == 0 else "en-sk",
         "choices": ["a", "b", "c", "d"], "correctIndex": 0, "explanation": ""}
        for i in range(n)
    ]
    return {
        "type": "vocabulary", "questions": qs, "currentIndex": n,
        "answers": [0] * n, "credits": credits, "retryQueue": [], "phase": "complete",
    }


class TestComputeSessionScore:
    def test_vocab_all_first_try(self):
        assert compute_session_score(_vocab_ex([1.0, 1.0, 1.0, 1.0])) == 10.0

    def test_vocab_mixed_retry_recovery(self):
        # 2 first-try, 1 recovered (0.5), 1 never -> (1+1+0.5+0)/4*10 = 6.25
        assert compute_session_score(_vocab_ex([1.0, 1.0, 0.5, 0.0])) == 6.25

    def test_vocab_legacy_session_without_credits(self):
        ex = _vocab_ex([None, None])
        del ex["credits"]
        ex["answers"] = [0, 1]  # correctIndex is 0 -> one right, one wrong
        assert compute_session_score(ex) == 5.0

    def test_grammar_uses_credits(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}, {}],
            "currentIndex": 3, "answers": ["a", "b", "c"],
            "correct": [True, False, False], "credits": [1.0, 0.8, 0.0],
            "phase": "complete",
        }
        assert compute_session_score(ex) == 6.0  # (1+0.8+0)/3*10

    def test_grammar_legacy_without_credits(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}],
            "currentIndex": 2, "answers": ["a", "b"],
            "correct": [True, False], "phase": "complete",
        }
        assert compute_session_score(ex) == 5.0

    def test_translation_averages_llm_scores(self):
        ex = {
            "type": "translation", "exercises": [{}, {}],
            "currentIndex": 2, "phase": "complete",
            "answers": [
                {"userAnswer": "x", "score": 8.0, "feedback": ""},
                {"userAnswer": "y", "score": 6.0, "feedback": ""},
            ],
        }
        assert compute_session_score(ex) == 7.0

    def test_conversation_returns_none(self):
        ex = {"type": "conversation", "exchangeCount": 5, "maxExchanges": 10, "phase": "complete"}
        assert compute_session_score(ex) is None

    def test_no_answers_returns_none(self):
        ex = _vocab_ex([])
        assert compute_session_score(ex) is None


class TestCategoryScores:
    def test_vocab_splits_by_direction(self):
        qs = [
            {"word": "a", "direction": "sk-en", "choices": ["x"], "correctIndex": 0, "explanation": ""},
            {"word": "b", "direction": "en-sk", "choices": ["x"], "correctIndex": 0, "explanation": ""},
        ]
        ex = _vocab_ex([1.0, 0.0], questions=qs)
        cats = compute_category_scores(ex)
        by_name = {c["category"]: c["score"] for c in cats}
        assert by_name["Word recognition (SK→EN)"] == 10.0
        assert by_name["Recall (EN→SK)"] == 0.0

    def test_grammar_has_accuracy_and_diacritics(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}],
            "currentIndex": 2, "answers": ["a", "b"],
            "correct": [True, False], "credits": [1.0, 0.8],
            "tiers": ["exact", "accent"], "phase": "complete",
        }
        cats = compute_category_scores(ex)
        names = [c["category"] for c in cats]
        assert "Accuracy" in names
        assert "Diacritics" in names

    def test_conversation_empty(self):
        assert compute_category_scores({"type": "conversation"}) == []
