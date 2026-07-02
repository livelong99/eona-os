"""Workspace orchestrator — manifest, ingest, and path resolution.

Covers the engine helpers for the Architect-orchestrated workspace tool without
spinning the full aiohttp app: manifest flags, the writable workspaces root, and
the three ingest sources (folder copy with VCS/heavy-dir skip, brainstorm copy,
github URL validation), plus the non-empty guard.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from gateway.platforms import api_dashboard as d
from tools.tool_manifest import load_manifest

SKILL_TOOL = (
    Path(__file__).resolve().parents[2]
    / ".." / ".claude" / "skills" / "bmad-agent-workspace" / "tool.yaml"
)


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_WORKSPACES_ROOT", str(tmp_path / "10_Projects"))
    monkeypatch.setenv("HERMES_BRAINSTORM_ROOT", str(tmp_path / "brainstorms"))
    monkeypatch.setenv("HERMES_DISABLE_RUFLO_INIT", "1")
    return tmp_path


def test_manifest_flags():
    m = load_manifest(SKILL_TOOL)
    assert m.tool == "workspace"
    assert m.swarm is True
    assert m.steering == "CLAUDE.md.tmpl"
    assert [s.id for s in m.steps] == ["provision", "design", "sprint", "implement"]


def test_workspace_root_and_dir(env):
    assert d._collection_root_for("workspace") == env / "10_Projects"
    assert d._artifacts_dir_for("workspace", {"brand": "Acme App"}) == env / "10_Projects" / "acme-app"


def test_ingest_folder_skips_heavy_dirs(env):
    src = env / "src"
    (src / "docs").mkdir(parents=True)
    (src / "README.md").write_text("hi")
    (src / "docs" / "prd.md").write_text("# PRD")
    (src / "node_modules").mkdir()
    (src / "node_modules" / "junk.js").write_text("x")
    dest = env / "10_Projects" / "acme-app"
    d._ingest_workspace("folder", str(src), dest)
    names = sorted(p.name for p in dest.rglob("*") if p.is_file())
    assert names == ["README.md", "prd.md"]
    assert not (dest / "node_modules").exists()


def test_ingest_non_empty_guard(env):
    src = env / "src"
    src.mkdir()
    (src / "a.txt").write_text("a")
    dest = env / "10_Projects" / "ws"
    d._ingest_workspace("folder", str(src), dest)
    with pytest.raises(ValueError, match="already exists"):
        d._ingest_workspace("folder", str(src), dest)


def test_ingest_brainstorm_seeds_prd_only(env):
    # promoting a brainstorm seeds the workspace with the PRD/docs but NOT the
    # brainstorm's own state files (qna/readiness/steering) — it provisions fresh.
    bs = env / "brainstorms" / "smart-pantry"
    bs.mkdir(parents=True)
    (bs / "prd.md").write_text("# Smart Pantry PRD")
    (bs / "qna.json").write_text("{}")
    (bs / "readiness.json").write_text("{}")
    (bs / "CLAUDE.md").write_text("brainstorm steering")
    dest = env / "10_Projects" / "smart-pantry"
    d._ingest_workspace("brainstorm", "Smart Pantry", dest)
    assert (dest / "prd.md").read_text() == "# Smart Pantry PRD"
    assert not (dest / "qna.json").exists()
    assert not (dest / "readiness.json").exists()
    assert not (dest / "CLAUDE.md").exists()


def test_ingest_github_url_validation(env):
    dest = env / "10_Projects" / "bad"
    # https on an allowed host only — bare strings, git@ SSH (SSRF), and
    # disallowed hosts are all rejected before any clone runs.
    for bad in ("not-a-url", "git@github.com:o/r.git", "https://evil.example.com/o/r.git"):
        with pytest.raises(ValueError, match="allowed host"):
            d._ingest_workspace("github", bad, dest)


def test_ingest_unknown_source(env):
    with pytest.raises(ValueError, match="unknown source_type"):
        d._ingest_workspace("ftp", "x", env / "10_Projects" / "x")


def test_ingest_folder_multi_root_containment(env, monkeypatch, tmp_path):
    """HERMES_BROWSE_ROOTS (pathsep list) allows a folder source from ANY
    configured root, not just the workspaces root — and still rejects a source
    outside every configured root."""
    import os as _os

    workspaces_root = env / "10_Projects"
    external_root = tmp_path.parent / f"{tmp_path.name}-external"
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    (external_root / "proj-a").mkdir(parents=True)
    (external_root / "proj-a" / "README.md").write_text("hi")
    (outside / "proj-b").mkdir(parents=True)
    monkeypatch.setenv("HERMES_BROWSE_ROOTS", f"{workspaces_root}{_os.pathsep}{external_root}")

    # A source under the SECOND configured root (not the workspaces root) succeeds.
    dest = workspaces_root / "proj-a"
    d._ingest_workspace("folder", str(external_root / "proj-a"), dest)
    assert (dest / "README.md").read_text() == "hi"

    # A source outside every configured root is still rejected.
    with pytest.raises(ValueError, match="configured browse root"):
        d._ingest_workspace("folder", str(outside / "proj-b"), workspaces_root / "proj-b")


def test_provision_does_not_clobber_existing_claude_md(env):
    m = load_manifest(SKILL_TOOL)
    folder = env / "10_Projects" / "existing"
    folder.mkdir(parents=True)
    (folder / "CLAUDE.md").write_text("PROJECT-OWN-CLAUDE")
    d._provision_swarm_session(m, "existing", "Existing", "")
    assert (folder / "CLAUDE.md").read_text() == "PROJECT-OWN-CLAUDE"  # preserved
