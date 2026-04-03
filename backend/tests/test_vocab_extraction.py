"""Tests for vocabulary extraction from completed sessions."""

from __future__ import annotations

import pytest

from app.vocab_extraction import extract_vocab_from_session


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

    def test_sets_source_mode(self, sample_vocab_session):
        words = extract_vocab_from_session(sample_vocab_session)
        for w in words:
            assert w["source_mode"] == "vocabulary"

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
        """Should fall back to feedback extraction if exercises missing."""
        session = {
            "mode": "vocabulary",
            "exercises": None,
            "feedback": {
                "vocabulary_learned": [
                    {"slovak": "auto", "english": "car", "example": None},
                ],
            },
        }
        words = extract_vocab_from_session(session)
        assert len(words) == 1
        assert words[0]["slovak"].lower() == "auto"


class TestGrammarModeExtraction:
    """Tests for extracting vocabulary from grammar mode sessions."""

    def test_extracts_blank_words(self, sample_grammar_session):
        words = extract_vocab_from_session(sample_grammar_session)
        slovaks = {w["slovak"].lower() for w in words}
        assert "dom" in slovaks
        assert "knihu" in slovaks

    def test_tracks_grammar_correctness(self, sample_grammar_session):
        words = extract_vocab_from_session(sample_grammar_session)
        dom = next(w for w in words if w["slovak"].lower() == "dom")
        knihu = next(w for w in words if w["slovak"].lower() == "knihu")

        assert dom["correct"] is True
        assert knihu["correct"] is False

    def test_supplements_with_feedback_vocab(self, sample_grammar_session):
        """Should also include words from feedback.vocabulary_learned."""
        words = extract_vocab_from_session(sample_grammar_session)
        slovaks = {w["slovak"].lower() for w in words}
        # "kniha" from feedback (different from "knihu" in blank)
        assert "kniha" in slovaks

    def test_source_mode_is_grammar(self, sample_grammar_session):
        words = extract_vocab_from_session(sample_grammar_session)
        for w in words:
            assert w["source_mode"] == "grammar"


class TestConversationModeExtraction:
    """Tests for extracting vocabulary from conversation mode sessions."""

    def test_extracts_from_feedback(self, sample_conversation_session):
        words = extract_vocab_from_session(sample_conversation_session)
        slovaks = {w["slovak"].lower() for w in words}
        assert "obchod" in slovaks
        assert "peniaze" in slovaks

    def test_all_marked_correct(self, sample_conversation_session):
        """Feedback-extracted words are always marked correct."""
        words = extract_vocab_from_session(sample_conversation_session)
        for w in words:
            assert w["correct"] is True

    def test_source_mode_is_conversation(self, sample_conversation_session):
        words = extract_vocab_from_session(sample_conversation_session)
        for w in words:
            assert w["source_mode"] == "conversation"


class TestTranslationModeExtraction:
    """Tests for extracting vocabulary from translation mode sessions."""

    def test_extracts_from_feedback(self):
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
                    {"slovak": "chlieb", "english": "bread", "example": None},
                ],
            },
        }
        words = extract_vocab_from_session(session)
        slovaks = {w["slovak"].lower() for w in words}
        assert "chcem" in slovaks
        assert "chlieb" in slovaks


class TestEdgeCases:
    """Edge cases for vocabulary extraction."""

    def test_empty_session_no_feedback(self):
        session = {"mode": "vocabulary", "exercises": None, "feedback": None}
        words = extract_vocab_from_session(session)
        assert words == []

    def test_empty_vocabulary_learned(self):
        session = {
            "mode": "conversation",
            "exercises": None,
            "feedback": {"vocabulary_learned": []},
        }
        words = extract_vocab_from_session(session)
        assert words == []

    def test_unknown_mode_uses_feedback(self):
        session = {
            "mode": "unknown_mode",
            "exercises": None,
            "feedback": {
                "vocabulary_learned": [
                    {"slovak": "test", "english": "test", "example": None},
                ],
            },
        }
        words = extract_vocab_from_session(session)
        assert len(words) == 1

    def test_empty_slovak_words_filtered(self):
        session = {
            "mode": "conversation",
            "exercises": None,
            "feedback": {
                "vocabulary_learned": [
                    {"slovak": "", "english": "empty", "example": None},
                    {"slovak": "dobrý", "english": "good", "example": None},
                ],
            },
        }
        words = extract_vocab_from_session(session)
        assert len(words) == 1
        assert words[0]["slovak"].lower() == "dobrý"
