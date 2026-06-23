#!/usr/bin/env python3
"""Claude Code delegation bridge (host-side).

Hermes runs in Docker; Claude Code runs on the host (tied to your subscription).
This tiny HTTP service lets Hermes delegate coding/agentic jobs to Claude Code:
it accepts a prompt and runs `claude -p ... --output-format json` on the host.

Run on the HOST (not in a container):
  BRIDGE_TOKEN=$(openssl rand -hex 16) BRIDGE_HOST=0.0.0.0 python3 scripts/claude-bridge.py
Then set CLAUDE_BRIDGE_URL + CLAUDE_BRIDGE_TOKEN for the hermes container (compose).

Security:
  - Refuses to start without BRIDGE_TOKEN (fail closed).
  - Every request must send  X-Bridge-Token: <token>.
  - Default bind is 127.0.0.1; to let the Docker container reach it via
    host.docker.internal you must set BRIDGE_HOST (e.g. 0.0.0.0) AND keep the
    token secret. Only do this on a trusted local network.
  - Claude runs in CLAUDE_BRIDGE_CWD (default: this repo). Permission mode is
    'default' unless you opt into more autonomy via CLAUDE_PERMISSION_MODE.
"""
from __future__ import annotations

import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("BRIDGE_TOKEN", "")
HOST = os.environ.get("BRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("BRIDGE_PORT", "8765"))
CWD = os.environ.get(
    "CLAUDE_BRIDGE_CWD",
    os.environ.get(
        "HERMES_VAULT_PATH",
        os.path.expanduser("~/Documents/Obsidian/Vault/10_Projects/agent-home"),
    ),
)
PERMISSION_MODE = os.environ.get("CLAUDE_PERMISSION_MODE", "default")
TIMEOUT = int(os.environ.get("CLAUDE_BRIDGE_TIMEOUT", "600"))


def run_claude(prompt: str) -> dict:
    cmd = ["claude", "-p", prompt, "--output-format", "json",
           "--permission-mode", PERMISSION_MODE]
    try:
        proc = subprocess.run(cmd, cwd=CWD, capture_output=True, text=True,
                              timeout=TIMEOUT)
    except FileNotFoundError:
        return {"ok": False, "error": "claude CLI not found on host PATH"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"claude timed out after {TIMEOUT}s"}
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr.strip()[:1000]}
    # `claude -p --output-format json` prints a JSON envelope; pass it through.
    try:
        return {"ok": True, "result": json.loads(proc.stdout)}
    except json.JSONDecodeError:
        return {"ok": True, "result": {"text": proc.stdout.strip()}}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/delegate":
            return self._send(404, {"error": "not found"})
        if self.headers.get("X-Bridge-Token") != TOKEN:
            return self._send(401, {"error": "bad or missing X-Bridge-Token"})
        length = int(self.headers.get("content-length", "0"))
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._send(400, {"error": "invalid JSON"})
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return self._send(400, {"error": "missing 'prompt'"})
        self._send(200, run_claude(prompt))

    def log_message(self, *_args) -> None:  # silence default logging
        pass


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Refusing to start: set BRIDGE_TOKEN (fail closed).")
    print(f"Claude bridge on http://{HOST}:{PORT}/delegate (cwd={CWD}, mode={PERMISSION_MODE})")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
