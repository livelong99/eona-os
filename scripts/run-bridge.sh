#!/usr/bin/env bash
# Launchd wrapper for the Claude Code delegation bridge.
#
# Loads secrets from ~/.hermes/.env and starts scripts/claude-bridge.py bound to
# 0.0.0.0 so the hermes container can reach it via host.docker.internal:8765.
# This makes the bridge a *supervised* service (KeepAlive) instead of a manual
# terminal — the single point of failure for Claude delegation must restart on
# crash/login. Installed by scripts/install-bridge-service.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${HERMES_ENV_FILE:-$HOME/.hermes/.env}"

# launchd starts with a minimal PATH; ensure `claude`, python3, node resolve.
export PATH="$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# The bridge reads BRIDGE_TOKEN; our .env stores it as CLAUDE_BRIDGE_TOKEN.
export BRIDGE_TOKEN="${BRIDGE_TOKEN:-${CLAUDE_BRIDGE_TOKEN:-}}"
# Bind to 0.0.0.0 so the Docker container reaches it (host.docker.internal:8765).
export BRIDGE_HOST="${BRIDGE_HOST:-0.0.0.0}"
export CLAUDE_BRIDGE_CWD="${CLAUDE_BRIDGE_CWD:-$REPO_ROOT}"

if [[ -z "${BRIDGE_TOKEN}" ]]; then
  echo "run-bridge: CLAUDE_BRIDGE_TOKEN/BRIDGE_TOKEN not set in $ENV_FILE" >&2
  exit 1
fi

exec python3 "$REPO_ROOT/scripts/claude-bridge.py"
