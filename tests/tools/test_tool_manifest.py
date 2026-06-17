"""Tests for engine/tools/tool_manifest.py — W-F implementation.

The suite loads from tests/tools/fixtures/brand-maker.tool.yaml (tracked in git)
so it stays green in a fresh checkout, even though the runtime tool.yaml beside
.claude/skills/gds-agent-brand-maker/ is gitignored.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
import yaml

# Absolute fixture path so tests work regardless of cwd.
FIXTURES = Path(__file__).resolve().parent / "fixtures"
# The fixture lives inside a skill-named subdir so discover_manifests (which
# rglobs for "tool.yaml") can find it exactly as it would in a real skills tree.
BRAND_MAKER_FIXTURE = FIXTURES / "gds-agent-brand-maker" / "tool.yaml"


# ---------------------------------------------------------------------------
# Import under test
# ---------------------------------------------------------------------------

from engine.tools.tool_manifest import (  # noqa: E402
    ToolManifest,
    ToolStep,
    discover_manifests,
    load_manifest,
)


# ---------------------------------------------------------------------------
# ST-1: load_manifest — happy path
# ---------------------------------------------------------------------------

class TestLoadManifest:
    def test_returns_tool_manifest_instance(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert isinstance(m, ToolManifest)

    def test_tool_id(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert m.tool == "brand-maker"

    def test_title(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert m.title == "Brand Maker (Forge)"

    def test_skill_extracted_from_launch_block(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert m.skill == "gds-agent-brand-maker"

    def test_six_steps_matching_skill_stages(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert len(m.steps) == 6

    def test_step_ids_sequential(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        expected_ids = [f"stage{i}" for i in range(6)]
        assert [s.id for s in m.steps] == expected_ids

    def test_stage3_is_hitl_artifact_iframe(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        stage3 = m.steps[3]
        assert stage3.hitl is True
        assert stage3.ui == "artifact-iframe"
        assert "mockup.html" in stage3.artifacts

    def test_stage4_is_not_hitl(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert m.steps[4].hitl is False

    def test_steps_are_tool_step_instances(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        for step in m.steps:
            assert isinstance(step, ToolStep)

    def test_inputs_present(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert len(m.inputs) >= 1
        ids = [i["id"] for i in m.inputs]
        assert "brand" in ids

    def test_brain_reads_preference_spine(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert "preference-spine" in m.brain.get("reads", [])

    def test_artifacts_root_present(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert m.artifacts_root is not None
        assert "{brand}" in m.artifacts_root

    def test_source_path_is_string(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        assert isinstance(m.source_path, str)
        assert "brand-maker" in m.source_path

    def test_manifest_is_immutable(self):
        m = load_manifest(BRAND_MAKER_FIXTURE)
        with pytest.raises((AttributeError, TypeError)):
            m.tool = "mutated"  # type: ignore[misc]


# ---------------------------------------------------------------------------
# ST-1: load_manifest — error paths
# ---------------------------------------------------------------------------

class TestLoadManifestErrors:
    def test_missing_file_raises_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            load_manifest(Path("/nonexistent/path/tool.yaml"))

    def test_schema_error_raises_value_error(self):
        """A YAML missing required 'steps' must raise ValueError."""
        bad = {
            "tool": "test-tool",
            "title": "Test",
            "launch": {"skill": "some-skill"},
            # steps intentionally omitted
        }
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            yaml.dump(bad, f)
            tmp = Path(f.name)
        try:
            with pytest.raises(ValueError, match="schema validation failed"):
                load_manifest(tmp)
        finally:
            tmp.unlink(missing_ok=True)

    def test_schema_error_on_invalid_tool_id(self):
        """tool id must match ^[a-z0-9][a-z0-9-]*$ — uppercase should fail."""
        bad = {
            "tool": "Bad_Tool",
            "title": "Bad",
            "launch": {"skill": "x"},
            "steps": [{"id": "s1", "title": "Step 1"}],
        }
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            yaml.dump(bad, f)
            tmp = Path(f.name)
        try:
            with pytest.raises(ValueError, match="schema validation failed"):
                load_manifest(tmp)
        finally:
            tmp.unlink(missing_ok=True)

    def test_additional_properties_rejected(self):
        """The schema sets additionalProperties:false — unknown keys must fail."""
        bad = {
            "tool": "my-tool",
            "title": "My Tool",
            "launch": {"skill": "x"},
            "steps": [{"id": "s1", "title": "Step 1"}],
            "unknown_key": "surprise",
        }
        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as f:
            yaml.dump(bad, f)
            tmp = Path(f.name)
        try:
            with pytest.raises(ValueError, match="schema validation failed"):
                load_manifest(tmp)
        finally:
            tmp.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# ST-2: discover_manifests
# ---------------------------------------------------------------------------

class TestDiscoverManifests:
    def test_finds_brand_maker_fixture(self):
        """discover_manifests pointed at the fixtures dir finds the brand-maker."""
        results = discover_manifests(roots=[FIXTURES])
        tools = [m.tool for m in results]
        assert "brand-maker" in tools

    def test_returns_list(self):
        results = discover_manifests(roots=[FIXTURES])
        assert isinstance(results, list)

    def test_empty_root_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            results = discover_manifests(roots=[Path(tmpdir)])
        assert results == []

    def test_nonexistent_root_returns_empty(self):
        results = discover_manifests(roots=[Path("/no/such/skills/dir")])
        assert results == []

    def test_bad_manifest_skipped_not_raised(self):
        """A malformed tool.yaml in the root should be skipped, not crash discovery."""
        with tempfile.TemporaryDirectory() as tmpdir:
            bad_skill = Path(tmpdir) / "bad-skill"
            bad_skill.mkdir()
            (bad_skill / "tool.yaml").write_text("not: valid: yaml: [{", encoding="utf-8")
            # Also plant the fixture so we get at least one result.
            import shutil
            good_skill = Path(tmpdir) / "brand-maker"
            good_skill.mkdir()
            shutil.copy(BRAND_MAKER_FIXTURE, good_skill / "tool.yaml")

            results = discover_manifests(roots=[Path(tmpdir)])
        # Good one loaded, bad one silently skipped.
        assert len(results) == 1
        assert results[0].tool == "brand-maker"


# ---------------------------------------------------------------------------
# ST-3: step derivation from SKILL.md
# ---------------------------------------------------------------------------

class TestDeriveStepsFromSkill:
    def test_steps_derived_when_omitted(self):
        """A tool.yaml without 'steps' should derive them from a sibling SKILL.md."""
        skill_md_content = """
## Capabilities

| Stage | Capability | Route |
| ----- | ---------- | ----- |
| 0 | Brand Intake Q&A | Load `references/0-brand-intake.md` |
| 1 | Deconstruction & Anti-Bias | Load `references/1-deconstruct-antibias.md` |
"""
        minimal_yaml = {
            "tool": "derive-test",
            "title": "Derive Test",
            "launch": {"skill": "derive-test-skill"},
            # steps intentionally absent
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            skill_dir = Path(tmpdir) / "derive-test-skill"
            skill_dir.mkdir()
            (skill_dir / "SKILL.md").write_text(skill_md_content, encoding="utf-8")
            tool_yaml = skill_dir / "tool.yaml"
            tool_yaml.write_text(yaml.dump(minimal_yaml), encoding="utf-8")

            m = load_manifest(tool_yaml)

        assert len(m.steps) == 2
        assert m.steps[0].id == "stage0"
        assert m.steps[0].title == "Brand Intake Q&A"
        assert m.steps[0].ref == "references/0-brand-intake.md"
        assert m.steps[1].id == "stage1"
