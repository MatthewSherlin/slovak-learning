# Learning Loop + Mobile Redesign — Combined Release

**Date:** 2026-07-17
**Status:** Approved pending user review
**Design source:** claude.ai/design project "Mobile PWA redesign" → `Redesign.dc.html` (local copy in session scratchpad)

## Goals

1. Fairer, more granular scoring — accents shouldn't fully fail an answer; session scores computed from real data, not LLM guesswork.
2. Adaptive learning — the app recommends what to practice next (spaced repetition + concept mastery).
3. Right-tool-per-job AI — deterministic code for objective judgments; LLM for generation, conversation, translation judgment, narrative feedback. Provider routing via OpenRouter (done — `SLOVAK_LLM_PROVIDER`).
4. Full UI redesign per the approved mocks: Home "2a Focus", Stats hub, redesigned quiz/feedback/guides, premium card system with real images.
5. One combined release; incremental local commits.

## Non-goals

- Auto-difficulty adjustment (deferred).
- "2b Journey" home variant / daily-goal ring (deferred).
- Analytics dashboards beyond the Stats hub (deferred — "adaptivity leads").

---

## 1. Scoring core (backend)

New module `app/scoring.py`:

- `grade_answer(expected, given) -> AnswerGrade` with tiers:
  - `exact` (credit 1.0) — case-insensitive, whitespace-trimmed match.
  - `accent` (credit 0.8) — matches after Unicode-decomposition accent stripping (NFD, drop combining marks). Feedback names the correctly-accented form.
  - `wrong` (credit 0.0).
- `compute_session_score(exercises) -> float` per mode:
  - Vocabulary: first-attempt accuracy weighted 1.0, retry recoveries 0.5; scale to 0–10.
  - Grammar: mean answer credit × 10.
  - Translation: mean of per-answer LLM scores (already 0–10).
  - Conversation: stays LLM-scored (subjective).
- `submit_grammar_answer` stores `credit` and tier per answer, not just bool. Exercise JSON gains `credits: list[float]`; frontend types updated to match.
- `end_session` uses computed score for vocab/grammar/translation; `FEEDBACK_PROMPT` rewritten to produce narrative only (strengths, improvements, grammar_notes, vocabulary_learned) — the LLM no longer invents `overall_score` except for conversation mode.
- Per-category breakdown (`scores[]`) computed deterministically where possible (e.g. "Word recognition" from sk→en vs en→sk accuracy split), narrative comments from LLM.

## 2. Adaptive layer (backend)

- `vocabulary_progress` gains `due_at TEXT`, `interval_days REAL DEFAULT 1` (migration in `init_db`, same ALTER-TABLE pattern as `pin_hash`).
  - On correct answer: `interval_days ×= 2.5` (cap 60), `due_at = now + interval`.
  - On wrong answer: `interval_days = 1`, `due_at = now`.
- New table `concept_progress(user_id, concept, times_seen, times_correct, last_seen_at)` — fed from grammar session lesson concept + per-answer credit.
- New `GET /api/users/{user_id}/recommendations`:
  ```json
  {
    "in_progress_session": {…} | null,
    "due_words": 8,
    "weakest_concept": {"concept": "Accusative case", "accuracy": 0.55} | null,
    "recommended": [{"kind": "review_vocab", "label": "Review 8 due words", "mode": "vocabulary", "params": {…}}, …]
  }
  ```
- Vocab session generation prefers due words (review-first), then new words; grammar generation targets weakest concept when no topic chosen.

## 3. Card gameplay (backend)

- Packs: 5 cards (was 3), guaranteed ≥1 rare-or-better (re-roll last slot if none).
- New `mythic` rarity, weight ~1%; catalog entries added per set. Full-art variants: `variant: "full_art"` field on select cards.
- Duplicate trade-in: `POST /api/users/{id}/cards/trade-in` — trades extra copies for XP (common 20, uncommon 40, rare 80, legendary 200, mythic 500). Requires tracking duplicate counts: `card_collection` gains `copies INTEGER DEFAULT 1` (dupes increment instead of being dropped).
- Showcase: `users.showcase_card_id` column; `PUT /api/users/{id}/showcase`; surfaced in `/api/cards/social`.
- All purchase/trade mutations inside `BEGIN IMMEDIATE` (per the race-fix pattern).
- XP model note: trade-in XP is *earned* credit — add an `xp_adjustments(user_id, amount, reason, created_at)` table summed into `_get_user_xp_earned` rather than mutating session history.

## 4. Card art pipeline

- Images sourced from public-domain/CC0-first (Wikimedia Commons, Openverse); CC-BY acceptable with attribution.
- Stored at `frontend/public/cards/<set_id>/<card_id>.webp`, target ≤60KB each.
- `frontend/public/cards/CREDITS.md` — per-image source URL, author, license.
- Catalog gains `art: str | null` path; cards without art render the engraved Cinzel monogram fallback from the design.
- Sourcing executed by parallel agents per set; images reviewed for fit before inclusion.

## 5. Frontend redesign

New shell: bottom tab bar (Home / Cards / Stats / Guides) replacing navbar routes; HashRouter retained.

Screens (from `Redesign.dc.html`):
- **Home 2a "Focus"** — date header, greeting, streak chip, avatar; Continue-session card (from recommendations endpoint); Recommended chip; mode grid with live stats.
- **Config bottom sheet** — replaces the session setup page; difficulty pills, optional topic chips, focus-area entry.
- **Vocab quiz** — new layout, pronunciation hint, XP toast on correct, progress dots. Fixes retry progress-bar bug in the rewrite.
- **Feedback** — score ring fed by computed score, per-category breakdown bars, narrative sections.
- **Stats hub** — tabs: Overview / History / Friends (merges Dashboard, History, Leaderboard; old routes redirect).
- **Guides** — card list with per-section read tracking (localStorage), progress counts.
- **Cards** — Shop (foil pack cards, set progress), Binder (album grid by set with owned/empty slots), Friends (collections + showcase), pack-opening flow (swipe-to-tear foil, card fan, tap-to-flip), trade-in sheet.
- **Loading** — branded lesson-generation loader, Home + Binder skeletons with shimmer.
- Theme: dark default; light theme via CSS custom properties (mock exists for Home light).

Bug fixes folded in while touching each file: GrammarMode XSS (render blank as JSX), PinEntry/SettingsModal hooks violations + context mutation, PinInput dedup, VocabMode retry progress, missing fetch error handling, global ErrorBoundary, dead props (`onEnd`, `index`, `size`), hardcoded card totals (derive from catalog), UserPicker hardcoded fallback removal, port-8888 error message.

## 6. Testing

- Backend: TDD throughout — scoring tiers, SRS scheduling, recommendations, pack guarantee/mythic odds (seeded RNG), trade-in, showcase. Existing 102-test suite stays green.
- Frontend: add vitest + @testing-library/react (new dev deps — approved as part of this spec). Smoke tests: scoring display, recommendation card rendering, pack-opening state machine, error boundary.
- Manual: full session loop per mode against live backend before release.

## 7. Sequencing

1. Backend: scoring → adaptive → cards (TDD, each a commit).
2. Art sourcing agents run in parallel with backend work.
3. Frontend: shell + theme tokens → Home/config → quiz/feedback → stats/guides → cards screens → loaders/polish.
4. Combined release at the end (user triggers deploy).

## Open questions (resolved)

- Home variant: **2a Focus** ✓
- Card gameplay scope: **everything** ✓
- Card art: **sourced free images with monogram fallback** ✓
- Release: **single combined release** ✓
