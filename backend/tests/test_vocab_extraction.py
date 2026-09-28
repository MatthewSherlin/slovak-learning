"""Tests for vocabulary extraction from completed sessions."""

from __future__ import annotations

import pytest

from app.vocab_extraction import extract_vocab_from_session, question_pair


class TestVocabModeExtraction:
    """Tests for extracting vocabulary from vocabulary mode sessions."""

    def test_extracts_correct_words_from_vocab_session(self, sample_vocab_session):
        words = extract_vocab_from_session(sample_vocab_session)
        slovaks = {w["slovak"].lower() for w in words}
        assert "chlieb" in slovaks
        assert "voda" in slovaks
        assert "mäso" in slovaks

    def test_resolves_sk_en_direction(self, sample_vocab_session):
        """For sk-en, the 'word' field is slovak, correct choice is english."""
        words = extract_vocab_from_session(sample_vocab_session)
        chlieb = next(w for w in words if w["slovak"].lower() == "chlieb")
        assert chlieb["english"].lower() == "bread"

    def test_resolves_en_sk_direction(self, sample_vocab_session):
        """For en-sk, the 'word' field is english, correct choice is slovak."""
        words = extract_vocab_from_session(sample_vocab_session)
        voda = next(w for w in words if w["slovak"].lower() == "voda")
        assert voda["english"].lower() == "water"

    def test_tracks_correctness(self, sample_vocab_session):
        """Should correctly identify right and wrong answers."""
        words = extract_vocab_from_session(sample_vocab_session)
        chlieb = next(w for w in words if w["slovak"].lower() == "chlieb")
        voda = next(w for w in words if w["slovak"].lower() == "voda")
        maso = next(w for w in words if w["slovak"].lower() == "mäso")

        assert chlieb["correct"] is True   # answered 0, correctIndex 0
        assert voda["correct"] is True     # answered 1, correctIndex 1
        assert maso["correct"] is False    # answered 0, correctIndex 1

    def test_retry_recovered_word_counts_as_incorrect(self, sample_vocab_session):
        """A word missed first and recovered on retry (credit 0.5) must not be
        recorded as correct — otherwise the SRS never resurfaces it."""
        ex = sample_vocab_session["exercises"]
        # Final answers all match correctIndex (retry overwrote the miss),
        # but credits preserve the first-attempt outcome.
        ex["answers"] = [0, 1, 1]
        ex["credits"] = [1.0, 0.5, 0.0]
        words = extract_vocab_from_session(sample_vocab_session)
        by_slovak = {w["slovak"].lower(): w for w in words}
        assert by_slovak["chlieb"]["correct"] is True
        assert by_slovak["voda"]["correct"] is False
        assert by_slovak["mäso"]["correct"] is False

    def test_sets_source_mode(self, sample_vocab_session):
        words = extract_vocab_from_session(sample_vocab_session)
        for w in words:
            assert w["source_mode"] == "vocabulary"

    def test_per_answer_sessions_extract_nothing_at_the_end(self, sample_vocab_session):
        sample_vocab_session["exercises"]["srsPerAnswer"] = True
        assert extract_vocab_from_session(sample_vocab_session) == []

    def test_question_pair_resolves_both_directions(self, sample_vocab_session):
        q_sk, q_en = sample_vocab_session["exercises"]["questions"][:2]
        assert question_pair(q_sk) == ("chlieb", "bread")
        assert question_pair(q_en) == ("voda", "water")

    def test_deduplicates_by_slovak(self):
        """Duplicate slovak words should be deduplicated."""
        session = {
            "mode": "vocabulary",
            "exercises": {
                "type": "vocabulary",
                "questions": [
                    {
                        "word": "dom",
                        "direction": "sk-en",
                        "choices": ["house", "home", "flat", "room"],
                        "correctIndex": 0,
                        "explanation": "",
                    },
                    {
                        "word": "Dom",  # same word different case
                        "direction": "sk-en",
                        "choices": ["house", "building", "flat", "room"],
                        "correctIndex": 0,
                        "explanation": "",
                    },
                ],
                "answers": [0, 0],
                "phase": "complete",
            },
            "feedback": None,
        }
        words = extract_vocab_from_session(session)
        assert len(words) == 1
        assert words[0]["slovak"].lower() == "dom"

    def test_handles_missing_exercises(self):
        session = {
            "mode": "vocabulary",
            "exercises": None,
            "feedback": {
                "vocabulary_learned": [
                    {"slovak": "auto", "english": "car", "example": None},
                ],
            },
        }
        assert extract_vocab_from_session(session) == []


class TestOtherModes:
    """Only vocabulary lessons have words to record; summaries are not read."""

    def test_grammar_extracts_nothing(self, sample_grammar_session):
        assert extract_vocab_from_session(sample_grammar_session) == []

    def test_conversation_extracts_nothing(self, sample_conversation_session):
        assert extract_vocab_from_session(sample_conversation_session) == []

    def test_translation_extracts_nothing(self):
        session = {
            "mode": "translation",
            "exercises": {
                "type": "translation",
                "exercises": [
                    {"source": "I want bread", "direction": "en-sk", "modelAnswer": "Chcem chlieb", "keyPoints": []},
                ],
                "answers": [{"userAnswer": "Chcem chlieb", "score": 9, "feedback": "Excellent"}],
                "phase": "complete",
            },
            "feedback": {
                "vocabulary_learned": [
                    {"slovak": "chcem", "english": "I want", "example": None},
                ],
            },
        }
        assert extract_vocab_from_session(session) == []
