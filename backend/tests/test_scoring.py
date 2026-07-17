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
