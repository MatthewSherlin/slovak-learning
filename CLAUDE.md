# Slovak Learning App

## Quick Start
```bash
chmod +x run.sh && ./run.sh
```
Backend: http://localhost:8888/docs | Frontend: http://localhost:5173

## Architecture
- **Backend:** FastAPI (Python 3.11+) at `backend/app/`
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4 at `frontend/src/`
- **LLM:** Google Gemini 2.0 Flash (free tier) via REST API, with Claude CLI fallback
- **Data:** JSON file persistence in `backend/data/`

## Key Backend Files
- `app/main.py` — FastAPI routes
- `app/sessions.py` — Session management, XP/streak/leaderboard logic
- `app/llm.py` — Unified LLM abstraction (Gemini or Claude)
- `app/gemini_client.py` — Gemini REST API client
- `app/questions.py` — Slovak question banks by mode/topic
- `app/prompts.py` — System prompts per learning mode
- `app/users.py` — User persistence (Matt & Zuki)
- `app/models.py` — Pydantic models

## Key Frontend Files
- `src/App.tsx` — Router
- `src/lib/api.ts` — API client
- `src/lib/types.ts` — TypeScript interfaces
- `src/components/UserPicker.tsx` — User selection + `useUser` hook
- `src/pages/` — Home, Session, History, Dashboard, Leaderboard, Guides

## Conventions
- Backend uses `ruff` style, type hints everywhere
- Frontend uses strict TypeScript, Tailwind utility classes, framer-motion for animations
- API routes prefixed with `/api/`
- Ports: backend 8888, frontend 5173

## Environment
Copy `backend/.env.example` to `backend/.env` and set:
```
SLOVAK_LLM_PROVIDER=gemini
SLOVAK_GEMINI_API_KEY=your-key
```
