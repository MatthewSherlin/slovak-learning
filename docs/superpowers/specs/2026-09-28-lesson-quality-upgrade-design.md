# Lesson Quality Upgrade — Design

**Date:** 2026-09-28
**Status:** Draft, awaiting owner review
**Builds on:** `2026-07-27-lesson-revamp-design.md`

## Problem

Production data (152 sessions, 2026-04-03 to 2026-09-22) shows four faults.

1. **Chosen focus is not honored.** Up to 6 of 10 vocabulary slots are forced review
   words picked without regard to topic. The prompt states `about: general` before the
   learner's text and tells the model the text cannot override review words. Translation
   always alternates direction regardless of the chosen topic, and the "Fill in the
   Blanks" and "Error Correction" topics produce ordinary translation exercises.
2. **Words and sentences repeat.** About half of each learner's review pool is not
   vocabulary (grammar blanks, words lifted from translation and conversation feedback;
   many have no English meaning, some are not real words). Review order is lowest
   accuracy first, so the same few words always win. The do-not-repeat list stops at
   150 words while learners have 212 to 302. Progress is saved only at session end,
   after the feedback call succeeds, so the 22 unfinished sessions recorded nothing.
   Translation has no repeat protection.
3. **Accents cost points.** Grammar gives 0.8 credit for accent-only differences.
   The translation grader inherits a rule that a word without diacritics is a wrong
   word ("Ano, mam vodu" scored 7/10).
4. **iPhone autocorrect rewrites Slovak answers.** No answer box disables it
   ("vodu" became "volunteer", "Prepáčte" became "Prepare").

Production also currently fails to start lessons because the OpenRouter balance is
negative, and the app reports this as a generic failure.

## Decisions (owner, 2026-09-28)

- Model: **Claude Sonnet 5**, reached **through OpenRouter** (`anthropic/claude-sonnet-5`,
  $2 / $10 per million tokens). The provider does not change.
- Accent policy: **full credit**, with the accented spelling shown as a small note.
- Review words: **off by default**. A toggle adds review words to whatever else is
  selected.
- "Fill in the Blanks" and "Error Correction": **build them properly**.
- The uncommitted local work is committed first as the baseline.

## Non-goals

- Typo tolerance beyond accents, case, punctuation and spacing.
- Tagging stored words with topics.
- Changes to the Anthropic-direct code path in `llm.py`, which stays as it is and
  unused in production.
- Anthropic SDK upgrade, database hosting changes, cards, stats, guides.

## 1. API contract

`CreateSessionRequest` gains `include_review: bool = False`. It is read by vocabulary
and translation sessions and ignored by grammar and conversation. Older clients that
omit it get the new default.

`POST /api/sessions` passes `include_review` through to `create_session`.

## 2. Session focus (all modes)

One helper builds the focus block placed at the **top** of every generation prompt:

| Topic chip | Instructions | Focus sent to the model |
|---|---|---|
| chosen | empty | the topic label |
| none | given | the learner's text |
| chosen | given | both, with the learner's text taking priority where they conflict |
| none | empty | everyday high-frequency material suited to the level, varied across themes |

The literal word "general" is never sent as a topic. The instructions block no longer
says the text cannot override review words. The line that it cannot override accuracy
rules stays.

The vocabulary prompt no longer includes the learning-context section. Its "recently
learned" and "struggles with" word lists contradict the do-not-repeat list.

## 3. Vocabulary composition

| `include_review` | Review slots | New slots |
|---|---|---|
| false (default) | 0 | 10, all on the session focus |
| true | up to 4 due words | the remainder, on the session focus |

- **Review eligibility:** `source_mode = 'vocabulary'` and a non-empty English meaning.
- **Review order:** most overdue first (`due_at` ascending). The separate "reinforce"
  slots are removed; a missed word is already due immediately.
- **Do-not-repeat list:** every word the learner has on record, up to 1000, most recent
  first. Review words chosen for this session are exempt.
- **Validation** keeps the existing checks and adds three rejections: the correct choice
  is a meta-answer ("all of the above", "none of the above", "both"); the Slovak side
  contains non-Latin letters; the prompt word equals the correct choice.
- **Under-delivery** is unchanged: fewer than 10 valid questions triggers one retry for
  the missing count; fewer than 6 after that raises `LLMError`.
- Each question carries `review: bool` so the interface can label review words.

## 4. Progress tracking

- **Per-answer saving.** `submit_vocab_answer` records the word on its first attempt.
  New sessions carry `srsPerAnswer: true` in the exercises blob; `end_session` skips the
  vocabulary upsert for those and keeps today's behaviour for sessions created earlier.
- **Grammar blanks are no longer written to `vocabulary_progress`.** Words from feedback
  in grammar, translation and conversation sessions are still recorded for the word
  count, and stay ineligible for quiz review through the eligibility rule in section 3.
- **`end_session` is idempotent.** A session that is already completed returns its stored
  feedback with no model call and no writes.
- **Progress before feedback.** Deterministic progress is recorded before the feedback
  call. `progressRecorded: true` in the exercises blob prevents a second recording when
  the feedback call fails and the learner retries.
- **One-time cleanup** in `init_db`, safe to run repeatedly: delete rows whose English
  meaning is a meta-answer or whose Slovak text contains non-Latin letters.

## 5. Scoring tolerance

`normalize_answer` strips diacritics, lowercases, unifies curly quotes and apostrophes,
removes punctuation, and collapses whitespace.

| Tier | Meaning | Credit |
|---|---|---|
| `exact` | matches ignoring case, punctuation, spacing | 1.0 |
| `accent` | matches only after stripping diacritics | 1.0 |
| `wrong` | anything else | 0.0 |

- The grammar "Diacritics" score category is removed.
- **Translation short-circuit:** when the normalized answer equals the normalized model
  answer, the score is 10 with no model call. The stored answer carries the tier so the
  interface can show the accented spelling.
- **Prompts:** the shared accuracy block is split. Generation rules keep the requirement
  that everything shown to learners has correct diacritics. Grading and tutoring prompts
  state that diacritics, capitalisation and punctuation are never errors, are never
  mentioned as mistakes, and never lower a score. The feedback prompt's rule to list
  accent marks as an improvement is removed. The conversation tutor corrects only word
  choice and grammar.
- **Inputs:** answer boxes that expect Slovak set `autoCorrect="off"`,
  `autoCapitalize="none"`, `spellCheck={false}`, `autoComplete="off"`. This covers
  grammar, conversation, the legacy chat box, and translation items answered in Slovak.
  Translation items answered in English keep autocorrect.
- **Interface:** an `accent` result renders as correct (green) with the line
  "With accents: …".

## 6. Translation exercise kinds

Each item gains `kind` and an optional `translation` (the English meaning, shown as
context). Items without `kind` are treated as `translate`, so stored sessions still load.

| Topic | Items generated |
|---|---|
| none | `translate`, directions alternating |
| English → Slovak | `translate`, all `en-sk` |
| Slovak → English | `translate`, all `sk-en` |
| Fill in the Blanks | `fill_blank` |
| Error Correction | `error_correction` |

**`fill_blank`:** `source` is a Slovak sentence with one `____`; `translation` is the
English meaning of the full sentence; `modelAnswer` is the missing word or short phrase.
A normalized match scores 10 without a model call. Otherwise the grader judges whether
the learner's word is also valid in the sentence.

**`error_correction`:** `source` is a Slovak sentence with exactly one mistake in word
choice or grammar, never in diacritics; `translation` is the intended meaning;
`modelAnswer` is the corrected sentence; `keyPoints` explains the mistake. A normalized
match with `modelAnswer` scores 10. A normalized match with the unchanged `source`
scores 1 with the note that nothing was changed. Anything else goes to the grader.

**Enforcement:** after generation the backend drops items whose `kind` or `direction`
does not match the topic, and `fill_blank` items that do not contain exactly one `____`.
The vocabulary under-delivery rule applies.

**Repeat protection:** the prompt lists source sentences from the learner's last 10
translation sessions (up to 60) as not to be reused. Exact normalized duplicates are
dropped after generation. The translation prompt keeps the recent-session digest from
the learning context and omits its word lists, for the same reason as vocabulary.

**Review words** are woven into sentences only when `include_review` is true: up to 6
due words from any source, as today, most overdue first.

The submit route and the session score formula are unchanged.

## 7. Model client (OpenRouter)

- Default `openrouter_model` becomes `anthropic/claude-sonnet-5`.
- **Structured output:** `ask_json` accepts a JSON schema and sends it as
  `response_format` of type `json_schema`. Schemas exist for the vocabulary batch,
  grammar lesson, translation batch, translation grading, and session feedback. The
  existing text extraction and repair stay as the fallback, used when a schema call is
  rejected. Prompts keep their description of the JSON shape as the contract for that
  fallback; the quote-escaping workaround is removed.
- **Reasoning effort per route**, sent as OpenRouter's `reasoning.effort`:

  | Route | Effort | `max_tokens` |
  |---|---|---|
  | Lesson generation | medium | 16000 |
  | Session feedback | low | 8000 |
  | Translation grading, conversation turn, hint | low | 4000 |

- **Truncation:** `finish_reason == "length"` raises `LLMError`.
- **Out of credits:** HTTP 402 raises a distinct `LLMCreditsError`. The API returns 503
  with code `tutor_out_of_credits`. The start sheet skips its 50-second retry polling
  for this error and shows "The tutor is out of AI credits."
- **Timeout:** the HTTP client timeout rises from 60 to 90 seconds.
- **Prompt wording:** capitalised emphasis and the self-review checklist are removed.
  Sonnet 5 follows instructions literally, so each rule states its scope plainly.
- **Latency target:** median session start under 20 seconds in the live smoke test.
  If it is missed, lesson generation drops to low effort.

## 8. Frontend

- **Hook ordering:** the four mode components narrow the session type in a thin wrapper
  so that every React hook runs unconditionally.
- **Review chip:** the "Review N due words" chip on the home screen opens the start
  sheet with the review toggle already on, and counts only quiz-eligible words.
- **Start sheet:** an "Include review words" toggle on vocabulary and translation,
  default off. The sheet gets `env(safe-area-inset-bottom)` bottom padding and scrolls
  when taller than the screen.
- **Orphan-session match** also compares topic and difficulty, so a retry cannot land
  in a session with different settings.
- **Session header** shows the focus the session was built with.
- **Vocabulary:** a "Review" label on questions with `review: true`.
- **Translation:** per-kind heading ("Translate to Slovak", "Translate to English",
  "Fill in the missing word", "Fix the mistake") and the English meaning when present.
- **Grammar and translation results:** the accent note from section 5.

## 9. Testing

**Backend (pytest):** answer normalization; both correct tiers give full credit;
translation short-circuit makes no model call; default composition has no review words;
`include_review` adds at most 4 eligible due words, most overdue first; uncapped
do-not-repeat list; the three new validation rejections; per-answer saving and the
legacy path; idempotent `end_session`; `progressRecorded` guard; topic-to-kind
enforcement; unchanged-sentence path for error correction; schema and effort present in
the OpenRouter payload; `finish_reason` and 402 handling; the focus table in section 2.

**Frontend (vitest):** the toggle sends `include_review`; Slovak answer boxes carry the
four attributes and English ones do not; translation headings per kind; accent note;
out-of-credits message; tightened orphan match.

**Live smoke test** (real model, a few cents, run locally): one session per mode and per
translation topic, with the instruction "food" on vocabulary. Check that all 10 words
are food-related, that no word repeats across three consecutive sessions, and record
start latency.

## 10. Rollout

1. Commit the current local work as the baseline.
2. Implement in the order: model client, scoring tolerance, composition and tracking,
   translation kinds, frontend.
3. **Owner only:** top up the OpenRouter balance; set `SLOVAK_OPENROUTER_MODEL` to
   `anthropic/claude-sonnet-5` in Render if that variable is set there; trigger the
   manual Render deploy.
4. Push `main` so GitHub Pages deploys the frontend, straight after the backend is live.
   The old frontend works against the new backend except that fill-in-the-blank and
   error-correction items would show a translation heading during that gap.
5. Verify: `include_review` appears in the production OpenAPI schema and a vocabulary
   session with the instruction "food" returns food words.

## 11. Compatibility

- Stored sessions without `kind`, `review`, `srsPerAnswer` or `progressRecorded` load
  and finish under the old rules.
- Stored grammar results with 0.8 credit keep their historical scores.
- Existing `vocabulary_progress` rows stay, apart from the cleanup in section 4.
