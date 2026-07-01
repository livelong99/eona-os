#!/usr/bin/env bash
# Eona OS — run. Brings up the Docker stack (all services bound to 127.0.0.1).
# Note: the host Claude bridge (scripts/claude-bridge.py) must run on the HOST, not in Docker.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ Eona OS run"

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if [ -f docker-compose.yml ]; then
    echo "▶ docker compose up -d --build"
    docker compose up -d --build
    echo "✓ stack up — dashboard http://127.0.0.1:3737 · engine http://127.0.0.1:8642/health"
    echo "  reminder: start the host bridge → python3 scripts/claude-bridge.py (needs ~/.hermes/.env)"
  else
    echo "• docker-compose.yml missing — cannot start stack"; exit 1
  fi
else
  echo "• docker compose unavailable — falling back to dashboard dev server"
  if [ -f dashboard/package.json ]; then
    echo "  run manually: set -a; . ~/.hermes/.env; set +a; (cd dashboard && npm run dev)  # http://localhost:3737"
  fi
  echo "• install Docker Desktop (Compose v2) for the full stack"
fi
