"""Labs "UI Agent Builder" — deterministic tool scaffolder.

Materializes a dashboard ``BuilderState`` draft into a real, discoverable,
runnable Hermes tool: a skill directory under the read-WRITE tool root
(``/opt/data/skills`` = host ``~/.hermes/skills``) containing a schema-valid
``tool.yaml`` + a ``SKILL.md`` + ``references/*.md`` step stubs.

This is the **deterministic half** of ``POST /v1/tools/build``: it guarantees a
runnable tool exists even if the downstream enrich agent (Opus 4.8) fails or is
skipped.  The agent only *enriches* the SKILL.md / references afterwards.

Security: the slug is sanitized to a kebab-case segment (no traversal); all
writes are confined to ``_writable_root()``; the generated ``tool.yaml`` is
validated against ``engine/schemas/tool_manifest.schema.json`` before the
scaffold is declared a success.  Reuses ``skill_manager_tool``'s name validation
and post-write security scan.
"""
from __future__ import annotations

import logging
import os
import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

logger = logging.getLogger(__name__)

# Dashboard field types (BuilderState input/output `type`) → tool.yaml input
# types (the schema's enum: text|textarea|file|file[]|select). Per the frozen
# contract: longtext→textarea, image/file→file, number/toggle→text,
# select→select, text→text.
_FIELD_TYPE_MAP: Dict[str, str] = {
    "text": "text",
    "longtext": "textarea",
    "number": "text",
    "toggle": "text",
    "select": "select",
    "image": "file",
    "file": "file",
}

# Dashboard categories (BuilderState.category) — kept for SKILL.md framing only.
_KNOWN_CATEGORIES = {"Creative", "Writing", "Research", "Data", "Dev"}

_MAX_SLUG_LEN = 64


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def _writable_root() -> Path:
    """The read-WRITE tool root user-built tools are written to.

    Picks the last writable entry of ``HERMES_TOOL_ROOTS`` (os.pathsep-separated)
    — by deployment convention ``/opt/skills:/opt/data/skills`` the second root
    is the writable ``~/.hermes`` mount.  Falls back to ``~/.hermes/skills`` when
    the env is unset (local/dev).  Never returns a read-only built-in root.
    """
    env = os.environ.get("HERMES_TOOL_ROOTS", "").strip()
    if env:
        roots = [p for p in env.split(os.pathsep) if p.strip()]
        # Prefer a root that is writable; in the canonical config that's the
        # second ("/opt/data/skills"). Walk from the end so user-built roots win.
        for raw in reversed(roots):
            candidate = Path(raw).expanduser()
            try:
                candidate.mkdir(parents=True, exist_ok=True)
                if os.access(candidate, os.W_OK):
                    return candidate
            except OSError:
                continue
    # Fallback: ~/.hermes/skills via hermes_constants when available.
    try:
        from hermes_constants import get_hermes_home
        root = get_hermes_home() / "skills"
    except Exception:
        root = Path(os.path.expanduser("~/.hermes/skills"))
    root.mkdir(parents=True, exist_ok=True)
    return root


def is_within_writable_root(path: Path) -> Optional[Path]:
    """Return the resolved path if it is strictly inside the writable tool root,
    else None.  Used by DELETE to confine removal to user-built tools.
    """
    root = _writable_root()
    try:
        resolved = path.resolve()
        root_resolved = root.resolve()
    except OSError:
        return None
    try:
        rel = resolved.relative_to(root_resolved)
    except ValueError:
        return None
    if not rel.parts:  # the root itself — never deletable
        return None
    return resolved


# ---------------------------------------------------------------------------
# Slug + draft sanitization
# ---------------------------------------------------------------------------

def sanitize_slug(name: str) -> Optional[str]:
    """Derive a filesystem-safe, schema-valid kebab-case slug from a name.

    Mirrors the tool.yaml ``tool`` pattern ``^[a-z0-9][a-z0-9-]*$`` and reuses
    ``skill_manager_tool._validate_name`` for defense-in-depth.  Returns None
    when no valid slug can be produced (e.g. name is empty/symbols-only).
    """
    if not isinstance(name, str):
        return None
    s = name.strip().lower()
    # Collapse any run of non-alphanumerics to a single hyphen.
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    if not s:
        return None
    s = s[:_MAX_SLUG_LEN].strip("-")
    if not s or not re.match(r"^[a-z0-9][a-z0-9-]*$", s):
        return None
    # Defense-in-depth: reuse the skill-name validator (it permits dots/underscores
    # too, but our regex above already restricted to kebab — so this only adds the
    # length/leading-char guard).
    try:
        from tools.skill_manager_tool import _validate_name
        if _validate_name(s) is not None:
            return None
    except Exception:
        pass
    return s


def _coerce_str(value: Any, default: str = "") -> str:
    return value.strip() if isinstance(value, str) else default


def _list_of_dicts(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [v for v in value if isinstance(v, dict)]


# ---------------------------------------------------------------------------
# Generators: tool.yaml, SKILL.md, references
# ---------------------------------------------------------------------------

def _build_inputs(draft_inputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Map BuilderState inputs[] → schema-valid tool.yaml inputs[]."""
    out: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    for i, raw in enumerate(draft_inputs):
        raw_id = _coerce_str(raw.get("id")) or _coerce_str(raw.get("label")) or f"input{i}"
        iid = re.sub(r"[^a-z0-9_]+", "_", raw_id.lower()).strip("_") or f"input{i}"
        if iid in seen_ids:
            iid = f"{iid}_{i}"
        seen_ids.add(iid)
        label = _coerce_str(raw.get("label")) or iid
        dash_type = _coerce_str(raw.get("type"), "text")
        yaml_type = _FIELD_TYPE_MAP.get(dash_type, "text")
        out.append({
            "id": iid,
            "label": label,
            "type": yaml_type,
            "required": bool(raw.get("required", False)),
        })
    return out


def _build_steps(draft_steps: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Tuple[str, str, str]]]:
    """Map BuilderState steps[] → schema-valid tool.yaml steps[].

    Returns (yaml_steps, ref_files) where ref_files is a list of
    (ref_path, title, detail) for the references/*.md stubs to write.
    """
    yaml_steps: List[Dict[str, Any]] = []
    ref_files: List[Tuple[str, str, str]] = []
    for i, raw in enumerate(draft_steps):
        title = _coerce_str(raw.get("title")) or f"Step {i}"
        detail = _coerce_str(raw.get("detail"))
        ref_name = f"{i}-" + (re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or f"step{i}")
        ref_path = f"references/{ref_name}.md"
        yaml_steps.append({
            "id": f"stage{i}",
            "title": title,
            "ref": ref_path,
            "hitl": False,
            "artifacts": [],
            "ui": "chat",
        })
        ref_files.append((ref_path, title, detail))
    if not yaml_steps:
        # Schema requires minItems: 1 — synthesize a single execution step.
        ref_path = "references/0-run.md"
        yaml_steps.append({
            "id": "stage0",
            "title": "Run",
            "ref": ref_path,
            "hitl": False,
            "artifacts": [],
            "ui": "chat",
        })
        ref_files.append((ref_path, "Run", "Execute the tool's primary workflow."))
    return yaml_steps, ref_files


def _build_tool_yaml(slug: str, draft: Dict[str, Any], inputs: List[Dict[str, Any]],
                     steps: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Assemble the tool.yaml dict (schema-valid)."""
    title = _coerce_str(draft.get("name")) or slug
    tagline = _coerce_str(draft.get("tagline"))
    description = tagline or f"{title} — a UI-built Hermes tool."
    raw: Dict[str, Any] = {
        "tool": slug,
        "title": title,
        "description": description,
        "launch": {
            "skill": slug,
            "session": "per-tool",
        },
        "steps": steps,
    }
    if inputs:
        raw["inputs"] = inputs
    return raw


def _build_skill_md(slug: str, draft: Dict[str, Any], inputs: List[Dict[str, Any]],
                    steps: List[Dict[str, Any]]) -> str:
    """Generate a SKILL.md: frontmatter + identity + capability table +
    workflow + I/O + uiNotes. Built deterministically; the enrich agent
    refines it afterward.
    """
    title = _coerce_str(draft.get("name")) or slug
    tagline = _coerce_str(draft.get("tagline"))
    category = _coerce_str(draft.get("category"))
    icon = _coerce_str(draft.get("icon"))
    ui_notes = _coerce_str(draft.get("uiNotes"))
    goals = _list_of_dicts(draft.get("goals"))
    draft_outputs = _list_of_dicts(draft.get("outputs"))

    desc = tagline or f"{title} — a UI-built Hermes tool."
    # Frontmatter description must stay under the skill-manager 1024-char limit.
    fm_desc = desc.replace("\n", " ").strip()[:480]

    lines: List[str] = []
    lines.append("---")
    lines.append(f"name: {slug}")
    lines.append(f"description: {fm_desc}")
    lines.append("---")
    lines.append("")
    lines.append(f"# {title}")
    lines.append("")
    if tagline:
        lines.append(f"> {tagline}")
        lines.append("")
    if category or icon:
        meta = []
        if category:
            meta.append(f"**Category:** {category}")
        if icon:
            meta.append(f"**Icon:** {icon}")
        lines.append("  ·  ".join(meta))
        lines.append("")

    lines.append("## Identity")
    lines.append("")
    lines.append(
        f"You are **{title}**. {tagline or 'You help the user accomplish a focused task end to end.'}"
    )
    lines.append("")

    # Capability table — drives step derivation in tool_manifest._parse_stage_table
    # too (kept consistent with the explicit steps[] in tool.yaml).
    lines.append("## Capabilities")
    lines.append("")
    lines.append("| # | Capability | Reference |")
    lines.append("| - | ---------- | --------- |")
    for i, step in enumerate(steps):
        title_cell = str(step.get("title", f"Step {i}")).replace("|", "\\|")
        ref_cell = str(step.get("ref", "")).replace("|", "\\|")
        lines.append(f"| {i} | {title_cell} | Load `{ref_cell}` |")
    lines.append("")

    if goals:
        lines.append("## Goals")
        lines.append("")
        for g in goals:
            goal_text = _coerce_str(g.get("goal"))
            if goal_text:
                lines.append(f"- {goal_text}")
        lines.append("")

    lines.append("## Workflow")
    lines.append("")
    for i, step in enumerate(steps):
        lines.append(f"{i + 1}. **{step.get('title', '')}** — see `{step.get('ref', '')}`.")
    lines.append("")

    if inputs:
        lines.append("## Inputs")
        lines.append("")
        for inp in inputs:
            req = " (required)" if inp.get("required") else ""
            lines.append(
                f"- **{inp.get('label', inp.get('id'))}** "
                f"(`{inp.get('id')}`, {inp.get('type', 'text')}){req}"
            )
        lines.append("")

    if draft_outputs:
        lines.append("## Outputs")
        lines.append("")
        for out in draft_outputs:
            label = _coerce_str(out.get("label")) or _coerce_str(out.get("id"))
            otype = _coerce_str(out.get("type"), "text")
            if label:
                lines.append(f"- **{label}** ({otype})")
        lines.append("")

    if ui_notes:
        lines.append("## UI Notes")
        lines.append("")
        lines.append(ui_notes)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _build_reference_stub(slug: str, title: str, detail: str, step_index: int) -> str:
    """A references/*.md stub for one workflow step."""
    lines = [
        f"# {title}",
        "",
        f"_Step {step_index} of the **{slug}** tool workflow._",
        "",
    ]
    if detail:
        lines.append(detail)
    else:
        lines.append("Describe what to do in this step. (Enriched by the builder agent.)")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def scaffold_tool(draft: Dict[str, Any]) -> Tuple[str, Path]:
    """Scaffold a runnable tool from a BuilderState ``draft``.

    Writes ``{root}/{slug}/tool.yaml`` + ``SKILL.md`` + ``references/*.md`` to
    the writable tool root, validating the generated ``tool.yaml`` against the
    manifest schema before returning.

    Returns ``(slug, skill_dir)``.

    Raises ``ValueError`` on an invalid draft, slug collision, or schema
    validation failure (fail-at-boundary; the caller surfaces a 4xx/5xx).
    """
    if not isinstance(draft, dict):
        raise ValueError("draft must be a JSON object")

    name = _coerce_str(draft.get("name"))
    slug = sanitize_slug(name)
    if slug is None:
        raise ValueError(
            "draft.name must yield a valid kebab-case slug "
            "(lowercase letters, numbers, hyphens; must start with a letter or digit)"
        )

    root = _writable_root()
    skill_dir = root / slug
    if skill_dir.exists():
        raise ValueError(f"A tool named '{slug}' already exists at {skill_dir}.")

    inputs = _build_inputs(_list_of_dicts(draft.get("inputs")))
    steps, ref_files = _build_steps(_list_of_dicts(draft.get("steps")))
    tool_yaml = _build_tool_yaml(slug, draft, inputs, steps)

    # Schema-validate BEFORE writing anything — fail at the boundary.
    from tools.tool_manifest import _validate as _validate_manifest
    _validate_manifest(tool_yaml)

    skill_md = _build_skill_md(slug, draft, inputs, steps)

    # Write the scaffold. Roll back the whole dir on any failure.
    try:
        skill_dir.mkdir(parents=True, exist_ok=False)
        (skill_dir / "tool.yaml").write_text(
            yaml.safe_dump(tool_yaml, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )
        (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")
        refs_dir = skill_dir / "references"
        refs_dir.mkdir(parents=True, exist_ok=True)
        for i, (ref_path, title, detail) in enumerate(ref_files):
            ref_file = skill_dir / ref_path
            ref_file.parent.mkdir(parents=True, exist_ok=True)
            ref_file.write_text(
                _build_reference_stub(slug, title, detail, i), encoding="utf-8"
            )
    except Exception:
        shutil.rmtree(skill_dir, ignore_errors=True)
        raise

    # Post-write security scan (no-op unless skills.guard_agent_created is on) —
    # mirrors _create_skill's roll-back-on-block behaviour.
    try:
        from tools.skill_manager_tool import _security_scan_skill
        scan_error = _security_scan_skill(skill_dir)
        if scan_error:
            shutil.rmtree(skill_dir, ignore_errors=True)
            raise ValueError(scan_error)
    except ValueError:
        raise
    except Exception:
        logger.debug("scaffold security scan raised (non-fatal)", exc_info=True)

    logger.info("scaffolded tool %s at %s", slug, skill_dir)
    return slug, skill_dir
