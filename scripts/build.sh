#!/usr/bin/env bash
# Eona OS — build. Idempotent; builds the dashboard and syntax-checks the engine.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "▶ Eona OS build — $ROOT"

# --- Dashboard (Vite/React 19, strict TS) ---
if [ -f dashboard/package.json ]; then
  echo "▶ dashboard: install + typecheck + build"
  ( cd dashboard
    if [ -f package-lock.json ]; then npm ci; else npm install; fi
    npm run build )   # tsc -b && vite build
else
  echo "• dashboard/: no package.json — skipping"
fi

# --- Engine (Python, Hermes fork) ---
if [ -d engine ]; then
  echo "▶ engine: byte-compile (syntax check)"
  PY="$(command -v python3 || command -v python || true)"
  if [ -n "$PY" ]; then "$PY" -m compileall -q engine; else echo "• python not found — skipping engine compile"; fi
else
  echo "• engine/: not present — skipping"
fi

echo "✓ build complete"
