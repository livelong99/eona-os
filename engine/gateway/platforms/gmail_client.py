"""Minimal Gmail reader for the dashboard Planner's inbox-triage panel.

Reads a handful of recent inbox messages and normalizes them to the shape the
dashboard ``planner.ts`` ``MailItem`` type expects (id / from / subject /
preview / tier / time). Read-only, dependency-free (stdlib ``urllib``), and
best-effort: any failure (not authed, network error, bad response) returns ``[]``
so the panel degrades to its mock fallback rather than erroring.

Auth, in priority order:
1. The **Google Workspace skill** token at ``~/.hermes/google_token.json`` — the
   gmail-scoped credential (``gmail.readonly``). Stored in google-auth
   ``authorized_user`` form with an embedded ``client_id``/``client_secret``/
   ``refresh_token``; refreshed here with stdlib (no ``google-auth`` dependency).
2. Fallback: the engine's ``agent/google_oauth.py`` token (``get_valid_access_token``)
   — note this is typically Gemini-scoped and may lack Gmail access.

When neither is present this module reports ``is_configured() == False`` and the
panel keeps its mock fallback.

``tier`` is a lightweight triage classification derived from Gmail labels and a
few subject keywords (Action / Meeting / FYI) — it is heuristic, not Gmail-native.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_API = "https://gmail.googleapis.com/gmail/v1/users/me"
_TOKEN_URI = "https://oauth2.googleapis.com/token"
_TIMEOUT_S = 8.0
_DEFAULT_QUERY = "in:inbox newer_than:7d"


def _workspace_token_path() -> Optional[Path]:
    """Path to the Google Workspace skill token, or None if home is unresolved."""
    try:
        from hermes_constants import get_hermes_home  # type: ignore

        return get_hermes_home() / "google_token.json"
    except Exception:
        p = Path(os.path.expanduser("~/.hermes/google_token.json"))
        return p


def _workspace_token_present() -> bool:
    p = _workspace_token_path()
    return bool(p and p.exists())


def _expired(expiry: Any) -> bool:
    """True when a google-auth ``expiry`` ISO string is past (or unparseable)."""
    if not expiry:
        return True
    try:
        s = str(expiry).replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return datetime.now(tz=timezone.utc).timestamp() >= dt.timestamp() - 60
    except Exception:
        return True


def _refresh_workspace_token(data: Dict[str, Any]) -> Optional[str]:
    """Exchange the stored refresh token for a fresh access token (stdlib)."""
    refresh = data.get("refresh_token")
    cid = data.get("client_id")
    secret = data.get("client_secret")
    if not (refresh and cid and secret):
        return None
    body = urllib.parse.urlencode(
        {"grant_type": "refresh_token", "client_id": cid, "client_secret": secret, "refresh_token": refresh}
    ).encode("ascii")
    uri = str(data.get("token_uri") or _TOKEN_URI)
    req = urllib.request.Request(
        uri, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError) as exc:
        logger.warning("gmail_client: workspace token refresh failed: %s", exc)
        return None
    new_token = str(payload.get("access_token") or "").strip()
    if not new_token:
        return None
    # Best-effort write-back so we don't refresh on every call.
    try:
        expires_in = int(payload.get("expires_in") or 0)
        if expires_in > 0:
            new_expiry = datetime.fromtimestamp(
                datetime.now(tz=timezone.utc).timestamp() + expires_in, tz=timezone.utc
            ).strftime("%Y-%m-%dT%H:%M:%SZ")
            data = {**data, "token": new_token, "expiry": new_expiry}
            p = _workspace_token_path()
            if p:
                p.write_text(json.dumps(data, indent=2))
    except Exception:
        logger.debug("gmail_client: token write-back failed", exc_info=True)
    return new_token


def _workspace_access_token() -> Optional[str]:
    """Return a valid access token from the Workspace skill store, or None."""
    p = _workspace_token_path()
    if not p or not p.exists():
        return None
    try:
        data = json.loads(p.read_text())
    except Exception as exc:
        logger.warning("gmail_client: could not read %s: %s", p, exc)
        return None
    # authorized_user stores the access token under "token"; tolerate "access".
    token = str(data.get("token") or data.get("access") or "").strip() or None
    if token and not _expired(data.get("expiry")):
        return token
    refreshed = _refresh_workspace_token(data)
    return refreshed or token

# Subject/snippet keywords that mark a message as a meeting-type item.
_MEETING_WORDS = ("invite", "meeting", "sync", "standup", "stand-up", "1:1", "call", "calendar")
# Gmail bulk categories that should never be treated as "action".
_BULK_LABELS = {"CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"}


def _load_oauth():
    """Return the google_oauth module, or None if unavailable."""
    try:
        from agent import google_oauth  # type: ignore

        return google_oauth
    except Exception:
        logger.debug("gmail_client: google_oauth import failed", exc_info=True)
        return None


def is_configured() -> bool:
    """True when a usable Google credential is present.

    Prefers the gmail-scoped Workspace token; otherwise reports True when the
    engine's google_oauth credential exists (it may lack Gmail scope, in which
    case the fetch returns empty and the panel keeps its mock data).
    """
    if _workspace_token_present():
        return True
    oauth = _load_oauth()
    if oauth is None:
        return False
    try:
        return oauth.load_credentials() is not None
    except Exception:
        return False


def _access_token() -> Optional[str]:
    """Best access token: gmail-scoped Workspace token, else google_oauth."""
    tok = _workspace_access_token()
    if tok:
        return tok
    oauth = _load_oauth()
    if oauth is None:
        return None
    try:
        return oauth.get_valid_access_token() or None
    except Exception as exc:
        logger.warning("gmail_client: could not obtain access token: %s", exc)
        return None


def _get(url: str, token: str) -> Optional[Dict[str, Any]]:
    req = urllib.request.Request(
        url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}, method="GET"
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError) as exc:
        logger.warning("gmail_client: GET failed (%s): %s", url.split("?")[0], exc)
        return None


def _header(headers: List[Dict[str, str]], name: str) -> str:
    low = name.lower()
    for h in headers or []:
        if str(h.get("name", "")).lower() == low:
            return str(h.get("value", "") or "")
    return ""


def _display_from(raw: str) -> str:
    """Extract the sender display name from a From header, else the address."""
    raw = (raw or "").strip()
    if "<" in raw:
        name = raw.split("<", 1)[0].strip().strip('"')
        if name:
            return name
        return raw.split("<", 1)[1].rstrip(">").strip()
    return raw


def _fmt_time(internal_date_ms: Any) -> str:
    """Format a Gmail internalDate (ms epoch) as HH:MM / Yesterday / 'Mon D' (UTC)."""
    try:
        ts = int(internal_date_ms) / 1000.0
    except (TypeError, ValueError):
        return ""
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    now = datetime.now(tz=timezone.utc)
    days = (now.date() - dt.date()).days
    if days <= 0:
        return dt.strftime("%H:%M")
    if days == 1:
        return "Yesterday"
    return dt.strftime("%b %-d") if os.name != "nt" else dt.strftime("%b %d")


def _classify(subject: str, snippet: str, labels: List[str]) -> str:
    text = f"{subject} {snippet}".lower()
    label_set = set(labels or [])
    if any(w in text for w in _MEETING_WORDS):
        return "meeting"
    important = "IMPORTANT" in label_set or "STARRED" in label_set
    bulk = bool(label_set & _BULK_LABELS)
    if important and not bulk:
        return "action"
    return "info"


def fetch_messages(max_results: int = 8) -> List[Dict[str, Any]]:
    """Return up to *max_results* inbox messages as ``MailItem``-shaped dicts.

    Never raises — returns ``[]`` on any failure (incl. not configured).
    """
    if not is_configured():
        return []
    token = _access_token()
    if not token:
        return []

    n = max(1, min(int(max_results or 8), 25))
    q = os.getenv("GMAIL_QUERY", "").strip() or _DEFAULT_QUERY
    list_url = f"{_API}/messages?" + urllib.parse.urlencode({"maxResults": n, "q": q})
    listing = _get(list_url, token)
    if not listing:
        return []

    out: List[Dict[str, Any]] = []
    for ref in listing.get("messages") or []:
        mid = ref.get("id") if isinstance(ref, dict) else None
        if not mid:
            continue
        detail_url = (
            f"{_API}/messages/{urllib.parse.quote(str(mid))}?"
            + urllib.parse.urlencode(
                [("format", "metadata"), ("metadataHeaders", "From"),
                 ("metadataHeaders", "Subject"), ("metadataHeaders", "Date")]
            )
        )
        msg = _get(detail_url, token)
        if not msg:
            continue
        headers = (msg.get("payload") or {}).get("headers") or []
        subject = _header(headers, "Subject") or "(no subject)"
        snippet = str(msg.get("snippet") or "")
        labels = msg.get("labelIds") or []
        out.append(
            {
                "id": str(msg.get("id") or mid),
                "from": _display_from(_header(headers, "From")) or "(unknown sender)",
                "subject": subject,
                "preview": snippet,
                "tier": _classify(subject, snippet, labels),
                "time": _fmt_time(msg.get("internalDate")),
            }
        )
    return out
