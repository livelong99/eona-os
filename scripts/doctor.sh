#!/usr/bin/env bash
# Agent Home — security & health doctor. Read-only checks; exits non-zero on FAIL.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="/Users/perkypanda/Documents/Obsidian/Vault"
ENV_FILE="${HOME}/.hermes/.env"
fail=0
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
bad()  { printf "\033[1;31m✗ %s\033[0m\n" "$*"; fail=1; }
info() { printf "\033[1;36m• %s\033[0m\n" "$*"; }

info "Agent Home doctor"

# 1) Published ports must be 127.0.0.1 only (8642 api, 3737 dash, tools, 8765 bridge)
for p in 8642 3737 8080 11235 6533 8765; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | grep -q '\*:'"$p"; then
    bad "Port $p bound to 0.0.0.0 (LAN-exposed). Publish as 127.0.0.1:$p:$p only."
  else
    ok "Port $p not exposed on 0.0.0.0"
  fi
done

# 2) No plaintext secrets committed (allow the .example template) -------------
if git -C "${REPO_DIR}" grep -nIE '(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,})' -- \
     ':!*.example' >/dev/null 2>&1; then
  bad "Possible API key tracked in git — secrets must live only in hermes/.env."
else
  ok "No API keys tracked in git"
fi
if grep -rIlE '(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,})' "${VAULT}" 2>/dev/null | head -1; then
  bad "Possible secret inside the Obsidian vault — keep secrets out of the vault."
else
  ok "No obvious secrets in the vault"
fi

# 3) .env perms + Claude token -------------------------------------------------
if [ -f "${ENV_FILE}" ]; then
  perm="$(stat -f '%A' "${ENV_FILE}" 2>/dev/null || echo '?')"
  [ "$perm" = "600" ] && ok "~/.hermes/.env perms 600" || bad "~/.hermes/.env perms $perm (chmod 600)"
  grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.\+' "${ENV_FILE}" \
    && ok "CLAUDE_CODE_OAUTH_TOKEN set (Claude subscription)" \
    || bad "CLAUDE_CODE_OAUTH_TOKEN missing — run 'claude setup-token'"
  grep -q '^API_SERVER_KEY=.\+' "${ENV_FILE}" \
    && ok "API_SERVER_KEY set" || bad "API_SERVER_KEY missing (engine API won't start)"
else
  info "~/.hermes/.env not found yet (run scripts/install.sh)"
fi

# 3b) claude CLI baked into the engine image -----------------------------------
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^agenthome-hermes$'; then
  docker exec agenthome-hermes sh -lc 'command -v claude >/dev/null' 2>/dev/null \
    && ok "claude CLI present in engine container" \
    || bad "claude CLI NOT in engine container (rebuild: docker compose build hermes)"
fi

# 4) SearXNG secret replaced ---------------------------------------------------
if grep -q "CHANGE_ME" "${REPO_DIR}/infra/searxng/settings.yml" 2>/dev/null; then
  bad "SearXNG secret_key still placeholder (run install.sh or set it manually)."
else
  ok "SearXNG secret_key set"
fi

# 5) Stack + gateway health ----------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  running=$(docker compose -f "${REPO_DIR}/docker-compose.yml" ps --services --filter status=running 2>/dev/null | wc -l | tr -d ' ')
  info "Docker services running: ${running}"
fi
if curl -fsS http://127.0.0.1:8642/health >/dev/null 2>&1; then
  ok "Engine API responding on 127.0.0.1:8642/health"
else
  info "Engine API not responding yet (docker compose up / still starting)"
fi
curl -fsS http://127.0.0.1:3737 >/dev/null 2>&1 && ok "Dashboard responding on :3737" \
  || info "Dashboard not responding yet"

[ "$fail" -eq 0 ] && { ok "All checks passed"; exit 0; } || { bad "Some checks FAILED"; exit 1; }
