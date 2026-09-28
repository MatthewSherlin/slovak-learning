"""JSON schemas for model output, sent as OpenRouter structured outputs.

Strict mode needs every object closed (additionalProperties false) with every
property required. Optional values are expressed as nullable instead.
"""

from __future__ import annotations


def _obj(properties: dict) -> dict:
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def _list_of(item: dict) -> dict:
    return {"type": "array", "items": item}


def _nullable(schema: dict) -> dict:
    return {"anyOf": [schema, {"type": "null"}]}


_STR: dict = {"type": "string"}
_DIRECTION: dict = {"type": "string", "enum": ["sk-en", "en-sk"]}

VOCAB_BATCH_SCHEMA: dict = _obj({
    "questions": _list_of(_obj({
        "word": _STR,
        "pronunciation": _STR,
        "direction": _DIRECTION,
        "choices": _list_of(_STR),
        "correctIndex": {"type": "integer"},
        "explanation": _STR,
    })),
})

GRAMMAR_LESSON_SCHEMA: dict = _obj({
    "lesson": _obj({
        "concept": _STR,
        "explanation": _STR,
        "examples": _list_of(_STR),
        "table": _nullable(_STR),
    }),
    "exercises": _list_of(_obj({
        "sentence": _STR,
        "blank": _STR,
        "hint": _nullable(_STR),
        "explanation": _STR,
        "choices": _nullable(_list_of(_STR)),
    })),
})

TRANSLATION_BATCH_SCHEMA: dict = _obj({
    "exercises": _list_of(_obj({
        "source": _STR,
        "direction": _DIRECTION,
        "translation": _nullable(_STR),
        "modelAnswer": _STR,
        "keyPoints": _list_of(_STR),
    })),
})

TRANSLATION_GRADE_SCHEMA: dict = _obj({
    "score": {"type": "integer"},
    "feedback": _STR,
})
