#!/usr/bin/env bash
# Agent Home — installer (Phase 1–2). Local Apple Silicon, free-first mesh.
# Run interactively; it pauses for you to add API keys. Safe to re-run.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERMES_HOME="${HOME}/.hermes"
VAULT="/Users/perkypanda/Documents/Obsidian/Vault"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }

# 1) Hermes engine -------------------------------------------------------------
if ! command -v hermes >/dev/null 2>&1; then
  say "Installing Hermes Agent (Nous Research, MIT)…"
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
else
  say "Hermes already installed: $(command -v hermes)"
fi

# 2) Tier A — local models (Ollama) -------------------------------------------
if ! command -v ollama >/dev/null 2>&1; then
  warn "Ollama not found. Install from https://ollama.com then re-run, or:"
  warn "  brew install ollama && ollama serve &"
else
  say "Pulling a local model for Tier A (private, free)…"
  ollama pull gemma3 || warn "Adjust the model tag to one available for your Mac."
fi

# 3) Config + secrets ----------------------------------------------------------
mkdir -p "${HERMES_HOME}"
if [ ! -f "${HERMES_HOME}/config.yaml" ]; then
  say "Seeding ~/.hermes/config.yaml from template (verify keys vs hermes docs)…"
  cp "${REPO_DIR}/hermes/config.yaml" "${HERMES_HOME}/config.yaml"
fi
if [ ! -f "${HERMES_HOME}/.env" ]; then
  cp "${REPO_DIR}/hermes/.env.example" "${HERMES_HOME}/.env"
  warn "Edit ${HERMES_HOME}/.env and add GEMINI_API_KEY (+ optional free-tier keys)."
  warn "Then re-run this script. Stopping so you can add keys."
  exit 0
fi

# 4) Obsidian shared memory ----------------------------------------------------
say "Obsidian memory: ensure the Local REST API plugin is enabled (port 27123)"
say "and MCP_OBSIDIAN_API_KEY is set in ~/.hermes/.env. Vault: ${VAULT}"

# 5) Kanban board --------------------------------------------------------------
say "Initializing Kanban board…"
hermes kanban init || warn "Verify 'hermes kanban init' against your Hermes version."

say "Done. Next: 'hermes gateway start' (binds 127.0.0.1:8642), then scripts/doctor.sh"
