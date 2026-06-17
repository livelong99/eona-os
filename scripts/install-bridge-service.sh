#!/usr/bin/env bash
# Install (or reinstall) the Claude Code bridge as an always-on launchd agent.
#
# Why: the bridge (scripts/claude-bridge.py) is the host-side path Hermes uses to
# delegate to Claude Code. For 24/7 operation it must survive logout/crash, so we
# run it under launchd (KeepAlive + RunAtLoad) instead of a manual terminal.
#
# Usage:
#   scripts/install-bridge-service.sh          # install + start
#   scripts/install-bridge-service.sh --uninstall
#
# Prereqs: ~/.hermes/.env exists with CLAUDE_BRIDGE_TOKEN (scripts/install.sh
# generates it), and the `claude` CLI is on your login PATH.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.agenthome.claude-bridge"
LA_DIR="$HOME/Library/LaunchAgents"
PLIST_DEST="$LA_DIR/$LABEL.plist"
PLIST_SRC="$REPO_ROOT/scripts/$LABEL.plist"
LOG_DIR="$HOME/.hermes/logs"
DOMAIN="gui/$(id -u)"

uninstall() {
  echo "Stopping and removing $LABEL ..."
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST_DEST"
  echo "Removed $PLIST_DEST"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

if [[ ! -f "$HOME/.hermes/.env" ]]; then
  echo "error: ~/.hermes/.env not found — run scripts/install.sh first." >&2
  exit 1
fi

mkdir -p "$LA_DIR" "$LOG_DIR"

# Substitute placeholders into the LaunchAgents copy (keeps the in-repo template
# path-agnostic and committable).
sed -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    "$PLIST_SRC" > "$PLIST_DEST"

# Reload idempotently.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST_DEST"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "Installed and started $LABEL."
echo "  plist: $PLIST_DEST"
echo "  logs:  $LOG_DIR/claude-bridge.{out,err}.log"
echo "Verify: curl -s -X POST http://127.0.0.1:8765/delegate -H \"X-Bridge-Token: \$CLAUDE_BRIDGE_TOKEN\" -d '{\"prompt\":\"say hi\"}'"
