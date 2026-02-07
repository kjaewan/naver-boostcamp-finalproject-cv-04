#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

COMFY_DIR="${COMFY_DIR:-$ROOT_DIR/../ComfyUI}"
COMFY_PORT="${COMFY_PORT:-8188}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
COMFY_BASE_URL="${COMFY_BASE_URL:-http://127.0.0.1:8188}"
COMFY_INPUT_DIR="${COMFY_INPUT_DIR:-$COMFY_DIR/input}"
COMFY_AUTOSTART="${COMFY_AUTOSTART:-1}"

if [[ "$COMFY_DIR" != /* ]]; then
  COMFY_DIR="$ROOT_DIR/$COMFY_DIR"
fi

if [[ "$COMFY_INPUT_DIR" != /* ]]; then
  COMFY_INPUT_DIR="$ROOT_DIR/$COMFY_INPUT_DIR"
fi

COMFY_DIR="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$COMFY_DIR")"
COMFY_INPUT_DIR="$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$COMFY_INPUT_DIR")"

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT INT TERM

echo "[1/3] Checking ComfyUI at: $COMFY_BASE_URL"
echo "      COMFY_DIR=$COMFY_DIR"
echo "      COMFY_INPUT_DIR=$COMFY_INPUT_DIR"
comfy_ready=0
if command -v curl >/dev/null 2>&1; then
  if curl -fsS "$COMFY_BASE_URL/system_stats" >/dev/null 2>&1; then
    comfy_ready=1
    echo "ComfyUI already running."
  fi
fi

if [[ "$comfy_ready" -eq 0 ]]; then
  if [[ "$COMFY_AUTOSTART" == "1" && -d "$COMFY_DIR" ]]; then
    echo "Starting sibling ComfyUI from: $COMFY_DIR"
    cd "$COMFY_DIR"
    python3 main.py --listen 127.0.0.1 --port "$COMFY_PORT" &
    pids+=("$!")
    sleep 3
  else
    echo "Warning: ComfyUI is not reachable and auto-start is disabled or COMFY_DIR is missing."
  fi
fi

echo "[2/3] Starting backend on :$BACKEND_PORT"
cd "$ROOT_DIR/backend"
COMFY_BASE_URL="$COMFY_BASE_URL" COMFY_INPUT_DIR="$COMFY_INPUT_DIR" python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" &
pids+=("$!")

cd "$ROOT_DIR"
if command -v npm >/dev/null 2>&1; then
  echo "[3/3] Starting frontend on :$FRONTEND_PORT"
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" &
  pids+=("$!")
else
  echo "[3/3] npm not found; frontend dev server skipped"
fi

echo "All services started. Press Ctrl+C to stop."
wait
