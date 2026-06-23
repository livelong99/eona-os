"""Brainstorm swarm enablers — provisioning, artifact-dir routing, promote copy.

Covers the engine helpers added for the PM-orchestrated brainstorm tool without
spinning the full aiohttp app: writable-root routing (brainstorm sessions live on
the rw data mount, not the read-only vault), session provisioning (folder +
steering CLAUDE.md + idempotency), and the promote folder copy.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from gateway.platforms import api_dashboard as d
from tools.tool_manifest import load_manifest

SKILL_TOOL = (
    Path(__file__).resolve().parents[2]
    / ".." / ".claude" / "skills" / "bmad-agent-brainstorm" / "tool.yaml"
)


@pytest.fixture
def env(tmp_path, monkeypatch):
    # Vault stays for Brand Maker's path; brainstorm + workspaces live on writable
    # roots pointed at tmp so the test never touches /opt/data or the real vault.
    monkeypatch.setenv("HERMES_VAULT_PATH", str(tmp_path))
    monkeypatch.setenv("HERMES_BRAINSTORM_ROOT", str(tmp_path / "brainstorms"))
    monkeypatch.setenv("HERMES_DATA_PATH", str(tmp_path / "data"))
    monkeypatch.delenv("HERMES_WORKSPACES_PATH", raising=False)
    monkeypatch.setenv("HERMES_DISABLE_RUFLO_INIT", "1")  # don't spawn npx in tests
    return tmp_path


@pytest.fixture
def manifest():
    return load_manifest(SKILL_TOOL)


def test_manifest_swarm_flags(manifest):
    assert manifest.tool == "brainstorm"
    assert manifest.swarm is True
    assert manifest.steering == "CLAUDE.md.tmpl"
    assert [s.id for s in manifest.steps] == ["clarify", "prd"]
    assert manifest.steps[0].ui == "qna-json"


def test_env_template_expansion(env):
    # ${VAR:-default} honours the env when set, the default otherwise.
    assert d._expand_env_template("${HERMES_BRAINSTORM_ROOT:-/opt/data/brainstorms}") == str(
        env / "brainstorms"
    )
    assert d._expand_env_template("${NOPE_UNSET:-/fallback}") == "/fallback"


def test_root_from_manifest_strips_placeholder(env, manifest):
    assert d._root_from_manifest(manifest) == env / "brainstorms"
    assert d._root_from_manifest(None) is None


def test_artifacts_dir_brainstorm_vs_brands(env):
    bs = d._artifacts_dir_for("brainstorm", {"brand": "Smart Pantry"})
    assert bs == env / "brainstorms" / "smart-pantry"
    bm = d._artifacts_dir_for("brand-maker", {"brand": "Acme Co"})
    assert bm == env / "30_Resources" / "Brands" / "acme-co"
    assert d._artifacts_dir_for("brainstorm", {"brand": ""}) is None


def test_collection_root_routing(env):
    assert d._collection_root_for("brainstorm") == env / "brainstorms"
    # unknown tool → no manifest → vault Brands fallback.
    assert d._collection_root_for("nope") == env / "30_Resources" / "Brands"


def test_provision_creates_folder_and_steering(env, manifest):
    folder = d._provision_swarm_session(manifest, "smart-pantry", "Smart Pantry", "A pantry tracker")
    assert folder == env / "brainstorms" / "smart-pantry"
    steering = (folder / "CLAUDE.md").read_text(encoding="utf-8")
    assert "Smart Pantry" in steering
    assert "smart-pantry" in steering
    assert "A pantry tracker" in steering
    assert str(folder) in steering  # absolute SESSION_FOLDER substituted
    assert (folder / ".swarm-provisioned").exists()


def test_provision_is_idempotent(env, manifest):
    folder = d._provision_swarm_session(manifest, "smart-pantry", "Smart Pantry", "first")
    again = d._provision_swarm_session(manifest, "smart-pantry", "Smart Pantry", "second")
    assert again == folder
    assert "first" in (folder / "CLAUDE.md").read_text(encoding="utf-8")


def test_swarm_mcp_servers_shape():
    servers = d._SWARM_MCP_SERVERS
    assert "claude-flow" in servers
    assert "command" in servers["claude-flow"]
    assert isinstance(servers["claude-flow"]["args"], list)


def test_workspaces_root_default_and_override(env, monkeypatch):
    # default lands on the writable data mount, not the read-only vault.
    assert d._workspaces_root() == env / "data" / "workspaces"
    monkeypatch.setenv("HERMES_WORKSPACES_PATH", str(env / "custom-ws"))
    assert d._workspaces_root() == env / "custom-ws"


def test_artifact_content_type_json():
    assert d._artifact_content_type("qna.json").startswith("application/json")
    assert d._artifact_content_type("prd.md").startswith("text/markdown")
