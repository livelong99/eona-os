"""Tests for the shared fail-open Cognee client (``agent.cognee_client``).

Covers JWT login + token caching, the authed ``request`` helper (incl. the
401 re-login retry), dataset-name resolution, and — above all — that every path
is **fail-open**: a login or HTTP failure yields ``None`` and never raises.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from agent import cognee_client


def _resp(payload, status=200):
    """A urlopen context-manager mock returning ``payload`` as JSON."""
    r = MagicMock()
    r.status = status
    r.read.return_value = json.dumps(payload).encode()
    r.__enter__.return_value = r
    r.__exit__.return_value = False
    return r


@pytest.fixture(autouse=True)
def _reset_token():
    cognee_client._TOK["token"] = None
    cognee_client._TOK["at"] = 0.0
    yield
    cognee_client._TOK["token"] = None
    cognee_client._TOK["at"] = 0.0


# ---------------------------------------------------------------------------
# Login + token cache
# ---------------------------------------------------------------------------

def test_login_failure_returns_none_fail_open():
    with patch("urllib.request.urlopen", side_effect=OSError("refused")):
        assert cognee_client.token(force=True) is None  # never raises


def test_login_success_and_cache():
    with patch("urllib.request.urlopen", return_value=_resp({"access_token": "tok123"})) as m:
        assert cognee_client.token(force=True) == "tok123"
        # Second call is cached → no second login.
        assert cognee_client.token() == "tok123"
    assert m.call_count == 1


def test_login_missing_token_returns_none():
    with patch("urllib.request.urlopen", return_value=_resp({"token_type": "bearer"})):
        assert cognee_client.token(force=True) is None


# ---------------------------------------------------------------------------
# request()
# ---------------------------------------------------------------------------

def test_request_without_token_returns_none():
    with patch("agent.cognee_client.token", return_value=None):
        assert cognee_client.request("GET", "/datasets") is None


def test_request_success_returns_parsed_body():
    with patch("agent.cognee_client.token", return_value="tok"), \
         patch("urllib.request.urlopen", return_value=_resp([{"id": "1"}])):
        assert cognee_client.request("GET", "/datasets") == [{"id": "1"}]


def test_request_http_error_is_fail_open():
    import urllib.error
    err = urllib.error.HTTPError("u", 500, "boom", {}, None)
    with patch("agent.cognee_client.token", return_value="tok"), \
         patch("urllib.request.urlopen", side_effect=err):
        assert cognee_client.request("POST", "/recall", json_body={"q": "x"}) is None


def test_request_401_triggers_one_relogin_retry():
    import urllib.error
    calls = {"n": 0}

    def _urlopen(req, timeout=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.HTTPError("u", 401, "expired", {}, None)
        return _resp({"ok": True})

    with patch("agent.cognee_client.token", return_value="tok"), \
         patch("urllib.request.urlopen", side_effect=_urlopen):
        assert cognee_client.request("GET", "/datasets") == {"ok": True}
    assert calls["n"] == 2  # original 401 + one retry


# ---------------------------------------------------------------------------
# resolve_dataset_id
# ---------------------------------------------------------------------------

def test_resolve_dataset_id_matches_by_name():
    rows = [{"id": "a", "name": "other"}, {"id": "b", "name": "vault"}]
    with patch("agent.cognee_client.request", return_value=rows):
        assert cognee_client.resolve_dataset_id("vault") == "b"


def test_resolve_dataset_id_absent_returns_none():
    with patch("agent.cognee_client.request", return_value=[]):
        assert cognee_client.resolve_dataset_id("vault") is None


def test_resolve_dataset_id_request_failure_returns_none():
    with patch("agent.cognee_client.request", return_value=None):
        assert cognee_client.resolve_dataset_id("vault") is None
