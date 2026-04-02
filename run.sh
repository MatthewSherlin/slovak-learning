#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
DIM='\033[2m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Slovak Learning — Starting Dev Servers${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cleanup() {
    echo ""
    echo -e "${DIM}Shutting down...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Check for venv, create if needed
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo -e "${GREEN}▸${NC} Creating Python virtual environment..."
    python3 -m venv "$BACKEND_DIR/.venv"
    "$BACKEND_DIR/.venv/bin/pip" install -e "$BACKEND_DIR" 2>&1 | tail -2
fi

# Start backend
echo -e "${GREEN}▸${NC} Starting backend (FastAPI) on :8888"
cd "$BACKEND_DIR"
source .venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8888 --reload &
BACKEND_PID=$!

# Start frontend
echo -e "${GREEN}▸${NC} Starting frontend (Vite) on :5173"
cd "$FRONTEND_DIR"
npx vite --host 127.0.0.1 --port 5173 &
FRONTEND_PID=$!

echo ""
echo -e "${GREEN}✓${NC} App running at ${GREEN}http://localhost:5173${NC}"
echo -e "${DIM}  Backend API at http://localhost:8888/docs${NC}"
echo -e "${DIM}  Press Ctrl+C to stop${NC}"
echo ""

wait
