"""Shared, fail-open client for the live Cognee REST API (base ``/api/v1``, JWT).

Used by the Cognee recall lane (``agent.brain._cognee_recall``) and the Cognee
graph reader (``gateway.platforms.cognee_graph``). Cognee requires a bearer token
(``POST /api/v1/auth/login``, form-encoded) on every call; this module logs in
once, caches the token, and attaches it.

Every function is **fail-open**: a login or request failure returns
``None``/``[]`` and never raises, so a model turn or the Memory screen is never
blocked when Cognee is down / unreachable / mis-configured. Thin ``urllib``
client — no SDK dependency added to ``engine/pyproject.toml``.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Base URL. Host default 8801 = the compose host publish (cognee → :8000 in
# container); in-container callers set COGNEE_URL=http://cognee:8000.
COGNEE_URL = os.environ.get("COGNEE_URL", "http://127.0.0.1:8801").rstrip("/")
_API = f"{COGNEE_URL}/api/v1"

# Cognee auto-creates a default user; creds are env-overridable.
_AUTH_EMAIL = os.environ.get("COGNEE_AUTH_EMAIL", "default_user@example.com")
_AUTH_PASSWORD = os.environ.get("COGNEE_AUTH_PASSWORD", "default_password")

_TIMEOUT = 15  # seconds — short, fail-open

# Token cache (the JWT lives ~1h; we re-login on a shorter TTL + on any 401).
_TOK_LOCK = threading.Lock()
_TOK: dict = {"token": None, "at": 0.0}
_TOK_TTL = 600.0  # 10 min


def _login() -> Optional[str]:
    """POST form-encoded creds to ``/auth/login``; return the bearer or None."""
    data = urllib.parse.urlencode(
        {"username": _AUTH_EMAIL, "password": _AUTH_PASSWORD}
    ).encode()
    req = urllib.request.Request(
        f"{_API}/auth/login",
        data=data,
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            tok = json.loads(resp.read().decode()).get("access_token")
            return tok or None
    except Exception as exc:  # unreachable / bad creds / malformed → fail-open
        logger.debug("Cognee login failed (non-fatal): %s", exc)
        return None


def token(force: bool = False) -> Optional[str]:
    """Return a cached bearer token, (re)logging in on TTL expiry or ``force``."""
    with _TOK_LOCK:
        cached = _TOK["token"]
        if cached and not force and (time.time() - _TOK["at"]) < _TOK_TTL:
            return cached
    tok = _login()
    with _TOK_LOCK:
        _TOK["token"] = tok
        _TOK["at"] = time.time()
    return tok


def request(
    method: str,
    path: str,
    *,
    json_body: Optional[dict] = None,
    _retry_auth: bool = True,
) -> Optional[Any]:
    """Authed JSON request to ``/api/v1{path}``.

    Returns the parsed JSON body (list or dict), or ``None`` on any failure
    (fail-open). A 401 triggers exactly one re-login + retry.
    """
    tok = token()
    if not tok:
        return None
    url = f"{_API}{path}"
    data = json.dumps(json_body).encode() if json_body is not None else None
    headers = {"authorization": f"Bearer {tok}", "accept": "application/json"}
    if data is not None:
        headers["content-type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            if getattr(resp, "status", 200) not in (200, 201):
                return None
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        if exc.code == 401 and _retry_auth:
            token(force=True)  # token expired → re-login once and retry
            return request(method, path, json_body=json_body, _retry_auth=False)
        logger.debug("Cognee %s %s failed (non-fatal): HTTP %s", method, path, exc.code)
        return None
    except Exception as exc:
        logger.debug("Cognee %s %s failed (non-fatal): %s", method, path, exc)
        return None


def resolve_dataset_id(name: str) -> Optional[str]:
    """Resolve a dataset name → its id via ``GET /datasets``. None if absent."""
    rows = request("GET", "/datasets")
    if not isinstance(rows, list):
        return None
    for row in rows:
        if isinstance(row, dict) and row.get("name") == name:
            return row.get("id")
    return None
