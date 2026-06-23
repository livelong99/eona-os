"""Minimal Jira REST client for the dashboard Planner's JIRA panel.

Reads a small set of issues from Jira and normalizes them to the shape the
dashboard ``planner.ts`` ``JiraItem`` type expects (id / ref / title / status /
points). Read-only and dependency-free (stdlib ``urllib``), best-effort: any
failure (missing config, network error, bad response) returns ``[]`` so the
panel degrades to its mock fallback rather than erroring.

Configuration via environment:
- ``JIRA_URL``       — instance base, e.g. ``https://your-site.atlassian.net`` (required)
- ``JIRA_API_TOKEN`` — API token (Cloud) or personal access token (Server/DC) (required)
- ``JIRA_EMAIL``     — account email. When set, Cloud Basic auth (``email:token``)
                       is used; when absent, a Bearer token (Server/DC PAT) is used.
- ``JIRA_JQL``       — optional JQL override. Defaults to the current user's open
                       issues, most-recently-updated first.

Jira statuses are mapped via the universal ``statusCategory`` (To Do / In
Progress / Done), with a name-based refinement so "In Review"-style statuses
surface as the dashboard's ``review`` column.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DEFAULT_JQL = "assignee = currentUser() ORDER BY updated DESC"
_TIMEOUT_S = 8.0

# Custom-field ids commonly used for "Story Points" across Jira instances. The
# field id is instance-specific, so we probe the well-known defaults in order.
_STORY_POINT_FIELDS = ("customfield_10016", "customfield_10026", "customfield_10002")


def _env(key: str) -> str:
    return os.getenv(key, "").strip()


def is_configured() -> bool:
    """True when the minimum Jira credentials are present."""
    return bool(_env("JIRA_URL") and _env("JIRA_API_TOKEN"))


def _auth_header() -> Optional[str]:
    """Build the Authorization header value, or None if unconfigured.

    Cloud uses Basic ``email:token``; Server/DC PATs use Bearer ``token``.
    """
    token = _env("JIRA_API_TOKEN")
    if not token:
        return None
    email = _env("JIRA_EMAIL")
    if email:
        raw = f"{email}:{token}".encode("utf-8")
        return "Basic " + base64.b64encode(raw).decode("ascii")
    return "Bearer " + token


def _map_status(fields: Dict[str, Any]) -> str:
    """Map a Jira issue's status to the dashboard's todo/inprogress/review/done."""
    status = fields.get("status") or {}
    name = str(status.get("name") or "").lower()
    category = str((status.get("statusCategory") or {}).get("key") or "").lower()
    if "review" in name or "qa" in name:
        return "review"
    if category == "done":
        return "done"
    if category == "indeterminate":
        return "inprogress"
    if category == "new":
        return "todo"
    # Fallback by common name fragments when category is absent.
    if any(w in name for w in ("progress", "doing", "develop")):
        return "inprogress"
    if "done" in name or "closed" in name or "resolved" in name:
        return "done"
    return "todo"


def _extract_points(fields: Dict[str, Any]) -> int:
    """Best-effort story points from common custom fields; 0 when unknown."""
    for fid in _STORY_POINT_FIELDS:
        val = fields.get(fid)
        if isinstance(val, (int, float)) and val > 0:
            return int(val)
    return 0


def fetch_issues(max_results: int = 25) -> List[Dict[str, Any]]:
    """Return up to *max_results* issues as ``JiraItem``-shaped dicts. Never raises."""
    if not is_configured():
        return []
    base = _env("JIRA_URL").rstrip("/")
    auth = _auth_header()
    if not auth:
        return []
    jql = _env("JIRA_JQL") or _DEFAULT_JQL
    fields = ",".join(("summary", "status", *_STORY_POINT_FIELDS))
    query = urllib.parse.urlencode(
        {"jql": jql, "maxResults": max(1, min(int(max_results or 25), 100)), "fields": fields}
    )
    url = f"{base}/rest/api/3/search?{query}"
    req = urllib.request.Request(
        url,
        headers={"Authorization": auth, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError) as exc:
        logger.warning("jira_client: fetch_issues failed: %s", exc)
        return []

    out: List[Dict[str, Any]] = []
    for issue in payload.get("issues") or []:
        if not isinstance(issue, dict):
            continue
        f = issue.get("fields") or {}
        out.append(
            {
                "id": str(issue.get("id") or issue.get("key") or ""),
                "ref": str(issue.get("key") or ""),
                "title": str(f.get("summary") or "").strip() or "(no summary)",
                "status": _map_status(f),
                "points": _extract_points(f),
            }
        )
    return out
