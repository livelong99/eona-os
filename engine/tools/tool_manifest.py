"""Tool Manifest loader — CONTRACT (Phase 0). Interface + stub only.

Worker W-F implements: discover ``tool.yaml`` files beside skills, validate each
against ``engine/schemas/tool_manifest.schema.json`` (fail-at-boundary), derive
missing ``steps`` from the skill's stage table, and return typed manifests for
the Launchpad + Workbench. Validate against ``gds-agent-brand-maker`` as the
reference tool.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "tool_manifest.schema.json"


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


def discover_manifests(roots: Optional[List[Path]] = None) -> List[ToolManifest]:
    """Find + validate every ``tool.yaml`` under the skill roots. W-F implements."""
    raise NotImplementedError("W-F: implement discover_manifests")


def load_manifest(path: Path) -> ToolManifest:
    """Load + schema-validate a single ``tool.yaml``. W-F implements."""
    raise NotImplementedError("W-F: implement load_manifest")
