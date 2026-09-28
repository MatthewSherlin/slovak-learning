"""Tests for deterministic answer grading and session scoring."""

from __future__ import annotations

from app.scoring import grade_answer, normalize_answer, strip_accents


class TestStripAccents:
    def test_strips_slovak_diacritics(self):
        assert strip_accents("vidím") == "vidim"
        assert strip_accents("mäso") == "maso"
        assert strip_accents("ťažký") == "tazky"
        assert strip_accents("ľúbiť") == "lubit"

    def test_plain_ascii_unchanged(self):
        assert strip_accents("dom") == "dom"


class TestNormalizeAnswer:
    def test_strips_accents_case_punctuation_spacing(self):
        assert normalize_answer("  Prepáčte, kde je ŠKOLA? ") == "prepacte kde je skola"

    def test_can_keep_accents(self):
        assert normalize_answer("Mám vodu.", strip_diacritics=False) == "mám vodu"

    def test_blank_marker_survives(self):
        assert normalize_answer("Mám ____.") == "mam ____"


class TestGradeAnswer:
    def test_exact_match(self):
        g = grade_answer("vidím", "vidím")
        assert g.tier == "exact"
        assert g.credit == 1.0

    def test_exact_is_case_and_whitespace_insensitive(self):
        g = grade_answer("vidím", "  VIDÍM ")
        assert g.tier == "exact"

    def test_accent_only_difference_gets_full_credit(self):
        g = grade_answer("vidím", "vidim")
        assert g.tier == "accent"
        assert g.credit == 1.0

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

    def test_punctuation_and_case_ignored(self):
        g = grade_answer("Áno, mám vodu.", "ano mam vodu")
        assert g.tier == "accent"
        assert g.credit == 1.0

    def test_punctuation_only_difference_is_exact(self):
        assert grade_answer("Mám vodu.", "mám vodu").tier == "exact"

    def test_extra_inner_whitespace_ignored(self):
        assert grade_answer("mám vodu", "mám    vodu").tier == "exact"

    def test_curly_and_straight_apostrophes_match(self):
        assert grade_answer("don’t", "don’t").tier == "exact"
        assert grade_answer("don’t", "dont").tier == "exact"

    def test_combining_accent_matches_precomposed(self):
        # i + U+0301, as produced by some on-screen keyboards
        assert grade_answer("vidím", "vidím").tier == "exact"

    def test_punctuation_only_answer_is_wrong(self):
        assert grade_answer("vidím", "...").tier == "wrong"
        assert grade_answer("?", "!").tier == "wrong"

    def test_whitespace_only_answer_is_wrong(self):
        assert grade_answer("vidím", "   ").tier == "wrong"


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

    def test_grammar_has_accuracy_and_no_diacritics_category(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}],
            "currentIndex": 2, "answers": ["a", "b"],
            "correct": [True, True], "credits": [1.0, 1.0],
            "tiers": ["exact", "accent"], "phase": "complete",
        }
        cats = compute_category_scores(ex)
        names = [c["category"] for c in cats]
        assert names == ["Accuracy"]

    def test_conversation_empty(self):
        assert compute_category_scores({"type": "conversation"}) == []


class TestPartialSessionScores:
    """Ending a session early must not inflate scores — unanswered counts as 0."""

    def test_translation_partial_counts_unanswered_as_zero(self):
        ex = {
            "type": "translation", "exercises": [{}, {}, {}, {}],
            "currentIndex": 2, "phase": "exercises",
            "answers": [
                {"userAnswer": "x", "score": 8.0, "feedback": ""},
                {"userAnswer": "y", "score": 6.0, "feedback": ""},
                None,
                None,
            ],
        }
        assert compute_session_score(ex) == 3.5  # (8+6)/4

    def test_grammar_legacy_partial_counts_unanswered_as_zero(self):
        ex = {
            "type": "grammar", "lesson": {}, "exercises": [{}, {}, {}, {}],
            "currentIndex": 2, "answers": ["a", "b", None, None],
            "correct": [True, True, None, None], "phase": "exercises",
        }
        assert compute_session_score(ex) == 5.0  # 2 correct / 4 total

    def test_retry_recovery_reflects_actual_recovery_rate(self):
        # 2 missed, 1 recovered -> 5.0, not a hardcoded 10.0
        ex = {
            "type": "vocabulary",
            "questions": [
                {"direction": "sk-en"}, {"direction": "sk-en"},
                {"direction": "sk-en"}, {"direction": "sk-en"},
            ],
            "answers": [0, 0, 0, 0],
            "credits": [1.0, 1.0, 0.5, 0.0],
            "phase": "complete",
        }
        cats = compute_category_scores(ex)
        recovery = next(c for c in cats if c["category"] == "Retry recovery")
        assert recovery["score"] == 5.0
        assert "1 of 2" in recovery["comment"]
