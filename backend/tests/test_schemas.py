"""Every schema must satisfy strict structured-output rules."""

from __future__ import annotations

import pytest

from app import schemas

ALL = [
    schemas.VOCAB_BATCH_SCHEMA,
    schemas.GRAMMAR_LESSON_SCHEMA,
    schemas.TRANSLATION_BATCH_SCHEMA,
    schemas.TRANSLATION_GRADE_SCHEMA,
]


def _objects(node):
    if isinstance(node, dict):
        if node.get("type") == "object":
            yield node
        for value in node.values():
            yield from _objects(value)
    elif isinstance(node, list):
        for item in node:
            yield from _objects(item)


@pytest.mark.parametrize("schema", ALL)
def test_objects_are_closed_and_fully_required(schema):
    found = list(_objects(schema))
    assert found, "schema has no object"
    for obj in found:
        assert obj["additionalProperties"] is False
        assert sorted(obj["required"]) == sorted(obj["properties"])


def test_top_level_keys():
    assert list(schemas.VOCAB_BATCH_SCHEMA["properties"]) == ["questions"]
    assert list(schemas.GRAMMAR_LESSON_SCHEMA["properties"]) == ["lesson", "exercises"]
    assert list(schemas.TRANSLATION_BATCH_SCHEMA["properties"]) == ["exercises"]
    assert list(schemas.TRANSLATION_GRADE_SCHEMA["properties"]) == ["score", "feedback"]
