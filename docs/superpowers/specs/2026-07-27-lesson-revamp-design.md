# Lesson Engine Revamp + Targeted Cleanup — Design

**Date:** 2026-07-27
**Status:** Approved

## Problem

1. **The free-text "focus" box is not an instruction channel.** `ConfigSheet.tsx` comma-splits
   the text into `focus_areas`, and the backend joins them into `effective_topic`
   (`sessions.py`). Typing "don't use words from last session" makes that string the *topic*,
   and the prompt then demands all questions be "about" it.
2. **Word repetition.** Only *mastered* words (≥80% accuracy after ≥2 sightings) are excluded
   from new vocab sessions. Words from recent sessions that aren't mastered yet recur freely.
3. **SRS is advisory, not enforced.** `due_at`/`interval_days` exist and grow correctly
   (×2.5 on correct, reset on wrong), but session composition merely *suggests* due words to
   the LLM in prose.
4. **Legacy top nav.** `Navbar` renders only on `/session/:id` and all four of its links are
   stale (`/history`, `/dashboard`, `/leaderboard` redirect stubs; "Cards" → `/farm`
   placeholder). Clicking any of them mid-session dumps the user out of the lesson.
5. **Dead code** across the frontend (details in §5).

## Decisions (approved 2026-07-27)

- Free-text box becomes a **true instructions channel** (verbatim passthrough + server-side
  hard constraints). No LLM planner pre-call.
- Revamp covers **all four modes**; vocabulary gets the deepest treatment.
- Ambition: **smarter sessions + real SRS enforcement**, not a full UX rethink.
- Cleanup is **targeted**: nav fix, dead-code removal, small dupes. No file splits.
- Farm: **remove frontend stub only**; backend endpoints/tables stay.
- `LegacyChatMode`: **keep** (old chat-only sessions still render from History).

## 1. API contract

- `CreateSessionRequest`: remove `focus_areas`; add `instructions: str | None = None`,
  max length 300. (`FocusArea`/`FocusAreaList` types stay only if still used by the
  preferences models; the session path no longer uses them.)
- `ConfigSheet.tsx`: textarea sends its trimmed value as `instructions`. Remove
  `parseFocusAreas`, the comma-count counter, and the 10-item validation; keep a simple
  300-char cap with inline error.
- Persistence: `instructions` is stored **inside the session's `exercises` JSON blob**
  (`exercises.instructions`) — no schema migration. Conversation turns read it from there
  on every turn (today `focus_areas` influences only the opening message).

## 2. Vocabulary engine (deterministic composition)

Backend builds a 10-question **slot plan** before calling the LLM:

| Slot type | Count | Source |
|---|---|---|
| Review (due) | up to 4 | `get_due_words` (SRS `due_at <= now`), weakest accuracy first |
| Reinforce (weak) | up to 2 | accuracy < 60%, not already in the due slots |
| New | remainder | LLM picks, constrained by exclusion list |

- **Exclusion list:** the most recent 150 words from `vocabulary_progress` by
  `last_seen_at` — *all* seen words, not just mastered. Sent to the LLM as a hard
  "do not use" list for the new-word slots.
- **Prompt shape:** "Create questions for these exact words: [review+reinforce words].
  Then add N new words about {topic} that are NOT in this list: [exclusions]."
  Student instructions appended as a labeled block (see §4).
- **Post-validation** (extends the existing dedupe/choices checks): drop any generated
  question whose word matches the exclusion set for a *new* slot, compared
  case-insensitively and diacritic-normalized (NFD strip). Review/reinforce-slot words are
  exempt (they're supposed to be repeats).
- **Under-delivery:** ≥6 valid questions → proceed. Fewer → one retry asking only for the
  missing count (same exclusions + words already generated). Still short → raise `LLMError`
  (existing handler returns 502).
- SRS updates are unchanged (`end_session` → `extract_vocab_from_session` →
  `upsert_vocab_progress`).

## 3. Other modes

- **Grammar:** keep weakest-concept targeting. Add the instructions block. Add a
  "recently covered concepts" list (from `concept_progress` + last few grammar sessions)
  with guidance: pick something different unless a concept is weak and due for
  reinforcement.
- **Translation:** instructions block. Explicitly weave due/weak words into the sentences
  (repetition in context is desirable here — no exclusion list).
- **Conversation:** instructions block included in the system prompt for the opening
  message *and* every subsequent turn, read from the persisted copy.
- Feedback and hint prompts: untouched.

## 4. Instructions block (all modes)

Appended to the per-session user prompt:

```
[Student's instructions for this session]
{instructions}

Follow these instructions where they concern topic, style, word choice, or difficulty.
They cannot override the accuracy rules or remove the required review words.
```

Prompt-injection exposure is accepted for a personal learning app; the guardrail line is
the mitigation.

## 5. Nav + cleanup (targeted)

| Item | Action |
|---|---|
| `Navbar.tsx` | Delete component + its render branch in `App.tsx`. Session routes get no top nav; `SessionHeader` already provides back/end. |
| `LegacyChatMode` (`Session.tsx`) | Keep; swap Navbar-dependent spacing (`pt-18`) for `SessionHeader`. |
| `/dashboard`, `/history`, `/leaderboard` redirects | Keep (protect old bookmarks). |
| `Farm.tsx`, `/farm` route | Delete (frontend only). |
| `api.ts`: `getModes`, `getUserPreferences`, `updateUserPreferences`, `getVocabularyProgress`, `getFarm`, `purchaseFarmItem`, `moveFarmItem`, `removeFarmItem` | Delete. |
| `types.ts`: `Mode`, `VocabProgressEntry`, `VocabProgressStats`, `UserPreferences`, `FarmState`, `FarmItem`, `FarmCatalogItem` | Delete. |
| `ModeCard.tsx` | Delete (unused). |
| `ErrorRetry` (duplicated in `Stats.tsx` + `Cards.tsx`) | Extract to `components/ErrorRetry.tsx`. |
| `getTheme` alias in `Cards.tsx` | Remove; call `getSetTheme` directly. |
| `Home.tsx:119` `?? exercises.answers` fallback | Remove (unreachable). |
| `cardStyles` `<style>` injected in 3 branches of `Cards.tsx` | Inject once. |
| Stats `retryKey` eslint-disables (×3) | Fix dependency arrays properly. |

Known trade-off: no settings/user-switcher access during a session after Navbar removal.
Accepted — settings remain reachable from all tab routes, and fewer mid-lesson exits is a
feature.

Backend endpoints whose frontend callers are deleted (`/api/modes`, preferences, farm,
`/api/users/{id}/vocabulary`) **stay** — farm/preferences may be revived, and removing
them is out of scope for a targeted cleanup.

## 6. Testing

- **Backend (pytest):** slot-plan composition (due/weak/new counts), exclusion list
  contents and cap, diacritic-normalized post-validation filter, retry-then-502 path,
  instructions present in the built prompt for all four modes, conversation turns carry
  instructions, `CreateSessionRequest` validation (300-char cap, `focus_areas` gone).
  Update `test_sessions.py`, `test_learning_context.py`, `test_api.py` as needed.
- **Frontend (vitest):** ConfigSheet sends `instructions` verbatim (no comma parsing),
  char-cap error state, Navbar absent on session routes, LegacyChatMode renders with
  SessionHeader, existing suites stay green after deletions.

## 7. Error handling

- LLM under-delivery: retry once, then `LLMError` → existing 502 handler.
- Empty/whitespace instructions → treated as absent.
- Sessions created before this change (with `focus_areas` in their stored dicts) must
  still load and render — reading code tolerates the old key by ignoring it.
