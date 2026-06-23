"""Discovery cache for ``discover_manifests`` — hot-path FS+CPU avoidance.

``discover_manifests`` is called per request on the dashboard's Launchpad, tool
detail, and launch paths.  Each call previously re-walked the skill roots and
re-parsed + re-validated every ``tool.yaml``.  The cache keeps the loaded
manifests keyed on the resolved roots and reuses them while a cheap filesystem
signature (tool.yaml paths + mtimes) is unchanged.  These tests assert:

* repeated calls with no FS change skip the per-file parse (served from cache);
* writing a NEW tool.yaml under a root invalidates the cache on the next call;
* distinct roots do not cross-contaminate each other's caches.
"""
from __future__ import annotations

from pathlib import Path

import pytest

import tools.tool_manifest as tm

# Minimal schema-valid manifest body.  Each fixture substitutes the tool id.
_MANIFEST = """\
tool: {tool}
title: {tool} tool
launch:
  skill: {tool}-skill
steps:
  - id: step0
    title: First step
"""


def _write_tool(root: Path, tool_id: str) -> Path:
    d = root / tool_id
    d.mkdir(parents=True, exist_ok=True)
    p = d / "tool.yaml"
    p.write_text(_MANIFEST.format(tool=tool_id), encoding="utf-8")
    return p


@pytest.fixture(autouse=True)
def _clear_cache():
    """Each test starts with an empty discovery cache (module-level state)."""
    tm._DISCOVERY_CACHE.clear()
    yield
    tm._DISCOVERY_CACHE.clear()


def test_second_call_served_from_cache(tmp_path, monkeypatch):
    root = tmp_path / "skills"
    _write_tool(root, "alpha")

    calls = {"n": 0}
    real_load = tm.load_manifest

    def counting_load(path):
        calls["n"] += 1
        return real_load(path)

    monkeypatch.setattr(tm, "load_manifest", counting_load)

    first = tm.discover_manifests(roots=[root])
    assert [m.tool for m in first] == ["alpha"]
    assert calls["n"] == 1  # parsed once

    second = tm.discover_manifests(roots=[root])
    assert second == first  # equal result
    assert second is first  # same cached object — no recompute
    assert calls["n"] == 1  # not re-parsed: served from cache


def test_new_tool_invalidates_cache(tmp_path):
    root = tmp_path / "skills"
    _write_tool(root, "alpha")

    first = tm.discover_manifests(roots=[root])
    assert [m.tool for m in first] == ["alpha"]

    # Tool Forge writes a new tool into the (writable) root after first discovery.
    _write_tool(root, "beta")

    second = tm.discover_manifests(roots=[root])
    assert sorted(m.tool for m in second) == ["alpha", "beta"]
    assert second is not first  # signature changed -> recomputed


def test_env_root_invalidation(tmp_path, monkeypatch):
    """Default-roots path (HERMES_TOOL_ROOTS) is cached + invalidated the same way."""
    root = tmp_path / "env-skills"
    _write_tool(root, "gamma")
    monkeypatch.setenv("HERMES_TOOL_ROOTS", str(root))

    first = tm.discover_manifests()
    assert [m.tool for m in first] == ["gamma"]

    second = tm.discover_manifests()
    assert second is first  # cached across calls

    _write_tool(root, "delta")
    third = tm.discover_manifests()
    assert sorted(m.tool for m in third) == ["delta", "gamma"]
    assert third is not first


def test_distinct_roots_do_not_cross_contaminate(tmp_path):
    root_a = tmp_path / "a"
    root_b = tmp_path / "b"
    _write_tool(root_a, "alpha")
    _write_tool(root_b, "beta")

    res_a = tm.discover_manifests(roots=[root_a])
    res_b = tm.discover_manifests(roots=[root_b])

    assert [m.tool for m in res_a] == ["alpha"]
    assert [m.tool for m in res_b] == ["beta"]

    # Re-calling each returns its own cached result, not the other's.
    assert tm.discover_manifests(roots=[root_a]) is res_a
    assert tm.discover_manifests(roots=[root_b]) is res_b


def test_modified_tool_invalidates_cache(tmp_path):
    """Editing an existing tool.yaml (mtime bump) invalidates the cache."""
    root = tmp_path / "skills"
    p = _write_tool(root, "alpha")

    first = tm.discover_manifests(roots=[root])
    assert first[0].title == "alpha tool"

    # Rewrite with a new title and a bumped mtime so the signature changes even
    # on coarse-resolution clocks.
    p.write_text(
        _MANIFEST.format(tool="alpha").replace("alpha tool", "alpha renamed"),
        encoding="utf-8",
    )
    import os

    st = p.stat()
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))

    second = tm.discover_manifests(roots=[root])
    assert second is not first
    assert second[0].title == "alpha renamed"
