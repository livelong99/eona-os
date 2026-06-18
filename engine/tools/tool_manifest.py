"""Tool Manifest loader — CONTRACT (Phase 0). Interface + stub only.

Worker W-F implements: discover ``tool.yaml`` files beside skills, validate each
against ``engine/schemas/tool_manifest.schema.json`` (fail-at-boundary), derive
missing ``steps`` from the skill's stage table, and return typed manifests for
the Launchpad + Workbench. Validate against ``gds-agent-brand-maker`` as the
reference tool.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import jsonschema
import yaml

log = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "tool_manifest.schema.json"


def _resolve_default_roots() -> List[Path]:
    """Skill roots searched when ``discover_manifests`` is called without roots.

    ``HERMES_TOOL_ROOTS`` (os.pathsep-separated) overrides the default — needed
    in container deployments where the repo's ``.claude/skills`` is mounted at a
    fixed path rather than sitting beside the engine source.
    """
    env = os.environ.get("HERMES_TOOL_ROOTS", "").strip()
    if env:
        return [Path(p).expanduser() for p in env.split(os.pathsep) if p.strip()]
    return [Path(__file__).resolve().parent.parent.parent / ".claude" / "skills"]


# Resolved at import for back-compat; discover_manifests re-resolves so a runtime
# env (set after import) is still honoured.
_DEFAULT_ROOTS: List[Path] = _resolve_default_roots()


@dataclass(frozen=True)
class ToolStep:
    id: str
    title: str
    ref: Optional[str] = None
    hitl: bool = False
    artifacts: List[str] = field(default_factory=list)
    ui: str = "chat"


@dataclass(frozen=True)
class ToolManifest:
    tool: str
    title: str
    skill: str
    steps: List[ToolStep]
    description: Optional[str] = None
    inputs: List[Dict[str, Any]] = field(default_factory=list)
    artifacts_root: Optional[str] = None
    brain: Dict[str, Any] = field(default_factory=dict)
    source_path: Optional[str] = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_schema() -> Dict[str, Any]:
    """Load the JSON schema from disk (cached on first call via module-level singleton)."""
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Tool manifest schema not found: {SCHEMA_PATH}")
    with SCHEMA_PATH.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)  # json is valid yaml; avoids an extra import


_SCHEMA_CACHE: Optional[Dict[str, Any]] = None


def _schema() -> Dict[str, Any]:
    global _SCHEMA_CACHE
    if _SCHEMA_CACHE is None:
        _SCHEMA_CACHE = _load_schema()
    return _SCHEMA_CACHE


def _validate(raw: Dict[str, Any]) -> None:
    """Validate *raw* against the tool manifest JSON schema.

    Raises ``ValueError`` wrapping the jsonschema message on failure so callers
    see a clean boundary error rather than an internal library type.
    """
    try:
        jsonschema.validate(instance=raw, schema=_schema())
    except jsonschema.ValidationError as exc:
        raise ValueError(f"tool.yaml schema validation failed: {exc.message}") from exc


def _parse_stage_table(skill_md: Path) -> List[ToolStep]:
    """Derive steps from the ``## Capabilities`` stage table in *skill_md*.

    Expects markdown table rows of the form:
        | 0 | Capability Title | Load `references/some-file.md` |

    Returns one ``ToolStep`` per numbered stage row.  Rows that do not start
    with a digit stage number are skipped (e.g. on-demand rows, header/divider).
    """
    if not skill_md.exists():
        return []

    text = skill_md.read_text(encoding="utf-8")
    # Find the Capabilities section then extract table rows from it.
    cap_match = re.search(r"##\s+Capabilities\b", text)
    if not cap_match:
        return []

    section = text[cap_match.start():]
    # Each table data row: | stage | title | route |
    row_pattern = re.compile(
        r"^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*Load\s+`([^`]+)`\s*\|",
        re.MULTILINE,
    )

    steps: List[ToolStep] = []
    for m in row_pattern.finditer(section):
        stage_num = m.group(1)
        title = m.group(2).strip()
        ref = m.group(3).strip()
        steps.append(ToolStep(
            id=f"stage{stage_num}",
            title=title,
            ref=ref,
            hitl=False,
            artifacts=[],
            ui="chat",
        ))
    return steps


def _map_step(raw_step: Dict[str, Any]) -> ToolStep:
    """Map a raw dict step (already schema-valid) to a ``ToolStep``."""
    return ToolStep(
        id=raw_step["id"],
        title=raw_step["title"],
        ref=raw_step.get("ref"),
        hitl=bool(raw_step.get("hitl", False)),
        artifacts=list(raw_step.get("artifacts", [])),
        ui=raw_step.get("ui", "chat"),
    )


def _map_manifest(raw: Dict[str, Any], source_path: str) -> ToolManifest:
    """Map a schema-valid raw dict to a ``ToolManifest``."""
    launch = raw["launch"]
    steps = [_map_step(s) for s in raw["steps"]]
    return ToolManifest(
        tool=raw["tool"],
        title=raw["title"],
        skill=launch["skill"],
        steps=steps,
        description=raw.get("description"),
        inputs=list(raw.get("inputs", [])),
        artifacts_root=raw.get("artifacts_root"),
        brain=dict(raw.get("brain", {})),
        source_path=source_path,
    )


# ---------------------------------------------------------------------------
# Public API (CONTRACT — do not change signatures)
# ---------------------------------------------------------------------------

def load_manifest(path: Path) -> ToolManifest:
    """Load + schema-validate a single ``tool.yaml``.

    Steps:
    1. Resolve the path and raise ``FileNotFoundError`` if missing.
    2. Parse YAML with ``yaml.safe_load`` (raises ``yaml.YAMLError`` on bad syntax).
    3. If the ``steps`` key is absent, derive it from the sibling ``SKILL.md``
       stage table (fail-at-boundary: if derivation yields no steps the schema
       will reject it downstream).
    4. Validate the dict against the JSON schema; raise ``ValueError`` on failure.
    5. Map to a frozen ``ToolManifest`` and return.
    """
    resolved = Path(path).resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"tool.yaml not found: {resolved}")

    with resolved.open(encoding="utf-8") as fh:
        raw: Dict[str, Any] = yaml.safe_load(fh) or {}

    # Derive missing steps from the sibling SKILL.md before validation so the
    # schema's minItems:1 constraint has a chance to pass.
    if "steps" not in raw:
        skill_md = resolved.parent / "SKILL.md"
        derived = _parse_stage_table(skill_md)
        if derived:
            raw = dict(raw)  # unfreeze for injection
            raw["steps"] = [
                {
                    "id": s.id,
                    "title": s.title,
                    **({"ref": s.ref} if s.ref else {}),
                    "hitl": s.hitl,
                    "artifacts": s.artifacts,
                    "ui": s.ui,
                }
                for s in derived
            ]
            log.debug("Derived %d steps from %s", len(derived), skill_md)

    _validate(raw)
    return _map_manifest(raw, str(resolved))


def discover_manifests(roots: Optional[List[Path]] = None) -> List[ToolManifest]:
    """Find + validate every ``tool.yaml`` under the skill roots.

    Walks each root recursively.  Per-file errors are logged at WARNING level
    and skipped so one bad manifest never blocks the rest.  Returns a list of
    all successfully loaded ``ToolManifest`` objects.
    """
    search_roots = roots if roots is not None else _resolve_default_roots()
    manifests: List[ToolManifest] = []

    for root in search_roots:
        root = Path(root)
        if not root.exists():
            log.debug("Skill root does not exist, skipping: %s", root)
            continue
        for yaml_path in sorted(root.rglob("tool.yaml")):
            try:
                manifests.append(load_manifest(yaml_path))
                log.debug("Loaded manifest: %s", yaml_path)
            except (FileNotFoundError, ValueError, yaml.YAMLError) as exc:
                log.warning("Skipping invalid manifest %s: %s", yaml_path, exc)

    return manifests
