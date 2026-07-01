#!/usr/bin/env bash
# Eona OS — test. Dashboard typecheck + engine pytest (falls back to compile check).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "▶ Eona OS test"
RC=0

# --- Dashboard: strict typecheck (the lint/type gate) ---
if [ -f dashboard/package.json ]; then
  echo "▶ dashboard: typecheck"
  ( cd dashboard
    [ -d node_modules ] || { if [ -f package-lock.json ]; then npm ci; else npm install; fi; }
    npm run typecheck ) || RC=1
else
  echo "• dashboard/: no package.json — skipping"
fi

# --- Engine: pytest if available, else syntax check ---
if [ -d engine ] || [ -d tests ]; then
  PY="$(command -v python3 || command -v python || true)"
  if [ -n "$PY" ] && "$PY" -c 'import pytest' >/dev/null 2>&1; then
    echo "▶ engine: pytest"
    "$PY" -m pytest -q tests engine 2>/dev/null || RC=1
  elif [ -n "$PY" ]; then
    echo "• pytest not installed — engine syntax check instead"
    "$PY" -m compileall -q engine || RC=1
  else
    echo "• python not found — skipping engine tests"
  fi
fi

[ "$RC" -eq 0 ] && echo "✓ tests passed" || echo "✗ tests failed"
exit "$RC"
