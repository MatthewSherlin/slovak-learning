# backend/tests/test_composition.py
"""Tests for deterministic vocab session composition."""

from __future__ import annotations

from app.composition import (
    build_exclusion_list,
    build_focus_block,
    build_vocab_plan,
    filter_new_questions,
    has_non_latin_letters,
    is_meta_answer,
    is_quiz_artifact,
    normalize_word,
    question_defect,
    resolve_topic_label,
)


def _w(slovak: str, english: str = "", seen: int = 4, correct: int = 1) -> dict:
    return {"slovak": slovak, "english": english, "times_seen": seen, "times_correct": correct}


class TestNormalizeWord:
    def test_strips_diacritics_and_case(self):
        assert normalize_word("Mäso") == "maso"
        assert normalize_word("čaj ") == "caj"

    def test_plain_word_unchanged(self):
        assert normalize_word("voda") == "voda"


class TestBuildVocabPlan:
    def test_no_review_words_by_default(self):
        due = [_w(f"d{i}") for i in range(6)]
        plan = build_vocab_plan(due, total=10)
        assert plan == {"review": [], "new_count": 10}

    def test_review_on_request_caps_at_4(self):
        due = [_w(f"d{i}") for i in range(6)]
        plan = build_vocab_plan(due, total=10, include_review=True)
        assert [w["slovak"] for w in plan["review"]] == ["d0", "d1", "d2", "d3"]
        assert plan["new_count"] == 6

    def test_review_on_request_with_nothing_due(self):
        assert build_vocab_plan([], total=10, include_review=True) == {
            "review": [], "new_count": 10,
        }


class TestBuildExclusionList:
    def test_excludes_seen_words_minus_plan(self):
        all_vocab = [_w("hrad"), _w("voda"), _w("čaj")]
        exclusions = build_exclusion_list(all_vocab, plan_words=[_w("hrad")])
        assert exclusions == ["voda", "čaj"]

    def test_caps_at_1000(self):
        all_vocab = [_w(f"slovo{i}") for i in range(1200)]
        assert len(build_exclusion_list(all_vocab, plan_words=[])) == 1000

    def test_300_words_all_excluded(self):
        all_vocab = [_w(f"slovo{i}") for i in range(300)]
        assert len(build_exclusion_list(all_vocab, plan_words=[])) == 300


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


class TestResolveTopicLabel:
    def test_known_topic_gets_its_label(self):
        assert resolve_topic_label("vocabulary", "food_drink") == "Food & Drink"

    def test_general_and_empty_are_no_topic(self):
        assert resolve_topic_label("vocabulary", "general") is None
        assert resolve_topic_label("vocabulary", "") is None
        assert resolve_topic_label("vocabulary", None) is None

    def test_unknown_topic_is_humanised(self):
        assert resolve_topic_label("vocabulary", "car_parts") == "car parts"


class TestBuildFocusBlock:
    def test_topic_only(self):
        block = build_focus_block("Food & Drink", "")
        assert block.startswith("[Session focus]")
        assert "Topic: Food & Drink" in block
        assert "[Student's instructions for this session]" not in block

    def test_instructions_only(self):
        block = build_focus_block(None, "I want to learn about food")
        assert "I want to learn about food" in block
        assert "Topic:" not in block
        assert "Build the whole session around" in block

    def test_both_instructions_win(self):
        block = build_focus_block("Numbers & Time", "only kitchen words")
        assert "Topic: Numbers & Time" in block
        assert "only kitchen words" in block
        assert "follow the instructions" in block

    def test_neither_uses_default_and_never_says_general(self):
        block = build_focus_block(None, None)
        assert "everyday high-frequency" in block
        assert "general" not in block.lower()

    def test_never_mentions_review_words(self):
        assert "review" not in build_focus_block("Food & Drink", "food please").lower()


def _question(**over) -> dict:
    q = {
        "word": "chlieb", "direction": "sk-en",
        "choices": ["bread", "butter", "milk", "cheese"], "correctIndex": 0,
    }
    q.update(over)
    return q


class TestQuestionDefect:
    def test_good_question_has_no_defect(self):
        assert question_defect(_question()) is None

    def test_meta_answer_as_correct_choice(self):
        q = _question(word="na zdravie", choices=["cheers", "bless you", "all of the above", "x"],
                      correctIndex=2)
        assert question_defect(q) == "meta answer among the choices"

    def test_meta_answer_as_distractor(self):
        q = _question(choices=["bread", "butter", "None of the above.", "cheese"])
        assert question_defect(q) == "meta answer among the choices"

    def test_cyrillic_in_slovak_word(self):
        assert question_defect(_question(word="čít\u0430\u043b")) == "non-Latin letters in Slovak text"

    def test_cyrillic_in_slovak_choices_for_en_sk(self):
        q = _question(word="bread", direction="en-sk",
                      choices=["chlieb", "\u0445\u043b\u0435\u0431", "maslo", "syr"])
        assert question_defect(q) == "non-Latin letters in Slovak text"

    def test_word_equal_to_answer(self):
        q = _question(word="Hotel", choices=["hotel", "house", "shop", "school"])
        assert question_defect(q) == "word equals its answer"

    def test_index_out_of_range(self):
        assert question_defect(_question(correctIndex=4)) == "correct index out of range"
        assert question_defect(_question(correctIndex=-1)) == "correct index out of range"

    def test_wrong_number_of_choices(self):
        assert question_defect(_question(choices=["bread", "butter"])) == "needs exactly four choices"

    def test_slovak_diacritics_are_latin(self):
        assert has_non_latin_letters("ťažký ľúbiť ôsmy") is False

    def test_meta_answer_detection(self):
        assert is_meta_answer("All of the Above") is True
        assert is_meta_answer("both") is True
        assert is_meta_answer("bread") is False


class TestIsQuizArtifact:
    def test_of_the_above_phrases(self):
        assert is_quiz_artifact("all of the above") is True
        assert is_quiz_artifact("None of the Above.") is True
        assert is_quiz_artifact("both of the above") is True

    def test_real_meanings_are_kept(self):
        assert is_quiz_artifact("both") is False
        assert is_quiz_artifact("neither") is False
        assert is_quiz_artifact("above") is False
        assert is_quiz_artifact("bread") is False
        assert is_quiz_artifact("") is False
