# Slovak Learning App

## Quick Start
```bash
chmod +x run.sh && ./run.sh
```
Backend: http://localhost:8888/docs | Frontend: http://localhost:5173

## Architecture
- **Backend:** FastAPI (Python 3.11+) at `backend/app/`
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 at `frontend/src/`
- **LLM:** Anthropic Claude Haiku (`claude-haiku-4-20250414`) via Python SDK
- **Database:** SQLite via `aiosqlite` at `backend/data/slovak.db`
- **Deployment:** GitHub Pages (frontend), backend hosted separately

## Key Backend Files
- `app/main.py` — FastAPI routes with lifespan, CORS
- `app/sessions.py` — Session creation, answer submission, feedback generation
- `app/llm.py` — Anthropic SDK wrapper (`ask()`, `ask_json()`)
- `app/database.py` — SQLite schema, CRUD, dashboard/leaderboard aggregation
- `app/questions.py` — Slovak question banks by mode/topic
- `app/prompts.py` — System prompts per learning mode
- `app/models.py` — Pydantic models (exercise data mirrors frontend TypeScript types)
- `app/config.py` — Settings via pydantic-settings

## Key Frontend Files
- `src/App.tsx` — HashRouter, UserProvider
- `src/lib/api.ts` — HTTP client (fetch to backend via `VITE_API_URL`)
- `src/lib/types.ts` — TypeScript interfaces (Session, ExerciseData union types)
- `src/components/UserPicker.tsx` — User selection + `useUser` hook
- `src/components/VocabMode.tsx` — Flashcard 4-choice quiz game
- `src/components/GrammarMode.tsx` — Fill-in-the-blank exercises
- `src/components/FeedbackView.tsx` — Animated score ring + detailed feedback
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

## Environment
Copy `backend/.env.example` to `backend/.env` and set:
```
SLOVAK_ANTHROPIC_API_KEY=sk-ant-api03-...
```

Frontend uses `VITE_API_URL` env var (defaults to `http://localhost:8888`).
