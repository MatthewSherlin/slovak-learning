# Slovak Learning App

## Quick Start
```bash
chmod +x run.sh && ./run.sh
```
Backend: http://localhost:8888/docs | Frontend: http://localhost:5173

## Architecture
- **Backend:** FastAPI (Python 3.11+) at `backend/app/`
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 at `frontend/src/`
- **LLM:** Claude Sonnet 5 through OpenRouter (`anthropic/claude-sonnet-5`); production sets `SLOVAK_LLM_PROVIDER=openrouter`
- **Database:** SQLite via `aiosqlite` at `backend/data/slovak.db`
- **Deployment:** GitHub Pages (frontend), backend hosted separately

## Key Backend Files
- `app/main.py` — FastAPI routes with lifespan, CORS
- `app/sessions.py` — Session creation, answer submission, end-of-lesson results
- `app/llm.py` — Model client for OpenRouter, with a direct Anthropic path kept as a fallback (`ask()`, `ask_messages()`, `ask_json()`)
- `app/database.py` — SQLite schema, CRUD, dashboard/leaderboard aggregation
- `app/questions.py` — Slovak question banks by mode/topic
- `app/prompts.py` — System prompts per learning mode
- `app/models.py` — Pydantic models (exercise data mirrors frontend TypeScript types)
- `app/config.py` — Settings via pydantic-settings
- `app/composition.py` — Session focus, slot plan, question and exercise validation
- `app/scoring.py` — Answer normalization and grading
- `app/schemas.py` — JSON schemas that constrain model output

## Key Frontend Files
- `src/App.tsx` — HashRouter, UserProvider
- `src/lib/api.ts` — HTTP client (fetch to backend via `VITE_API_URL`)
- `src/lib/types.ts` — TypeScript interfaces (Session, ExerciseData union types)
- `src/components/UserPicker.tsx` — User selection + `useUser` hook
- `src/components/VocabMode.tsx` — Flashcard 4-choice quiz game
- `src/components/GrammarMode.tsx` — Fill-in-the-blank exercises
- `src/components/FeedbackView.tsx` — Results page: score ring, breakdown bars, one row per answer
- `src/lib/results.ts` — Builds the results page's rows from a session's exercises
- `src/lib/pacing.ts`, `src/lib/sounds.ts`, `src/lib/speech.ts` — Lesson timings, answer sounds, spoken pronunciation
- `src/pages/` — Home, Session, History, Dashboard, Leaderboard, Guides

## Learning Modes
- **Vocabulary:** 4-choice flashcard game (10 words, SK↔EN, retry missed)
- **Grammar:** Lesson → fill-in-the-blank exercises (LLM-generated)
- **Translation:** Translate sentences, LLM evaluates quality
- **Conversation:** Chat with AI tutor on a topic

## Conventions
- Backend uses `ruff` style, type hints everywhere
- Frontend uses strict TypeScript, Tailwind utility classes, framer-motion for animations
- API routes prefixed with `/api/`
- Ports: backend 8888, frontend 5173
- Exercise data stored as JSON columns in SQLite (mirrors frontend type shapes)
- Backend is source of truth for all scoring — no client-side evaluation
- Session create takes `instructions` (free text, max 300 chars) and `include_review` (default false). The focus block built from topic + instructions opens every generation prompt.
- Accents, capitalisation and punctuation never cost points. `scoring.normalize_answer` is the single place that decides what counts as the same answer.
- Review words appear only when `include_review` is true, and only words learned in vocabulary mode with an English meaning are eligible.
- Vocabulary progress is saved as each first answer arrives, not at the end of the session.
- Translation topics choose the exercise kind: `translate`, `fill_blank`, `error_correction`.
- Ending a lesson makes no model call. The results are counted from the answers; conversation lessons have no score. Stored feedback from before this has no `items_answered`, and the results page ignores its AI-written text.
- The app is used as a home-screen web app on iPhones and Android phones: tap targets at least 44 by 44 (`.tap-target` adds an invisible box), text fields at least 16px, `env(safe-area-inset-*)` on top and bottom edges, nothing wider than 360px.
- Colours come from the `--color-*` tokens in `src/index.css`, defined for both themes. `colorTokens.test.ts` fails on a hex literal in the files it lists.

## Environment
Copy `backend/.env.example` to `backend/.env` and set:
```
SLOVAK_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
```
`SLOVAK_OPENROUTER_MODEL` overrides the model (default `anthropic/claude-sonnet-5`). If `SLOVAK_LLM_PROVIDER` is not set, the backend calls the Anthropic API directly and needs `SLOVAK_ANTHROPIC_API_KEY` instead; schema output, reasoning effort and the out-of-credits message apply only to the OpenRouter path.

Frontend uses `VITE_API_URL` env var (defaults to `http://localhost:8888`).
