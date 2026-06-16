#!/usr/bin/env bash
# Agent Home — security & health doctor. Read-only checks; exits non-zero on any FAIL.
set -uo pipefail

HERMES_HOME="${HOME}/.hermes"
VAULT="/Users/perkypanda/Documents/Obsidian/Vault"
fail=0
ok()   { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
bad()  { printf "\033[1;31m✗ %s\033[0m\n" "$*"; fail=1; }
info() { printf "\033[1;36m• %s\033[0m\n" "$*"; }

info "Agent Home doctor"

# 1) Services bind to localhost only ------------------------------------------
for p in 8642 27123 3737 11434; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | grep -q '\*:'"$p"; then
    bad "Port $p is bound to 0.0.0.0 (LAN-exposed). Bind to 127.0.0.1 only."
  else
    ok "Port $p not exposed on 0.0.0.0"
  fi
done

# 2) No plaintext secrets in the repo or vault --------------------------------
if grep -rIlE '(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})' \
     "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" 2>/dev/null | grep -v '.env.example'; then
  bad "Possible API key committed in the repo (see files above)."
else
  ok "No obvious API keys in the repo"
fi
if grep -rIlE '(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})' "${VAULT}" 2>/dev/null | head -1; then
  bad "Possible secret found inside the Obsidian vault — secrets must stay out of the vault."
else
  ok "No obvious secrets in the vault"
fi

# 3) .env present and not world-readable ---------------------------------------
if [ -f "${HERMES_HOME}/.env" ]; then
  perm="$(stat -f '%A' "${HERMES_HOME}/.env" 2>/dev/null || echo '?')"
  [ "$perm" = "600" ] && ok "~/.hermes/.env perms 600" || bad "~/.hermes/.env perms $perm (chmod 600)"
else
  info "~/.hermes/.env not found yet (run scripts/install.sh)"
fi

# 4) Gateway health ------------------------------------------------------------
if curl -fsS http://127.0.0.1:8642/ >/dev/null 2>&1; then
  ok "Hermes gateway responding on 127.0.0.1:8642"
else
  info "Hermes gateway not running (start with 'hermes gateway start')"
fi

[ "$fail" -eq 0 ] && { ok "All checks passed"; exit 0; } || { bad "Some checks FAILED"; exit 1; }
