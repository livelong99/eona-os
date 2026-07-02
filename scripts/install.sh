#!/usr/bin/env bash
# Agent Home — fresh deploy (Claude-only).
#
# Stack: our forked Hermes engine, BUILT from ./engine (bundles the real `claude`
# CLI) + SearXNG + Crawl4AI + Qdrant + the Agent OS dashboard. Every turn is
# delegated to the local `claude` CLI via the "claude_code" runtime, which uses
# your Claude Code SUBSCRIPTION (CLAUDE_CODE_OAUTH_TOKEN) — no Gemini, no
# OpenRouter, no per-token API cost. All ports bound to 127.0.0.1.
#
# Usage:
#   scripts/install.sh           # fresh deploy: rebuild images + recreate containers
#   scripts/install.sh --wipe    # also delete volumes + kanban/session state (keeps secrets)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERMES_HOME="${HOME}/.hermes"          # mounted into the engine container as /opt/data
ENV_FILE="${HERMES_HOME}/.env"
PATHS_ENV="${REPO_DIR}/.env"           # path overrides only (VAULT_DIR/WORKSPACES_DIR) — git-ignored,
                                       # separate from ENV_FILE above (secrets stay in ~/.hermes/.env)
SEARX="${REPO_DIR}/infra/searxng/settings.yml"
COMPOSE="docker compose -f ${REPO_DIR}/docker-compose.yml"
WIPE=0; [ "${1:-}" = "--wipe" ] && WIPE=1

say()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
warn() { printf "\033[1;33m⚠ %s\033[0m\n" "$*"; }
die()  { printf "\033[1;31m✗ %s\033[0m\n" "$*"; exit 1; }
# Portable in-place sed (macOS BSD vs GNU).
sedi() { sed -i '' "$@" 2>/dev/null || sed -i "$@"; }

# 1) Prerequisites -------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker not found — install Docker Desktop and re-run."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 required."
docker info >/dev/null 2>&1 || die "Docker daemon not running — start Docker Desktop and re-run."
say "Docker OK: $(docker --version)"
command -v claude >/dev/null 2>&1 \
  && say "Claude Code CLI found on host (needed for: claude setup-token)." \
  || warn "Claude Code CLI not found on host — install it, then run: claude setup-token"

# 2) Seed ~/.hermes (engine /opt/data) from the repo ---------------------------
mkdir -p "${HERMES_HOME}/skills" "${HERMES_HOME}/.claude"
cp "${REPO_DIR}/hermes/config.yaml" "${HERMES_HOME}/config.yaml"   # config is non-secret; always refresh
cp -R "${REPO_DIR}/hermes/skills/." "${HERMES_HOME}/skills/" 2>/dev/null || true
cp -R "${REPO_DIR}/hermes/profiles" "${HERMES_HOME}/profiles" 2>/dev/null || true
say "Seeded ${HERMES_HOME} (config.yaml, skills, profiles)."

# 2b) Workspace + vault paths (${PATHS_ENV}) -----------------------------------
# Two INDEPENDENT, optional host directories, persisted in the repo-root .env
# (Docker Compose's own var-substitution file — already git-ignored). Obsidian is
# NOT required: VAULT_DIR only powers the optional Memory/Brain features and
# defaults to a folder that's auto-created below if it doesn't exist yet.
# Re-running this script NEVER overwrites a key already present in ${PATHS_ENV}.
DEFAULT_VAULT_DIR="${HOME}/Documents/Obsidian/Vault"
_paths_env_get() { [ -f "${PATHS_ENV}" ] && grep -m1 "^${1}=" "${PATHS_ENV}" 2>/dev/null | cut -d= -f2- || true; }
_paths_env_set_if_missing() { # KEY VALUE COMMENT
  touch "${PATHS_ENV}"
  if ! grep -q "^${1}=" "${PATHS_ENV}" 2>/dev/null; then
    { [ -n "${3:-}" ] && printf '# %s\n' "$3"; printf '%s=%s\n' "$1" "$2"; } >> "${PATHS_ENV}"
  fi
}

CUR_VAULT_DIR="$(_paths_env_get VAULT_DIR)"
if [ -t 0 ] && [ -z "${CUR_VAULT_DIR}" ]; then
  read -r -p "Obsidian vault directory (optional, Enter for default) [${DEFAULT_VAULT_DIR}]: " ans_vault || ans_vault=""
  VAULT_DIR="${ans_vault:-${DEFAULT_VAULT_DIR}}"
else
  VAULT_DIR="${CUR_VAULT_DIR:-${VAULT_DIR:-${DEFAULT_VAULT_DIR}}}"
fi
_paths_env_set_if_missing VAULT_DIR "${VAULT_DIR}" \
  "Obsidian vault (optional) — Memory/Brain features degrade gracefully if absent/empty."

DEFAULT_WORKSPACES_DIR="${VAULT_DIR}/10_Projects"
CUR_WORKSPACES_DIR="$(_paths_env_get WORKSPACES_DIR)"
if [ -t 0 ] && [ -z "${CUR_WORKSPACES_DIR}" ]; then
  read -r -p "Workspaces directory — where ingested projects live (Enter for default) [${DEFAULT_WORKSPACES_DIR}]: " ans_ws || ans_ws=""
  WORKSPACES_DIR="${ans_ws:-${DEFAULT_WORKSPACES_DIR}}"
else
  WORKSPACES_DIR="${CUR_WORKSPACES_DIR:-${WORKSPACES_DIR:-${DEFAULT_WORKSPACES_DIR}}}"
fi
_paths_env_set_if_missing WORKSPACES_DIR "${WORKSPACES_DIR}" \
  "Where ingested workspace projects live — independent of the vault above."

mkdir -p "${VAULT_DIR}" "${WORKSPACES_DIR}"
say "Vault directory:      ${VAULT_DIR}"
say "Workspaces directory: ${WORKSPACES_DIR}"
if [ ! -d "${VAULT_DIR}/.obsidian" ]; then
  warn "No .obsidian/ at ${VAULT_DIR} — Obsidian isn't required; Memory/Brain will show an"
  warn "empty graph until this becomes (or points at) a real Obsidian vault."
fi

# 3) Secrets (~/.hermes/.env) --------------------------------------------------
# The ONLY auth credential is CLAUDE_CODE_OAUTH_TOKEN (your subscription).
# API_SERVER_KEY + CLAUDE_BRIDGE_TOKEN are local tokens we generate.
if [ ! -f "${ENV_FILE}" ]; then
  umask 177
  cat > "${ENV_FILE}" <<EOF
# Agent Home secrets — Claude-only. NEVER commit. NEVER put in the Obsidian vault.
# Claude Code subscription token (first-party, no per-token cost).
# Generate on the host:  claude setup-token   → paste the sk-ant-oat.../cc-... value.
CLAUDE_CODE_OAUTH_TOKEN=

# Local OpenAI-compatible API server bearer token (required to start :8642).
API_SERVER_KEY=$(openssl rand -hex 24)

# Claude Code delegation bridge — local shared token (not a paid cred).
CLAUDE_BRIDGE_TOKEN=$(openssl rand -hex 16)

# Obsidian Local REST API plugin token (optional shared memory).
MCP_OBSIDIAN_API_KEY=
EOF
  umask 022
  warn "Created ${ENV_FILE}. Now run:  claude setup-token"
  warn "Paste the value into CLAUDE_CODE_OAUTH_TOKEN in ${ENV_FILE}, then re-run this script."
  exit 0
fi
# Backfill local tokens if a pre-existing .env lacks them.
grep -q '^API_SERVER_KEY=.\+'    "${ENV_FILE}" || printf 'API_SERVER_KEY=%s\n'    "$(openssl rand -hex 24)" >> "${ENV_FILE}"
grep -q '^CLAUDE_BRIDGE_TOKEN=.\+' "${ENV_FILE}" || printf 'CLAUDE_BRIDGE_TOKEN=%s\n' "$(openssl rand -hex 16)" >> "${ENV_FILE}"
grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.\+' "${ENV_FILE}" \
  || die "CLAUDE_CODE_OAUTH_TOKEN is empty in ${ENV_FILE}. Run 'claude setup-token', paste it, re-run."
say "Secrets present (Claude token + API/bridge tokens)."

# 4) SearXNG secret ------------------------------------------------------------
if grep -q "CHANGE_ME" "${SEARX}" 2>/dev/null; then
  sedi "s/CHANGE_ME_run_openssl_rand_hex_32/$(openssl rand -hex 32)/" "${SEARX}"
  say "Generated SearXNG secret_key."
fi

# 5) Obsidian reminder ---------------------------------------------------------
say "If using shared memory, run Obsidian + the Local REST API plugin (host :27123);"
say "containers reach it via host.docker.internal."

# 6) Fresh deploy --------------------------------------------------------------
if [ "${WIPE}" -eq 1 ]; then
  warn "--wipe: removing containers, networks, AND volumes (qdrant) + kanban/session state."
  ${COMPOSE} down --remove-orphans --volumes || true
  rm -f "${HERMES_HOME}/kanban.db" 2>/dev/null || true
  rm -rf "${HERMES_HOME}/sessions" "${HERMES_HOME}/kanban" 2>/dev/null || true
else
  say "Tearing down existing containers (volumes kept)…"
  ${COMPOSE} down --remove-orphans || true
fi

say "Building images (engine from ./engine + dashboard) and starting the stack…"
${COMPOSE} up -d --build

# 7) Wait for the API server ---------------------------------------------------
say "Waiting for the engine API (:8642)…"
for i in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8642/health >/dev/null 2>&1 && { say "Engine API healthy."; break; }
  sleep 3
  [ "$i" -eq 30 ] && warn "Engine API not healthy yet — check: ${COMPOSE} logs -f hermes"
done

say "Done. Dashboard → http://127.0.0.1:3737 · API → http://127.0.0.1:8642"
say "Verify:  scripts/doctor.sh    ·    Logs:  ${COMPOSE} logs -f hermes"
echo
say "Enable Claude Code delegation from the host (separate terminal):"
echo "    set -a; . ${ENV_FILE}; set +a"
echo "    BRIDGE_TOKEN=\$CLAUDE_BRIDGE_TOKEN BRIDGE_HOST=0.0.0.0 python3 ${REPO_DIR}/scripts/claude-bridge.py"
say "Optional — index the vault for semantic recall:"
echo "    set -a; . ${ENV_FILE}; set +a; python3 ${REPO_DIR}/scripts/index-vault.py"
