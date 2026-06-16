#!/usr/bin/env bash
# Agent Home — installer. Docker Compose stack on local Apple Silicon.
# Paid creds: GEMINI_API_KEY only (Claude uses the Claude Code CLI subscription).
# Host-native (you install these yourself): Obsidian + Local REST plugin,
# Claude Code CLI, and optionally Ollama. Everything else runs in Docker.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_DIR}/hermes/.env"
SEARX="${REPO_DIR}/infra/searxng/settings.yml"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }

# 1) Prerequisites -------------------------------------------------------------
command -v docker >/dev/null 2>&1 || { warn "Docker not found — install Docker Desktop and re-run."; exit 1; }
docker compose version >/dev/null 2>&1 || { warn "Docker Compose v2 required."; exit 1; }
say "Docker OK: $(docker --version)"

command -v claude >/dev/null 2>&1 && say "Claude Code CLI found." \
  || warn "Claude Code CLI not found on host — install it (the premium runtime tab)."
command -v ollama >/dev/null 2>&1 && say "Ollama found (optional local tier)." \
  || warn "Ollama not found (optional). Install from https://ollama.com for a free local tier."

# 2) Secrets -------------------------------------------------------------------
if [ ! -f "${ENV_FILE}" ]; then
  cp "${REPO_DIR}/hermes/.env.example" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  warn "Created hermes/.env — add your GEMINI_API_KEY (and Obsidian token), then re-run."
  exit 0
fi
if ! grep -q '^GEMINI_API_KEY=.\+' "${ENV_FILE}"; then
  warn "GEMINI_API_KEY is empty in hermes/.env. Add it, then re-run."
  exit 0
fi

# 3) SearXNG secret ------------------------------------------------------------
if grep -q "CHANGE_ME" "${SEARX}" 2>/dev/null; then
  key="$(openssl rand -hex 32)"
  /usr/bin/sed -i '' "s/CHANGE_ME_run_openssl_rand_hex_32/${key}/" "${SEARX}" 2>/dev/null \
    || sed -i "s/CHANGE_ME_run_openssl_rand_hex_32/${key}/" "${SEARX}"
  say "Generated SearXNG secret_key."
fi

# 4) Obsidian reminder ---------------------------------------------------------
say "Ensure Obsidian is running with the Local REST API plugin (host :27123)."
say "Containers reach it via host.docker.internal."

# 5) Bring up the stack --------------------------------------------------------
say "Building + starting the stack (hermes, searxng, crawl4ai, qdrant, dashboard)…"
docker compose -f "${REPO_DIR}/docker-compose.yml" up -d --build

say "Done. Dashboard → http://127.0.0.1:3737 · Gateway → http://127.0.0.1:8642"
say "Verify with: scripts/doctor.sh   ·   Logs: docker compose logs -f hermes"
