"""Tests for B2 endpoints: POST /v1/tools/{tool_id}/launch and POST /v1/goal.

Covers:
- 404 on unknown tool_id
- 400 on missing/empty objective
- 202 + run_id returned for valid launch
- 202 + run_id + session_id returned for valid goal
- _start_run registers run in adapter._run_streams
- goal.verdict event is emitted by the judge loop
- missing/empty body handled gracefully
"""

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from gateway.config import PlatformConfig
from gateway.platforms.api_server import (
    APIServerAdapter,
    cors_middleware,
    security_headers_middleware,
)
from gateway.platforms.api_dashboard import register_dashboard_routes, _start_run


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _make_adapter(api_key: str = "") -> APIServerAdapter:
    extra = {}
    if api_key:
        extra["key"] = api_key
    config = PlatformConfig(enabled=True, extra=extra)
    adapter = APIServerAdapter(config)
    # Stub _background_tasks as a plain set (the real class uses this)
    adapter._background_tasks = set()
    return adapter


def _create_dashboard_app(adapter: APIServerAdapter) -> web.Application:
    """Create an aiohttp app with dashboard + run-events routes."""
    mws = [mw for mw in (cors_middleware, security_headers_middleware) if mw is not None]
    app = web.Application(middlewares=mws)
    app["api_server_adapter"] = adapter
    register_dashboard_routes(app, adapter)
    # Wire run-events route so tests can assert SSE behaviour.
    app.router.add_get("/v1/runs/{run_id}", adapter._handle_get_run)
    app.router.add_get("/v1/runs/{run_id}/events", adapter._handle_run_events)
    return app


def _fake_manifest(tool_id: str = "brand-maker", skill: str = "gds-agent-brand-maker"):
    """Return a minimal ToolManifest-like object."""
    m = MagicMock()
    m.tool = tool_id
    m.title = "Test Tool"
    m.skill = skill
    m.steps = []
    m.inputs = []
    m.description = None
    return m


def _fast_agent_factory(response_text: str = "done"):
    """Return an agent factory whose run_conversation returns immediately."""
    def _factory(**kwargs):
        agent = MagicMock()
        agent.run_event_callback = None
        agent.run_conversation.return_value = {"final_response": response_text, "completed": True}
        agent.session_prompt_tokens = 1
        agent.session_completion_tokens = 2
        agent.session_total_tokens = 3
        return agent
    return _factory


# ---------------------------------------------------------------------------
# POST /v1/tools/{tool_id}/launch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tool_launch_404_unknown_tool():
    """Unknown tool_id returns 404."""
    adapter = _make_adapter()

    with patch("tools.tool_manifest.discover_manifests", return_value=[]):
        app = _create_dashboard_app(adapter)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post("/v1/tools/no-such-tool/launch", json={})
            assert resp.status == 404
            body = await resp.json()
            assert body["error"] == "tool_not_found"


@pytest.mark.asyncio
async def test_tool_launch_returns_run_id():
    """Valid tool_id returns 202 with run_id."""
    adapter = _make_adapter()
    manifest = _fake_manifest()

    with (
        patch("tools.tool_manifest.discover_manifests", return_value=[manifest]),
        patch.object(adapter, "_create_agent", side_effect=_fast_agent_factory()),
        patch("gateway.session_context.set_session_vars", return_value=[]),
        patch("gateway.session_context.clear_session_vars"),
        patch("tools.approval.set_current_session_key", return_value=None),
        patch("tools.approval.reset_current_session_key"),
        patch("tools.approval.register_gateway_notify"),
        patch("tools.approval.unregister_gateway_notify"),
    ):
        app = _create_dashboard_app(adapter)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/v1/tools/brand-maker/launch",
                json={"inputs": {"brand": "Acme"}},
            )
            assert resp.status == 202
            body = await resp.json()
            assert "run_id" in body
            assert body["run_id"].startswith("run_")


@pytest.mark.asyncio
async def test_tool_launch_no_body_ok():
    """Omitted body defaults inputs to {} — still returns 202."""
    adapter = _make_adapter()
    manifest = _fake_manifest()

    with (
        patch("tools.tool_manifest.discover_manifests", return_value=[manifest]),
        patch.object(adapter, "_create_agent", side_effect=_fast_agent_factory()),
        patch("gateway.session_context.set_session_vars", return_value=[]),
        patch("gateway.session_context.clear_session_vars"),
        patch("tools.approval.set_current_session_key", return_value=None),
        patch("tools.approval.reset_current_session_key"),
        patch("tools.approval.register_gateway_notify"),
        patch("tools.approval.unregister_gateway_notify"),
    ):
        app = _create_dashboard_app(adapter)
        async with TestClient(TestServer(app)) as client:
            # Send with no body at all
            resp = await client.post("/v1/tools/brand-maker/launch")
            assert resp.status == 202
            body = await resp.json()
            assert "run_id" in body


@pytest.mark.asyncio
async def test_tool_launch_invalid_tool_id_slash():
    """tool_id with a path separator returns 400."""
    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    # aiohttp won't route a slash in path segment — test the guard
    # by hitting a valid-looking URL; the guard fires on ".." not "/".
    # For double-dot:
    async with TestClient(TestServer(app)) as client:
        # This will 404 at aiohttp routing level before our handler,
        # which is also acceptable.  Test that we at least don't 500.
        resp = await client.post("/v1/tools/../etc/launch", json={})
        assert resp.status in (400, 404)


# ---------------------------------------------------------------------------
# POST /v1/goal
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_goal_missing_objective_returns_400():
    """Missing 'objective' field → 400."""
    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/v1/goal", json={"max_turns": 5})
        assert resp.status == 400
        body = await resp.json()
        assert body["error"] == "missing_objective"


@pytest.mark.asyncio
async def test_goal_empty_objective_returns_400():
    """Empty-string 'objective' → 400."""
    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/v1/goal", json={"objective": "   "})
        assert resp.status == 400
        body = await resp.json()
        assert body["error"] == "missing_objective"


@pytest.mark.asyncio
async def test_goal_returns_run_id_and_session_id():
    """Valid objective → 202 with run_id + session_id."""
    adapter = _make_adapter()

    fake_gm = MagicMock()
    fake_gm.set.return_value = MagicMock(status="active")

    with (
        patch("hermes_cli.goals.GoalManager", return_value=fake_gm),
        patch.object(adapter, "_create_agent", side_effect=_fast_agent_factory()),
        patch("gateway.session_context.set_session_vars", return_value=[]),
        patch("gateway.session_context.clear_session_vars"),
        patch("tools.approval.set_current_session_key", return_value=None),
        patch("tools.approval.reset_current_session_key"),
        patch("tools.approval.register_gateway_notify"),
        patch("tools.approval.unregister_gateway_notify"),
    ):
        app = _create_dashboard_app(adapter)
        async with TestClient(TestServer(app)) as client:
            resp = await client.post(
                "/v1/goal",
                json={"objective": "Write a haiku about Rust.", "max_turns": 3},
            )
            assert resp.status == 202
            body = await resp.json()
            assert "run_id" in body
            assert body["run_id"].startswith("run_")
            assert "session_id" in body


@pytest.mark.asyncio
async def test_goal_invalid_max_turns_returns_400():
    """Non-integer max_turns → 400."""
    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post(
            "/v1/goal",
            json={"objective": "valid goal", "max_turns": "not-a-number"},
        )
        assert resp.status == 400
        body = await resp.json()
        assert body["error"] == "invalid_max_turns"


# ---------------------------------------------------------------------------
# _start_run unit test — registers in adapter._run_streams
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_run_registers_in_run_streams():
    """_start_run populates adapter._run_streams with the run_id key."""
    adapter = _make_adapter()
    adapter._background_tasks = set()

    run_id = "run_test_abc123"
    session_id = "session_test_abc123"

    with (
        patch.object(adapter, "_create_agent", side_effect=_fast_agent_factory()),
        patch("gateway.session_context.set_session_vars", return_value=[]),
        patch("gateway.session_context.clear_session_vars"),
        patch("tools.approval.set_current_session_key", return_value=None),
        patch("tools.approval.reset_current_session_key"),
        patch("tools.approval.register_gateway_notify"),
        patch("tools.approval.unregister_gateway_notify"),
    ):
        # _start_run must be called from within a running loop.
        async def _do():
            _start_run(adapter, run_id, "hello", session_id)
            # The queue is registered synchronously before the task fires.
            assert run_id in adapter._run_streams
            assert run_id in adapter._run_streams_created
            assert run_id in adapter._run_approval_sessions

        await _do()


# ---------------------------------------------------------------------------
# goal.verdict event emitted by judge loop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_goal_judge_loop_emits_verdict_event():
    """When judge returns done=True, a goal.verdict event lands in the queue."""
    adapter = _make_adapter()
    adapter._background_tasks = set()

    run_id = "run_goal_test_xyz"
    session_id = "goal-test-xyz"

    # GoalManager that immediately says done.
    fake_gm = MagicMock()
    fake_gm.evaluate_after_turn.return_value = {
        "status": "done",
        "should_continue": False,
        "continuation_prompt": None,
        "verdict": "done",
        "reason": "test complete",
        "message": "done",
    }

    with (
        patch.object(adapter, "_create_agent", side_effect=_fast_agent_factory("result text")),
        patch("gateway.session_context.set_session_vars", return_value=[]),
        patch("gateway.session_context.clear_session_vars"),
        patch("tools.approval.set_current_session_key", return_value=None),
        patch("tools.approval.reset_current_session_key"),
        patch("tools.approval.register_gateway_notify"),
        patch("tools.approval.unregister_gateway_notify"),
    ):
        async def _do():
            _start_run(adapter, run_id, "do something", session_id, goal_manager=fake_gm)
            q = adapter._run_streams[run_id]

            # Drain events until we see goal.verdict or the sentinel None.
            events = []
            for _ in range(30):
                try:
                    item = await asyncio.wait_for(q.get(), timeout=2.0)
                except asyncio.TimeoutError:
                    break
                if item is None:
                    break
                events.append(item)

            kinds = [e.get("event") for e in events]
            assert "goal.verdict" in kinds, f"Expected goal.verdict in {kinds}"

            verdict_ev = next(e for e in events if e.get("event") == "goal.verdict")
            assert verdict_ev["verdict"] == "done"
            assert verdict_ev["reason"] == "test complete"

        await _do()
