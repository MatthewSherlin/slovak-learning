# Lesson Quality Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lessons honor the learner's chosen topic and typed request, stop repeating words and sentences, never penalise accents, and run on Claude Sonnet 5 through OpenRouter.

**Architecture:** Deterministic rules move out of prompts and into code: answer normalization in `scoring.py`, session composition and validation in `composition.py`, progress tracking in `sessions.py`. The model client gains schema-enforced JSON, per-route reasoning effort, and a distinct out-of-credits error. The frontend adds one toggle, per-kind translation headings, and autocorrect-free Slovak inputs.

**Tech Stack:** FastAPI, aiosqlite, pytest with `asyncio_mode = auto`, httpx, OpenRouter chat completions API; React 19, TypeScript, Vite, vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-28-lesson-quality-upgrade-design.md`

## Global Constraints

- Provider stays OpenRouter. Default model string is exactly `anthropic/claude-sonnet-5`.
- The Anthropic-direct path in `llm.py` (`_anthropic_chat`) is not modified.
- No new dependencies in `backend/pyproject.toml` or `frontend/package.json`.
- Accent policy: tiers `exact` and `accent` both earn credit `1.0`; `wrong` earns `0.0`.
- Review words are off unless the request carries `include_review: true`.
- Vocabulary sessions target 10 questions; fewer than 10 triggers one retry; fewer than 6 raises `LLMError`. Translation sessions follow the same rule.
- Reasoning effort and `max_tokens` per route: lesson generation `medium` / 16000; session feedback `low` / 8000; translation grading, conversation turn, hint `low` / 4000.
- The literal word `general` is never sent to the model as a topic.
- Stored sessions that lack `kind`, `review`, `srsPerAnswer`, `progressRecorded` or `tier` must load and finish.
- Backend is the source of truth for scoring. No client-side evaluation.
- All top and bottom fixed UI respects `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`.
- Backend code has type hints on every function. Frontend code has no `any`.
- Run backend tests with `cd backend && .venv/bin/python -m pytest -q`. Run frontend tests with `cd frontend && npx vitest run` and typecheck with `npx tsc -b`.
- Commit locally after each task under the owner's git identity, lowercase conventional subject, no co-author line. **Never push.** Pushing `main` deploys the frontend.

## Review Focus

1. **A learner types only punctuation, spaces or an emoji as an answer.** It must grade as `wrong`, not match an expected answer that normalizes to the same empty string. Pinned in Task 2.
2. **An accent typed with the on-screen diacritics keyboard arrives as a combining character (`i` + U+0301) instead of a precomposed `í`.** It must grade as `exact`. Pinned in Task 2.
3. **The model returns fewer review questions than requested, or returns a review word twice.** The session must still start with unique questions and the right `review` flags. Pinned in Task 6.
4. **The learner double-taps an answer or the phone resends the request.** A word must be counted once in the progress store for that first attempt. Pinned in Task 7.
5. **OpenRouter rejects the schema with HTTP 400.** The lesson must still start through the text-JSON fallback rather than fail. Pinned in Task 4.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `backend/app/scoring.py` | Answer normalization and grading | Modify |
| `backend/app/prompts.py` | System prompts | Rewrite |
| `backend/app/schemas.py` | JSON schemas for model output | Create |
| `backend/app/llm.py` | Model client | Modify (OpenRouter path, `ask*` signatures) |
| `backend/app/config.py` | Settings | Modify (model default) |
| `backend/app/composition.py` | Focus block, slot plan, validation, translation filtering | Modify |
| `backend/app/database.py` | Review candidates, due order, cleanup | Modify |
| `backend/app/vocab_extraction.py` | Words to record from a session | Modify |
| `backend/app/sessions.py` | Session creation, answers, end of session | Modify |
| `backend/app/models.py`, `backend/app/main.py` | Request field, error handler, recommendations | Modify |
| `backend/scripts/smoke_lessons.py` | Live smoke test | Create |
| `frontend/src/lib/slovakInput.ts` | Shared input attributes | Create |
| `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts` | Types and request shape | Modify |
| `frontend/src/components/{Vocab,Grammar,Conversation,Translation}Mode.tsx` | Mode screens | Modify |
| `frontend/src/components/ConfigSheet.tsx`, `SessionHeader.tsx`, `frontend/src/pages/{Home,Session}.tsx` | Start sheet, header, home, legacy chat | Modify |

---

### Task 1: Hook ordering in the four mode components

**Files:**
- Modify: `frontend/src/components/VocabMode.tsx:17-20`
- Modify: `frontend/src/components/GrammarMode.tsx:46-49`
- Modify: `frontend/src/components/ConversationMode.tsx:52-54`
- Modify: `frontend/src/components/TranslationMode.tsx:20-22`

**Interfaces:**
- Consumes: nothing.
- Produces: each file still default-exports a component taking `{ session, setSession }`. No signature change.

- [ ] **Step 1: Confirm the lint failures exist**

Run: `cd frontend && npx eslint src/components/VocabMode.tsx src/components/GrammarMode.tsx src/components/ConversationMode.tsx src/components/TranslationMode.tsx 2>&1 | grep -c "rules-of-hooks"`
Expected: a number greater than 0.

- [ ] **Step 2: Wrap `VocabMode`**

In `VocabMode.tsx` change the type import to include `VocabExerciseData`:

```tsx
import type { Session, SessionFeedback, VocabExerciseData } from '../lib/types';
```

Replace

```tsx
export default function VocabMode({ session, setSession }: VocabModeProps) {
  // Bug fix #8: use discriminant narrowing instead of bare `as` cast
  if (session.exercises?.type !== 'vocabulary') return null;
  const ex = session.exercises;

```

with

```tsx
export default function VocabMode({ session, setSession }: VocabModeProps) {
  // Narrow in a wrapper so every hook in the inner component runs unconditionally.
  if (session.exercises?.type !== 'vocabulary') return null;
  return <VocabModeInner session={session} ex={session.exercises} setSession={setSession} />;
}

function VocabModeInner({
  session,
  ex,
  setSession,
}: VocabModeProps & { ex: VocabExerciseData }) {
```

- [ ] **Step 3: Wrap `GrammarMode`**

Change the type import:

```tsx
import type { Session, SessionFeedback, GrammarExerciseData } from '../lib/types';
```

Replace

```tsx
export default function GrammarMode({ session, setSession }: GrammarModeProps) {
  // Discriminant narrowing — no bare `as` cast
  if (session.exercises?.type !== 'grammar') return null;
  const ex = session.exercises;

```

with

```tsx
export default function GrammarMode({ session, setSession }: GrammarModeProps) {
  // Narrow in a wrapper so every hook in the inner component runs unconditionally.
  if (session.exercises?.type !== 'grammar') return null;
  return <GrammarModeInner session={session} ex={session.exercises} setSession={setSession} />;
}

function GrammarModeInner({
  session,
  ex,
  setSession,
}: GrammarModeProps & { ex: GrammarExerciseData }) {
```

- [ ] **Step 4: Wrap `ConversationMode`**

Change the type import:

```tsx
import type { Session, SessionFeedback, Difficulty, ConversationExerciseData } from '../lib/types';
```

Replace

```tsx
export default function ConversationMode({ session, setSession }: ConversationModeProps) {
  if (session.exercises?.type !== 'conversation') return null;
  const ex = session.exercises;
```

with

```tsx
export default function ConversationMode({ session, setSession }: ConversationModeProps) {
  // Narrow in a wrapper so every hook in the inner component runs unconditionally.
  if (session.exercises?.type !== 'conversation') return null;
  return <ConversationModeInner session={session} ex={session.exercises} setSession={setSession} />;
}

function ConversationModeInner({
  session,
  ex,
  setSession,
}: ConversationModeProps & { ex: ConversationExerciseData }) {
```

- [ ] **Step 5: Wrap `TranslationMode`**

`TranslationExerciseData` is already imported. Replace

```tsx
export default function TranslationMode({ session, setSession }: TranslationModeProps) {
  if (session.exercises?.type !== 'translation') return null;
  const ex = session.exercises;
```

with

```tsx
export default function TranslationMode({ session, setSession }: TranslationModeProps) {
  // Narrow in a wrapper so every hook in the inner component runs unconditionally.
  if (session.exercises?.type !== 'translation') return null;
  return <TranslationModeInner session={session} ex={session.exercises} setSession={setSession} />;
}

function TranslationModeInner({
  session,
  ex,
  setSession,
}: TranslationModeProps & { ex: TranslationExerciseData }) {
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npx eslint src/components/VocabMode.tsx src/components/GrammarMode.tsx src/components/ConversationMode.tsx src/components/TranslationMode.tsx 2>&1 | grep -c "rules-of-hooks"`
Expected: `0`

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: 169 tests pass, `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/VocabMode.tsx frontend/src/components/GrammarMode.tsx frontend/src/components/ConversationMode.tsx frontend/src/components/TranslationMode.tsx
git commit -m "refactor: narrow session type in wrappers so hooks run unconditionally"
```

---

### Task 2: Answer normalization and full-credit grading

**Files:**
- Modify: `backend/app/scoring.py`
- Modify: `backend/app/sessions.py` (the transcript note inside `submit_grammar_answer`)
- Test: `backend/tests/test_scoring.py`, `backend/tests/test_sessions.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalize_answer(s: str, *, strip_diacritics: bool = True) -> str`
  - `grade_answer(expected: str, given: str) -> AnswerGrade` where `AnswerGrade.tier` is `"exact" | "accent" | "wrong"` and `credit` is `1.0`, `1.0`, `0.0`.
  - `compute_category_scores` no longer returns a `"Diacritics"` category.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_scoring.py` change the first import line to:

```python
from app.scoring import grade_answer, normalize_answer, strip_accents
```

Replace the method `test_accent_only_miss_gets_partial_credit` with:

```python
    def test_accent_only_difference_gets_full_credit(self):
        g = grade_answer("vidím", "vidim")
        assert g.tier == "accent"
        assert g.credit == 1.0
```

Add these methods to `TestGradeAnswer`:

```python
    def test_punctuation_and_case_ignored(self):
        g = grade_answer("Áno, mám vodu.", "ano mam vodu")
        assert g.tier == "accent"
        assert g.credit == 1.0

    def test_punctuation_only_difference_is_exact(self):
        assert grade_answer("Mám vodu.", "mám vodu").tier == "exact"

    def test_extra_inner_whitespace_ignored(self):
        assert grade_answer("mám vodu", "mám    vodu").tier == "exact"

    def test_curly_and_straight_apostrophes_match(self):
        assert grade_answer("don't", "don’t").tier == "exact"
        assert grade_answer("don't", "dont").tier == "exact"

    def test_combining_accent_matches_precomposed(self):
        # i + U+0301, as produced by some on-screen keyboards
        assert grade_answer("vidím", "vidím").tier == "exact"

    def test_punctuation_only_answer_is_wrong(self):
        assert grade_answer("vidím", "...").tier == "wrong"
        assert grade_answer("?", "!").tier == "wrong"

    def test_whitespace_only_answer_is_wrong(self):
        assert grade_answer("vidím", "   ").tier == "wrong"
```

Add a new class above `TestGradeAnswer`:

```python
class TestNormalizeAnswer:
    def test_strips_accents_case_punctuation_spacing(self):
        assert normalize_answer("  Prepáčte, kde je ŠKOLA? ") == "prepacte kde je skola"

    def test_can_keep_accents(self):
        assert normalize_answer("Mám vodu.", strip_diacritics=False) == "mám vodu"

    def test_blank_marker_survives(self):
        assert normalize_answer("Mám ____.") == "mam ____"
```

Replace `test_grammar_has_accuracy_and_diacritics` with:

```python
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
```

In `backend/tests/test_sessions.py` replace `test_accent_miss_partial_credit` with:

```python
    async def test_accent_only_answer_full_credit(self, db, active_grammar_session):
        result = await submit_grammar_answer(db, active_grammar_session["id"], "vidim")
        ex = result["exercises"]
        assert ex["correct"][0] is True
        assert ex["credits"][0] == 1.0
        assert ex["tiers"][0] == "accent"
        note = result["messages"][-1]["content"]
        assert "vidím" in note          # accented spelling is shown
        assert "almost" not in note     # and never framed as a miss
        assert "watch" not in note.lower()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_scoring.py tests/test_sessions.py -q`
Expected: FAIL, first with `ImportError: cannot import name 'normalize_answer'`.

- [ ] **Step 3: Implement**

In `backend/app/scoring.py` replace everything from `import unicodedata` down to the end of `grade_answer` with:

```python
import re
import unicodedata
from typing import NamedTuple

_APOSTROPHES = re.compile(r"['‘’`´]")
_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)


class AnswerGrade(NamedTuple):
    tier: str  # "exact" | "accent" | "wrong"
    credit: float


def strip_accents(s: str) -> str:
    """Remove combining marks: 'vidím' -> 'vidim'."""
    decomposed = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize_answer(s: str, *, strip_diacritics: bool = True) -> str:
    """Reduce an answer to the parts that are graded.

    Case, punctuation and spacing never matter. Diacritics are removed too
    unless strip_diacritics is False.
    """
    text = unicodedata.normalize("NFC", s).lower()
    if strip_diacritics:
        text = strip_accents(text)
    text = _APOSTROPHES.sub("", text)
    text = _NON_WORD.sub(" ", text)
    return " ".join(text.split())


def grade_answer(expected: str, given: str) -> AnswerGrade:
    """Grade a typed answer against the expected form.

    exact  (1.0): matches ignoring case, punctuation and spacing
    accent (1.0): matches only after stripping diacritics. Learners type on
                  English keyboards, so this is a correct answer; the tier
                  lets the interface show the accented spelling.
    wrong  (0.0): anything else, including an answer with no letters or digits
    """
    given_plain = normalize_answer(given)
    if not given_plain:
        return AnswerGrade("wrong", 0.0)
    if normalize_answer(expected, strip_diacritics=False) == normalize_answer(
        given, strip_diacritics=False
    ):
        return AnswerGrade("exact", 1.0)
    if normalize_answer(expected) == given_plain:
        return AnswerGrade("accent", 1.0)
    return AnswerGrade("wrong", 0.0)
```

This removes the `_norm` function, which nothing else uses.

In `compute_category_scores`, inside `if kind == "grammar":`, replace everything after the `accuracy = ...` line down to `return cats` with:

```python
        return [{"category": "Accuracy", "score": accuracy, "comment": ""}]
```

In `backend/app/sessions.py`, inside `submit_grammar_answer`, replace

```python
    if grade.tier == "accent":
        note = f"Answer: {answer} (almost — watch the diacritics: {correct_answer})"
    elif is_correct:
```

with

```python
    if grade.tier == "accent":
        note = f"Answer: {answer} (correct; written with accents: {correct_answer})"
    elif is_correct:
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass. `test_grammar_uses_credits` still passes with its stored `0.8`, which proves old sessions keep their historical scores.

- [ ] **Step 5: Commit**

```bash
git add backend/app/scoring.py backend/app/sessions.py backend/tests/test_scoring.py backend/tests/test_sessions.py
git commit -m "feat: accents, case and punctuation never cost points"
```

---

### Task 3: Prompts that tolerate English keyboards

**Files:**
- Rewrite: `backend/app/prompts.py`
- Create: `backend/tests/test_prompts.py`

**Interfaces:**
- Consumes: nothing.
- Produces these module constants, all `str`: `GENERATION_ACCURACY`, `GRADING_TOLERANCE`, `CONVERSATION_TURN_PROMPT`, `HINT_PROMPT`, `FEEDBACK_PROMPT`, `VOCAB_BATCH_PROMPT`, `GRAMMAR_LESSON_PROMPT`, `TRANSLATION_BATCH_PROMPT`, `TRANSLATION_EVALUATE_PROMPT`. The old constant `ACCURACY` is removed.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_prompts.py`:

```python
"""Prompts must separate what we write from how we judge what learners type."""

from __future__ import annotations

from app import prompts

GRADING_PROMPTS = [
    prompts.TRANSLATION_EVALUATE_PROMPT,
    prompts.FEEDBACK_PROMPT,
    prompts.CONVERSATION_TURN_PROMPT,
]

GENERATION_PROMPTS = [
    prompts.VOCAB_BATCH_PROMPT,
    prompts.GRAMMAR_LESSON_PROMPT,
    prompts.TRANSLATION_BATCH_PROMPT,
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


def test_feedback_prompt_does_not_ask_for_an_accent_improvement():
    assert "accent marks" not in prompts.FEEDBACK_PROMPT


def test_old_shared_block_is_gone():
    assert not hasattr(prompts, "ACCURACY")


def test_quote_escaping_workaround_is_gone():
    assert 'escaped as \\"' not in prompts.GRAMMAR_LESSON_PROMPT
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_prompts.py -q`
Expected: FAIL with `AttributeError: module 'app.prompts' has no attribute 'GRADING_TOLERANCE'`.

- [ ] **Step 3: Rewrite `backend/app/prompts.py`**

Replace the whole file with:

```python
"""System prompts for each Slovak learning mode.

Two shared blocks keep two concerns apart. GENERATION_ACCURACY governs the
Slovak we write. GRADING_TOLERANCE governs how we read what learners type.
"""

GENERATION_ACCURACY = """You are writing material for a Slovak language learning app. Learners memorise what you write, so a wrong word, meaning or grammatical form does real harm.

Accuracy rules for everything you write in Slovak:
1. Use only Slovak words, meanings and forms you are certain of. When unsure, choose a different, common word you are certain of.
2. Write every Slovak word with its correct diacritics (š, č, ž, ť, ď, ň, ľ, á, é, í, ó, ú, ý, ô, ä, ŕ, ĺ). This rule applies to text you write. It never applies to how you judge what a learner typed.
3. Use real Slovak only. Do not borrow or adapt words from Czech, Polish or other Slavic languages, and do not invent words.
4. Write Slovak in the Latin alphabet only."""

GRADING_TOLERANCE = """The learners type on English keyboards. Whenever you read something a learner typed:
- Treat missing or wrong diacritics, capitalisation, punctuation and spacing as if they had been typed correctly. "mam vodu" is the same answer as "Mám vodu."
- These never lower a score and are never described as mistakes, errors or things to improve.
- Judge only word choice, grammar and meaning."""

CONVERSATION_TURN_PROMPT = f"""{GENERATION_ACCURACY}

{GRADING_TOLERANCE}

You are a friendly Slovak conversation partner in a real back-and-forth dialogue.

How to reply:
- Send one short message per turn, two or three sentences at most.
- Write in Slovak. Add an English translation in parentheses only for words that are new or difficult at the learner's level.
- Respond to what the learner actually said, then keep the conversation moving with a follow-up question or remark.
- Stay in character for the scenario (shopkeeper, friend, and so on).
- If the learner made a mistake in word choice or grammar, add one brief correction as the last line, starting with "📝 ". Leave the correction out when you are not certain of the correct form, and when the only differences are diacritics, capitalisation or punctuation.
- Write only your own side of the dialogue. Leave out vocabulary lists and grammar lectures."""

HINT_PROMPT = f"""{GENERATION_ACCURACY}

The learner is stuck. Give one short, encouraging hint that moves them toward the answer without stating it.

- Vocabulary: the first letter or syllable, or a related word they may know.
- Grammar: the rule that applies.
- Conversation: a phrase structure they can complete.
- Translation: the sentence broken into smaller parts.

Output only the hint, addressed to the learner."""

FEEDBACK_PROMPT = f"""{GENERATION_ACCURACY}

{GRADING_TOLERANCE}

Analyse this Slovak learning session and write narrative feedback.

The app computes the numeric score for vocabulary, grammar and translation sessions from the learner's answers, so for those sessions your overall_score and scores are ignored. For conversation sessions your overall_score and scores are used: score fluency, vocabulary range and grammar accuracy from the learner's messages only.

Return JSON with this shape:
{{
  "overall_score": <number 1-10>,
  "scores": [
    {{"category": "<category name>", "score": <number 1-10>, "comment": "<specific feedback>"}}
  ],
  "strengths": ["<strength>", "<strength>", "<strength>"],
  "improvements": ["<improvement>", "<improvement>", "<improvement>"],
  "sample_answer": "<a model response to the main exercise, or null>",
  "vocabulary_learned": [
    {{"slovak": "<word>", "english": "<translation>", "example": "<example sentence or null>"}}
  ],
  "grammar_notes": ["<grammar point covered>"]
}}

Rules:
- Strengths and improvements refer to specific answers the learner gave, not to how the session was designed.
- Improvements concern word choice, grammar or meaning. If the learner made no such mistakes, give fewer improvements rather than inventing one.
- vocabulary_learned lists the new Slovak words introduced in the session, each as a dictionary form with its English meaning.
- Be encouraging and honest, with tips the learner can act on."""

VOCAB_BATCH_PROMPT = f"""{GENERATION_ACCURACY}

Write vocabulary quiz questions for a Slovak learner. The user message says how many and what the session focus is.

Return JSON with this shape:
{{
  "questions": [
    {{
      "word": "<the word to display>",
      "pronunciation": "<simple phonetic hint for the Slovak word, such as VOH-dah>",
      "direction": "sk-en",
      "choices": ["<option>", "<option>", "<option>", "<option>"],
      "correctIndex": 0,
      "explanation": "<brief usage tip or note on the word, plain text>"
    }}
  ]
}}

Rules for every question:
- Alternate between "sk-en" (show a Slovak word, choose its English meaning) and "en-sk" (show an English word, choose its Slovak translation).
- For "sk-en", word is Slovak and all four choices are English. For "en-sk", word is English and all four choices are Slovak.
- Exactly four choices, all different, exactly one correct. correctIndex is 0-based and varies from question to question.
- Every choice is a real word or phrase that could stand as an answer on its own. Options such as "all of the above" or "both" are not allowed.
- Distractors are plausible: the same word class and a related theme, and clearly not a correct translation.
- Each question teaches a different word. No word appears twice in the set, in either direction.
- Use dictionary forms: nominative singular for nouns, infinitive for verbs, masculine nominative singular for adjectives. Fixed phrases such as greetings are fine as they are.
- pronunciation is always for the Slovak word, in simple capitalised syllables, never IPA.

Session focus: every new word belongs to the focus given in the user message. If the focus is a theme such as food, every new word is a word a learner would need when talking about that theme.

Review words: when the user message lists REQUIRED REVIEW WORDS, write one question for each of those exact words, whatever the session focus. Everything else is a new word.

Already-seen words: when the user message lists words the student has already seen, none of them is used for a new question.

Level:
- Beginner (A1-A2): the most common words for the focus. Distractors clearly different from the answer.
- Intermediate (B1-B2): broader vocabulary for the focus. Distractors closer in meaning.
- Advanced (C1-C2): nuanced vocabulary, idioms and abstract terms for the focus. Distractors with subtle differences in meaning."""

GRAMMAR_LESSON_PROMPT = f"""{GENERATION_ACCURACY}

Write a brief grammar lesson and fill-in-the-blank exercises for a Slovak learner.

Return JSON with this shape:
{{
  "lesson": {{
    "concept": "<name of the grammar concept>",
    "explanation": "<2-3 short paragraphs in markdown, with comparisons to English where they help>",
    "examples": ["<Slovak sentence — English translation>", "<example>", "<example>"],
    "table": "<markdown table of the pattern, or null>"
  }},
  "exercises": [
    {{
      "sentence": "<sentence with ____ for the blank>",
      "blank": "<the correct word or form>",
      "hint": "<short hint about which rule applies, or null>",
      "explanation": "<why this form is correct, plain text>",
      "choices": ["<option>", "<option>", "<option>", "<option>"]
    }}
  ]
}}

Rules:
- Write 8 to 10 exercises that test the concept taught in the lesson, ordered from easier to harder.
- Each sentence has exactly one blank, written as four underscores. The blank is one word or a short phrase.
- blank holds the exact correct form.
- hint names the rule or pattern, such as "this preposition takes the locative case". It never contains the answer or any of the choices.
- Every form in a declension or conjugation table is one you are certain of.
- The session focus in the user message decides the vocabulary domain and example themes. The lesson stays grammatically accurate whatever the focus.

Level:
- Beginner (A1-A2): teach one simple pattern with basic vocabulary. Every exercise includes choices: exactly four options, one of which is the blank value, the others plausible wrong forms. The position of the correct option varies.
- Intermediate (B1-B2): cover the concept more broadly, with exercises that require choosing between similar forms. choices is null; the learner types the answer.
- Advanced (C1-C2): include exceptions, irregular forms and stylistic nuance. choices is null; the learner types the answer."""

TRANSLATION_BATCH_PROMPT = f"""{GENERATION_ACCURACY}

Write translation exercises for a Slovak learner. The user message says how many, which direction, and what the session focus is.

Return JSON with this shape:
{{
  "exercises": [
    {{
      "source": "<sentence to translate>",
      "direction": "en-sk",
      "translation": null,
      "modelAnswer": "<the ideal translation>",
      "keyPoints": ["<grammar note>", "<vocabulary note>"]
    }}
  ]
}}

Rules:
- Each source is a complete sentence.
- For "en-sk", source is English and modelAnswer is Slovak. For "sk-en", source is Slovak and modelAnswer is English.
- When the user message fixes one direction, every exercise uses it. Otherwise alternate, starting with "en-sk".
- modelAnswer is accurate and natural.
- keyPoints holds one to three brief notes on the grammar or vocabulary in the sentence.
- translation is null for these exercises.
- Every sentence is different from the others in the set in both wording and content, and different from the sentences the user message lists as already used.
- The session focus in the user message decides what the sentences are about.

Level:
- Beginner (A1-A2): short, simple sentences in the present tense, 5 to 8 words.
- Intermediate (B1-B2): longer sentences with more than one clause and a mix of tenses, 8 to 15 words.
- Advanced (C1-C2): complex sentences with subordinate clauses, passive voice or the conditional, 12 to 20 words."""

TRANSLATION_EVALUATE_PROMPT = f"""{GENERATION_ACCURACY}

{GRADING_TOLERANCE}

Evaluate one answer from a Slovak learner. The user message describes the exercise and what to decide.

Return JSON with this shape:
{{
  "score": <whole number 1-10>,
  "feedback": "<2-3 sentences addressed to the learner: what was right, what was wrong, and the key correction>"
}}

Scoring guide:
- 9-10: correct meaning and grammar, natural phrasing
- 7-8: correct meaning, minor grammar or phrasing issues
- 5-6: understandable, with noticeable errors
- 3-4: partly correct, with significant errors
- 1-2: mostly incorrect, or no real attempt

Rules:
- Accept any answer that is grammatically correct and carries the right meaning, even when it differs from the model answer.
- Do not mark a wrong answer as correct to be encouraging.
- Any Slovak you write in the feedback is correct Slovak.
- When you are unsure about part of the answer, give a moderate score and comment only on what you are certain of."""
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && grep -rn "ACCURACY" app | grep -v "GENERATION_ACCURACY" ; .venv/bin/python -m pytest -q`
Expected: the grep prints nothing; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/prompts.py backend/tests/test_prompts.py
git commit -m "feat: grading prompts ignore accents, case and punctuation"
```

---

### Task 4: Model client — schemas, effort, truncation, out-of-credits

**Files:**
- Create: `backend/app/schemas.py`
- Modify: `backend/app/llm.py`
- Modify: `backend/app/config.py:18`
- Modify: `backend/app/main.py` (imports, one new exception handler)
- Test: `backend/tests/test_llm_client.py`, `backend/tests/test_llm_errors.py`, create `backend/tests/test_schemas.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class LLMUnavailableError(LLMError)`, `class LLMCreditsError(LLMError)`
  - `async def ask(prompt: str, system_prompt: str | None = None, max_tokens: int = 4096, *, effort: str | None = None, schema: dict | None = None, schema_name: str = "response") -> str`
  - `async def ask_messages(messages: list[dict], system_prompt: str, max_tokens: int = 1024, *, effort: str | None = None) -> str`
  - `async def ask_json(prompt: str, system_prompt: str | None = None, *, schema: dict | None = None, schema_name: str = "response", effort: str | None = None, max_tokens: int = 4096) -> dict`
  - `schemas.VOCAB_BATCH_SCHEMA`, `GRAMMAR_LESSON_SCHEMA`, `TRANSLATION_BATCH_SCHEMA`, `TRANSLATION_GRADE_SCHEMA`, `FEEDBACK_SCHEMA`, each a `dict`.
  - HTTP 503 with body `{"detail": "The tutor is out of AI credits.", "code": "tutor_out_of_credits"}` when `LLMCreditsError` escapes a route.

- [ ] **Step 1: Write the failing schema test**

Create `backend/tests/test_schemas.py`:

```python
"""Every schema must satisfy strict structured-output rules."""

from __future__ import annotations

import pytest

from app import schemas

ALL = [
    schemas.VOCAB_BATCH_SCHEMA,
    schemas.GRAMMAR_LESSON_SCHEMA,
    schemas.TRANSLATION_BATCH_SCHEMA,
    schemas.TRANSLATION_GRADE_SCHEMA,
    schemas.FEEDBACK_SCHEMA,
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_schemas.py -q`
Expected: FAIL with `ImportError: cannot import name 'schemas'`.

- [ ] **Step 3: Create `backend/app/schemas.py`**

```python
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

FEEDBACK_SCHEMA: dict = _obj({
    "overall_score": {"type": "number"},
    "scores": _list_of(_obj({
        "category": _STR,
        "score": {"type": "number"},
        "comment": _STR,
    })),
    "strengths": _list_of(_STR),
    "improvements": _list_of(_STR),
    "sample_answer": _nullable(_STR),
    "vocabulary_learned": _list_of(_obj({
        "slovak": _STR,
        "english": _STR,
        "example": _nullable(_STR),
    })),
    "grammar_notes": _list_of(_STR),
})
```

Run: `cd backend && .venv/bin/python -m pytest tests/test_schemas.py -q`
Expected: PASS.

- [ ] **Step 4: Write the failing client tests**

In `backend/tests/test_llm_client.py`:

Change the import line to:

```python
from app.llm import LLMCreditsError, LLMError, LLMUnavailableError, _parse_openrouter_response
```

In `TestRetries.test_persistent_transient_error_becomes_llm_error` change `with pytest.raises(LLMError):` to `with pytest.raises(LLMUnavailableError):`.

In `TestAskJsonRetry`, change all three `fake_ask` signatures from `(prompt, system_prompt=None, max_tokens=4096)` to `(prompt, system_prompt=None, max_tokens=4096, **kwargs)`.

In `TestProviderRouting.test_openrouter_provider_routes_to_openrouter` change the fake signature to `async def fake_openrouter(messages, system_prompt, max_tokens, **kwargs):`.

Add to `TestOpenRouterParsing`:

```python
    def test_truncated_response_raises(self):
        data = {"choices": [{"finish_reason": "length", "message": {"content": '{"a": 1'}}]}
        with pytest.raises(LLMError, match="truncated"):
            _parse_openrouter_response(data)

    def test_error_payload_with_402_code_is_credits_error(self):
        data = {"error": {"code": 402, "message": "Insufficient credits"}}
        with pytest.raises(LLMCreditsError):
            _parse_openrouter_response(data)

    def test_string_error_payload_raises(self):
        with pytest.raises(LLMError, match="boom"):
            _parse_openrouter_response({"error": "boom"})
```

Append to the end of the file:

```python
# ── OpenRouter request payload ───────────────────────────────────────


class _FakeResponse:
    def __init__(self, status_code: int = 200, body: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._body = body if body is not None else {
            "choices": [{"finish_reason": "stop", "message": {"content": '{"ok": true}'}}]
        }
        self.text = text

    def json(self) -> dict:
        return self._body


class _FakeHttp:
    def __init__(self, responses: list[_FakeResponse]):
        self.responses = responses
        self.payloads: list[dict] = []

    async def post(self, url, headers=None, json=None):
        self.payloads.append(json)
        return self.responses.pop(0)


@pytest.fixture
def openrouter(monkeypatch):
    def install(responses: list[_FakeResponse]) -> _FakeHttp:
        fake = _FakeHttp(responses)
        monkeypatch.setattr(settings, "llm_provider", "openrouter")
        monkeypatch.setattr(llm, "_get_http", lambda: fake)
        return fake

    return install


SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}},
    "required": ["ok"],
    "additionalProperties": False,
}


@pytest.mark.asyncio
class TestOpenRouterPayload:
    async def test_default_model_is_sonnet_5(self):
        assert Settings.model_fields["openrouter_model"].default == "anthropic/claude-sonnet-5"

    async def test_schema_and_effort_are_sent(self, openrouter):
        fake = openrouter([_FakeResponse()])
        result = await llm.ask_json(
            "p", "s", schema=SCHEMA, schema_name="thing", effort="medium", max_tokens=16000
        )
        assert result == {"ok": True}
        payload = fake.payloads[0]
        assert payload["max_tokens"] == 16000
        assert payload["reasoning"] == {"effort": "medium", "exclude": True}
        assert payload["response_format"] == {
            "type": "json_schema",
            "json_schema": {"name": "thing", "strict": True, "schema": SCHEMA},
        }

    async def test_no_schema_no_effort_sends_neither(self, openrouter):
        fake = openrouter([_FakeResponse(body={
            "choices": [{"finish_reason": "stop", "message": {"content": "Ahoj"}}]
        })])
        assert await llm.ask("p") == "Ahoj"
        assert "reasoning" not in fake.payloads[0]
        assert "response_format" not in fake.payloads[0]

    async def test_http_402_is_credits_error_and_not_retried(self, openrouter):
        fake = openrouter([_FakeResponse(status_code=402, text="no credits")])
        with pytest.raises(LLMCreditsError):
            await llm.ask_json("p", schema=SCHEMA)
        assert len(fake.payloads) == 1

    async def test_rejected_schema_falls_back_to_text_json(self, openrouter):
        fake = openrouter([
            _FakeResponse(status_code=400, text="schema not supported"),
            _FakeResponse(),
        ])
        result = await llm.ask_json("p", schema=SCHEMA, effort="low")
        assert result == {"ok": True}
        assert "response_format" in fake.payloads[0]
        assert "response_format" not in fake.payloads[1]
        assert fake.payloads[1]["reasoning"] == {"effort": "low", "exclude": True}

    async def test_exhausted_retries_do_not_trigger_fallback(self, openrouter):
        fake = openrouter([_FakeResponse(status_code=503) for _ in range(3)])
        with pytest.raises(LLMUnavailableError):
            await llm.ask_json("p", schema=SCHEMA)
        assert len(fake.payloads) == 3
```

In `backend/tests/test_llm_errors.py` change the import to `from app.llm import LLMCreditsError, LLMError, _extract_json` and add to `TestSessionCreationLLMFailure`:

```python
    async def test_out_of_credits_returns_503_with_code(self, client, monkeypatch):
        async def boom(*args, **kwargs):
            raise LLMCreditsError("no credits")

        monkeypatch.setattr(sessions_module, "ask_json", boom)

        async with client as c:
            resp = await c.post("/api/sessions", json={
                "user_id": "matt",
                "mode": "vocabulary",
                "topic": "food_drink",
                "difficulty": "beginner",
            })
        assert resp.status_code == 503
        assert resp.json()["code"] == "tutor_out_of_credits"
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_llm_client.py tests/test_llm_errors.py -q`
Expected: FAIL with `ImportError: cannot import name 'LLMCreditsError'`.

- [ ] **Step 6: Implement in `backend/app/llm.py`**

After the `LLMError` class add:

```python
class LLMUnavailableError(LLMError):
    """Transient failures persisted through every retry."""


class LLMCreditsError(LLMError):
    """The provider account has no credits left. Retrying will not help."""
```

In `_get_http` change `timeout=60.0` to `timeout=90.0`.

In `_with_retries` change the raise inside the `except` to:

```python
                raise LLMUnavailableError(
                    f"LLM unavailable after {_MAX_ATTEMPTS} attempts: {e}"
                ) from e
```

Replace `_parse_openrouter_response` and `_openrouter_chat` with:

```python
def _parse_openrouter_response(data: dict) -> str:
    """Extract message text from an OpenAI-style chat completion payload."""
    if "error" in data:
        err = data["error"]
        message = err.get("message", err) if isinstance(err, dict) else err
        if isinstance(err, dict) and err.get("code") == 402:
            raise LLMCreditsError(f"OpenRouter is out of credits: {message}")
        raise LLMError(f"OpenRouter error: {message}")
    choices = data.get("choices") or []
    if not choices:
        raise LLMError("Empty response from LLM")
    if choices[0].get("finish_reason") == "length":
        raise LLMError("LLM response truncated at max_tokens")
    content = choices[0].get("message", {}).get("content")
    if not content:
        raise LLMError("Empty response from LLM")
    return content


async def _openrouter_chat(
    messages: list[dict],
    system_prompt: str | None,
    max_tokens: int,
    *,
    effort: str | None = None,
    schema: dict | None = None,
    schema_name: str = "response",
) -> str:
    """Single OpenRouter (OpenAI-compatible) API call."""
    payload_messages = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)
    payload: dict = {
        "model": settings.openrouter_model,
        "max_tokens": max_tokens,
        "messages": payload_messages,
    }
    if effort:
        # exclude: the reasoning text is never shown, so don't ship it back
        payload["reasoning"] = {"effort": effort, "exclude": True}
    if schema is not None:
        payload["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "strict": True, "schema": schema},
        }
    try:
        resp = await _get_http().post(
            f"{settings.openrouter_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            json=payload,
        )
    except httpx.TransportError as e:
        raise _TransientLLMError(str(e)) from e
    if resp.status_code == 402:
        raise LLMCreditsError("OpenRouter is out of credits")
    if resp.status_code == 429 or resp.status_code >= 500:
        raise _TransientLLMError(f"OpenRouter HTTP {resp.status_code}")
    if resp.status_code != 200:
        raise LLMError(f"OpenRouter HTTP {resp.status_code}: {resp.text[:200]}")
    return _parse_openrouter_response(resp.json())
```

Replace `_chat`, `ask` and `ask_messages` with:

```python
async def _chat(
    messages: list[dict],
    system_prompt: str | None,
    max_tokens: int,
    *,
    effort: str | None = None,
    schema: dict | None = None,
    schema_name: str = "response",
) -> str:
    """Route to the configured provider, with retries."""
    if settings.llm_provider == "openrouter":
        return await _with_retries(lambda: _openrouter_chat(
            messages, system_prompt, max_tokens,
            effort=effort, schema=schema, schema_name=schema_name,
        ))
    return await _with_retries(lambda: _anthropic_chat(messages, system_prompt, max_tokens))


async def ask(
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 4096,
    *,
    effort: str | None = None,
    schema: dict | None = None,
    schema_name: str = "response",
) -> str:
    """Send a prompt to the LLM and return the text response."""
    return await _chat(
        [{"role": "user", "content": prompt}], system_prompt, max_tokens,
        effort=effort, schema=schema, schema_name=schema_name,
    )


async def ask_messages(
    messages: list[dict],
    system_prompt: str,
    max_tokens: int = 1024,
    *,
    effort: str | None = None,
) -> str:
    """Send a multi-turn conversation to the LLM using messages format."""
    return await _chat(messages, system_prompt, max_tokens, effort=effort)
```

Replace `ask_json` with:

```python
async def ask_json(
    prompt: str,
    system_prompt: str | None = None,
    *,
    schema: dict | None = None,
    schema_name: str = "response",
    effort: str | None = None,
    max_tokens: int = 4096,
) -> dict:
    """Send a prompt to the LLM and parse the JSON response.

    With a schema the provider enforces the shape. If that call is rejected
    (a provider that refuses the schema, a truncated reply), the request is
    repeated as plain text JSON. An unparseable plain reply is retried once
    with an explicit JSON-only instruction.
    """
    if schema is not None:
        try:
            raw = await ask(
                prompt, system_prompt, max_tokens,
                effort=effort, schema=schema, schema_name=schema_name,
            )
            return _extract_json(raw)
        except (LLMCreditsError, LLMUnavailableError):
            raise
        except LLMError as e:
            log.warning("Structured output call failed (%s); using text JSON", e)

    raw = await ask(prompt, system_prompt, max_tokens, effort=effort)
    try:
        return _extract_json(raw)
    except LLMError:
        log.warning("Unparseable JSON response, retrying with stricter instruction")
        strict_prompt = (
            f"{prompt}\n\nRespond with ONLY valid JSON. "
            "No prose, no markdown fences, no explanations."
        )
        raw = await ask(strict_prompt, system_prompt, max_tokens, effort=effort)
        return _extract_json(raw)
```

In `backend/app/config.py` change line 18 to:

```python
    openrouter_model: str = "anthropic/claude-sonnet-5"
```

In `backend/app/main.py` change `from .llm import LLMError` to `from .llm import LLMCreditsError, LLMError` and add directly above the existing `@app.exception_handler(LLMError)`:

```python
@app.exception_handler(LLMCreditsError)
async def llm_credits_handler(request: Request, exc: LLMCreditsError) -> JSONResponse:
    """The AI account is empty. Say so plainly; retrying cannot help."""
    logging.getLogger(__name__).error("LLM out of credits on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={"detail": "The tutor is out of AI credits.", "code": "tutor_out_of_credits"},
    )
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/llm.py backend/app/config.py backend/app/main.py backend/tests/test_schemas.py backend/tests/test_llm_client.py backend/tests/test_llm_errors.py
git commit -m "feat: sonnet 5 on openrouter with schema output, effort and credits error"
```

---

### Task 5: Session focus, and wiring for grammar, conversation, hint and feedback

**Files:**
- Modify: `backend/app/composition.py`
- Modify: `backend/app/sessions.py` (`_get_learning_context`, `_create_grammar_session`, `_create_conversation_session`, `submit_conversation_answer`, `get_hint`, the feedback call in `end_session`, `_instructions_block`)
- Test: `backend/tests/test_composition.py`, `backend/tests/test_generation_targeting.py`, `backend/tests/test_feedback.py`, `backend/tests/test_learning_context.py`

**Interfaces:**
- Consumes: `ask_json`, `ask_messages`, `ask` keyword arguments from Task 4; `GRAMMAR_LESSON_SCHEMA`, `FEEDBACK_SCHEMA` from Task 4.
- Produces:
  - `composition.resolve_topic_label(mode: str, topic: str | None) -> str | None` — `None` for `None`, `""` and `"general"`.
  - `composition.build_focus_block(topic_label: str | None, instructions: str | None) -> str` — always starts with the line `[Session focus]`.
  - `sessions._get_learning_context(db, user_id, mode, *, include_vocab: bool = True) -> str`

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_composition.py` extend the import list with `build_focus_block` and `resolve_topic_label`, and append:

```python
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
```

In `backend/tests/test_generation_targeting.py`:

Change `capture_llm`'s fake to accept and record keyword arguments:

```python
    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        captured.setdefault("prompts", []).append(prompt)
        captured.setdefault("kwargs", []).append(kwargs)
        captured["prompt"] = prompt if "prompt" not in captured else captured["prompt"]
        return {
            "questions": [_q(i) for i in range(10)],
            "lesson": {"concept": "X", "explanation": "", "examples": []},
            "exercises": [],
        }
```

Change `capture_messages`'s fake to:

```python
    async def fake_ask_messages(messages, system_prompt=None, max_tokens=1024, **kwargs):
        captured.setdefault("system_prompts", []).append(system_prompt)
        captured.setdefault("calls", []).append({"max_tokens": max_tokens, **kwargs})
        captured["messages"] = messages
        return "Ahoj!"
```

Append:

```python
async def test_grammar_prompt_leads_with_focus_and_never_says_general(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_grammar_session(db, {
        "user_id": uid, "mode": "grammar", "topic": "general",
        "instructions": "use food vocabulary in examples",
    })
    prompt = capture_llm["prompt"]
    assert prompt.index("[Session focus]") < prompt.index("Create a grammar lesson")
    assert "Topic: general" not in prompt
    assert "about: general" not in prompt


async def test_grammar_call_uses_schema_and_medium_effort(db, capture_llm):
    from app.schemas import GRAMMAR_LESSON_SCHEMA

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_grammar_session(db, {"user_id": uid, "mode": "grammar", "topic": "noun_cases"})
    kwargs = capture_llm["kwargs"][0]
    assert kwargs["schema"] is GRAMMAR_LESSON_SCHEMA
    assert kwargs["effort"] == "medium"
    assert kwargs["max_tokens"] == 16000


async def test_conversation_calls_use_low_effort(db, capture_messages):
    from app.sessions import _create_conversation_session, submit_conversation_answer

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    session = await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "daily_life",
    })
    await submit_conversation_answer(db, session["id"], "Ahoj")
    assert capture_messages["calls"] == [
        {"max_tokens": 4000, "effort": "low"},
        {"max_tokens": 4000, "effort": "low"},
    ]


async def test_instructions_block_no_longer_protects_review_words(db, capture_messages):
    from app.sessions import _create_conversation_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "daily_life",
        "instructions": "talk about food",
    })
    assert "review words" not in capture_messages["messages"][0]["content"]
```

In `backend/tests/test_feedback.py` change the fake to:

```python
    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        captured["prompt"] = prompt
        captured["system"] = system_prompt
        captured["kwargs"] = kwargs
        return dict(FULL_LLM)
```

and append:

```python
async def test_feedback_call_uses_schema_and_low_effort(db, fake_llm, sample_vocab_session):
    from app.schemas import FEEDBACK_SCHEMA

    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    await end_session(db, session["id"])
    assert fake_llm["kwargs"]["schema"] is FEEDBACK_SCHEMA
    assert fake_llm["kwargs"]["effort"] == "low"
    assert fake_llm["kwargs"]["max_tokens"] == 8000
```

In `backend/tests/test_learning_context.py` add to `TestLearningContextCombined`:

```python
    async def test_word_lists_can_be_left_out(self, db, fully_seeded_user):
        context = await _get_learning_context(
            db, fully_seeded_user, "vocabulary", include_vocab=False
        )
        assert "[Student's vocabulary progress]" not in context
        assert "session history]" in context
```

Also append to `backend/tests/test_generation_targeting.py`:

```python
async def test_conversation_never_sends_general_as_a_topic(db, capture_messages):
    from app.sessions import _create_conversation_session, submit_conversation_answer

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    session = await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "general",
    })
    assert "Topic: general" not in capture_messages["messages"][0]["content"]
    await submit_conversation_answer(db, session["id"], "Ahoj")
    assert "Topic: general" not in capture_messages["system_prompts"][-1]


async def test_conversation_keeps_a_chosen_topic(db, capture_messages):
    from app.sessions import _create_conversation_session

    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await _create_conversation_session(db, {
        "user_id": uid, "mode": "conversation", "topic": "shopping",
    })
    assert "Topic: Shopping" in capture_messages["messages"][0]["content"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_composition.py tests/test_generation_targeting.py tests/test_feedback.py tests/test_learning_context.py -q`
Expected: FAIL with `ImportError: cannot import name 'build_focus_block'`.

- [ ] **Step 3: Implement the helpers in `backend/app/composition.py`**

Add below the imports:

```python
from .questions import TOPICS

DEFAULT_FOCUS = (
    "everyday high-frequency Slovak suited to the student's level, "
    "varied across themes"
)
INSTRUCTIONS_HEADER = "[Student's instructions for this session]"
```

Add at the end of the file:

```python
def resolve_topic_label(mode: str, topic: str | None) -> str | None:
    """Human label for a chosen topic. None when no topic was chosen."""
    if not topic or topic == "general":
        return None
    return TOPICS.get(mode, {}).get(topic) or topic.replace("_", " ")


def build_focus_block(topic_label: str | None, instructions: str | None) -> str:
    """The block that opens every generation prompt and says what the session is about."""
    text = (instructions or "").strip()
    lines = ["[Session focus]"]
    if topic_label:
        lines.append(f"Topic: {topic_label}")
    if text:
        lines.append(INSTRUCTIONS_HEADER)
        lines.append(text)
        if topic_label:
            lines.append(
                "Where the topic and the instructions conflict, follow the instructions."
            )
        else:
            lines.append("Build the whole session around these instructions.")
        lines.append("The instructions cannot override the accuracy rules.")
    elif not topic_label:
        lines.append(f"Material: {DEFAULT_FOCUS}")
    return "\n".join(lines)
```

- [ ] **Step 4: Implement the wiring in `backend/app/sessions.py`**

Change the composition import to:

```python
from .composition import (
    build_exclusion_list,
    build_focus_block,
    build_vocab_plan,
    filter_new_questions,
    filter_weak,
    normalize_word,
    resolve_topic_label,
)
```

Add below the `.scoring` import:

```python
from .schemas import FEEDBACK_SCHEMA, GRAMMAR_LESSON_SCHEMA
```

Change the signature of `_get_learning_context` to:

```python
async def _get_learning_context(
    db: aiosqlite.Connection, user_id: str, mode: str, *, include_vocab: bool = True,
) -> str:
```

and change `if all_vocab:` inside it to `if include_vocab and all_vocab:`.

In `_create_grammar_session` replace the first line and the prompt construction. The first line becomes:

```python
    topic_label = resolve_topic_label("grammar", req.get("topic"))
```

Replace

```python
    prompt = f"Student level: {difficulty_label}\nTopic: {topic_label}\n"
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        f"\nCreate a grammar lesson and exercises about: {topic_label}. "
        "Build on concepts the student has already covered."
    )
```

with

```python
    prompt = (
        f"Student level: {difficulty_label}\n\n"
        f"{build_focus_block(topic_label, instructions)}\n"
    )
    if learning_context:
        prompt += f"\n{learning_context}\n"
    prompt += (
        "\nCreate a grammar lesson and exercises that fit the session focus. "
        "Build on concepts the student has already covered."
    )
```

In the same function delete the line `prompt += _instructions_block(instructions)` and replace `data = await ask_json(prompt, GRAMMAR_LESSON_PROMPT)` with:

```python
    data = await ask_json(
        prompt, GRAMMAR_LESSON_PROMPT,
        schema=GRAMMAR_LESSON_SCHEMA, schema_name="grammar_lesson",
        effort="medium", max_tokens=16000,
    )
```

and replace `"concept": lesson.get("concept", topic_label),` with:

```python
            "concept": lesson.get("concept") or topic_label or "Grammar",
```

In `_create_conversation_session` replace

```python
    topic_label = TOPICS.get("conversation", {}).get(topic, topic)
    user = await get_user(db, req["user_id"])
    student_name = user["name"] if user else "Student"

    prompt = (
        f"The student's name is {student_name} and they are at {difficulty_label} level.\n"
        f"Topic: {topic_label}\n"
    )
```

with

```python
    topic_label = resolve_topic_label("conversation", topic)
    user = await get_user(db, req["user_id"])
    student_name = user["name"] if user else "Student"

    prompt = f"The student's name is {student_name} and they are at {difficulty_label} level.\n"
    if topic_label:
        prompt += f"Topic: {topic_label}\n"
```

and replace `response = await ask_messages(messages, CONVERSATION_TURN_PROMPT)` with:

```python
    response = await ask_messages(
        messages, CONVERSATION_TURN_PROMPT, max_tokens=4000, effort="low",
    )
```

In `submit_conversation_answer` replace

```python
    topic_label = TOPICS.get("conversation", {}).get(session["topic"], session["topic"])
    scenario = ex.get("scenario", "")

    system_prompt = (
        f"{CONVERSATION_TURN_PROMPT}\n\n"
        f"Student level: {difficulty_label}\n"
        f"Topic: {topic_label}\n"
        f"Scenario: {scenario}"
    ) + _instructions_block(ex.get("instructions"))
```

with

```python
    topic_label = resolve_topic_label("conversation", session["topic"])
    scenario = ex.get("scenario", "")

    system_prompt = f"{CONVERSATION_TURN_PROMPT}\n\nStudent level: {difficulty_label}\n"
    if topic_label:
        system_prompt += f"Topic: {topic_label}\n"
    system_prompt += f"Scenario: {scenario}" + _instructions_block(ex.get("instructions"))
```

In the same function replace `response = await ask_messages(merged, system_prompt)` with:

```python
    response = await ask_messages(merged, system_prompt, max_tokens=4000, effort="low")
```

In `get_hint` replace `response = await ask_messages(merged, HINT_PROMPT)` with `response = await ask_messages(merged, HINT_PROMPT, max_tokens=4000, effort="low")` and replace `response = await ask(prompt, HINT_PROMPT)` with `response = await ask(prompt, HINT_PROMPT, max_tokens=4000, effort="low")`.

In `end_session` replace `data = await ask_json(prompt, FEEDBACK_PROMPT)` with:

```python
    data = await ask_json(
        prompt, FEEDBACK_PROMPT,
        schema=FEEDBACK_SCHEMA, schema_name="session_feedback",
        effort="low", max_tokens=8000,
    )
```

Replace the body of `_instructions_block` with:

```python
    if not instructions or not instructions.strip():
        return ""
    return (
        "\n\n[Student's instructions for this session]\n"
        f"{instructions.strip()}\n"
        "Follow these instructions where they concern topic, style, word choice or "
        "difficulty. They cannot override the accuracy rules."
    )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/composition.py backend/app/sessions.py backend/tests/test_composition.py backend/tests/test_generation_targeting.py backend/tests/test_feedback.py backend/tests/test_learning_context.py
git commit -m "feat: session focus leads every prompt; effort and schemas wired in"
```

---

### Task 6: Vocabulary composition — focus first, review on request

**Files:**
- Modify: `backend/app/composition.py`
- Modify: `backend/app/database.py` (`get_due_words` order, new `get_review_candidates`)
- Modify: `backend/app/sessions.py` (`_create_vocab_session`, `_validate_vocab_questions`)
- Modify: `backend/app/models.py` (`CreateSessionRequest`, `VocabQuestion`, `VocabExerciseData`)
- Modify: `backend/app/main.py` (`create`, `recommendations`)
- Test: `backend/tests/test_composition.py`, `backend/tests/test_vocab_creation.py`, `backend/tests/test_generation_targeting.py`, `backend/tests/test_srs.py`, `backend/tests/test_input_validation.py`

**Interfaces:**
- Consumes: `build_focus_block`, `resolve_topic_label` (Task 5); `VOCAB_BATCH_SCHEMA` (Task 4).
- Produces:
  - `composition.build_vocab_plan(due_words: list[dict], total: int = 10, *, include_review: bool = False, max_review: int = 4) -> dict` with keys `review` and `new_count`.
  - `composition.build_exclusion_list(all_vocab, plan_words, cap: int = 1000) -> list[str]`
  - `composition.is_meta_answer(text: str) -> bool`, `composition.has_non_latin_letters(text: str) -> bool`, `composition.question_defect(q: dict) -> str | None`
  - `database.get_review_candidates(db, user_id: str, limit: int = 8) -> list[dict]`
  - `composition.filter_weak` is deleted.
  - Request field `include_review: bool = False`. Each stored vocabulary question has `review: bool`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_composition.py`:

Remove `filter_weak` from the import list and add `has_non_latin_letters`, `is_meta_answer`, `question_defect`. Delete the class `TestFilterWeak`. Replace the class `TestBuildVocabPlan` with:

```python
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
```

Replace `test_caps_at_150` with:

```python
    def test_caps_at_1000(self):
        all_vocab = [_w(f"slovo{i}") for i in range(1200)]
        assert len(build_exclusion_list(all_vocab, plan_words=[])) == 1000

    def test_300_words_all_excluded(self):
        all_vocab = [_w(f"slovo{i}") for i in range(300)]
        assert len(build_exclusion_list(all_vocab, plan_words=[])) == 300
```

Append:

```python
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
        assert question_defect(_question(word="čítал")) == "non-Latin letters in Slovak text"

    def test_cyrillic_in_slovak_choices_for_en_sk(self):
        q = _question(word="bread", direction="en-sk",
                      choices=["chlieb", "хлеб", "maslo", "syr"])
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
```

In `backend/tests/test_vocab_creation.py`:

Change the fake to accept keyword arguments:

```python
    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        state["prompts"].append(prompt)
        state.setdefault("kwargs", []).append(kwargs)
        return state["responses"].pop(0)
```

Replace `test_due_words_fill_review_slots` with:

```python
async def test_due_words_ignored_by_default(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "food_drink"})
    assert "REQUIRED REVIEW WORDS" not in llm["prompts"][0]
    assert all(q["review"] is False for q in session["exercises"]["questions"])
    # a due word is still a seen word, so it is excluded from the new slots
    assert "hrad" in llm["prompts"][0]


async def test_review_words_added_on_request(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q("hrad", "castle")] + [_q(f"s{i}") for i in range(9)]}]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "food_drink", "include_review": True,
    })
    assert "REQUIRED REVIEW WORDS" in llm["prompts"][0]
    flags = {q["word"]: q["review"] for q in session["exercises"]["questions"]}
    assert flags["hrad"] is True
    assert flags["s0"] is False


async def test_only_quiz_words_are_review_candidates(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "knihu", "english": "", "correct": False, "source_mode": "grammar"},
        {"slovak": "vodu", "english": "water (accusative)", "correct": False, "source_mode": "translation"},
        {"slovak": "prázdny", "english": "", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    assert "REQUIRED REVIEW WORDS" not in llm["prompts"][0]


async def test_duplicate_review_question_kept_once(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [
        {"questions": [_q("hrad", "castle"), _q("hrad", "castle")] + [_q(f"s{i}") for i in range(8)]},
        {"questions": [_q("s8")]},
    ]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert words.count("hrad") == 1
    assert len(words) == 10


async def test_missing_review_question_does_not_block_the_session(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    session = await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    assert len(session["exercises"]["questions"]) == 10


async def test_prompt_leads_with_focus_and_omits_word_lists(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "kniha", "english": "book", "correct": True, "source_mode": "vocabulary"},
    ])
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general",
        "instructions": "I want to learn about food",
    })
    prompt = llm["prompts"][0]
    assert prompt.index("I want to learn about food") < prompt.index("NEW vocabulary questions")
    assert "about: general" not in prompt
    assert "Topic: general" not in prompt
    assert "[Student's vocabulary progress]" not in prompt
    assert "Recently learned words" not in prompt


async def test_meta_answer_question_dropped_and_topped_up(db, llm):
    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    bad = {
        "word": "na zdravie", "direction": "sk-en",
        "choices": ["cheers", "bless you", "all of the above", "to your health"],
        "correctIndex": 2, "explanation": "",
    }
    llm["responses"] = [
        {"questions": [bad] + [_q(f"s{i}") for i in range(9)]},
        {"questions": [_q("s9")]},
    ]
    session = await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    words = [q["word"] for q in session["exercises"]["questions"]]
    assert "na zdravie" not in words
    assert len(words) == 10


async def test_vocab_call_uses_schema_and_medium_effort(db, llm):
    from app.schemas import VOCAB_BATCH_SCHEMA

    uid = f"vc_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    llm["responses"] = [{"questions": [_q(f"s{i}") for i in range(10)]}]
    await _create_vocab_session(db, {"user_id": uid, "mode": "vocabulary", "topic": "general"})
    assert llm["kwargs"][0]["schema"] is VOCAB_BATCH_SCHEMA
    assert llm["kwargs"][0]["effort"] == "medium"
    assert llm["kwargs"][0]["max_tokens"] == 16000
```

In `backend/tests/test_generation_targeting.py` replace `test_vocab_prompt_includes_due_words` with:

```python
async def test_vocab_prompt_includes_due_words_when_review_requested(db, capture_llm):
    uid = f"gt_{uuid.uuid4().hex[:8]}"
    await _seed_user(db, uid)
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
    ])
    await _create_vocab_session(db, {
        "user_id": uid, "mode": "vocabulary", "topic": "general", "include_review": True,
    })
    assert "hrad" in capture_llm["prompt"]
    assert "due for review" in capture_llm["prompt"]
```

In `backend/tests/test_srs.py` extend the import with `get_review_candidates` and append:

```python
async def test_due_words_come_most_overdue_first(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [_word("nový", False), _word("starý", False)])
    long_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    await db.execute(
        "UPDATE vocabulary_progress SET due_at = ? WHERE user_id = ? AND slovak = 'starý'",
        (long_ago, uid),
    )
    await db.commit()
    due = await get_due_words(db, uid)
    assert [w["slovak"] for w in due][:2] == ["starý", "nový"]


async def test_review_candidates_are_quiz_words_with_a_meaning(db):
    uid = f"srs_{uuid.uuid4().hex[:8]}"
    await upsert_vocab_progress(db, uid, [
        {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
        {"slovak": "knihu", "english": "", "correct": False, "source_mode": "grammar"},
        {"slovak": "vodu", "english": "water", "correct": False, "source_mode": "translation"},
        {"slovak": "bez", "english": "", "correct": False, "source_mode": "vocabulary"},
    ])
    candidates = await get_review_candidates(db, uid)
    assert [w["slovak"] for w in candidates] == ["hrad"]
```

In `backend/tests/test_input_validation.py` add to `TestInstructionsLimits`:

```python
    async def test_include_review_reaches_session_creation(self, client, monkeypatch):
        from app import main as main_module

        seen: dict = {}

        async def fake_create(db, req):
            seen.update(req)
            return {"id": "x"}

        monkeypatch.setattr(main_module, "create_session", fake_create)
        async with client as c:
            resp = await c.post("/api/sessions", json={
                "user_id": "matt", "mode": "vocabulary", "include_review": True,
            })
        assert resp.status_code == 200
        assert seen["include_review"] is True

    async def test_include_review_defaults_to_false(self, client, monkeypatch):
        from app import main as main_module

        seen: dict = {}

        async def fake_create(db, req):
            seen.update(req)
            return {"id": "x"}

        monkeypatch.setattr(main_module, "create_session", fake_create)
        async with client as c:
            await c.post("/api/sessions", json={"user_id": "matt", "mode": "vocabulary"})
        assert seen["include_review"] is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_composition.py tests/test_vocab_creation.py tests/test_srs.py tests/test_input_validation.py tests/test_generation_targeting.py -q`
Expected: FAIL with `ImportError: cannot import name 'has_non_latin_letters'`.

- [ ] **Step 3: Implement in `backend/app/composition.py`**

Delete `filter_weak`. Replace `build_vocab_plan` and `build_exclusion_list` with:

```python
def build_vocab_plan(
    due_words: list[dict],
    total: int = 10,
    *,
    include_review: bool = False,
    max_review: int = 4,
) -> dict:
    """Split a session into review and new slots.

    Review words appear only when the learner asked for them; otherwise every
    slot is a new word on the session focus.
    """
    review = due_words[:max_review] if include_review else []
    return {"review": review, "new_count": total - len(review)}


def build_exclusion_list(
    all_vocab: list[dict], plan_words: list[dict], cap: int = 1000,
) -> list[str]:
    """Seen words the LLM must not reuse for new slots (plan's own words exempt)."""
    plan_keys = {normalize_word(w["slovak"]) for w in plan_words}
    return [
        w["slovak"]
        for w in all_vocab[:cap]
        if normalize_word(w["slovak"]) not in plan_keys
    ]
```

Add below `filter_new_questions`:

```python
META_ANSWERS = frozenset({
    "all of the above",
    "none of the above",
    "both of the above",
    "neither of the above",
    "both",
    "neither",
})


def is_meta_answer(text: str) -> bool:
    """True for quiz options that refer to other options instead of a meaning."""
    return normalize_word(text).strip(" .!") in META_ANSWERS


def has_non_latin_letters(text: str) -> bool:
    """True when any letter is outside the Latin script (Cyrillic look-alikes)."""
    return any(
        ch.isalpha() and not unicodedata.name(ch, "").startswith("LATIN")
        for ch in text
    )


def question_defect(q: dict) -> str | None:
    """Why a generated vocabulary question is unusable, or None when it is fine."""
    choices = q.get("choices") or []
    if len(choices) != 4:
        return "needs exactly four choices"
    idx = q.get("correctIndex")
    if not isinstance(idx, int) or isinstance(idx, bool) or not 0 <= idx < 4:
        return "correct index out of range"
    if any(is_meta_answer(c) for c in choices):
        return "meta answer among the choices"
    word = q.get("word", "")
    if normalize_word(word) == normalize_word(choices[idx]):
        return "word equals its answer"
    slovak_texts = [word] if q.get("direction") == "sk-en" else choices
    if any(has_non_latin_letters(t) for t in slovak_texts):
        return "non-Latin letters in Slovak text"
    return None
```

- [ ] **Step 4: Implement in `backend/app/database.py`**

In `get_due_words` change the docstring to `"""Words due for review now, most overdue first."""` and the `ORDER BY` line to:

```sql
           ORDER BY due_at ASC
```

Add directly below `get_due_words`:

```python
async def get_review_candidates(
    db: aiosqlite.Connection, user_id: str, limit: int = 8,
) -> list[dict]:
    """Due words that can be quizzed: learned as vocabulary, with a meaning.

    Grammar blanks and words lifted from feedback are inflected fragments,
    often without an English meaning, so they never enter a quiz.
    """
    now = datetime.now(timezone.utc).isoformat()
    cursor = await db.execute(
        """SELECT slovak, english, times_seen, times_correct, last_seen_at, source_mode, due_at
           FROM vocabulary_progress
           WHERE user_id = ? AND due_at IS NOT NULL AND due_at <= ?
             AND source_mode = 'vocabulary' AND english != ''
           ORDER BY due_at ASC
           LIMIT ?""",
        (user_id, now, limit),
    )
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 5: Implement in `backend/app/models.py`**

Add to `VocabQuestion`:

```python
    review: bool = False  # a due word the learner asked to review
```

Add to `VocabExerciseData`, below `instructions`:

```python
    srsPerAnswer: bool = False  # progress is saved as each answer arrives
    progressRecorded: bool = False  # end-of-session progress already saved
```

Add to `GrammarExerciseData`, below `instructions`:

```python
    progressRecorded: bool = False
```

Add to `CreateSessionRequest`:

```python
    include_review: bool = False
```

- [ ] **Step 6: Implement in `backend/app/main.py`**

Add `get_review_candidates,` to the `.database` import list. In `create`, add to the dict passed to `create_session`:

```python
            "include_review": req.include_review,
```

In `recommendations` replace `due = await get_due_words(db, user_id, limit=20)` with:

```python
        due = await get_review_candidates(db, user_id, limit=20)
```

That was the only use of `get_due_words` in `main.py`, so remove `get_due_words,` from the import list.

- [ ] **Step 7: Implement in `backend/app/sessions.py`**

In the `.database` import list add `get_review_candidates,`. Remove `filter_weak,` from the composition import and add `question_defect,`. Change the schemas import to:

```python
from .schemas import FEEDBACK_SCHEMA, GRAMMAR_LESSON_SCHEMA, VOCAB_BATCH_SCHEMA
```

Replace the whole of `_create_vocab_session` and `_validate_vocab_questions` with:

```python
async def _create_vocab_session(db: aiosqlite.Connection, req: dict) -> dict:
    topic_label = resolve_topic_label("vocabulary", req.get("topic"))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()
    include_review = bool(req.get("include_review"))
    focus = build_focus_block(topic_label, instructions)

    due = await get_review_candidates(db, req["user_id"], limit=8) if include_review else []
    plan = build_vocab_plan(due, total=10, include_review=include_review)
    plan_words = plan["review"]
    all_vocab = await get_vocab_progress(db, req["user_id"])
    exclusions = build_exclusion_list(all_vocab, plan_words)

    prompt = f"Student level: {difficulty_label}\n\n{focus}\n"
    if plan_words:
        listed = ", ".join(f"{w['slovak']} ({w['english']})" for w in plan_words)
        prompt += (
            "\nREQUIRED REVIEW WORDS — these are due for review; create one question "
            f"for each of these exact Slovak words, whatever the session focus: {listed}\n"
        )
    prompt += (
        f"\nAdd {plan['new_count']} NEW vocabulary questions. "
        "Every new word fits the session focus."
    )
    if exclusions:
        prompt += (
            "\n\nThe student has already seen these words. Do not use any of them "
            "for the new questions: " + ", ".join(exclusions)
        )

    data = await ask_json(
        prompt, VOCAB_BATCH_PROMPT,
        schema=VOCAB_BATCH_SCHEMA, schema_name="vocab_batch",
        effort="medium", max_tokens=16000,
    )
    questions = _validate_vocab_questions(
        data.get("questions", []), plan_words, exclusions
    )

    if len(questions) < 10:
        missing = 10 - len(questions)
        seen_norm: set[str] = set()
        used_words: list[str] = []
        for w in list({q["word"] for q in questions}) + list(exclusions):
            nw = normalize_word(w)
            if nw not in seen_norm:
                seen_norm.add(nw)
                used_words.append(w)
        used = ", ".join(sorted(used_words))
        retry_prompt = (
            f"Student level: {difficulty_label}\n\n{focus}\n\n"
            f"Generate exactly {missing} vocabulary quiz questions that fit the "
            f"session focus. Do NOT use any of these words: {used}"
        )
        more = await ask_json(
            retry_prompt, VOCAB_BATCH_PROMPT,
            schema=VOCAB_BATCH_SCHEMA, schema_name="vocab_batch",
            effort="medium", max_tokens=16000,
        )
        questions = _validate_vocab_questions(
            questions + more.get("questions", []), plan_words, exclusions
        )

    if len(questions) < 6:
        raise LLMError("Vocabulary generation produced too few valid questions")

    if len(questions) < 10:
        log.warning("Vocab session generated %d/10 questions for user %s", len(questions), req["user_id"])

    questions = questions[:10]

    exercises = {
        "type": "vocabulary",
        "questions": questions,
        "currentIndex": 0,
        "answers": [None] * len(questions),
        "credits": [None] * len(questions),
        "retryQueue": [],
        "phase": "questions",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session


def _validate_vocab_questions(
    questions: list[dict], plan_words: list[dict], exclusions: list[str],
) -> list[dict]:
    """Drop defective, excluded and duplicate questions; flag the review ones."""
    plan_keys: set[str] = set()
    for w in plan_words:
        plan_keys.add(normalize_word(w["slovak"]))
        if w.get("english"):
            plan_keys.add(normalize_word(w["english"]))

    seen_words: set[str] = set()
    valid: list[dict] = []
    for q in filter_new_questions(questions, plan_words, exclusions):
        defect = question_defect(q)
        if defect:
            log.info("Dropping vocab question %r: %s", q.get("word"), defect)
            continue
        # Dedupe on both the display word and the correct answer so the same
        # pair can't appear twice via opposite directions (mäso→meat, meat→mäso).
        keys = {normalize_word(q["word"]), normalize_word(q["choices"][q["correctIndex"]])}
        if keys & seen_words:
            continue
        lower_choices = [c.strip().lower() for c in q["choices"]]
        if len(set(lower_choices)) < len(lower_choices):
            continue
        seen_words |= keys
        q["review"] = bool(keys & plan_keys)
        valid.append(q)
    return valid
```

`_instructions_block` stays: conversation still uses it.

`filter_weak` no longer exists, and `_create_translation_session` still calls it until Task 8 rewrites that function. In `_create_translation_session` replace

```python
    due = await get_due_words(db, req["user_id"], limit=6)
    weak = filter_weak(await get_weak_words(db, req["user_id"], limit=6))
    seen_keys = {w["slovak"] for w in due}
    review_words = (due + [w for w in weak if w["slovak"] not in seen_keys])[:6]
```

with

```python
    review_words = await get_due_words(db, req["user_id"], limit=6)
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass, including `tests/test_recommendations.py`, whose seeded words are already vocabulary words with a meaning.

- [ ] **Step 9: Commit**

```bash
git add backend/app/composition.py backend/app/database.py backend/app/models.py backend/app/main.py backend/app/sessions.py backend/tests
git commit -m "feat: vocab sessions follow the chosen focus; review words on request"
```

---

### Task 7: Progress tracking that survives unfinished sessions

**Files:**
- Modify: `backend/app/vocab_extraction.py`
- Modify: `backend/app/sessions.py` (`_create_vocab_session`, `submit_vocab_answer`, `end_session`)
- Modify: `backend/app/database.py` (`init_db`, new `_cleanup_bad_vocab_rows`)
- Test: `backend/tests/test_vocab_extraction.py`, `backend/tests/test_sessions.py`, `backend/tests/test_feedback.py`, `backend/tests/test_database.py`

**Interfaces:**
- Consumes: `is_meta_answer`, `has_non_latin_letters` (Task 6).
- Produces:
  - `vocab_extraction.question_pair(q: dict) -> tuple[str, str]` returning `(slovak, english)`.
  - New vocabulary sessions carry `exercises["srsPerAnswer"] = True`.
  - `end_session` returns stored feedback, with no model call, for a completed session.
  - `exercises["progressRecorded"] = True` after end-of-session progress is saved.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_vocab_extraction.py`:

Add `question_pair` to the import from `app.vocab_extraction`. In `TestGrammarModeExtraction` delete `test_extracts_blank_words` and `test_tracks_grammar_correctness`, and add:

```python
    def test_blanks_are_not_extracted(self, sample_grammar_session):
        words = extract_vocab_from_session(sample_grammar_session)
        slovaks = {w["slovak"].lower() for w in words}
        assert "knihu" not in slovaks      # an inflected blank, not a vocabulary word
        assert slovaks == {"dom", "kniha"}  # from feedback only
```

Add to `TestVocabModeExtraction`:

```python
    def test_per_answer_sessions_extract_nothing_at_the_end(self, sample_vocab_session):
        sample_vocab_session["exercises"]["srsPerAnswer"] = True
        assert extract_vocab_from_session(sample_vocab_session) == []

    def test_question_pair_resolves_both_directions(self, sample_vocab_session):
        q_sk, q_en = sample_vocab_session["exercises"]["questions"][:2]
        assert question_pair(q_sk) == ("chlieb", "bread")
        assert question_pair(q_en) == ("voda", "water")
```

In `backend/tests/test_sessions.py` append:

```python
class TestPerAnswerProgress:
    async def _fresh(self, db, active_vocab_session) -> tuple[str, str]:
        """Make the fixture a per-answer session owned by a unique user."""
        from app.database import get_session as db_get_session, update_session as db_update_session

        uid = f"pa_{uuid.uuid4().hex[:8]}"
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
            (uid,),
        )
        await db.execute(
            "UPDATE sessions SET user_id = ? WHERE id = ?", (uid, active_vocab_session["id"]),
        )
        await db.commit()
        session = await db_get_session(db, active_vocab_session["id"])
        ex = session["exercises"]
        ex["srsPerAnswer"] = True
        await db_update_session(db, session["id"], exercises_json=ex)
        return session["id"], uid

    async def _rows(self, db, uid) -> dict:
        from app.database import get_vocab_progress

        return {w["slovak"]: w for w in await get_vocab_progress(db, uid)}

    async def test_first_attempt_is_recorded_without_ending(self, db, active_vocab_session):
        sid, uid = await self._fresh(db, active_vocab_session)
        await submit_vocab_answer(db, sid, 0)  # chlieb, correct
        rows = await self._rows(db, uid)
        assert rows["chlieb"]["times_seen"] == 1
        assert rows["chlieb"]["times_correct"] == 1
        assert rows["chlieb"]["english"] == "bread"
        assert rows["chlieb"]["source_mode"] == "vocabulary"

    async def test_wrong_first_attempt_recorded_as_wrong(self, db, active_vocab_session):
        sid, uid = await self._fresh(db, active_vocab_session)
        await submit_vocab_answer(db, sid, 1)  # chlieb, wrong
        rows = await self._rows(db, uid)
        assert rows["chlieb"]["times_correct"] == 0

    async def test_retry_answers_are_not_counted_again(self, db, active_vocab_session):
        sid, uid = await self._fresh(db, active_vocab_session)
        await submit_vocab_answer(db, sid, 1)  # q0 wrong
        await submit_vocab_answer(db, sid, 1)  # q1 correct -> retry phase
        await submit_vocab_answer(db, sid, 0)  # retry q0 correct
        rows = await self._rows(db, uid)
        assert rows["chlieb"]["times_seen"] == 1
        assert rows["chlieb"]["times_correct"] == 0
        assert rows["voda"]["times_seen"] == 1

    async def test_answer_after_completion_changes_nothing(self, db, active_vocab_session):
        sid, uid = await self._fresh(db, active_vocab_session)
        await submit_vocab_answer(db, sid, 0)
        await submit_vocab_answer(db, sid, 1)  # both correct -> complete
        with pytest.raises(ValueError):
            await submit_vocab_answer(db, sid, 0)  # a resent request
        rows = await self._rows(db, uid)
        assert rows["chlieb"]["times_seen"] == 1
        assert rows["voda"]["times_seen"] == 1

    async def test_legacy_session_not_recorded_per_answer(self, db, active_vocab_session):
        from app.database import get_vocab_progress

        uid = f"pa_{uuid.uuid4().hex[:8]}"
        await db.execute(
            "UPDATE sessions SET user_id = ? WHERE id = ?", (uid, active_vocab_session["id"]),
        )
        await db.commit()
        await submit_vocab_answer(db, active_vocab_session["id"], 0)
        assert await get_vocab_progress(db, uid) == []
```

In `backend/tests/test_feedback.py` append:

```python
async def test_end_session_twice_calls_the_model_once(db, monkeypatch, sample_vocab_session):
    calls = {"n": 0}

    async def counting_ask_json(prompt, system_prompt=None, **kwargs):
        calls["n"] += 1
        return dict(FULL_LLM)

    monkeypatch.setattr(sessions_module, "ask_json", counting_ask_json)
    uid = f"fbu_{uuid.uuid4().hex[:8]}"
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "user_id": uid,
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)
    first = await end_session(db, session["id"])
    second = await end_session(db, session["id"])
    assert calls["n"] == 1
    assert second == first

    from app.database import get_vocab_progress

    rows = await get_vocab_progress(db, uid)
    assert {w["times_seen"] for w in rows} == {1}


async def test_progress_survives_a_failed_feedback_call_once(db, monkeypatch, sample_vocab_session):
    from app.database import get_vocab_progress
    from app.llm import LLMError

    state = {"fail": True}

    async def flaky_ask_json(prompt, system_prompt=None, **kwargs):
        if state["fail"]:
            raise LLMError("upstream unavailable")
        return dict(FULL_LLM)

    monkeypatch.setattr(sessions_module, "ask_json", flaky_ask_json)
    uid = f"fbu_{uuid.uuid4().hex[:8]}"
    session = {
        **sample_vocab_session,
        "id": f"fb-{uuid.uuid4().hex[:8]}",
        "user_id": uid,
        "completed": False,
        "feedback": None,
    }
    await db_create_session(db, session)

    with pytest.raises(LLMError):
        await end_session(db, session["id"])
    assert len(await get_vocab_progress(db, uid)) == 3  # saved despite the failure

    state["fail"] = False
    await end_session(db, session["id"])
    rows = await get_vocab_progress(db, uid)
    assert {w["times_seen"] for w in rows} == {1}  # and not saved a second time
```

In `backend/tests/test_database.py` add `import uuid` above `import pytest`, add `init_db,` to the `from app.database import (...)` list, and append:

```python
async def test_init_removes_unusable_vocab_rows(db):
    uid = f"clean_{uuid.uuid4().hex[:8]}"
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'C', 'C', '#000')",
        (uid,),
    )
    rows = [
        ("na zdravie", "all of the above"),
        ("čítал", ""),
        ("chlieb", "bread"),
        ("ťažký", "heavy"),
    ]
    for slovak, english in rows:
        await db.execute(
            """INSERT INTO vocabulary_progress
               (user_id, slovak, english, times_seen, times_correct, last_seen_at,
                source_mode, created_at, due_at, interval_days)
               VALUES (?, ?, ?, 1, 1, '2026-01-01T00:00:00+00:00', 'vocabulary',
                       '2026-01-01T00:00:00+00:00', '2026-01-02T00:00:00+00:00', 1)""",
            (uid, slovak, english),
        )
    await db.commit()

    await init_db()
    await init_db()  # safe to run repeatedly

    kept = {w["slovak"] for w in await get_vocab_progress(db, uid)}
    assert kept == {"chlieb", "ťažký"}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_vocab_extraction.py tests/test_sessions.py tests/test_feedback.py tests/test_database.py -q`
Expected: FAIL with `ImportError: cannot import name 'question_pair'`.

- [ ] **Step 3: Implement in `backend/app/vocab_extraction.py`**

In `extract_vocab_from_session` change the `"grammar"` entry of `extractors` to `_extract_from_feedback`. Delete the function `_extract_from_grammar`.

Add above `_extract_from_vocab`:

```python
def question_pair(q: dict) -> tuple[str, str]:
    """The (slovak, english) pair a vocabulary question teaches."""
    choices = q.get("choices", [])
    idx = q.get("correctIndex", 0)
    answer = choices[idx] if 0 <= idx < len(choices) else ""
    if q.get("direction", "sk-en") == "sk-en":
        return q.get("word", ""), answer
    return answer, q.get("word", "")
```

In `_extract_from_vocab`, add as the first statement after the `if not exercises or "questions" not in exercises:` block:

```python
    if exercises.get("srsPerAnswer"):
        return []  # each word was saved when its first answer arrived
```

and replace the block from `word = q.get("word", "")` through the `if direction == "sk-en": ... else: ...` assignment with:

```python
        correct_idx = q.get("correctIndex", 0)
        user_answer = answers[i] if i < len(answers) else None
        # Credits preserve the first-attempt outcome (retry overwrites answers):
        # only full credit counts as correct so missed words resurface in the SRS.
        credit = credits[i] if i < len(credits) else None
        if credit is not None:
            is_correct = credit >= 1.0
        else:
            is_correct = user_answer == correct_idx

        slovak, english = question_pair(q)
```

- [ ] **Step 4: Implement in `backend/app/sessions.py`**

Change the vocab extraction import to:

```python
from .vocab_extraction import extract_vocab_from_session, question_pair
```

In `_create_vocab_session`, add to the `exercises` dict:

```python
        "srsPerAnswer": True,
```

In `submit_vocab_answer`, directly after the line `is_correct = choice_index == q["correctIndex"]` add:

```python
    first_attempt = ex["phase"] == "questions"
```

and directly after the `await db_update_session(...)` call near the end of that function add:

```python
    if first_attempt and ex.get("srsPerAnswer"):
        slovak, english = question_pair(q)
        try:
            await upsert_vocab_progress(db, session["user_id"], [{
                "slovak": slovak,
                "english": english,
                "correct": is_correct,
                "source_mode": "vocabulary",
            }])
        except Exception:
            log.exception("Failed to save progress for %r in session %s", slovak, session_id)
```

Replace the whole of `end_session` with:

```python
async def _record_deterministic_progress(db: aiosqlite.Connection, session: dict) -> None:
    """Save the progress that needs no model output, once per session."""
    ex = session.get("exercises") or {}
    if not ex or ex.get("progressRecorded"):
        return
    try:
        if ex.get("type") == "vocabulary" and not ex.get("srsPerAnswer"):
            words = extract_vocab_from_session(session)
            if words:
                await upsert_vocab_progress(db, session["user_id"], words)
        if ex.get("type") == "grammar":
            concept = (ex.get("lesson") or {}).get("concept", "")
            credits = [c for c in (ex.get("credits") or []) if c is not None]
            if concept and credits:
                await record_concept_result(db, session["user_id"], concept, credits)
    except Exception:
        # Leave the flag unset so the next attempt records it.
        log.exception("Failed to record progress for session %s", session["id"])
        return
    ex["progressRecorded"] = True
    await db_update_session(db, session["id"], exercises_json=ex)


async def end_session(db: aiosqlite.Connection, session_id: str) -> dict:
    session = await db_get_session(db, session_id)
    if not session:
        raise ValueError("Session not found")

    if session["completed"] and session.get("feedback"):
        return session["feedback"]

    # Before the model call: a failed feedback request must not cost the
    # learner their progress.
    await _record_deterministic_progress(db, session)

    conversation = _build_conversation(session["messages"])
    mode_label = session["mode"].replace("_", " ").title()
    topic_label = resolve_topic_label(session["mode"], session["topic"]) or "no set topic"

    prompt = (
        f"Mode: {mode_label}\n"
        f"Topic: {topic_label}\n"
        f"Difficulty: {session['difficulty']}\n\n"
        f"Full session transcript:\n{conversation}\n\n"
        f"Analyze this session and provide feedback as JSON."
    )

    data = await ask_json(
        prompt, FEEDBACK_PROMPT,
        schema=FEEDBACK_SCHEMA, schema_name="session_feedback",
        effort="low", max_tokens=8000,
    )

    computed_score = compute_session_score(session.get("exercises"))
    computed_categories = compute_category_scores(session.get("exercises"))

    if computed_score is not None:
        overall = computed_score
        scores = computed_categories
    else:
        # Conversation (and legacy/unscorable): LLM decides
        overall = data.get("overall_score", 5)
        scores = [
            {"category": s.get("category", ""), "score": s.get("score", 5), "comment": s.get("comment", "")}
            for s in data.get("scores", [])
        ]

    feedback = {
        "overall_score": overall,
        "scores": scores,
        "strengths": data.get("strengths", []),
        "improvements": data.get("improvements", []),
        "sample_answer": data.get("sample_answer"),
        "vocabulary_learned": [
            {"slovak": v.get("slovak", ""), "english": v.get("english", ""), "example": v.get("example")}
            for v in data.get("vocabulary_learned", [])
        ],
        "grammar_notes": data.get("grammar_notes", []),
    }

    await db_update_session(
        db, session_id,
        completed=True,
        feedback_json=feedback,
    )

    # Words that only the feedback can name. Vocabulary sessions with
    # questions were already recorded from their answers.
    ex = session.get("exercises") or {}
    has_vocab_questions = ex.get("type") == "vocabulary" and bool(ex.get("questions"))
    if not has_vocab_questions:
        try:
            words = extract_vocab_from_session({**session, "feedback": feedback})
            if words:
                await upsert_vocab_progress(db, session["user_id"], words)
                log.info("Tracked %d words for user %s", len(words), session["user_id"])
        except Exception:
            log.exception("Failed to persist vocab progress for session %s", session_id)

    return feedback
```

- [ ] **Step 5: Implement in `backend/app/database.py`**

Add below the existing imports:

```python
from .composition import has_non_latin_letters, is_meta_answer
```

In `init_db`, directly after the `UPDATE vocabulary_progress SET due_at = last_seen_at ...` backfill statement, add:

```python
        await _cleanup_bad_vocab_rows(db)
```

Add above `init_db`:

```python
async def _cleanup_bad_vocab_rows(db: aiosqlite.Connection) -> None:
    """Remove rows a quiz could never use: a meta-answer as the meaning, or
    Slovak text with letters from another script. Safe to run repeatedly."""
    cursor = await db.execute("SELECT id, slovak, english FROM vocabulary_progress")
    bad_ids = [
        row[0]
        for row in await cursor.fetchall()
        if is_meta_answer(row[2] or "") or has_non_latin_letters(row[1] or "")
    ]
    for row_id in bad_ids:
        await db.execute("DELETE FROM vocabulary_progress WHERE id = ?", (row_id,))
    if bad_ids:
        log.info("Removed %d unusable vocabulary rows", len(bad_ids))
```

`log` is already defined at the top of `database.py`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/vocab_extraction.py backend/app/sessions.py backend/app/database.py backend/tests
git commit -m "feat: save vocab progress per answer; idempotent end of session"
```

---

### Task 8: Translation kinds, enforced direction, repeat protection

**Files:**
- Modify: `backend/app/prompts.py` (two new constants)
- Modify: `backend/app/composition.py` (`filter_translation_items`)
- Modify: `backend/app/sessions.py` (`_create_translation_session`, `submit_translation`)
- Modify: `backend/app/models.py` (`TranslationExerciseItem`, `TranslationAnswer`, `TranslationExerciseData`)
- Test: create `backend/tests/test_translation.py`; modify `backend/tests/test_generation_targeting.py`, `backend/tests/test_prompts.py`, `backend/tests/test_composition.py`

**Interfaces:**
- Consumes: `grade_answer`, `normalize_answer` (Task 2); `build_focus_block` (Task 5); `TRANSLATION_BATCH_SCHEMA`, `TRANSLATION_GRADE_SCHEMA` (Task 4); `_get_learning_context(..., include_vocab=False)` (Task 5).
- Produces:
  - `prompts.FILL_BLANK_BATCH_PROMPT`, `prompts.ERROR_CORRECTION_BATCH_PROMPT`
  - `composition.filter_translation_items(items: list[dict], kind: str, direction: str | None, recent_sources: list[str]) -> list[dict]`
  - `sessions.TRANSLATION_KINDS: dict[str, tuple[str, str | None]]`
  - Stored translation items have keys `kind`, `source`, `direction`, `translation`, `modelAnswer`, `keyPoints`. Stored answers have keys `userAnswer`, `score`, `feedback`, `tier`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_prompts.py` add `prompts.FILL_BLANK_BATCH_PROMPT` and `prompts.ERROR_CORRECTION_BATCH_PROMPT` to `GENERATION_PROMPTS`, and append:

```python
def test_error_correction_never_uses_accent_mistakes():
    assert "never a missing or wrong diacritic" in prompts.ERROR_CORRECTION_BATCH_PROMPT
```

In `backend/tests/test_composition.py` add `filter_translation_items` to the import list and append:

```python
def _item(**over) -> dict:
    item = {
        "source": "I have water.", "direction": "en-sk", "translation": None,
        "modelAnswer": "Mám vodu.", "keyPoints": ["accusative"],
    }
    item.update(over)
    return item


class TestFilterTranslationItems:
    def test_sets_kind_and_keeps_good_items(self):
        kept = filter_translation_items([_item()], "translate", None, [])
        assert kept == [{
            "kind": "translate", "source": "I have water.", "direction": "en-sk",
            "translation": None, "modelAnswer": "Mám vodu.", "keyPoints": ["accusative"],
        }]

    def test_drops_wrong_direction(self):
        items = [_item(), _item(source="Mám psa.", direction="sk-en", modelAnswer="I have a dog.")]
        kept = filter_translation_items(items, "translate", "en-sk", [])
        assert [i["source"] for i in kept] == ["I have water."]

    def test_drops_recently_used_sentence_ignoring_accents_and_punctuation(self):
        kept = filter_translation_items(
            [_item(source="Mám vodu.", direction="sk-en", modelAnswer="I have water.")],
            "translate", None, ["mam vodu"],
        )
        assert kept == []

    def test_drops_duplicates_within_the_batch(self):
        kept = filter_translation_items([_item(), _item()], "translate", None, [])
        assert len(kept) == 1

    def test_drops_empty_source_or_answer(self):
        items = [_item(source="  "), _item(modelAnswer="")]
        assert filter_translation_items(items, "translate", None, []) == []

    def test_fill_blank_needs_exactly_one_blank(self):
        items = [
            _item(source="Mám ____.", modelAnswer="vodu", translation="I have water."),
            _item(source="Mám vodu.", modelAnswer="vodu", translation="I have water."),
            _item(source="____ mám ____.", modelAnswer="ja", translation="I have."),
        ]
        kept = filter_translation_items(items, "fill_blank", "en-sk", [])
        assert [i["source"] for i in kept] == ["Mám ____."]

    def test_fill_blank_normalises_blank_length(self):
        kept = filter_translation_items(
            [_item(source="Mám ______.", modelAnswer="vodu", translation="I have water.")],
            "fill_blank", "en-sk", [],
        )
        assert kept[0]["source"] == "Mám ____."

    def test_translate_item_must_not_contain_a_blank(self):
        assert filter_translation_items([_item(source="I have ____.")], "translate", None, []) == []

    def test_error_correction_needs_a_real_difference(self):
        items = [
            _item(source="Mám voda.", modelAnswer="Mám vodu.", translation="I have water."),
            _item(source="Mam vodu", modelAnswer="Mám vodu.", translation="I have water."),
        ]
        kept = filter_translation_items(items, "error_correction", "en-sk", [])
        assert [i["source"] for i in kept] == ["Mám voda."]
```

Create `backend/tests/test_translation.py`:

```python
"""Translation sessions: kinds, direction, repeat protection, tolerant grading."""

from __future__ import annotations

import uuid

import pytest

from app import sessions as sessions_module
from app.database import create_session as db_create_session, upsert_vocab_progress
from app.llm import LLMError
from app.schemas import TRANSLATION_BATCH_SCHEMA, TRANSLATION_GRADE_SCHEMA
from app.sessions import _create_translation_session, submit_translation

pytestmark = pytest.mark.asyncio


def _translate(i: int, direction: str = "en-sk") -> dict:
    if direction == "en-sk":
        return {"source": f"English sentence {i}.", "direction": "en-sk", "translation": None,
                "modelAnswer": f"Slovenská veta {i}.", "keyPoints": []}
    return {"source": f"Slovenská veta {i}.", "direction": "sk-en", "translation": None,
            "modelAnswer": f"English sentence {i}.", "keyPoints": []}


def _blank(i: int) -> dict:
    return {"source": f"Veta {i} má ____.", "direction": "en-sk",
            "translation": f"Sentence {i} has a word.", "modelAnswer": f"slovo{i}", "keyPoints": []}


def _broken(i: int) -> dict:
    return {"source": f"Mám voda {i}.", "direction": "en-sk",
            "translation": f"I have water {i}.", "modelAnswer": f"Mám vodu {i}.",
            "keyPoints": ["accusative"]}


@pytest.fixture
def llm(monkeypatch):
    state = {"prompts": [], "systems": [], "kwargs": [], "responses": []}

    async def fake_ask_json(prompt, system_prompt=None, **kwargs):
        state["prompts"].append(prompt)
        state["systems"].append(system_prompt)
        state["kwargs"].append(kwargs)
        return state["responses"].pop(0)

    monkeypatch.setattr(sessions_module, "ask_json", fake_ask_json)
    return state


async def _user(db) -> str:
    uid = f"tr_{uuid.uuid4().hex[:8]}"
    await db.execute(
        "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'T', 'T', '#000')",
        (uid,),
    )
    await db.commit()
    return uid


async def _stored(db, uid: str, items: list[dict], kind: str = "translate") -> str:
    sid = f"tr-{uuid.uuid4().hex[:8]}"
    await db_create_session(db, {
        "id": sid, "user_id": uid, "mode": "translation", "topic": "general",
        "difficulty": "beginner", "completed": False,
        "created_at": "2026-09-01T10:00:00+00:00",
        "exercises": {
            "type": "translation",
            "exercises": [{"kind": kind, **i} for i in items],
            "currentIndex": 0, "answers": [None] * len(items), "phase": "exercises",
        },
        "feedback": None, "messages": [],
    })
    return sid


class TestCreation:
    async def test_slovak_to_english_is_all_one_direction(self, db, llm):
        uid = await _user(db)
        mixed = [_translate(i, "sk-en") for i in range(10)] + [_translate(99, "en-sk")]
        llm["responses"] = [{"exercises": mixed}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "slovak_to_english",
        })
        items = session["exercises"]["exercises"]
        assert len(items) == 10
        assert {i["direction"] for i in items} == {"sk-en"}
        assert {i["kind"] for i in items} == {"translate"}
        assert 'direction "sk-en"' in llm["prompts"][0]

    async def test_no_topic_allows_both_directions(self, db, llm):
        uid = await _user(db)
        llm["responses"] = [{"exercises": [
            _translate(i, "en-sk" if i % 2 == 0 else "sk-en") for i in range(10)
        ]}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        assert {i["direction"] for i in session["exercises"]["exercises"]} == {"en-sk", "sk-en"}

    async def test_fill_in_blanks_uses_its_own_prompt_and_kind(self, db, llm):
        from app.prompts import FILL_BLANK_BATCH_PROMPT

        uid = await _user(db)
        llm["responses"] = [{"exercises": [_blank(i) for i in range(10)]}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "fill_in_blanks",
        })
        assert llm["systems"][0] is FILL_BLANK_BATCH_PROMPT
        item = session["exercises"]["exercises"][0]
        assert item["kind"] == "fill_blank"
        assert item["translation"] == "Sentence 0 has a word."

    async def test_error_correction_uses_its_own_prompt_and_kind(self, db, llm):
        from app.prompts import ERROR_CORRECTION_BATCH_PROMPT

        uid = await _user(db)
        llm["responses"] = [{"exercises": [_broken(i) for i in range(10)]}]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "error_correction",
        })
        assert llm["systems"][0] is ERROR_CORRECTION_BATCH_PROMPT
        assert session["exercises"]["exercises"][0]["kind"] == "error_correction"

    async def test_recent_sentences_are_listed_and_filtered(self, db, llm):
        uid = await _user(db)
        await _stored(db, uid, [_translate(1, "sk-en")])
        llm["responses"] = [
            {"exercises": [_translate(1, "sk-en")] + [_translate(i) for i in range(10, 19)]},
            {"exercises": [_translate(50)]},
        ]
        session = await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        sources = [i["source"] for i in session["exercises"]["exercises"]]
        assert "Slovenská veta 1." in llm["prompts"][0]
        assert "Slovenská veta 1." not in sources
        assert len(sources) == 10

    async def test_review_words_only_on_request(self, db, llm):
        uid = await _user(db)
        await upsert_vocab_progress(db, uid, [
            {"slovak": "hrad", "english": "castle", "correct": False, "source_mode": "vocabulary"},
        ])
        llm["responses"] = [
            {"exercises": [_translate(i) for i in range(10)]},
            {"exercises": [_translate(i) for i in range(20, 30)]},
        ]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        assert "hrad" not in llm["prompts"][0]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general", "include_review": True,
        })
        assert "Weave these review words" in llm["prompts"][1]
        assert "hrad" in llm["prompts"][1]

    async def test_focus_leads_and_word_lists_are_left_out(self, db, llm):
        uid = await _user(db)
        await upsert_vocab_progress(db, uid, [
            {"slovak": "kniha", "english": "book", "correct": True, "source_mode": "vocabulary"},
        ])
        llm["responses"] = [{"exercises": [_translate(i) for i in range(10)]}]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "english_to_slovak",
            "instructions": "sentences about food",
        })
        prompt = llm["prompts"][0]
        assert prompt.index("sentences about food") < prompt.index("Generate 10")
        assert "[Student's vocabulary progress]" not in prompt
        assert "Topic:" not in prompt  # the chip chooses the exercise kind, not a theme

    async def test_schema_and_effort(self, db, llm):
        uid = await _user(db)
        llm["responses"] = [{"exercises": [_translate(i) for i in range(10)]}]
        await _create_translation_session(db, {
            "user_id": uid, "mode": "translation", "topic": "general",
        })
        assert llm["kwargs"][0]["schema"] is TRANSLATION_BATCH_SCHEMA
        assert llm["kwargs"][0]["effort"] == "medium"
        assert llm["kwargs"][0]["max_tokens"] == 16000

    async def test_too_few_items_after_retry_raises(self, db, llm):
        uid = await _user(db)
        llm["responses"] = [
            {"exercises": [_translate(i) for i in range(3)]},
            {"exercises": []},
        ]
        with pytest.raises(LLMError):
            await _create_translation_session(db, {
                "user_id": uid, "mode": "translation", "topic": "general",
            })
        assert len(llm["prompts"]) == 2


class TestGrading:
    async def test_accent_free_match_scores_10_without_the_model(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Yes, I have water.", "direction": "en-sk", "translation": None,
             "modelAnswer": "Áno, mám vodu.", "keyPoints": []},
        ])
        result = await submit_translation(db, sid, "Ano, mam  vodu")
        answer = result["exercises"]["answers"][0]
        assert answer["score"] == 10
        assert answer["tier"] == "accent"
        assert "Áno, mám vodu." in answer["feedback"]
        assert llm["prompts"] == []

    async def test_exact_match_has_no_accent_note(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Mám psa.", "direction": "sk-en", "translation": None,
             "modelAnswer": "I have a dog.", "keyPoints": []},
        ])
        result = await submit_translation(db, sid, "i have a dog")
        answer = result["exercises"]["answers"][0]
        assert answer["score"] == 10
        assert answer["tier"] == "exact"
        assert "accents" not in answer["feedback"]

    async def test_other_answers_go_to_the_grader(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Thank you for the bread.", "direction": "en-sk", "translation": None,
             "modelAnswer": "Ďakujem za chlieb.", "keyPoints": []},
        ])
        llm["responses"] = [{"score": 6, "feedback": "Close."}]
        result = await submit_translation(db, sid, "Dakujem pre chlieb")
        answer = result["exercises"]["answers"][0]
        assert answer == {"userAnswer": "Dakujem pre chlieb", "score": 6,
                          "feedback": "Close.", "tier": None}
        assert llm["kwargs"][0]["schema"] is TRANSLATION_GRADE_SCHEMA
        assert llm["kwargs"][0]["effort"] == "low"
        assert llm["kwargs"][0]["max_tokens"] == 4000

    async def test_grader_score_is_clamped_to_1_through_10(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [_translate(1), _translate(2)])
        llm["responses"] = [{"score": 14, "feedback": "x"}, {"score": 0, "feedback": "y"}]
        first = await submit_translation(db, sid, "something else")
        second = await submit_translation(db, sid, "something else again")
        assert first["exercises"]["answers"][0]["score"] == 10
        assert second["exercises"]["answers"][1]["score"] == 1

    async def test_unchanged_error_sentence_scores_1_without_the_model(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Mám voda.", "direction": "en-sk", "translation": "I have water.",
             "modelAnswer": "Mám vodu.", "keyPoints": ["accusative"]},
        ], kind="error_correction")
        result = await submit_translation(db, sid, "mam voda")
        answer = result["exercises"]["answers"][0]
        assert answer["score"] == 1
        assert "unchanged" in answer["feedback"]
        assert llm["prompts"] == []

    async def test_fill_blank_other_word_is_judged_in_context(self, db, llm):
        uid = await _user(db)
        sid = await _stored(db, uid, [
            {"source": "Mám ____.", "direction": "en-sk", "translation": "I have water.",
             "modelAnswer": "vodu", "keyPoints": []},
        ], kind="fill_blank")
        llm["responses"] = [{"score": 3, "feedback": "That means milk."}]
        await submit_translation(db, sid, "mlieko")
        assert "filled the blank" in llm["prompts"][0]
        assert "Mám ____." in llm["prompts"][0]

    async def test_items_stored_without_a_kind_still_grade(self, db, llm):
        uid = await _user(db)
        sid = f"tr-{uuid.uuid4().hex[:8]}"
        await db_create_session(db, {
            "id": sid, "user_id": uid, "mode": "translation", "topic": "general",
            "difficulty": "beginner", "completed": False,
            "created_at": "2026-08-01T10:00:00+00:00",
            "exercises": {
                "type": "translation",
                "exercises": [{"source": "I have water.", "direction": "en-sk",
                               "modelAnswer": "Mám vodu.", "keyPoints": []}],
                "currentIndex": 0, "answers": [None], "phase": "exercises",
            },
            "feedback": None, "messages": [],
        })
        result = await submit_translation(db, sid, "mam vodu")
        assert result["exercises"]["answers"][0]["score"] == 10
```

In `backend/tests/test_generation_targeting.py` delete `test_translation_instructions_and_review_words`; `test_translation.py` now covers it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_translation.py tests/test_composition.py tests/test_prompts.py -q`
Expected: FAIL with `ImportError: cannot import name 'filter_translation_items'`.

- [ ] **Step 3: Add the two prompts to `backend/app/prompts.py`**

Insert between `TRANSLATION_BATCH_PROMPT` and `TRANSLATION_EVALUATE_PROMPT`:

```python
FILL_BLANK_BATCH_PROMPT = f"""{GENERATION_ACCURACY}

Write fill-in-the-blank exercises for a Slovak learner. Each one shows a Slovak sentence with one missing word and the English meaning of the whole sentence. The user message says how many and what the session focus is.

Return JSON with this shape:
{{
  "exercises": [
    {{
      "source": "<Slovak sentence with ____ in place of the missing word>",
      "direction": "en-sk",
      "translation": "<English meaning of the complete sentence>",
      "modelAnswer": "<the missing Slovak word or short phrase>",
      "keyPoints": ["<why this word, in this form>"]
    }}
  ]
}}

Rules:
- Each source has exactly one blank, written as four underscores.
- modelAnswer is only what goes in the blank, in the form the sentence needs.
- The missing word is a content word the English meaning makes clear, so the learner can work it out.
- direction is always "en-sk".
- The sentence with modelAnswer in the blank is correct, natural Slovak.
- Every sentence is different from the others in the set and from the sentences the user message lists as already used.
- The session focus in the user message decides what the sentences are about.

Level:
- Beginner (A1-A2): short present-tense sentences, 4 to 7 words, with a common noun, verb or adjective missing.
- Intermediate (B1-B2): sentences of 8 to 12 words, with the missing word in an inflected form.
- Advanced (C1-C2): complex sentences where the missing word depends on idiom, aspect or government."""

ERROR_CORRECTION_BATCH_PROMPT = f"""{GENERATION_ACCURACY}

Write error-correction exercises for a Slovak learner. Each one shows a Slovak sentence that contains exactly one deliberate mistake, together with the English meaning the sentence is supposed to have. The learner rewrites the sentence correctly. The user message says how many and what the session focus is.

Return JSON with this shape:
{{
  "exercises": [
    {{
      "source": "<Slovak sentence containing exactly one mistake>",
      "direction": "en-sk",
      "translation": "<English meaning of the intended sentence>",
      "modelAnswer": "<the same sentence, corrected>",
      "keyPoints": ["<what the mistake was and the rule behind the correction>"]
    }}
  ]
}}

Rules:
- The accuracy rules apply to modelAnswer and to every word of source except the one deliberate mistake.
- The mistake is in word choice or grammar: a wrong case ending, wrong verb form, wrong gender agreement, wrong preposition, or a wrong word. It is never a missing or wrong diacritic, capital letter or punctuation mark, because the learners cannot type those.
- source and modelAnswer differ in one word, or in one word and the word that must agree with it.
- The mistake is one that English speakers learning Slovak really make.
- direction is always "en-sk".
- Every sentence is different from the others in the set and from the sentences the user message lists as already used.
- The session focus in the user message decides what the sentences are about.

Level:
- Beginner (A1-A2): short present-tense sentences with a mistake in a basic ending or a common word.
- Intermediate (B1-B2): longer sentences with a mistake in case government, tense or aspect.
- Advanced (C1-C2): complex sentences with a subtle mistake in aspect, word order or idiom."""
```

- [ ] **Step 4: Implement `filter_translation_items` in `backend/app/composition.py`**

Add to the imports:

```python
import re

from .scoring import normalize_answer
```

Add at the end of the file:

```python
_BLANK = re.compile(r"_{3,}")
_DIRECTIONS = ("en-sk", "sk-en")


def filter_translation_items(
    items: list[dict], kind: str, direction: str | None, recent_sources: list[str],
) -> list[dict]:
    """Keep generated translation items that match what the learner chose.

    Drops items in the wrong direction, malformed items for the kind,
    sentences used in recent sessions, and duplicates. The kind is set here
    rather than trusted from the model.
    """
    seen = {normalize_answer(s) for s in recent_sources}
    kept: list[dict] = []
    for raw in items:
        source = _BLANK.sub("____", (raw.get("source") or "").strip())
        answer = (raw.get("modelAnswer") or "").strip()
        item_direction = raw.get("direction")
        if not source or not answer or item_direction not in _DIRECTIONS:
            continue
        if direction and item_direction != direction:
            continue
        blanks = source.count("____")
        if kind == "fill_blank" and blanks != 1:
            continue
        if kind != "fill_blank" and blanks:
            continue
        if kind == "error_correction" and normalize_answer(source) == normalize_answer(answer):
            continue
        key = normalize_answer(source)
        if not key or key in seen:
            continue
        seen.add(key)
        kept.append({
            "kind": kind,
            "source": source,
            "direction": item_direction,
            "translation": (raw.get("translation") or "").strip() or None,
            "modelAnswer": answer,
            "keyPoints": [str(k) for k in (raw.get("keyPoints") or [])],
        })
    return kept
```

- [ ] **Step 5: Implement in `backend/app/models.py`**

Replace `TranslationExerciseItem` and `TranslationAnswer` with:

```python
class TranslationExerciseItem(BaseModel):
    kind: str = "translate"  # "translate" | "fill_blank" | "error_correction"
    source: str
    direction: str  # "sk-en" | "en-sk"
    translation: str | None = None  # English meaning, shown as context
    modelAnswer: str
    keyPoints: list[str]


class TranslationAnswer(BaseModel):
    userAnswer: str
    score: float
    feedback: str
    tier: str | None = None  # "exact" | "accent" when graded without the model
```

- [ ] **Step 6: Implement in `backend/app/sessions.py`**

Add `filter_translation_items,` to the composition import. Change the prompts import to include `ERROR_CORRECTION_BATCH_PROMPT,` and `FILL_BLANK_BATCH_PROMPT,`. Change the scoring import to:

```python
from .scoring import compute_category_scores, compute_session_score, grade_answer, normalize_answer
```

Change the schemas import to:

```python
from .schemas import (
    FEEDBACK_SCHEMA,
    GRAMMAR_LESSON_SCHEMA,
    TRANSLATION_BATCH_SCHEMA,
    TRANSLATION_GRADE_SCHEMA,
    VOCAB_BATCH_SCHEMA,
)
```

Add below `DIFFICULTY_LABELS`:

```python
# Translation topic -> (exercise kind, fixed direction or None for both)
TRANSLATION_KINDS: dict[str, tuple[str, str | None]] = {
    "english_to_slovak": ("translate", "en-sk"),
    "slovak_to_english": ("translate", "sk-en"),
    "fill_in_blanks": ("fill_blank", "en-sk"),
    "error_correction": ("error_correction", "en-sk"),
}

_TRANSLATION_PROMPTS: dict[str, str] = {
    "translate": TRANSLATION_BATCH_PROMPT,
    "fill_blank": FILL_BLANK_BATCH_PROMPT,
    "error_correction": ERROR_CORRECTION_BATCH_PROMPT,
}

_TRANSLATION_NOUNS: dict[str, str] = {
    "translate": "translation exercises",
    "fill_blank": "fill-in-the-blank exercises",
    "error_correction": "error-correction exercises",
}

_GRADER_TASKS: dict[str, str] = {
    "translate": "Evaluate the student's translation.",
    "fill_blank": (
        "The student filled the blank in the Slovak sentence. Decide whether their "
        "word is correct in this sentence. A different word that is also correct "
        "and natural here earns full marks."
    ),
    "error_correction": (
        "The source sentence contains one deliberate mistake. The student rewrote "
        "it. Decide whether their sentence fixes the mistake and is correct Slovak."
    ),
}
```

Replace the whole of `_create_translation_session` with:

```python
async def _recent_translation_sources(
    db: aiosqlite.Connection, user_id: str, sessions_back: int = 10, cap: int = 60,
) -> list[str]:
    """Source sentences from the learner's latest translation sessions."""
    sources: list[str] = []
    counted = 0
    for s in await list_sessions(db, user_id):
        if s["mode"] != "translation":
            continue
        counted += 1
        for item in (s.get("exercises") or {}).get("exercises", []):
            if item.get("source"):
                sources.append(item["source"])
        if counted >= sessions_back:
            break
    return sources[:cap]


async def _create_translation_session(db: aiosqlite.Connection, req: dict) -> dict:
    kind, direction = TRANSLATION_KINDS.get(req.get("topic") or "", ("translate", None))
    difficulty = req.get("difficulty", "beginner")
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, difficulty)
    instructions = (req.get("instructions") or "").strip()
    include_review = bool(req.get("include_review"))
    system_prompt = _TRANSLATION_PROMPTS[kind]
    noun = _TRANSLATION_NOUNS[kind]

    # The topic chip chooses the exercise kind, so the theme comes from the
    # learner's instructions alone.
    focus = build_focus_block(None, instructions)
    learning_context = await _get_learning_context(
        db, req["user_id"], "translation", include_vocab=False,
    )
    review_words = await get_due_words(db, req["user_id"], limit=6) if include_review else []
    recent_sources = await _recent_translation_sources(db, req["user_id"])

    def build_prompt(count: int, avoid: list[str]) -> str:
        prompt = f"Student level: {difficulty_label}\n\n{focus}\n"
        if learning_context:
            prompt += f"\n{learning_context}\n"
        prompt += f"\nGenerate {count} {noun} that fit the session focus."
        if kind == "translate" and direction:
            prompt += f' Every exercise uses direction "{direction}".'
        if review_words:
            listed = ", ".join(
                f"{w['slovak']} ({w['english']})" if w.get("english") else w["slovak"]
                for w in review_words
            )
            prompt += (
                "\n\nWeave these review words into the sentences where natural "
                f"(the student asked to review them): {listed}"
            )
        if avoid:
            prompt += (
                "\n\nThese sentences were used recently. Do not reuse them or "
                "lightly reworded versions of them:\n- " + "\n- ".join(avoid)
            )
        return prompt

    data = await ask_json(
        build_prompt(10, recent_sources), system_prompt,
        schema=TRANSLATION_BATCH_SCHEMA, schema_name="translation_batch",
        effort="medium", max_tokens=16000,
    )
    items = filter_translation_items(
        data.get("exercises", []), kind, direction, recent_sources,
    )

    if len(items) < 10:
        used = recent_sources + [i["source"] for i in items]
        more = await ask_json(
            build_prompt(10 - len(items), used), system_prompt,
            schema=TRANSLATION_BATCH_SCHEMA, schema_name="translation_batch",
            effort="medium", max_tokens=16000,
        )
        items += filter_translation_items(more.get("exercises", []), kind, direction, used)

    if len(items) < 6:
        raise LLMError("Translation generation produced too few valid exercises")
    if len(items) < 10:
        log.warning(
            "Translation session generated %d/10 exercises for user %s",
            len(items), req["user_id"],
        )
    items = items[:10]

    exercises = {
        "type": "translation",
        "exercises": items,
        "currentIndex": 0,
        "answers": [None] * len(items),
        "phase": "exercises",
    }

    session = _build_session(req, exercises=exercises)
    await db_create_session(db, session)
    return session
```

In `submit_translation` replace everything from the comment `# LLM evaluation` through the assignment to `ex["answers"][idx]` with:

```python
    kind = exercise.get("kind", "translate")
    model_answer = exercise["modelAnswer"]
    grade = grade_answer(model_answer, answer)
    tier: str | None = None

    if grade.tier != "wrong":
        # Same answer once accents, case and punctuation are set aside.
        tier = grade.tier
        score = 10
        feedback = "Correct."
        if tier == "accent":
            feedback += f" With accents: {model_answer}"
    elif kind == "error_correction" and normalize_answer(answer) == normalize_answer(
        exercise["source"]
    ):
        score = 1
        feedback = (
            "The sentence is unchanged, so the mistake is still there. "
            f"Corrected: {model_answer}"
        )
    else:
        eval_prompt = (
            f"Exercise type: {kind}\n"
            f"Source ({exercise['direction']}): {exercise['source']}\n"
        )
        if exercise.get("translation"):
            eval_prompt += f"Intended meaning: {exercise['translation']}\n"
        eval_prompt += (
            f"Model answer: {model_answer}\n"
            f"Student's answer: {answer}\n\n"
            f"{_GRADER_TASKS.get(kind, _GRADER_TASKS['translate'])}"
        )
        eval_data = await ask_json(
            eval_prompt, TRANSLATION_EVALUATE_PROMPT,
            schema=TRANSLATION_GRADE_SCHEMA, schema_name="translation_grade",
            effort="low", max_tokens=4000,
        )
        try:
            score = int(round(float(eval_data.get("score", 5))))
        except (TypeError, ValueError):
            score = 5
        score = max(1, min(10, score))
        feedback = eval_data.get("feedback", "")

    ex["answers"][idx] = {
        "userAnswer": answer,
        "score": score,
        "feedback": feedback,
        "tier": tier,
    }
```

Leave the rest of `submit_translation` as it is.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend/app/prompts.py backend/app/composition.py backend/app/models.py backend/app/sessions.py backend/tests
git commit -m "feat: translation kinds, enforced direction and repeat protection"
```

---

### Task 9: Slovak answer boxes without autocorrect; accent note in grammar

**Files:**
- Create: `frontend/src/lib/slovakInput.ts`
- Create: `frontend/src/lib/translationKinds.ts`
- Create: `frontend/src/lib/__tests__/translationKinds.test.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/components/GrammarMode.tsx`
- Modify: `frontend/src/components/ConversationMode.tsx`
- Modify: `frontend/src/pages/Session.tsx`
- Test: `frontend/src/components/__tests__/GrammarMode.test.tsx`

**Interfaces:**
- Consumes: backend fields `kind`, `translation`, `tier`, `review` (Tasks 6 and 8).
- Produces:
  - `SLOVAK_INPUT_PROPS` — `{ autoCorrect: 'off', autoCapitalize: 'none', autoComplete: 'off', spellCheck: false }`
  - `translationHeading(exercise: TranslationExercise): string`
  - `translationBadge(exercise: TranslationExercise): string`
  - `translationPlaceholder(exercise: TranslationExercise): string`
  - `answersInSlovak(exercise: TranslationExercise): boolean`
  - Types: `TranslationKind`, `TranslationExercise.kind?`, `TranslationExercise.translation?`, `TranslationAnswer.tier?`, `VocabQuestion.review?`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/__tests__/translationKinds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  answersInSlovak,
  translationBadge,
  translationHeading,
  translationPlaceholder,
} from '../translationKinds';
import type { TranslationExercise } from '../types';

function ex(over: Partial<TranslationExercise>): TranslationExercise {
  return { source: 's', direction: 'en-sk', modelAnswer: 'm', keyPoints: [], ...over };
}

describe('translationKinds', () => {
  it('treats an exercise without a kind as a translation', () => {
    expect(translationHeading(ex({ direction: 'en-sk' }))).toBe('Translate to Slovak');
    expect(translationHeading(ex({ direction: 'sk-en' }))).toBe('Translate to English');
  });

  it('names the two new kinds', () => {
    expect(translationHeading(ex({ kind: 'fill_blank' }))).toBe('Fill in the missing word');
    expect(translationHeading(ex({ kind: 'error_correction' }))).toBe('Fix the mistake');
  });

  it('gives a short badge per kind', () => {
    expect(translationBadge(ex({ direction: 'en-sk' }))).toBe('EN → SK');
    expect(translationBadge(ex({ direction: 'sk-en' }))).toBe('SK → EN');
    expect(translationBadge(ex({ kind: 'fill_blank' }))).toBe('Blank');
    expect(translationBadge(ex({ kind: 'error_correction' }))).toBe('Fix');
  });

  it('gives a placeholder per kind', () => {
    expect(translationPlaceholder(ex({}))).toBe('Type your translation...');
    expect(translationPlaceholder(ex({ kind: 'fill_blank' }))).toBe('Type the missing word...');
    expect(translationPlaceholder(ex({ kind: 'error_correction' }))).toBe(
      'Type the corrected sentence...',
    );
  });

  it('knows which answers are typed in Slovak', () => {
    expect(answersInSlovak(ex({ direction: 'en-sk' }))).toBe(true);
    expect(answersInSlovak(ex({ direction: 'sk-en' }))).toBe(false);
    expect(answersInSlovak(ex({ kind: 'fill_blank', direction: 'en-sk' }))).toBe(true);
  });
});
```

In `frontend/src/components/__tests__/GrammarMode.test.tsx`:

Replace the test titled `accent tier shows "Takmer!" label and diacritics note` with:

```tsx
  it('accent tier shows as correct with the accented spelling', async () => {
    const { submitGrammarAnswer } = await import('../../lib/api');
    const mockSubmit = vi.mocked(submitGrammarAnswer);
    mockSubmit.mockResolvedValueOnce(
      makeResponseSession({ wasCorrect: true, tier: 'accent', userAnswer: 'hovorim' })
    );

    const user = userEvent.setup();
    const session = makeFirstExerciseSession();
    render(<MemoryRouter><GrammarWrapper initialSession={session} /></MemoryRouter>);

    const input = screen.getByPlaceholderText('Type the missing word...');
    await user.type(input, 'hovorim');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/With accents/)).toBeTruthy();
    });
    expect(screen.getByText('Correct!')).toBeTruthy();
    expect(screen.queryByText('Takmer!')).toBeNull();
    expect(screen.queryByText(/Watch the diacritics/)).toBeNull();
  });

  it('turns off autocorrect on the Slovak answer box', () => {
    const session = makeFirstExerciseSession();
    render(<MemoryRouter><GrammarWrapper initialSession={session} /></MemoryRouter>);
    const input = screen.getByPlaceholderText('Type the missing word...');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });
```

In the test titled `shows final answer tier feedback before ending session when last exercise is answered`, replace

```tsx
    // After submitting the last exercise, the tier feedback ("Takmer!") MUST be
    // visible — the session should NOT have auto-ended yet.
    await waitFor(() => {
      expect(screen.getByText('Takmer!')).toBeTruthy();
    });
```

with

```tsx
    // After submitting the last exercise, the result panel MUST be visible —
    // the session should NOT have auto-ended yet.
    await waitFor(() => {
      expect(screen.getByText(/With accents/)).toBeTruthy();
    });
```

and in the comment a few lines above it replace `(the amber "Takmer!" case — a wrong-diacritics but correct answer)` with `(a correct answer typed without its accents)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/translationKinds.test.ts src/components/__tests__/GrammarMode.test.tsx`
Expected: FAIL. The first file cannot resolve `../translationKinds`; the grammar tests fail on `With accents`.

- [ ] **Step 3: Extend the types in `frontend/src/lib/types.ts`**

Add `review?: boolean;` to `VocabQuestion`. Replace the `TranslationExercise` and `TranslationAnswer` interfaces with:

```ts
export type TranslationKind = 'translate' | 'fill_blank' | 'error_correction';

export interface TranslationExercise {
  /** Absent on sessions created before kinds existed; treat as 'translate'. */
  kind?: TranslationKind;
  source: string;
  direction: 'sk-en' | 'en-sk';
  /** English meaning, shown as context for fill_blank and error_correction. */
  translation?: string | null;
  modelAnswer: string;
  keyPoints: string[];
}

export interface TranslationAnswer {
  userAnswer: string;
  score: number;
  feedback: string;
  /** Set when the answer was graded without the model. */
  tier?: 'exact' | 'accent' | null;
}
```

- [ ] **Step 4: Create the two helpers**

Create `frontend/src/lib/slovakInput.ts`:

```ts
/**
 * Attributes for boxes where the learner types Slovak. iOS autocorrect rewrites
 * Slovak words into English ones ("vodu" becomes "volunteer"), and
 * auto-capitalisation changes the first letter of every answer.
 */
export const SLOVAK_INPUT_PROPS = {
  autoCorrect: 'off',
  autoCapitalize: 'none',
  autoComplete: 'off',
  spellCheck: false,
} as const;
```

Create `frontend/src/lib/translationKinds.ts`:

```ts
import type { TranslationExercise, TranslationKind } from './types';

function kindOf(exercise: TranslationExercise): TranslationKind {
  return exercise.kind ?? 'translate';
}

export function translationHeading(exercise: TranslationExercise): string {
  const kind = kindOf(exercise);
  if (kind === 'fill_blank') return 'Fill in the missing word';
  if (kind === 'error_correction') return 'Fix the mistake';
  return exercise.direction === 'en-sk' ? 'Translate to Slovak' : 'Translate to English';
}

export function translationBadge(exercise: TranslationExercise): string {
  const kind = kindOf(exercise);
  if (kind === 'fill_blank') return 'Blank';
  if (kind === 'error_correction') return 'Fix';
  return exercise.direction === 'en-sk' ? 'EN → SK' : 'SK → EN';
}

export function translationPlaceholder(exercise: TranslationExercise): string {
  const kind = kindOf(exercise);
  if (kind === 'fill_blank') return 'Type the missing word...';
  if (kind === 'error_correction') return 'Type the corrected sentence...';
  return 'Type your translation...';
}

/** True when the learner's answer is written in Slovak. */
export function answersInSlovak(exercise: TranslationExercise): boolean {
  return exercise.direction === 'en-sk';
}
```

- [ ] **Step 5: Apply the input attributes**

In `GrammarMode.tsx` add `import { SLOVAK_INPUT_PROPS } from '../lib/slovakInput';` below the `renderInlineMd` import, and in the text `<input` (the one with `placeholder="Type the missing word..."`) add the line `{...SLOVAK_INPUT_PROPS}` directly after `autoFocus`.

In `ConversationMode.tsx` add the same import below the `DiacriticsKeyboard` import, and in the `<textarea` with `placeholder="Type your response in Slovak... (Enter to send)"` add `{...SLOVAK_INPUT_PROPS}` directly after `rows={1}`.

In `pages/Session.tsx` add `import { SLOVAK_INPUT_PROPS } from '../lib/slovakInput';` with the other imports, and in the `<textarea` with `placeholder="Type your response... (Enter to send, Shift+Enter for new line)"` add `{...SLOVAK_INPUT_PROPS}` directly after `rows={1}`.

- [ ] **Step 6: Render the accent tier as correct in `GrammarMode.tsx`**

Replace the auto-advance effect

```tsx
  useEffect(() => {
    if (showResult && lastCorrect) {
      const timer = setTimeout(handleNext, 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, lastCorrect, handleNext]);
```

with

```tsx
  // An accent-free answer is correct; it stays a little longer so the learner
  // can read the accented spelling.
  useEffect(() => {
    if (showResult && lastCorrect) {
      const timer = setTimeout(handleNext, lastTier === 'accent' ? 2600 : 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, lastCorrect, lastTier, handleNext]);
```

Replace

```tsx
  const blankDisplayClass = showResult
    ? lastTier === 'accent'
      ? 'border-warning/40 bg-warning/5 text-warning'
      : lastCorrect
      ? 'border-success/40 bg-success/5 text-success'
      : 'border-danger/40 bg-danger/5 text-danger'
    : 'border-mode-grammar/40 bg-mode-grammar/5 text-mode-grammar';
```

with

```tsx
  const blankDisplayClass = showResult
    ? lastCorrect
      ? 'border-success/40 bg-success/5 text-success'
      : 'border-danger/40 bg-danger/5 text-danger'
    : 'border-mode-grammar/40 bg-mode-grammar/5 text-mode-grammar';
```

Replace

```tsx
                      if (isRight) {
                        cardClass = lastTier === 'accent'
                          ? 'bg-warning/10 border-warning/50 ring-2 ring-warning/30'
                          : 'bg-success/10 border-success/50 ring-2 ring-success/30';
                      } else if
```

with

```tsx
                      if (isRight) {
                        cardClass = 'bg-success/10 border-success/50 ring-2 ring-success/30';
                      } else if
```

Replace

```tsx
                              className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-md ${lastTier === 'accent' ? 'bg-warning' : 'bg-success'}`}
```

with

```tsx
                              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-success flex items-center justify-center shadow-md"
```

In `TierFeedback`, replace everything from `const isAccent = tier === 'accent';` down to the line `: 'Correct!';` with:

```tsx
  const isAccent = tier === 'accent';
  const isWrong = !wasCorrect;

  const panelClass = isWrong ? 'bg-danger/5 border-danger/20' : 'bg-success/5 border-success/20';
  const iconClass = isWrong ? 'text-danger' : 'text-success';
  const labelClass = iconClass;

  const label = isWrong ? 'Not quite' : streak >= 3 ? `${streak} in a row!` : 'Correct!';
```

Replace

```tsx
      {isAccent && (
        <p className="text-[12px] text-text-secondary ml-[23px]">
          Watch the diacritics: <strong className="text-warning">{correctAnswer}</strong>
        </p>
      )}

      {isExact && !isAccent && explanation && (
        <p className="text-[12px] text-text-muted ml-[23px] mt-1">{renderInlineMd(explanation)}</p>
      )}
```

with

```tsx
      {isAccent && (
        <p className="text-[12px] text-text-secondary ml-[23px]">
          With accents: <strong className="text-success">{correctAnswer}</strong>
        </p>
      )}

      {!isWrong && explanation && (
        <p className="text-[12px] text-text-muted ml-[23px] mt-1">{renderInlineMd(explanation)}</p>
      )}
```

Leave the two `Next` buttons in `TierFeedback` as they are.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all pass, `tsc` exits 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/slovakInput.ts frontend/src/lib/translationKinds.ts frontend/src/lib/__tests__/translationKinds.test.ts frontend/src/lib/types.ts frontend/src/components/GrammarMode.tsx frontend/src/components/ConversationMode.tsx frontend/src/pages/Session.tsx frontend/src/components/__tests__/GrammarMode.test.tsx
git commit -m "feat: no autocorrect on slovak answers; accent-free answers show as correct"
```

---

### Task 10: Start sheet — review toggle, credits message, tighter session recovery

**Files:**
- Modify: `frontend/src/lib/api.ts:48-54`
- Modify: `frontend/src/components/ConfigSheet.tsx`
- Modify: `frontend/src/pages/Home.tsx`
- Test: `frontend/src/components/__tests__/ConfigSheet.test.tsx`, `frontend/src/pages/__tests__/Home.test.tsx`

**Interfaces:**
- Consumes: request field `include_review` (Task 6); 503 body with `"code": "tutor_out_of_credits"` (Task 4).
- Produces: `ConfigSheet` prop `recommendedReview?: boolean`. The toggle is a `button` with `role="switch"` and accessible name `Include review words`.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/__tests__/ConfigSheet.test.tsx` replace the API mock with:

```tsx
vi.mock('../../lib/api', () => ({
  getTopics: vi.fn(),
  createSession: vi.fn(),
  listSessions: vi.fn(),
}));
```

Add `vi.mocked(api.listSessions).mockResolvedValue([]);` to `beforeEach`, and add these tests inside the `describe`:

```tsx
  it('offers a review toggle on vocabulary, off by default', async () => {
    renderSheet({ mode: 'vocabulary' });
    const toggle = screen.getByRole('switch', { name: /include review words/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ include_review: false })
      );
    });
  });

  it('sends include_review when the toggle is switched on', async () => {
    renderSheet({ mode: 'translation' });
    fireEvent.click(screen.getByRole('switch', { name: /include review words/i }));
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    await waitFor(() => {
      expect(api.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ include_review: true })
      );
    });
  });

  it('has no review toggle on grammar or conversation', () => {
    const { unmount } = renderSheet({ mode: 'grammar' });
    expect(screen.queryByRole('switch', { name: /include review words/i })).toBeNull();
    unmount();
    renderSheet({ mode: 'conversation' });
    expect(screen.queryByRole('switch', { name: /include review words/i })).toBeNull();
  });

  it('starts with the toggle on when opened from the review chip', () => {
    renderSheet({ mode: 'vocabulary', recommendedReview: true });
    const toggle = screen.getByRole('switch', { name: /include review words/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('says so at once when the tutor is out of credits', async () => {
    vi.mocked(api.createSession).mockRejectedValue(
      new Error('{"detail":"The tutor is out of AI credits.","code":"tutor_out_of_credits"}')
    );
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(screen.queryByText('The tutor is out of AI credits.')).not.toBeNull();
    });
    expect(api.listSessions).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('recovers only a session with the same topic and difficulty', async () => {
    vi.mocked(api.createSession).mockRejectedValue(new Error('network'));
    const now = new Date().toISOString();
    vi.mocked(api.listSessions).mockResolvedValue([
      { id: 'other-topic', user_id: 'user-1', mode: 'vocabulary', topic: 'numbers',
        difficulty: 'beginner', completed: false, overall_score: null,
        question_preview: '', created_at: now },
      { id: 'other-level', user_id: 'user-1', mode: 'vocabulary', topic: 'food',
        difficulty: 'advanced', completed: false, overall_score: null,
        question_preview: '', created_at: now },
      { id: 'the-one', user_id: 'user-1', mode: 'vocabulary', topic: 'food',
        difficulty: 'beginner', completed: false, overall_score: null,
        question_preview: '', created_at: now },
    ]);
    renderSheet();
    await waitFor(() => {
      expect(screen.queryByText('Food & Drink')).not.toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: /food & drink/i }));
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/session/the-one');
    });
  });
```

In `frontend/src/pages/__tests__/Home.test.tsx` replace the API mock with:

```tsx
vi.mock('../../lib/api', () => ({
  getRecommendations: vi.fn(),
  getDashboard: vi.fn(),
  getLeaderboard: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  getTopics: vi.fn(() => Promise.resolve([])),
  listSessions: vi.fn(() => Promise.resolve([])),
}));
```

and add this test directly after the one titled `renders recommended chips when recommendations include review_vocab`:

```tsx
  it('opens the start sheet with review on when the review chip is tapped', async () => {
    vi.mocked(api.getRecommendations).mockResolvedValue(
      baseRecs({
        recommended: [
          { kind: 'review_vocab', label: 'Review 5 due words', mode: 'vocabulary' },
        ],
      })
    );

    renderHome();

    await waitFor(() => {
      expect(screen.queryByText('Review 5 due words')).not.toBeNull();
    });
    fireEvent.click(screen.getByText('Review 5 due words'));

    const toggle = await screen.findByRole('switch', { name: /include review words/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/ConfigSheet.test.tsx src/pages/__tests__/Home.test.tsx`
Expected: FAIL with `Unable to find an accessible element with the role "switch"`.

- [ ] **Step 3: Implement in `frontend/src/lib/api.ts`**

Add to the `createSession` parameter type, below `instructions?: string;`:

```ts
  include_review?: boolean;
```

- [ ] **Step 4: Implement in `frontend/src/components/ConfigSheet.tsx`**

Add below `const MAX_INSTRUCTIONS_CHARS = 300;`:

```tsx
/** Modes where due words can be mixed into the session. */
const REVIEW_MODES: LearningMode[] = ['vocabulary', 'translation'];
```

Add to `ConfigSheetProps`, below `recommendedTopic`:

```tsx
  /** Open with the review toggle already on (from the "Review due words" chip) */
  recommendedReview?: boolean;
```

Add `recommendedReview,` to the destructured props. Add below the `focusError` state:

```tsx
  const [includeReview, setIncludeReview] = useState(false);
  const offersReview = REVIEW_MODES.includes(mode);
```

In the reset effect add `setIncludeReview(recommendedReview ?? false);` below `setSelectedTopic(recommendedTopic ?? null);` and change its dependency array to `[open, mode, recommendedTopic, recommendedReview]`.

Replace `findOrphanedSession` with:

```tsx
  const findOrphanedSession = useCallback(async (): Promise<string | null> => {
    try {
      const sessions = await listSessions(userId);
      const fresh = sessions.find(
        (s) =>
          !s.completed &&
          s.mode === mode &&
          s.topic === (selectedTopic ?? 'general') &&
          s.difficulty === difficulty &&
          Date.now() - new Date(s.created_at).getTime() < 3 * 60_000,
      );
      return fresh?.id ?? null;
    } catch {
      return null;
    }
  }, [userId, mode, selectedTopic, difficulty]);
```

In `handleStart` add to the `createSession` argument, below `instructions`:

```tsx
        include_review: offersReview ? includeReview : undefined,
```

and replace `} catch {` (the one directly after `navigate(\`/session/${session.id}\`);`) with:

```tsx
    } catch (e) {
      // An empty AI account will not recover in the next minute: say so now.
      if (e instanceof Error && e.message.includes('tutor_out_of_credits')) {
        setStarting(false);
        setStartError('The tutor is out of AI credits.');
        return;
      }
```

Change the `handleStart` dependency array to:

```tsx
  }, [userId, mode, difficulty, selectedTopic, focusText, includeReview, offersReview, navigate, findOrphanedSession]);
```

In the sheet panel's `style`, replace `padding: '12px 20px 32px 20px',` with:

```tsx
              padding: '12px 20px calc(env(safe-area-inset-bottom) + 32px) 20px',
              maxHeight: '92dvh',
              overflowY: 'auto',
```

Directly above the `{/* Start error */}` comment add:

```tsx
            {/* Review toggle */}
            {offersReview && (
              <button
                type="button"
                role="switch"
                aria-checked={includeReview}
                aria-label="Include review words"
                onClick={() => setIncludeReview((v) => !v)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  borderRadius: '14px',
                  background: '#0e1017',
                  border: includeReview
                    ? '1px solid rgba(94,164,247,0.35)'
                    : '1px solid rgba(255,255,255,0.08)',
                  color: '#eef1f8',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>
                  <span style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>
                    Include review words
                  </span>
                  <span style={{ display: 'block', fontSize: '12px', color: '#6b7289', marginTop: '2px' }}>
                    Mix in words you are due to see again
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: '44px',
                    height: '26px',
                    borderRadius: '999px',
                    padding: '3px',
                    background: includeReview ? '#5ea4f7' : 'rgba(255,255,255,0.12)',
                    transition: 'background 0.15s',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '20px',
                      height: '20px',
                      borderRadius: '999px',
                      background: '#ffffff',
                      transform: includeReview ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.15s',
                    }}
                  />
                </span>
              </button>
            )}
```

- [ ] **Step 5: Implement in `frontend/src/pages/Home.tsx`**

Add below the `sheetRecommendedTopic` state:

```tsx
  const [sheetRecommendedReview, setSheetRecommendedReview] = useState(false);
```

Replace `handleModeClick` and `handleRecClick` with:

```tsx
  const handleModeClick = (mode: LearningMode) => {
    if (!user) return;
    setSheetRecommendedTopic(undefined);
    setSheetRecommendedReview(false);
    setSheetMode(mode);
  };

  const handleRecClick = (rec: RecommendedAction) => {
    if (!user) return;
    setSheetRecommendedTopic(undefined);
    setSheetRecommendedReview(rec.kind === 'review_vocab');
    setSheetMode(rec.mode);
  };
```

In the `<ConfigSheet` element add below `recommendedTopic={sheetRecommendedTopic}`:

```tsx
          recommendedReview={sheetRecommendedReview}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all pass, `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/ConfigSheet.tsx frontend/src/pages/Home.tsx frontend/src/components/__tests__/ConfigSheet.test.tsx frontend/src/pages/__tests__/Home.test.tsx
git commit -m "feat: review toggle, out-of-credits message and safer session recovery"
```

---

### Task 11: Translation screen per kind, review label, focus in the header

**Files:**
- Modify: `frontend/src/components/TranslationMode.tsx`
- Modify: `frontend/src/components/VocabMode.tsx`
- Modify: `frontend/src/components/SessionHeader.tsx`
- Create: `frontend/src/components/__tests__/TranslationMode.test.tsx`
- Create: `frontend/src/components/__tests__/SessionHeader.test.tsx`
- Test: `frontend/src/components/__tests__/VocabMode.test.tsx`

**Interfaces:**
- Consumes: `translationHeading`, `translationBadge`, `translationPlaceholder`, `answersInSlovak`, `SLOVAK_INPUT_PROPS` (Task 9).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/TranslationMode.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TranslationMode from '../TranslationMode';
import type { Session, TranslationExercise } from '../../lib/types';

vi.mock('../../lib/api', () => ({
  submitTranslation: vi.fn(),
  endSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../../lib/sounds', () => ({
  playCorrect: vi.fn(),
  playIncorrect: vi.fn(),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const motion = new Proxy({} as any, {
    get: (_target: unknown, tag: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.forwardRef(({ children, ...props }: any, ref: any) => {
        return React.createElement(tag, { ...props, ref }, children);
      });
    },
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

vi.mock('../SessionHeader', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children }: { children: any }) => children ?? null,
}));
vi.mock('../ProgressBar', () => ({ default: () => null }));
vi.mock('../LoadingDots', () => ({ default: () => null }));
vi.mock('../FeedbackView', () => ({ default: () => null }));
vi.mock('../DiacriticsKeyboard', () => ({ default: () => null }));

function makeSession(exercise: TranslationExercise): Session {
  return {
    id: 'tr-1',
    user_id: 'user-1',
    mode: 'translation',
    topic: 'general',
    difficulty: 'beginner',
    messages: [],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises: {
      type: 'translation',
      exercises: [exercise],
      currentIndex: 0,
      answers: [null],
      phase: 'exercises',
    },
  };
}

function renderMode(exercise: TranslationExercise) {
  return render(
    <MemoryRouter>
      <TranslationMode session={makeSession(exercise)} setSession={() => {}} />
    </MemoryRouter>
  );
}

describe('TranslationMode', () => {
  it('shows a translation to Slovak with autocorrect off', () => {
    renderMode({ source: 'I have water.', direction: 'en-sk', modelAnswer: 'Mám vodu.', keyPoints: [] });
    expect(screen.getByText('Translate to Slovak')).toBeTruthy();
    const box = screen.getByPlaceholderText('Type your translation...');
    expect(box.getAttribute('autocorrect')).toBe('off');
    expect(box.getAttribute('autocapitalize')).toBe('none');
    expect(box.getAttribute('spellcheck')).toBe('false');
  });

  it('keeps autocorrect for answers typed in English', () => {
    renderMode({ source: 'Mám vodu.', direction: 'sk-en', modelAnswer: 'I have water.', keyPoints: [] });
    expect(screen.getByText('Translate to English')).toBeTruthy();
    const box = screen.getByPlaceholderText('Type your translation...');
    expect(box.getAttribute('autocorrect')).toBeNull();
    expect(box.getAttribute('spellcheck')).toBeNull();
  });

  it('shows a fill-in-the-blank exercise with its meaning', () => {
    renderMode({
      kind: 'fill_blank', source: 'Mám ____.', direction: 'en-sk',
      translation: 'I have water.', modelAnswer: 'vodu', keyPoints: [],
    });
    expect(screen.getByText('Fill in the missing word')).toBeTruthy();
    expect(screen.getByText('Mám ____.')).toBeTruthy();
    expect(screen.getByText('I have water.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type the missing word...')).toBeTruthy();
  });

  it('shows an error-correction exercise with its meaning', () => {
    renderMode({
      kind: 'error_correction', source: 'Mám voda.', direction: 'en-sk',
      translation: 'I have water.', modelAnswer: 'Mám vodu.', keyPoints: [],
    });
    expect(screen.getByText('Fix the mistake')).toBeTruthy();
    expect(screen.getByText('I have water.')).toBeTruthy();
    expect(screen.getByPlaceholderText('Type the corrected sentence...')).toBeTruthy();
  });

  it('shows no meaning line for a plain translation', () => {
    renderMode({ source: 'I have water.', direction: 'en-sk', modelAnswer: 'Mám vodu.', keyPoints: [] });
    expect(screen.queryByText(/^Meaning/)).toBeNull();
  });
});
```

Create `frontend/src/components/__tests__/SessionHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SessionHeader from '../SessionHeader';
import type { Session } from '../../lib/types';

function makeSession(instructions?: string): Session {
  return {
    id: 's-1',
    user_id: 'user-1',
    mode: 'vocabulary',
    topic: 'food_drink',
    difficulty: 'beginner',
    messages: [],
    completed: false,
    created_at: new Date().toISOString(),
    feedback: null,
    exercises: {
      type: 'vocabulary',
      questions: [],
      currentIndex: 0,
      answers: [],
      retryQueue: [],
      phase: 'questions',
      instructions,
    },
  };
}

function renderHeader(session: Session) {
  return render(
    <MemoryRouter>
      <SessionHeader session={session} onEnd={() => {}} ending={false} />
    </MemoryRouter>
  );
}

describe('SessionHeader', () => {
  it('shows the focus the session was built with', () => {
    renderHeader(makeSession('I want to learn about food'));
    expect(screen.getByText('Focus: I want to learn about food')).toBeTruthy();
  });

  it('shows no focus line when none was given', () => {
    renderHeader(makeSession());
    expect(screen.queryByText(/^Focus:/)).toBeNull();
  });

  it('still shows a session that has no exercises', () => {
    const session = { ...makeSession(), exercises: undefined };
    renderHeader(session);
    expect(screen.getByText('Vocabulary')).toBeTruthy();
    expect(screen.queryByText(/^Focus:/)).toBeNull();
  });
});
```

In `frontend/src/components/__tests__/VocabMode.test.tsx` add inside the top-level `describe`:

```tsx
  it('labels a question that is a review word', () => {
    const session = makeVocabSession({
      questions: [
        { word: 'hrad', direction: 'sk-en', choices: ['castle', 'house', 'shop', 'road'],
          correctIndex: 0, explanation: '', review: true },
      ],
      answers: [null],
      credits: [null],
    });
    render(<VocabMode session={session} setSession={() => {}} />);
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('shows no review label on a new word', () => {
    const session = makeVocabSession();
    render(<VocabMode session={session} setSession={() => {}} />);
    expect(screen.queryByText('Review')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/TranslationMode.test.tsx src/components/__tests__/SessionHeader.test.tsx src/components/__tests__/VocabMode.test.tsx`
Expected: FAIL on `Fill in the missing word`, `Focus: I want to learn about food` and `Review`.

- [ ] **Step 3: Implement in `frontend/src/components/TranslationMode.tsx`**

Add below the `renderInlineMd` import:

```tsx
import { SLOVAK_INPUT_PROPS } from '../lib/slovakInput';
import {
  answersInSlovak,
  translationBadge,
  translationHeading,
  translationPlaceholder,
} from '../lib/translationKinds';
```

Replace the auto-advance effect

```tsx
  useEffect(() => {
    if (showResult && lastAnswer && lastAnswer.score >= 8) {
      const timer = setTimeout(handleNext, 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, lastAnswer, handleNext]);
```

with

```tsx
  // An accent-free answer stays a little longer so the accented spelling can be read.
  useEffect(() => {
    if (showResult && lastAnswer && lastAnswer.score >= 8) {
      const timer = setTimeout(handleNext, lastAnswer.tier === 'accent' ? 2600 : 1400);
      return () => clearTimeout(timer);
    }
  }, [showResult, lastAnswer, handleNext]);
```

In the sentence review list replace

```tsx
                            {exercise.direction === 'en-sk' ? 'EN → SK' : 'SK → EN'}
```

with

```tsx
                            {translationBadge(exercise)}
```

Delete

```tsx
  const directionLabel = currentExercise.direction === 'en-sk'
    ? 'Translate to Slovak'
    : 'Translate to English';
```

and replace `{directionLabel}` with `{translationHeading(currentExercise)}`.

Replace

```tsx
                <p className="text-[18px] font-medium text-text-primary leading-relaxed">
                  {currentExercise.source}
                </p>
              </motion.div>
```

with

```tsx
                <p className="text-[18px] font-medium text-text-primary leading-relaxed">
                  {currentExercise.source}
                </p>
                {currentExercise.translation && (
                  <p className="text-[13px] text-text-muted mt-3">
                    <span className="text-text-faint">Meaning: </span>
                    <span>{currentExercise.translation}</span>
                  </p>
                )}
              </motion.div>
```

In the answer `<textarea` replace

```tsx
                    placeholder="Type your translation..."
                    rows={2}
                    autoFocus
```

with

```tsx
                    placeholder={translationPlaceholder(currentExercise)}
                    rows={2}
                    autoFocus
                    {...(answersInSlovak(currentExercise) ? SLOVAK_INPUT_PROPS : {})}
```

- [ ] **Step 4: Implement in `frontend/src/components/VocabMode.tsx`**

Replace

```tsx
              {directionLabel}
            </p>
```

with

```tsx
              {directionLabel}
              {currentQuestion.review && (
                <span style={{
                  marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                  background: 'rgba(245,196,94,0.12)', color: '#f5c45e',
                  letterSpacing: '0.08em',
                }}>
                  Review
                </span>
              )}
            </p>
```

- [ ] **Step 5: Implement in `frontend/src/components/SessionHeader.tsx`**

Add below `const topicDisplay = session.topic.replace(/_/g, ' ');`:

```tsx
  const focus = session.exercises?.instructions;
```

Replace

```tsx
            <div className="text-[11px] text-text-faint mt-0.5">
              {topicDisplay}
            </div>
```

with

```tsx
            <div className="text-[11px] text-text-faint mt-0.5">
              {topicDisplay}
            </div>
            {focus && (
              <div
                className="text-[11px] text-text-faint mt-0.5 max-w-[11rem] truncate"
                title={focus}
              >
                Focus: {focus}
              </div>
            )}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc -b && npx eslint src/components/TranslationMode.tsx src/components/VocabMode.tsx src/components/SessionHeader.tsx src/components/ConfigSheet.tsx src/lib/translationKinds.ts src/lib/slovakInput.ts`
Expected: all tests pass, `tsc` exits 0, eslint reports no errors for these six files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/TranslationMode.tsx frontend/src/components/VocabMode.tsx frontend/src/components/SessionHeader.tsx frontend/src/components/__tests__
git commit -m "feat: translation screen per exercise kind; review label; focus in header"
```

---

### Task 12: Documentation, live smoke test, rollout

**Files:**
- Create: `backend/scripts/smoke_lessons.py`
- Modify: `CLAUDE.md`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: everything above.
- Produces: a script that exits 0 when the hard checks pass and prints the words and latencies for a person to read.

- [ ] **Step 1: Update the documentation**

In `CLAUDE.md` replace the line

```
- **LLM:** Anthropic Claude Haiku (`claude-haiku-4-20250414`) via Python SDK
```

with

```
- **LLM:** Claude Sonnet 5 through OpenRouter (`anthropic/claude-sonnet-5`); production sets `SLOVAK_LLM_PROVIDER=openrouter`
```

Add these three lines to the "Key Backend Files" list:

```
- `app/composition.py` — Session focus, slot plan, question and exercise validation
- `app/scoring.py` — Answer normalization and grading
- `app/schemas.py` — JSON schemas that constrain model output
```

Replace the last bullet of "Conventions" (the one that begins `Session create takes a free-text 'instructions' field`) with:

```
- Session create takes `instructions` (free text, max 300 chars) and `include_review` (default false). The focus block built from topic + instructions opens every generation prompt.
- Accents, capitalisation and punctuation never cost points. `scoring.normalize_answer` is the single place that decides what counts as the same answer.
- Review words appear only when `include_review` is true, and only words learned in vocabulary mode with an English meaning are eligible.
- Vocabulary progress is saved as each first answer arrives, not at the end of the session.
- Translation topics choose the exercise kind: `translate`, `fill_blank`, `error_correction`.
```

In `backend/.env.example` replace the line `# SLOVAK_OPENROUTER_MODEL=google/gemini-2.5-flash` with `# SLOVAK_OPENROUTER_MODEL=anthropic/claude-sonnet-5`.

- [ ] **Step 2: Create `backend/scripts/smoke_lessons.py`**

```python
"""Live smoke test: build real lessons with the configured model.

Costs a few cents per run. Works on a throwaway database, so no learner data
is touched. Run from backend/:

    .venv/bin/python -m scripts.smoke_lessons
"""

from __future__ import annotations

import asyncio
import os
import statistics
import sys
import tempfile
import time

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["SLOVAK_DB_PATH"] = _tmp.name

from app.config import settings  # noqa: E402
from app.database import get_db, init_db  # noqa: E402
from app.scoring import strip_accents  # noqa: E402
from app.sessions import (  # noqa: E402
    TRANSLATION_KINDS,
    create_session,
    submit_translation,
    submit_vocab_answer,
)
from app.vocab_extraction import question_pair  # noqa: E402

USER = "smoke"
failures: list[str] = []
latencies: list[float] = []


def check(ok: bool, message: str) -> None:
    print(f"  {'ok  ' if ok else 'FAIL'} {message}")
    if not ok:
        failures.append(message)


async def timed_create(db, req: dict) -> dict:
    started = time.monotonic()
    session = await create_session(db, {"user_id": USER, "difficulty": "beginner", **req})
    elapsed = time.monotonic() - started
    latencies.append(elapsed)
    print(f"  created in {elapsed:.1f}s")
    return session


async def vocab_round(db, label: str, req: dict) -> set[str]:
    print(f"\n[vocabulary] {label}")
    session = await timed_create(db, {"mode": "vocabulary", **req})
    questions = session["exercises"]["questions"]
    pairs = [question_pair(q) for q in questions]
    for slovak, english in pairs:
        print(f"    {slovak} = {english}")
    check(len(questions) == 10, f"10 questions (got {len(questions)})")
    check(not any(q["review"] for q in questions), "no review words without asking")
    for q in questions:  # answer everything so the words count as seen
        await submit_vocab_answer(db, session["id"], q["correctIndex"])
    return {slovak.lower() for slovak, _ in pairs}


async def translation_round(db, topic: str) -> dict:
    print(f"\n[translation] topic={topic}")
    session = await timed_create(db, {"mode": "translation", "topic": topic})
    items = session["exercises"]["exercises"]
    for item in items:
        print(f"    [{item['kind']} {item['direction']}] {item['source']}  ->  {item['modelAnswer']}")
    kind, direction = TRANSLATION_KINDS.get(topic, ("translate", None))
    check(len(items) == 10, f"10 exercises (got {len(items)})")
    check(all(i["kind"] == kind for i in items), f"every exercise is {kind}")
    if direction:
        check(all(i["direction"] == direction for i in items), f"every exercise is {direction}")
    return session


async def main() -> int:
    print(f"provider={settings.llm_provider} model={settings.openrouter_model}")
    await init_db()
    async with get_db() as db:
        await db.execute(
            "INSERT OR IGNORE INTO users (id, name, avatar, color) VALUES (?, 'Smoke', 'S', '#000')",
            (USER,),
        )
        await db.commit()

        # Typed request is honored, and words do not repeat across sessions.
        food = {"topic": "general", "instructions": "I want to learn about food"}
        first = await vocab_round(db, "typed request: food (1 of 3)", food)
        second = await vocab_round(db, "typed request: food (2 of 3)", food)
        third = await vocab_round(db, "typed request: food (3 of 3)", food)
        repeats = (first & second) | (first & third) | (second & third)
        check(not repeats, f"no word repeats across three sessions (repeats: {sorted(repeats)})")
        print("  READ: are all thirty words above about food?")

        # Topic chip is honored.
        await vocab_round(db, "topic chip: Numbers & Time", {"topic": "numbers_time"})
        print("  READ: are all ten words above numbers or time words?")

        # Translation kinds and directions.
        sessions = {t: await translation_round(db, t) for t in [*TRANSLATION_KINDS, "general"]}

        # Accent-free answers score 10 without the model; others reach the grader.
        print("\n[grading]")
        en_sk = sessions["english_to_slovak"]
        plain = strip_accents(en_sk["exercises"]["exercises"][0]["modelAnswer"]).lower()
        graded = await submit_translation(db, en_sk["id"], plain)
        answer = graded["exercises"]["answers"][0]
        print(f"    typed {plain!r} -> {answer['score']}/10, {answer['feedback']!r}")
        check(answer["score"] == 10, "accent-free answer scores 10")

        started = time.monotonic()
        graded = await submit_translation(db, en_sk["id"], "toto je zle")
        elapsed = time.monotonic() - started
        answer = graded["exercises"]["answers"][1]
        print(f"    wrong answer -> {answer['score']}/10 in {elapsed:.1f}s, {answer['feedback']!r}")
        check(1 <= answer["score"] <= 10, "grader returns a score from 1 to 10")
        check("diacritic" not in answer["feedback"].lower(), "grader does not mention diacritics")

        # Grammar and conversation start.
        print("\n[grammar] topic=noun_cases")
        grammar = await timed_create(db, {"mode": "grammar", "topic": "noun_cases"})
        lesson = grammar["exercises"]
        print(f"    concept: {lesson['lesson']['concept']}; {len(lesson['exercises'])} exercises")
        check(8 <= len(lesson["exercises"]) <= 10, "8 to 10 grammar exercises")
        check(
            all(e["sentence"].count("____") == 1 for e in lesson["exercises"]),
            "each grammar sentence has one blank",
        )

        print("\n[conversation] topic=shopping")
        chat = await timed_create(db, {"mode": "conversation", "topic": "shopping"})
        print(f"    tutor: {chat['messages'][0]['content']}")

    median = statistics.median(latencies)
    print(f"\nsession start latency: median {median:.1f}s, max {max(latencies):.1f}s")
    check(median < 20, f"median start under 20s (got {median:.1f}s)")

    print(f"\n{len(failures)} failed check(s)")
    for message in failures:
        print(f"  - {message}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

- [ ] **Step 3: Run the whole test suite**

Run: `cd backend && .venv/bin/python -m pytest -q && cd ../frontend && npx vitest run && npx tsc -b`
Expected: every test passes, `tsc` exits 0.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md backend/.env.example backend/scripts/smoke_lessons.py
git commit -m "docs: sonnet 5 on openrouter, lesson rules, live smoke script"
```

- [ ] **Step 5: OWNER — top up OpenRouter**

The account balance is negative and every lesson start fails until it is positive. Add credit at openrouter.ai. Make sure `backend/.env` on this machine has `SLOVAK_LLM_PROVIDER=openrouter` and a working `OPENROUTER_API_KEY`.

- [ ] **Step 6: Run the live smoke test**

Run: `cd backend && .venv/bin/python -m scripts.smoke_lessons`
Expected: exit code 0 and the last lines read `0 failed check(s)`. Read the two lists marked `READ:` and confirm the words match the focus.

If the only failed check is `median start under 20s`, change `effort="medium"` to `effort="low"` in the three creation functions in `backend/app/sessions.py` (`_create_vocab_session` twice, `_create_grammar_session` once, `_create_translation_session` twice), change the matching assertions in `tests/test_vocab_creation.py`, `tests/test_generation_targeting.py` and `tests/test_translation.py` from `"medium"` to `"low"`, run the suite and the smoke test again, and commit with `fix: low reasoning effort for lesson generation to meet start time`.

- [ ] **Step 7: OWNER — deploy the backend**

In the Render dashboard for `slovak-learning`:
1. Confirm the service has a persistent disk mounted where `SLOVAK_DB_PATH` points, or where `backend/data/` lives. Production data has survived earlier deploys, so this should already be so.
2. If `SLOVAK_OPENROUTER_MODEL` is set, change it to `anthropic/claude-sonnet-5`. If it is not set, the new code default applies.
3. Push `main` (this also deploys the frontend to GitHub Pages) and trigger a manual deploy of the backend, backend first.

- [ ] **Step 8: Verify production**

Run: `curl -s https://slovak-learning.onrender.com/openapi.json | jq '.components.schemas.CreateSessionRequest.properties | keys'`
Expected: the list includes `"include_review"`.

Then on a phone: start a vocabulary lesson with "I want to learn about food" typed in the box and no topic chip. Expected: ten food words, the header reads `Focus: I want to learn about food`, and a typed grammar answer without accents is marked correct.
