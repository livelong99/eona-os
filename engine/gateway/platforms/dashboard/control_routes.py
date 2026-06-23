"""Control routes — usage rollup, model config, and Planner integrations.

Extracted verbatim from ``api_dashboard.py``. Shared catalog/tier descriptors
and the ``_build_services`` helper are referenced through the ``api_dashboard``
module object so behaviour is unchanged.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from gateway.platforms import api_dashboard as _ad

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)


def register(app: "Any", adapter: "Any") -> None:  # type: ignore[name-defined]
    """Register the Control + Planner-integration routes on the aiohttp app."""
    from aiohttp import web  # local import to match api_server's lazy pattern

    # ------------------------------------------------------------------
    # GET /v1/usage — aggregated usage for Control → Overview.
    # Rolls the state.db ``sessions`` table up into the control.ts shapes
    # (UsageStat[] / spend series / ModelUsage[]) + live system health.
    # Best-effort: on any failure returns 200 with zeroed/static data so the
    # dashboard keeps its mock fallback rather than erroring.
    # ------------------------------------------------------------------
    async def _usage(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from gateway.platforms import usage_aggregate

            db = adapter._ensure_session_db()
            active = len(getattr(adapter, "_active_run_agents", {}) or {})
            view = usage_aggregate.build_usage_view(db, days=14, active_agents=active)
            view["services"] = _ad._build_services()
            return web.json_response(view)
        except Exception as exc:
            logger.exception("/v1/usage failed")
            return web.json_response({"error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/model-config — static catalog merged with persisted roster/routing.
    # PUT /v1/model-config — persist {roster, routing} for Control → Models.
    # ------------------------------------------------------------------
    async def _model_config_get(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from gateway.platforms import model_config_store

            model_config_store.init_db()
            cfg = model_config_store.get_config()
        except Exception as exc:
            logger.exception("/v1/model-config GET failed")
            cfg = {"roster": {}, "routing": {}}
            return web.json_response(
                {"models": _ad._MODEL_CATALOG, "tiers": _ad._ROUTING_TIERS, **cfg, "error": str(exc)}
            )
        return web.json_response({"models": _ad._MODEL_CATALOG, "tiers": _ad._ROUTING_TIERS, **cfg})

    async def _model_config_put(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid_json", "detail": "request body must be JSON"}, status=400
            )
        if not isinstance(body, dict):
            return web.json_response(
                {"error": "invalid_body", "detail": "body must be a JSON object"}, status=400
            )

        valid_ids = {m["id"] for m in _ad._MODEL_CATALOG}
        roster = body.get("roster")
        routing = body.get("routing")

        clean_roster = None
        if isinstance(roster, dict):
            clean_roster = {str(k): bool(v) for k, v in roster.items() if str(k) in valid_ids}

        clean_routing = None
        if isinstance(routing, dict):
            clean_routing = {}
            for tier, mid in routing.items():
                if tier in {"t1", "t2"} and isinstance(mid, str) and mid in valid_ids:
                    clean_routing[tier] = mid

        try:
            from gateway.platforms import model_config_store

            model_config_store.init_db()
            model_config_store.put_config(roster=clean_roster, routing=clean_routing)
            cfg = model_config_store.get_config()
        except Exception as exc:
            logger.exception("/v1/model-config PUT failed")
            return web.json_response({"error": str(exc)}, status=500)
        return web.json_response({"saved": True, **cfg})

    # ------------------------------------------------------------------
    # GET /v1/integrations/jira/items — live Jira issues for the Planner.
    # Returns {items: JiraItem[], configured: bool}. Best-effort: when Jira
    # isn't configured (or the fetch fails) returns an empty list + the flag so
    # the Planner panel falls back to its mock data without erroring.
    # ------------------------------------------------------------------
    async def _jira_items(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from gateway.platforms import jira_client

            if not jira_client.is_configured():
                return web.json_response({"items": [], "configured": False})
            loop = asyncio.get_running_loop()
            items = await loop.run_in_executor(None, jira_client.fetch_issues)
            return web.json_response({"items": items, "configured": True})
        except Exception as exc:
            logger.exception("/v1/integrations/jira/items failed")
            return web.json_response({"items": [], "configured": False, "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/integrations/gmail/messages — recent inbox mail for the Planner.
    # Returns {messages: MailItem[], configured: bool}. Best-effort: when Gmail
    # OAuth isn't set up (or the fetch fails) returns an empty list + the flag so
    # the Planner mail panel falls back to its mock data without erroring.
    # ------------------------------------------------------------------
    async def _gmail_messages(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from gateway.platforms import gmail_client

            if not gmail_client.is_configured():
                return web.json_response({"messages": [], "configured": False})
            loop = asyncio.get_running_loop()
            messages = await loop.run_in_executor(None, gmail_client.fetch_messages)
            return web.json_response({"messages": messages, "configured": True})
        except Exception as exc:
            logger.exception("/v1/integrations/gmail/messages failed")
            return web.json_response({"messages": [], "configured": False, "error": str(exc)})

    # Control screen: Overview usage rollup + Models roster/routing persistence.
    app.router.add_get("/v1/usage", _usage)
    app.router.add_get("/v1/model-config", _model_config_get)
    app.router.add_put("/v1/model-config", _model_config_put)
    # Planner: live Jira issues + Gmail inbox (fall back to mock when unconfigured).
    app.router.add_get("/v1/integrations/jira/items", _jira_items)
    app.router.add_get("/v1/integrations/gmail/messages", _gmail_messages)
