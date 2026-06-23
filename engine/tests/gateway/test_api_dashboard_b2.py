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


# ---------------------------------------------------------------------------
# GET /v1/tools/workspace/projects — marker-based listing (perf fix)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_workspace_projects_lists_only_marked(tmp_path, monkeypatch):
    """The workspaces root (10_Projects) holds the user's own projects too, so the
    list endpoint must surface ONLY folders carrying the .agent-home-conf marker —
    and describe them from the marker/workspace.json without walking the tree."""
    import json as _json
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    root = tmp_path / "10_Projects"
    # A real workspace (marked) + its phase state.
    ws = root / "my-ws"
    ws.mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "My WS", "slug": "my-ws", "created": 1.0})
    (ws / "workspace.json").write_text(_json.dumps({"phase": "ready"}), encoding="utf-8")
    # A foreign project (unmarked, with a heavy tree) that must be ignored.
    foreign = root / "agent-home" / "node_modules"
    foreign.mkdir(parents=True)
    (foreign / "junk.js").write_text("x")

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/v1/tools/workspace/projects")
        assert resp.status == 200
        data = await resp.json()

    ids = [p["id"] for p in data["projects"]]
    assert ids == ["my-ws"]  # foreign agent-home skipped
    assert data["projects"][0]["name"] == "My WS"
    assert data["projects"][0]["phase"] == "ready"


# ---------------------------------------------------------------------------
# POST /v1/tools/workspace/exec — build/run/test scripts (streamed logs)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_workspace_exec_streams_build(tmp_path, monkeypatch):
    """exec runs scripts/{script}.sh in the workspace and streams its output + exit."""
    import json as _json
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    ws = tmp_path / "10_Projects" / "demo"
    (ws / "scripts").mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "Demo", "slug": "demo"})
    (ws / "scripts" / "build.sh").write_text("#!/bin/bash\necho hello-build\n", encoding="utf-8")

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        # bad script name → 400
        bad = await client.post("/v1/tools/workspace/exec", json={"slug": "demo", "script": "deploy"})
        assert bad.status == 400
        # unknown workspace → 404
        nows = await client.post("/v1/tools/workspace/exec", json={"slug": "nope", "script": "build"})
        assert nows.status == 404
        # missing script (test.sh not authored) → 404
        miss = await client.post("/v1/tools/workspace/exec", json={"slug": "demo", "script": "test"})
        assert miss.status == 404
        # build streams its output + a 0 exit
        resp = await client.post("/v1/tools/workspace/exec", json={"slug": "demo", "script": "build"})
        assert resp.status == 200
        body = await resp.text()

    events = [_json.loads(l[5:].strip()) for l in body.splitlines() if l.startswith("data:")]
    kinds = [e["type"] for e in events]
    assert kinds[0] == "start"
    assert any(e["type"] == "line" and "hello-build" in e.get("text", "") for e in events)
    exit_ev = next(e for e in events if e["type"] == "exit")
    assert exit_ev["code"] == 0


@pytest.mark.asyncio
async def test_workspace_exec_stop_noop_when_idle(tmp_path, monkeypatch):
    """stop reports not-running when nothing is in flight."""
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    ws = tmp_path / "10_Projects" / "demo2"
    ws.mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "Demo2", "slug": "demo2"})

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/v1/tools/workspace/exec/stop", json={"slug": "demo2", "script": "run"})
        assert resp.status == 200
        assert (await resp.json())["stopped"] is False


# ---------------------------------------------------------------------------
# GET /v1/tools/workspace/browse — local-folder picker (server-side browser)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_workspace_browse_lists_and_contains(tmp_path, monkeypatch):
    """browse lists sub-folders (skipping noise), and never escapes the root."""
    vault = tmp_path / "vault"
    (vault / "10_Projects").mkdir(parents=True)
    (vault / "my-app" / "src").mkdir(parents=True)
    (vault / "my-app" / "node_modules").mkdir()
    (vault / ".hidden").mkdir()
    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(vault / "10_Projects"))
    monkeypatch.setenv("HERMES_BROWSE_ROOT", str(vault))

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        # root listing skips dotdirs; shows real folders
        root = await (await client.get("/v1/tools/workspace/browse")).json()
        names = [e["name"] for e in root["entries"]]
        assert "my-app" in names and "10_Projects" in names
        assert ".hidden" not in names
        assert root["parent"] is None  # can't go above the root

        # navigate in; node_modules is hidden
        sub = await (await client.get(
            f"/v1/tools/workspace/browse?path={vault / 'my-app'}")).json()
        subnames = [e["name"] for e in sub["entries"]]
        assert "src" in subnames and "node_modules" not in subnames
        assert sub["parent"] == str(vault)

        # traversal above the root is clamped back to the root
        esc = await (await client.get("/v1/tools/workspace/browse?path=/etc")).json()
        assert esc["path"] == str(vault)


@pytest.mark.asyncio
async def test_workspace_create_already_onboarded(tmp_path, monkeypatch):
    """Picking a folder that is already a workspace returns 409 already_onboarded
    (with the slug) so the UI can offer to open it — no copy, no relaunch."""
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    ws = tmp_path / "10_Projects" / "tax-genie"
    (ws / "src").mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "Tax Genie", "slug": "tax-genie"})

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/v1/tools/workspace/create", json={
            "name": "Tax Genie", "source_type": "folder", "source_ref": str(ws),
        })
        assert resp.status == 409
        data = await resp.json()
        assert data["error"] == "already_onboarded"
        assert data["slug"] == "tax-genie"


@pytest.mark.asyncio
async def test_workspace_rename_and_scripts_listing(tmp_path, monkeypatch):
    """rename updates the marker + workspace.json; the listing surfaces scripts."""
    import json as _json
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    ws = tmp_path / "10_Projects" / "tax-genie"
    (ws / "scripts").mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "Tax Genie", "slug": "tax-genie"})
    (ws / "workspace.json").write_text(_json.dumps({"name": "Tax Genie", "phase": "ready"}), encoding="utf-8")
    (ws / "scripts" / "build.sh").write_text("#!/bin/bash\necho hi\n", encoding="utf-8")

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        # listing surfaces the on-disk script
        proj = (await (await client.get("/v1/tools/workspace/projects")).json())["projects"][0]
        assert proj["scripts"].get("build") == "scripts/build.sh"
        assert "run" not in proj["scripts"]

        # rename
        r = await client.post("/v1/tools/workspace/rename", json={"slug": "tax-genie", "name": "Tax Wizard"})
        assert r.status == 200
        assert (await r.json())["name"] == "Tax Wizard"

        # reflected in marker, workspace.json, and the listing
        assert _json.loads((ws / d._WORKSPACE_MARKER).read_text())["name"] == "Tax Wizard"
        assert _json.loads((ws / "workspace.json").read_text())["name"] == "Tax Wizard"
        proj2 = (await (await client.get("/v1/tools/workspace/projects")).json())["projects"][0]
        assert proj2["name"] == "Tax Wizard"

        # empty name rejected
        bad = await client.post("/v1/tools/workspace/rename", json={"slug": "tax-genie", "name": "  "})
        assert bad.status == 400
        # unknown workspace
        nope = await client.post("/v1/tools/workspace/rename", json={"slug": "nope", "name": "X"})
        assert nope.status == 404


def test_tool_forge_discovered_as_swarm_template_excluded():
    """Tool Forge is discovered as a swarm tool; its template skeleton (tool.yaml.tmpl)
    is NOT picked up as a real tool, and the manifest serializes the swarm flag."""
    from tools.tool_manifest import discover_manifests
    from gateway.platforms.api_dashboard import _manifest_to_dict
    ms = {m.tool: m for m in discover_manifests()}
    assert "tool-forge" in ms
    forge = ms["tool-forge"]
    assert forge.swarm is True and forge.steering == "CLAUDE.md.tmpl"
    assert [s.id for s in forge.steps] == ["discover", "author", "validate"]
    assert not any("template" in t for t in ms)  # tool.yaml.tmpl must not match discovery
    assert _manifest_to_dict(forge)["swarm"] is True


# ---------------------------------------------------------------------------
# Fix #1: artifact-raw endpoints reject symlinked files (anti-exfiltration)
# ---------------------------------------------------------------------------


def test_artifact_is_symlinked_rejects_symlink_file(tmp_path):
    """A symlink planted in the artifact dir is rejected even when its target
    resolves back inside the same root (validate_within_dir would pass it)."""
    from gateway.platforms.api_dashboard import _artifact_is_symlinked

    root = tmp_path / "brand"
    root.mkdir()
    real = root / "real.html"
    real.write_text("<h1>ok</h1>")
    link = root / "link.html"
    link.symlink_to(real)  # target IS inside root → containment alone passes

    assert _artifact_is_symlinked(link, root) is True
    assert _artifact_is_symlinked(real, root) is False


def test_artifact_is_symlinked_rejects_symlinked_parent(tmp_path):
    """A symlinked intermediate directory component is also rejected."""
    from gateway.platforms.api_dashboard import _artifact_is_symlinked

    root = tmp_path / "brand"
    real_dir = root / "real_sub"
    real_dir.mkdir(parents=True)
    (real_dir / "f.html").write_text("x")
    link_dir = root / "sub"
    link_dir.symlink_to(real_dir)

    # candidate path goes through the symlinked dir component
    assert _artifact_is_symlinked(link_dir / "f.html", root) is True
    # the genuine path through the real dir is fine
    assert _artifact_is_symlinked(real_dir / "f.html", root) is False


def test_artifact_is_symlinked_escaping_target(tmp_path):
    """A symlink whose target escapes the host root is rejected too."""
    from gateway.platforms.api_dashboard import _artifact_is_symlinked

    secret = tmp_path / "secret.txt"
    secret.write_text("topsecret")
    root = tmp_path / "brand"
    root.mkdir()
    link = root / "leak.txt"
    link.symlink_to(secret)

    assert _artifact_is_symlinked(link, root) is True


# ---------------------------------------------------------------------------
# Fix #2: USER-authored tools' artifacts_root is clamped to approved bases
# ---------------------------------------------------------------------------


def test_collection_root_clamps_escaping_user_tool(tmp_path, monkeypatch):
    """A user-authored tool whose artifacts_root escapes /opt/data + the vault is
    clamped to the Brands root rather than honoured."""
    from gateway.platforms import api_dashboard as ad

    data_root = tmp_path / "data"
    user_tools = data_root / "skills"
    user_tools.mkdir(parents=True)
    vault = tmp_path / "vault"
    vault.mkdir()
    monkeypatch.setenv("HERMES_USER_TOOLS_ROOT", str(user_tools))
    monkeypatch.setenv("HERMES_VAULT_PATH", str(vault))

    # Manifest discovered UNDER the writable user-tools root, pointing OUTSIDE
    # every approved base (straight at /etc).
    evil = MagicMock()
    evil.tool = "evil"
    evil.artifacts_root = "/etc/{x}/"
    evil.source_path = str(user_tools / "evil" / "tool.yaml")

    with patch.object(ad, "_manifest_for", return_value=evil):
        root = ad._collection_root_for("evil")
    assert root == ad._brands_root()


def test_collection_root_allows_contained_user_tool(tmp_path, monkeypatch):
    """A user-authored tool whose artifacts_root stays inside /opt/data is honoured."""
    from gateway.platforms import api_dashboard as ad

    data_root = tmp_path / "data"
    user_tools = data_root / "skills"
    user_tools.mkdir(parents=True)
    monkeypatch.setenv("HERMES_USER_TOOLS_ROOT", str(user_tools))
    monkeypatch.delenv("HERMES_VAULT_PATH", raising=False)

    ok = MagicMock()
    ok.tool = "ok"
    ok.artifacts_root = str(data_root / "ok-out") + "/{x}/"
    ok.source_path = str(user_tools / "ok" / "tool.yaml")

    with patch.object(ad, "_manifest_for", return_value=ok):
        root = ad._collection_root_for("ok")
    assert root == data_root / "ok-out"


def test_collection_root_builtin_tool_not_clamped(tmp_path, monkeypatch):
    """A built-in tool (manifest OUTSIDE the user-tools root) keeps its artifacts_root
    even when it points outside the approved bases — built-ins are trusted."""
    from gateway.platforms import api_dashboard as ad

    user_tools = tmp_path / "data" / "skills"
    user_tools.mkdir(parents=True)
    monkeypatch.setenv("HERMES_USER_TOOLS_ROOT", str(user_tools))

    builtin = MagicMock()
    builtin.tool = "workspace"
    builtin.artifacts_root = str(tmp_path / "anywhere") + "/{name}/"
    # source_path lives under a read-only repo root, NOT the user-tools root.
    builtin.source_path = str(tmp_path / "repo" / "skills" / "workspace" / "tool.yaml")

    with patch.object(ad, "_manifest_for", return_value=builtin):
        root = ad._collection_root_for("workspace")
    assert root == tmp_path / "anywhere"


@pytest.mark.asyncio
async def test_workspace_resume(tmp_path, monkeypatch):
    """Resume relaunches an existing workspace (no ingest): 404 unknown, 400 no
    slug, 202 + a registered run record (run_cwd + recovered name) for a real one."""
    import json as _json
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    ws = tmp_path / "10_Projects" / "deck"
    ws.mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "Deck", "slug": "deck"})
    (ws / "workspace.json").write_text(_json.dumps({"name": "Deck Heads", "phase": "ready"}), encoding="utf-8")
    # Stub the launch so no real claude run starts.
    monkeypatch.setattr(d, "_start_run", lambda *a, **k: None)
    monkeypatch.setattr(d, "_provision_swarm_session", lambda *a, **k: str(ws))

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        assert (await client.post("/v1/tools/workspace/resume", json={"slug": "nope"})).status == 404
        assert (await client.post("/v1/tools/workspace/resume", json={})).status == 400
        r = await client.post("/v1/tools/workspace/resume", json={"slug": "deck"})
        assert r.status == 202
        data = await r.json()
        assert data["workspace_id"] == "deck" and data["run_id"].startswith("run_")
        rec = d._run_registry()[data["run_id"]]
        assert rec["run_cwd"] == str(ws) and rec["brand"] == "Deck Heads" and rec["tool_id"] == "workspace"


@pytest.mark.asyncio
async def test_workspace_git_status(tmp_path, monkeypatch):
    """git endpoint reports branch + commits for a repo workspace; 404 unknown."""
    import os
    import subprocess
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    ws = tmp_path / "10_Projects" / "repo"
    ws.mkdir(parents=True)
    d._write_workspace_marker(ws, {"name": "Repo", "slug": "repo"})
    env = {**os.environ, "GIT_AUTHOR_NAME": "T", "GIT_AUTHOR_EMAIL": "t@x", "GIT_COMMITTER_NAME": "T", "GIT_COMMITTER_EMAIL": "t@x"}
    for args in (["init", "-q"], ["add", "-A"], ["commit", "-qm", "first commit", "--allow-empty"]):
        subprocess.run(["git", "-C", str(ws), *args], check=True, env=env, capture_output=True)

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        assert (await client.get("/v1/tools/workspace/git?slug=nope")).status == 404
        r = await client.get("/v1/tools/workspace/git?slug=repo")
        assert r.status == 200
        data = await r.json()
        assert data["is_repo"] is True
        assert data["branch"]  # some branch name
        assert any("first commit" == c["subject"] for c in data["commits"])
        assert data["has_upstream"] is False  # no remote in the test repo


@pytest.mark.asyncio
async def test_workspace_git_parent_scoping_and_init(tmp_path, monkeypatch):
    """A folder inside a parent repo reports is_repo=false (+in_parent_repo); git
    init makes it its OWN repo with an initial commit."""
    import os
    import subprocess
    from gateway.platforms import api_dashboard as d

    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    root = tmp_path / "10_Projects"
    root.mkdir(parents=True)
    subprocess.run(["git", "-C", str(root), "init", "-q"], check=True, capture_output=True)  # parent repo
    ws = root / "deck"
    ws.mkdir()
    d._write_workspace_marker(ws, {"name": "Deck", "slug": "deck"})
    (ws / "file.txt").write_text("hi", encoding="utf-8")

    adapter = _make_adapter()
    app = _create_dashboard_app(adapter)
    async with TestClient(TestServer(app)) as client:
        s = await (await client.get("/v1/tools/workspace/git?slug=deck")).json()
        assert s["is_repo"] is False and s.get("in_parent_repo") is True
        r = await client.post("/v1/tools/workspace/git/init", json={"slug": "deck"})
        assert r.status == 200 and (await r.json())["ok"] is True
        s2 = await (await client.get("/v1/tools/workspace/git?slug=deck")).json()
        assert s2["is_repo"] is True
        assert any(c["subject"] == "Initial commit" for c in s2["commits"])
