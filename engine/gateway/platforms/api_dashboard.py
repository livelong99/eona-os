"""Dashboard data API — implements the Kanban/memory/events/tools/goal endpoints.

Worker W-B fills: ``GET /v1/tasks`` (Kanban board → Task[]),
``GET /v1/memory`` (vault galaxy → MemoryGraph), ``GET /v1/events`` (global
SSE TaskEvent stream).  Shapes match ``dashboard/src/lib/types.ts``.

Worker B2 fills: ``POST /v1/tools/{tool_id}/launch`` (Workbench run-start) and
``POST /v1/goal`` (Goal Mode run-start with judge loop).  Both reuse the
adapter's existing run-start machinery (``_create_agent``, ``_set_run_status``,
``_make_run_event_callback``) via the module-level ``_start_run`` helper so
``api_server.py`` is never touched.

This module is intentionally isolated so these workers never edit the
api_server route block: ``ApiServerPlatform`` calls
``register_dashboard_routes(app, adapter)`` once at startup (pre-wired in
Phase 0).
"""
from __future__ import annotations

import asyncio
import glob
import json
import logging
import math
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers: Kanban DB
# ---------------------------------------------------------------------------

def _connect_kanban():
    """Lazy import + connect to the kanban DB.  Same pattern as kanban_tools."""
    from hermes_cli import kanban_db as kb
    conn = kb.connect()
    return kb, conn


def _task_to_dict(t: Any) -> dict:
    """Map a kanban_db.Task to the dashboard Task shape.

    kanban_db stores timestamps as integer *seconds* (Unix epoch).
    The TS type expects ``updatedAt`` in *milliseconds*.
    """
    ts_s = t.completed_at or t.started_at or t.created_at or 0
    return {
        "id": t.id,
        "title": t.title,
        "status": t.status,
        # assignee is optional in the TS type; omit key when None
        **({"assignee": t.assignee} if t.assignee else {}),
        "updatedAt": ts_s * 1000,
    }


# ---------------------------------------------------------------------------
# Helpers: memory galaxy layout (mirrors mock.ts galaxy())
# ---------------------------------------------------------------------------

_FALLBACK_LABELS = [
    "architecture", "hermes", "kanban", "obsidian-memory",
    "claude-runtime", "security", "writer", "researcher",
]

_VAULT_GLOB_DEFAULT = os.path.join(
    os.path.expanduser(os.environ.get("HERMES_VAULT_PATH", "~/Documents/Obsidian/Vault")),
    "**", "*.md",
)


def _build_galaxy(labels: list[str]) -> dict:
    """Deterministic radial galaxy layout — mirrors mock.ts galaxy()."""
    n = len(labels)
    nodes = []
    for i, label in enumerate(labels):
        ring = i % 3
        r = 0.16 + ring * 0.17
        a = (i / n) * math.pi * 2 + ring * 0.6
        # Linear congruential jitter (same constants as mock.ts)
        jitter = ((i * 9301 + 49297) % 233280) / 233280 - 0.5
        nodes.append({
            "id": label,
            "label": label,
            "x": 0.5 + math.cos(a) * (r + jitter * 0.05),
            "y": 0.5 + math.sin(a) * (r + jitter * 0.05),
            "weight": 0.6 + ((i * 7) % 5) / 5,
        })
    edges = [
        {"from": nodes[i]["id"], "to": nodes[(i * 3 + 1) % n]["id"]}
        for i in range(1, n)
    ]
    # Hub anchors for the first two nodes (mirrors mock)
    if n >= 2:
        edges.append({"from": nodes[0]["id"], "to": nodes[1]["id"]})
    if n >= 3:
        edges.append({"from": nodes[0]["id"], "to": nodes[2]["id"]})
    return {"nodes": nodes, "edges": edges}


def _vault_labels(cap: int = 40) -> list[str]:
    """Return up to ``cap`` note stems from the Obsidian vault.

    Falls back to ``_FALLBACK_LABELS`` on any error so the endpoint stays
    live even when the vault path is wrong or unreadable.
    """
    try:
        paths = glob.glob(_VAULT_GLOB_DEFAULT, recursive=True)
        seen: set[str] = set()
        labels: list[str] = []
        for p in paths:
            stem = Path(p).stem
            # Skip hidden / system notes and exact duplicates
            if stem.startswith(".") or stem.startswith("_") or stem in seen:
                continue
            seen.add(stem)
            labels.append(stem)
            if len(labels) >= cap:
                break
        return labels if labels else _FALLBACK_LABELS
    except Exception:
        logger.debug("vault label scan failed; using fallback", exc_info=True)
        return _FALLBACK_LABELS


# ---------------------------------------------------------------------------
# Helpers: tool manifests (Launchpad) + approvals (Trust Rail)
# ---------------------------------------------------------------------------

# Fixed approval choice set — mirrors api_server's _approval_notify and the
# per-run POST /v1/runs/{run_id}/approval handler.
_APPROVAL_CHOICES = ["once", "session", "always", "deny"]

# Labs "UI Agent Builder": the builder/refine agents run on Opus 4.8 (authoring
# accuracy), not the default runtime model. Forwarded to the claude_code CLI as
# --model via the per-request _model_override hook.
_TOOL_BUILDER_MODEL = "claude-opus-4-8"


def _builder_model() -> str:
    """Tier-2 model for the Labs builder, honoring persisted routing.

    The Labs tool builder/refine runs on the Tier-2 surface (Brainstorming, Tools
    & Workspace). Reads the Control → Models persisted Tier-2 routing, falling back
    to the Opus default when nothing is saved or the store is unavailable (fully
    best-effort — never raises).
    """
    try:
        from gateway.platforms import model_config_store

        return model_config_store.resolve_tier_model("t2", default=_TOOL_BUILDER_MODEL) or _TOOL_BUILDER_MODEL
    except Exception:
        return _TOOL_BUILDER_MODEL


# Static model catalog for Control → Models (mirrors dashboard/src/lib/control.ts
# MODELS). Ids are bare-dashed CLI form so the persisted routing maps straight to
# the claude_code --model flag. The persisted roster (enabled flags) and routing
# (tier→id) are merged on top of this by GET /v1/model-config.
_MODEL_CATALOG: List[Dict[str, Any]] = [
    {"id": "claude-sonnet-4-6", "name": "Sonnet 4.6", "tier": "Balanced", "context": "200K", "cost": "$3 / $15", "role": "Fast, capable all-rounder", "enabled": True, "color": "#4f8cff"},
    {"id": "claude-opus-4-8", "name": "Opus 4.8", "tier": "Reasoning", "context": "200K", "cost": "$15 / $75", "role": "Deepest reasoning for heavy creative & coding work", "enabled": True, "color": "#a78bfa"},
]

# 2-tier routing descriptors, keyed by surface (mirrors control.ts ROUTING).
# ``id`` is the store's tier key; ``default`` is the catalog model id pre-selected
# when nothing is saved (Tier 1 → Sonnet, Tier 2 → Opus).
_ROUTING_TIERS: List[Dict[str, Any]] = [
    {"id": "t1", "tier": "Tier 1 · Voice & Planner", "desc": "Home voice agent and the planner", "default": "claude-sonnet-4-6"},
    {"id": "t2", "tier": "Tier 2 · Brainstorm, Tools & Workspace", "desc": "Brainstorming, Labs tools, and the workspace", "default": "claude-opus-4-8"},
]


def _build_services() -> List[Dict[str, str]]:
    """System-health rows for Control → Overview (mirrors control.ts SERVICES).

    Derives a few real signals best-effort; falls back to sensible static values
    so the panel always renders. Never raises.
    """
    engine_detail = "running"
    try:
        from gateway.status import read_runtime_status

        rt = read_runtime_status() or {}
        state = rt.get("gateway_state")
        if state:
            engine_detail = str(state)
    except Exception:
        logger.debug("read_runtime_status unavailable for /v1/usage services", exc_info=True)

    vault_path = os.path.expanduser(os.environ.get("HERMES_VAULT_PATH", "~/Documents/Obsidian/Vault"))
    vault_ok = False
    try:
        vault_ok = os.path.isdir(vault_path)
    except Exception:
        vault_ok = False

    cron_on = os.environ.get("HERMES_BUDGET_GOVERNOR") == "1" or os.environ.get("HERMES_TRUST_GATE") == "1"

    return [
        {"name": "Hermes engine", "status": "healthy", "detail": engine_detail},
        {"name": "Claude bridge", "status": "healthy", "detail": "connected"},
        {"name": "Obsidian vault", "status": "healthy" if vault_ok else "off", "detail": "synced" if vault_ok else "path not found"},
        {"name": "Cron scheduler", "status": "healthy" if cron_on else "off", "detail": "armed" if cron_on else "autonomy disabled"},
    ]

# Persona for the deterministic-scaffold ENRICH agent (build endpoint). It is
# fed the draft + the on-disk scaffold paths and told to enrich, not re-ask.
_TOOL_BUILDER_ENRICH_PERSONA = (
    "You are the Hermes Tool Builder, an expert agent-skill author. A tool has "
    "ALREADY been scaffolded on disk from the user's form draft: a valid "
    "tool.yaml, a SKILL.md, and references/ step stubs. Your job is to ENRICH "
    "the scaffold, not to re-interrogate the user or re-ask questions. "
    "Improve SKILL.md (sharpen the identity, capabilities, and workflow) and "
    "flesh out each references/<step>.md with concrete, actionable guidance "
    "derived from the draft's goals and steps. Do NOT modify the tool.yaml "
    "`tool`, `launch.skill`, or the steps[] ids/refs — they are load-bearing. "
    "Keep edits confined to the scaffolded skill directory. Be concise and "
    "concrete; write the kind of skill a fresh agent could execute cold."
)

# Persona for the refine endpoint — critiques/improves the draft conversationally.
_TOOL_BUILDER_REFINE_PERSONA = (
    "You are the Hermes Tool Builder, an expert agent-skill author and critic. "
    "The user is refining a tool draft (BuilderState: name, tagline, category, "
    "skill, goals, steps, inputs, outputs, uiNotes) before publishing it. "
    "Critique and improve the draft: prune redundancy, tighten goals into crisp "
    "outcomes, sequence the workflow steps, and make inputs/outputs precise. "
    "Respond conversationally with specific, actionable suggestions the user can "
    "apply. Be direct and concise."
)


def _manifest_to_dict(m: Any) -> dict:
    """Map a tools.tool_manifest.ToolManifest to the dashboard ToolManifest shape
    (dashboard/src/lib/tools.ts). ``tool`` → ``id``; steps/inputs passed through.
    """
    return {
        "id": m.tool,
        "title": m.title,
        "skill": m.skill,
        "steps": [
            {
                "id": s.id,
                "title": s.title,
                "ref": s.ref,
                "hitl": s.hitl,
                "artifacts": list(s.artifacts or []),
                "ui": s.ui,
            }
            for s in (m.steps or [])
        ],
        **({"description": m.description} if m.description else {}),
        "inputs": list(m.inputs or []),
        # Swarm flag drives the dashboard run-screen choice (glass-box swarm UI
        # vs the legacy single-agent workbench).
        "swarm": bool(getattr(m, "swarm", False)),
        **({"steering": m.steering} if getattr(m, "steering", None) else {}),
    }


# ---------------------------------------------------------------------------
# Run registry (live Workbench) — run_id → launch context so the resume-message
# and artifacts endpoints can resolve a run after launch. A small module-level
# dict suffices: no richer registry exists, and concurrent runs each get a
# distinct run_id key. ``claude_session_id`` is filled in when the run's first
# turn completes (captured from the agent result) so a /message follow-up can
# --resume that exact Claude Code conversation.
# ---------------------------------------------------------------------------

_RUN_REGISTRY: Dict[str, Dict[str, Any]] = {}

# The in-memory dict above is the hot-path source of truth, but it is wiped on
# every engine restart/rebuild.  ``labs_store`` mirrors the durable subset of
# each record to SQLite on the ``/opt/data`` volume so the resume/artifacts
# endpoints keep resolving runs after a restart.  We hydrate the dict from the
# DB ONCE, lazily, on first registry access (``_run_registry()``), so module
# import never touches the filesystem.  All durability is best-effort: a DB
# failure logs and continues — it must never break the live request path.
_RUN_REGISTRY_HYDRATED = False


def _run_registry() -> Dict[str, Dict[str, Any]]:
    """Return the run registry, hydrating it from the durable store once.

    On first call: create the SQLite table and load every persisted run into the
    in-memory dict (without clobbering any record already added this process —
    a live record always wins over its restart-loaded copy).
    """
    global _RUN_REGISTRY_HYDRATED
    if not _RUN_REGISTRY_HYDRATED:
        _RUN_REGISTRY_HYDRATED = True
        try:
            from gateway.platforms import labs_store

            labs_store.init_db()
            for rec in labs_store.load_all():
                rid = rec.get("run_id")
                if rid and rid not in _RUN_REGISTRY:
                    _RUN_REGISTRY[rid] = rec
        except Exception as exc:  # never let hydration break a request
            logger.warning("run registry hydration failed: %s", exc)
    return _RUN_REGISTRY


def _persist_run(run_id: str, record: Dict[str, Any]) -> None:
    """Upsert a run record to the durable store (best-effort, never raises)."""
    try:
        from gateway.platforms import labs_store

        labs_store.persist_run(run_id, record)
    except Exception as exc:
        logger.warning("run persist failed for %s: %s", run_id, exc)

# Injected (per turn, via --append-system-prompt) on tool-launch + /message runs so
# a multi-stage skill (e.g. Brand Maker / Forge) executes exactly ONE stage per turn
# and halts for review — the contract the step-gated Workbench depends on. Without
# it the agent runs the whole pipeline in a single turn and the per-stage approval
# gate is meaningless. Harmless for single-step tools (their one request IS the stage).
_STEP_GATE_SYSTEM_PROMPT = (
    "You are running inside a STEP-GATED Workbench that advances ONE stage at a time. "
    "Execute ONLY the single stage or step the current user message asks for — nothing "
    "beyond it. "
    "You MUST persist this stage's deliverable to disk: actually call the Write tool to "
    "save the stage's artifact file(s) into the brand/output folder BEFORE you end your "
    "turn. Describing, analysing, or narrating the stage in your reply is NOT sufficient — "
    "if you end a turn without having written the artifact file, the stage is lost. Write "
    "the file first, then end your turn. "
    "Do NOT begin, preview, draft, or run any later stage in the same turn, even if you "
    "already know what comes next and even if it seems efficient. The moment the current "
    "stage's artifact is written, STOP and end your turn so the user can review and "
    "approve. The user will send an explicit approval before you continue to the next stage."
)

# Image / video extensions recognised for the artifacts ``kind`` classifier.
_ARTIFACT_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"}
_ARTIFACT_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".avi"}


def _kebab(text: str) -> str:
    """Kebab-case a brand name: lowercase, spaces/punct → hyphens, collapse
    repeats, trim leading/trailing hyphens. Mirrors the brand-identifier rule
    the Brand Maker uses for its 30_Resources/Brands/{brand} artifacts dir.
    """
    s = (text or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-")


def _titleize(kebab: str) -> str:
    """Title-case a kebab brand id for display: "acme-co" → "Acme Co",
    "brackish" → "Brackish". The inverse-ish of _kebab for UI labels.
    """
    parts = [p for p in (kebab or "").split("-") if p]
    return " ".join(p[:1].upper() + p[1:] for p in parts)


def _brands_root() -> Path:
    """Resolve the Brands artifacts root: ``${HERMES_VAULT_PATH}/30_Resources/Brands``.

    Defaults to ``/vault`` in-container (matches the compose rw mount).
    """
    vault = os.environ.get("HERMES_VAULT_PATH", "/vault")
    return Path(os.path.expanduser(vault)) / "30_Resources" / "Brands"


def _artifact_kind(name: str) -> str:
    """Classify an artifact file by extension → html|markdown|image|video|other."""
    ext = Path(name).suffix.lower()
    if ext == ".html":
        return "html"
    if ext == ".md":
        return "markdown"
    if ext in _ARTIFACT_IMAGE_EXTS:
        return "image"
    if ext in _ARTIFACT_VIDEO_EXTS:
        return "video"
    return "other"


def _artifact_content_type(name: str) -> str:
    """Map an artifact file extension to a Content-Type for raw streaming."""
    ext = Path(name).suffix.lower()
    return {
        ".html": "text/html; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")


def _artifact_is_symlinked(candidate: Path, root: Path) -> bool:
    """True when *candidate* (or any path component between *root* and it) is a
    symlink, OR the resolved real path diverges from the lexical path.

    A launched agent with Write+Bash can plant a symlink inside the artifact dir
    pointing at an arbitrary host file; ``validate_within_dir`` follows symlinks
    via ``resolve()``, so a link whose target also resolves inside *root* would
    still pass containment. Rejecting any symlinked component closes that hole —
    the raw endpoints serve only genuine regular files written under *root*."""
    try:
        root_resolved = root.resolve()
        # Walk the LEXICAL candidate path (not resolve()'d — that would erase the
        # very symlinks we're hunting). Each component from root → candidate must
        # be a real (non-symlink) entry. The root itself may legitimately be a
        # symlink (e.g. a mounted dir), so we start checking *below* it.
        try:
            rel = candidate.relative_to(root)
        except ValueError:
            # Not lexically under root → suspect (containment is enforced upstream).
            return True
        cur = root_resolved
        for part in rel.parts:
            cur = cur / part
            if cur.is_symlink():
                return True
        # Final guard: the symlink-free lexical path must equal the real path.
        return candidate.resolve() != (root_resolved / rel)
    except OSError:
        return True


# Per-run MCP servers registered for swarm tools (e.g. the brainstorm PM). Lets
# the orchestrating agent reach Ruflo's coordination tools (swarm_init, memory_*)
# on top of the always-on hermes-tools server. Override the launch command via
# RUFLO_MCP_COMMAND / RUFLO_MCP_ARGS.
def _swarm_mcp_servers() -> Dict[str, Any]:
    import shlex
    command = os.environ.get("RUFLO_MCP_COMMAND", "npx")
    args = shlex.split(os.environ.get("RUFLO_MCP_ARGS", "-y ruflo@latest mcp start"))
    return {"claude-flow": {"command": command, "args": args}}


# The 21st.dev "magic" MCP (UI component generation / inspiration / logo search)
# for the frontend + UX agents. Env-gated: registered ONLY when configured
# (MAGIC_MCP_COMMAND or an API key). When absent, runs degrade gracefully to the
# ui-ux-pro-max / frontend-design skills + WebSearch — never a failure.
def _magic_mcp_servers() -> Dict[str, Any]:
    import shlex
    command = os.environ.get("MAGIC_MCP_COMMAND")
    api_key = os.environ.get("MAGIC_MCP_API_KEY") or os.environ.get("TWENTYFIRST_API_KEY")
    if not command and not api_key:
        return {}
    server: Dict[str, Any] = {
        "command": command or "npx",
        "args": shlex.split(os.environ.get("MAGIC_MCP_ARGS", "-y @21st-dev/magic@latest")),
    }
    if api_key:
        server["env"] = {"API_KEY": api_key, "TWENTYFIRST_API_KEY": api_key}
    return {"magic": server}


_SWARM_MCP_SERVERS: Dict[str, Any] = _swarm_mcp_servers()
_MAGIC_MCP_SERVERS: Dict[str, Any] = _magic_mcp_servers()


def _manifest_for(tool_id: str) -> Optional[Any]:
    """Resolve a single ToolManifest by id (best-effort, None on any failure)."""
    try:
        from tools.tool_manifest import discover_manifests
        for m in discover_manifests():
            if getattr(m, "tool", None) == tool_id:
                return m
    except Exception:
        logger.debug("manifest lookup failed for %s", tool_id, exc_info=True)
    return None


def _expand_env_template(tmpl: str) -> str:
    """Expand ``${VAR}`` / ``${VAR:-default}`` shell-style refs against the engine
    environment. Mirrors how the launched agent's shell would resolve them, so the
    engine and the agent agree on the same absolute path."""
    def repl(m: "re.Match[str]") -> str:
        var, default = m.group(1), m.group(2)
        return os.environ.get(var, default if default is not None else "")
    return re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}", repl, tmpl)


def _root_from_manifest(manifest: Optional[Any]) -> Optional[Path]:
    """Resolve a tool's artifacts base dir from its ``artifacts_root`` template:
    expand env refs, then strip the trailing ``{placeholder}/`` so callers append
    the per-session slug. Returns None when the manifest has no template."""
    tmpl = getattr(manifest, "artifacts_root", None) if manifest else None
    if not tmpl:
        return None
    expanded = _expand_env_template(tmpl)
    base = re.sub(r"/\{[^}]+\}/?$", "", expanded).rstrip("/")
    return Path(os.path.expanduser(base)) if base else None


def _user_tools_root() -> Optional[Path]:
    """The writable root user-authored tools are installed into (host ``~/.hermes/
    skills`` → ``/opt/data/skills`` in-container). ``HERMES_USER_TOOLS_ROOT`` is
    the canonical env (set by compose); falls back to the last writable entry of
    ``HERMES_TOOL_ROOTS`` so the convention matches ``tool_builder._writable_root``.
    Returns None when neither is resolvable (no user-tools root → nothing to gate)."""
    env = os.environ.get("HERMES_USER_TOOLS_ROOT", "").strip()
    if env:
        return Path(os.path.expanduser(env))
    roots_env = os.environ.get("HERMES_TOOL_ROOTS", "").strip()
    if roots_env:
        parts = [p for p in roots_env.split(os.pathsep) if p.strip()]
        if len(parts) > 1:
            # By deployment convention the LAST entry is the writable user root.
            return Path(os.path.expanduser(parts[-1]))
    return None


def _approved_artifacts_bases() -> List[Path]:
    """Bases a USER-authored tool's ``artifacts_root`` is allowed to resolve into:
    the writable data root (``/opt/data``) and the vault (``HERMES_VAULT_PATH``).
    Built-in tools are exempt (their roots are trusted, repo-controlled)."""
    bases: List[Path] = []
    user_root = _user_tools_root()
    if user_root is not None:
        # ``/opt/data/skills`` → data root is its parent (``/opt/data``).
        bases.append(user_root.parent)
    vault = os.environ.get("HERMES_VAULT_PATH")
    if vault:
        bases.append(Path(os.path.expanduser(vault)))
    return bases


def _is_user_authored(manifest: Optional[Any]) -> bool:
    """True when the manifest was discovered under the writable user-tools root
    (so its ``artifacts_root`` is attacker-controllable and must be contained)."""
    src = getattr(manifest, "source_path", None) if manifest else None
    user_root = _user_tools_root()
    if not src or user_root is None:
        return False
    try:
        Path(src).resolve().relative_to(user_root.resolve())
        return True
    except (ValueError, OSError):
        return False


def _collection_root_for(tool_id: str) -> Path:
    """The artifacts base dir for a tool, taken from its manifest ``artifacts_root``
    (so each tool writes to its own — possibly writable, non-vault — location).
    Falls back to the vault Brands root when the manifest has no template.

    For USER-authored tools (manifest under the writable user-tools root), the
    resolved root MUST stay inside an approved base (``/opt/data`` or the vault);
    an escaping template is clamped to the Brands root rather than honoured, so a
    user-built tool cannot redirect artifact reads at arbitrary host paths.
    Built-in tools (read-only repo roots) are trusted and unchanged."""
    manifest = _manifest_for(tool_id)
    root = _root_from_manifest(manifest)
    if root is None:
        return _brands_root()
    if _is_user_authored(manifest):
        bases = _approved_artifacts_bases()
        if bases:
            try:
                resolved = root.resolve()
            except OSError:
                return _brands_root()
            contained = False
            for base in bases:
                try:
                    resolved.relative_to(base.resolve())
                    contained = True
                    break
                except (ValueError, OSError):
                    continue
            if not contained:
                logger.warning(
                    "tool %s artifacts_root %s escapes approved bases; clamping",
                    tool_id, root,
                )
                return _brands_root()
    return root


def _artifacts_dir_for(tool_id: str, record: Dict[str, Any]) -> Optional[Path]:
    """Resolve the on-disk artifacts dir for a run, honouring the tool's
    ``artifacts_root`` collection (``Brands`` vs ``Brainstorms`` …). Mirrors
    ``_brands_root()`` env handling so the Brand Maker path is unchanged."""
    slug = _kebab(record.get("brand") or "")
    if not slug:
        return None
    return _collection_root_for(tool_id) / slug


def _workspaces_root() -> Path:
    """Workspaces root that promoted brainstorm folders are copied into. Defaults
    to the rw data mount (``/opt/data/workspaces``) since the vault is read-only
    in-container; override with ``HERMES_WORKSPACES_PATH``."""
    override = os.environ.get("HERMES_WORKSPACES_PATH")
    if override:
        return Path(os.path.expanduser(override))
    return Path(os.path.expanduser(os.environ.get("HERMES_DATA_PATH", "/opt/data"))) / "workspaces"


# Marker file written into every pipeline-created workspace. The workspaces root
# (10_Projects) also holds the user's own projects, so the list endpoint only
# surfaces folders carrying this marker — and reads its metadata instead of
# recursively walking the (potentially huge) project tree.
_WORKSPACE_MARKER = ".agent-home-conf"

# Running build/run/test scripts, keyed "{slug}:{script}". The process is started
# in its own session so we can kill the whole tree (a dev server + children).
_WORKSPACE_EXEC_PROCS: Dict[str, Any] = {}
# Only these three scripts are runnable from the dashboard — never arbitrary commands.
_WORKSPACE_SCRIPTS = ("build", "run", "test")

# Folders hidden from the "local folder" picker (noise / heavy build output).
_BROWSE_SKIP = {
    "node_modules", "dist", "build", ".venv", "__pycache__", ".next",
    ".swarm", ".claude-flow", "venv", "target",
}


def _browse_root() -> Path:
    """Root the local-folder picker may browse. Defaults to the mounted vault (the
    parent of the workspaces root), so any picked folder is engine-readable. Override
    with HERMES_BROWSE_ROOT."""
    env = os.environ.get("HERMES_BROWSE_ROOT")
    if env:
        return Path(env)
    return _collection_root_for("workspace").parent


def _kill_proc_group(proc: Any) -> None:
    """Best-effort terminate a script's whole process group (SIGTERM)."""
    import os
    import signal
    if proc is None or proc.returncode is not None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.terminate()
        except ProcessLookupError:
            pass


def _write_workspace_marker(dest: Path, meta: Dict[str, Any]) -> None:
    """Stamp a workspace folder so the list endpoint recognises (and cheaply
    describes) it without scanning the tree."""
    try:
        (dest / _WORKSPACE_MARKER).write_text(
            json.dumps({**meta, "agent_home": True}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        logger.warning("could not write workspace marker for %s", dest, exc_info=True)


def _ingest_workspace(source_type: str, source_ref: str, dest: Path) -> None:
    """Materialize a workspace at *dest* from one of three sources (blocking; call
    via run_in_executor). Never overwrites a non-empty existing workspace."""
    import shutil
    import subprocess
    if dest.exists() and any(dest.iterdir()):
        raise ValueError(f"workspace already exists and is non-empty: {dest}")
    dest.parent.mkdir(parents=True, exist_ok=True)

    if source_type == "github":
        url = (source_ref or "").strip()
        # Only https:// clones from an allow-list of public hosts. SSH (`git@`) is
        # rejected — it would let the engine open TCP to arbitrary internal hosts
        # (SSRF). Override the host allow-list via HERMES_GIT_ALLOWED_HOSTS (csv).
        from urllib.parse import urlparse
        allowed = {h.strip().lower() for h in os.environ.get(
            "HERMES_GIT_ALLOWED_HOSTS", "github.com,gitlab.com,bitbucket.org",
        ).split(",") if h.strip()}
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or host not in allowed:
            raise ValueError(
                "github source must be an https:// URL on an allowed host "
                f"({', '.join(sorted(allowed))})"
            )
        git = os.environ.get("GIT_BIN", "git")
        proc = subprocess.run(
            # `--` so a crafted URL can't be parsed as a flag.
            [git, "clone", "--depth", "1", "--", url, str(dest)],
            capture_output=True, text=True, timeout=600,
        )
        if proc.returncode != 0:
            raise ValueError(f"git clone failed: {proc.stderr.strip()[:300]}")
        return

    if source_type == "folder":
        src = Path(os.path.expanduser((source_ref or "").strip()))
        if not src.is_dir():
            raise ValueError(f"folder source not found: {src}")
        # Containment: only ingest folders inside the browsable root (the mounted
        # vault) — never an arbitrary host path like /opt/data or /etc, which the
        # raw API would otherwise copy into a servable workspace.
        broot = _browse_root().resolve()
        try:
            contained = src.resolve().is_relative_to(broot)
        except Exception:
            contained = False
        if not contained:
            raise ValueError(f"folder source must be inside the browsable root ({broot})")
        # Skip heavy/VCS dirs so the copy is fast and clean. symlinks=True copies
        # links as-is (does NOT follow them out of the tree → no exfiltration).
        ignore = shutil.ignore_patterns(".git", "node_modules", "dist", "build", ".venv", "__pycache__")
        shutil.copytree(src, dest, dirs_exist_ok=True, ignore=ignore, symlinks=True)
        return

    if source_type == "brainstorm":
        src = _collection_root_for("brainstorm") / _kebab(source_ref or "")
        if not src.is_dir():
            raise ValueError(f"brainstorm session not found: {source_ref!r}")
        # Seed the workspace with the PRD/docs only — skip the brainstorm's own
        # state files (qna/readiness/steering/ruflo) so the workspace provisions
        # fresh with the refined PRD as its spec.
        ignore = shutil.ignore_patterns(
            "qna.json", "readiness.json", "CLAUDE.md", ".swarm-provisioned",
            ".claude-flow", ".swarm",
        )
        shutil.copytree(src, dest, dirs_exist_ok=True, ignore=ignore)
        return

    raise ValueError(f"unknown source_type: {source_type!r}")


def _kick_ruflo_init(folder: Path) -> None:
    """Fire `ruflo init` inside *folder* in the background (best-effort). Never
    blocks the launch or the agent's first turn; failures are logged at debug.
    Disable with ``HERMES_DISABLE_RUFLO_INIT=1``; override cmd via ``RUFLO_INIT_CMD``."""
    if os.environ.get("HERMES_DISABLE_RUFLO_INIT") == "1":
        return
    import shlex
    cmd = shlex.split(os.environ.get("RUFLO_INIT_CMD", "npx -y ruflo@latest init"))

    async def _run() -> None:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, cwd=str(folder),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await asyncio.wait_for(proc.wait(), timeout=180)
        except Exception:
            logger.debug("ruflo init best-effort failed in %s", folder, exc_info=True)

    try:
        asyncio.get_running_loop().create_task(_run())
    except RuntimeError:
        logger.debug("ruflo init skipped: no running loop")


def _provision_swarm_session(manifest: Any, slug: str, project: str, brief: str) -> Optional[Path]:
    """Provision a swarm tool's session folder before the agent's first turn:
    create the dir on the (writable) artifacts root, write the steering
    ``CLAUDE.md`` from the skill's template, and kick `ruflo init`. Idempotent via
    a sentinel so relaunch/restart is cheap. Returns the folder (or None on mkdir
    failure)."""
    root = _root_from_manifest(manifest) or _brands_root()
    folder = root / slug
    sentinel = folder / ".swarm-provisioned"
    if sentinel.exists():
        return folder  # already set up — keep relaunch/restart cheap
    try:
        folder.mkdir(parents=True, exist_ok=True)
    except OSError:
        logger.warning("swarm provision: mkdir failed for %s", folder, exc_info=True)
        return None

    steering = getattr(manifest, "steering", None)
    source_path = getattr(manifest, "source_path", None)
    # Never clobber a project's existing CLAUDE.md (workspaces ingested from a
    # folder/repo may already have one — the agent updates it during provisioning).
    if steering and source_path and not (folder / "CLAUDE.md").exists():
        tmpl_path = Path(source_path).parent / "assets" / steering
        try:
            tmpl = tmpl_path.read_text(encoding="utf-8")
            doc = (
                tmpl.replace("{{PROJECT}}", project or slug)
                    .replace("{{SLUG}}", slug)
                    .replace("{{FOLDER}}", str(folder))
                    .replace("{{BRIEF}}", brief or "_(none provided)_")
            )
            (folder / "CLAUDE.md").write_text(doc, encoding="utf-8")
        except OSError:
            logger.warning("swarm provision: steering write failed for %s", folder, exc_info=True)

    _kick_ruflo_init(folder)
    try:
        sentinel.write_text("ok\n", encoding="utf-8")
    except OSError:
        pass
    return folder


# ---------------------------------------------------------------------------
# Run-start helper (B2) — reuses adapter machinery, no api_server.py edit
# ---------------------------------------------------------------------------

def _start_run(
    adapter: Any,
    run_id: str,
    user_message: str,
    session_id: str,
    *,
    goal_manager: Optional[Any] = None,
    model_override: Optional[str] = None,
    append_system_prompt: Optional[str] = None,
    resume_claude_session_id: Optional[str] = None,
    run_record: Optional[Dict[str, Any]] = None,
    swarm: bool = False,
    run_cwd: Optional[str] = None,
) -> None:
    """Register a new run on *adapter* and fire the background asyncio task.

    Replicates the minimal subset of ``_handle_create_run`` needed by the
    tool-launch and goal endpoints:

    - Allocates the per-run ``asyncio.Queue`` and registers it in the
      adapter's ``_run_streams`` / ``_run_streams_created`` / ``_run_approval_sessions``
      dicts (same keys ``_handle_run_events`` expects).
    - Sets initial run status via ``adapter._set_run_status``.
    - Emits a ``run.header`` event so the dashboard has a header chip
      immediately.
    - Creates an ``AIAgent`` via ``adapter._create_agent`` and schedules
      ``_run_and_close`` as an asyncio task.

    When *goal_manager* is provided the inner task runs a Ralph-style judge
    loop: after each ``agent.run_conversation`` call it calls
    ``gm.evaluate_after_turn(response)``; if ``should_continue`` it feeds the
    continuation prompt back in and emits a ``goal.verdict`` event each turn.

    **Callers must be inside an active asyncio event loop** (i.e., called from
    a coroutine or task — both ``_tool_launch`` and ``_goal`` are aiohttp
    handlers so this is always true).
    """
    loop = asyncio.get_running_loop()
    q: "asyncio.Queue[Optional[Dict[str, Any]]]" = asyncio.Queue()
    created_at = time.time()

    approval_session_key = session_id
    adapter._run_streams[run_id] = q
    adapter._run_streams_created[run_id] = created_at
    adapter._run_approval_sessions[run_id] = approval_session_key

    # Build text-delta callback so message.delta events flow to the queue.
    def _text_cb(delta: Optional[str]) -> None:
        if delta is None:
            return
        try:
            loop.call_soon_threadsafe(q.put_nowait, {
                "event": "message.delta",
                "run_id": run_id,
                "timestamp": time.time(),
                "delta": delta,
            })
        except Exception:
            pass

    adapter._set_run_status(
        run_id,
        "queued",
        created_at=created_at,
        session_id=session_id,
        model="",
    )

    # Emit run.header immediately (mirrors _handle_create_run).
    try:
        loop.call_soon_threadsafe(q.put_nowait, {
            "event": "run.header",
            "run_id": run_id,
            "timestamp": time.time(),
            "model": "",
            "tools": [],
            "mcp_servers": [],
        })
    except Exception:
        pass

    async def _run_and_close() -> None:
        try:
            adapter._set_run_status(run_id, "running")
            event_cb, on_event_cb = adapter._make_run_event_callback(run_id, loop)
            # Labs, Brainstorm and Workspace runs are the Tier-2 surface.
            agent = adapter._create_agent(
                session_id=session_id,
                stream_delta_callback=_text_cb,
                tool_progress_callback=event_cb,
                ephemeral_system_prompt=append_system_prompt,
                tier="t2",
            )
            adapter._active_run_agents[run_id] = agent
            agent.run_event_callback = on_event_cb
            # Resume an existing Claude Code conversation (live Workbench /message):
            # pre-create the lazy ClaudeCodeSession and seed its session_id so the
            # next turn runs `claude --resume <id>`, continuing Forge's session.
            if resume_claude_session_id:
                try:
                    from agent.claude_code_runtime import ClaudeCodeSession
                    cwd = getattr(agent, "session_cwd", None) or os.getcwd()
                    sess = ClaudeCodeSession(cwd=cwd)
                    sess.session_id = resume_claude_session_id
                    agent._claude_session = sess
                except Exception:
                    logger.debug("[api_dashboard] resume seed failed for %s",
                                 run_id, exc_info=True)
            # Per-request claude_code hooks (Labs builder/refine): a persona via
            # --append-system-prompt and Opus 4.8 via --model. Both default to
            # None elsewhere → unchanged behaviour for normal tool launches.
            if append_system_prompt:
                agent._append_system_prompt = append_system_prompt
            if model_override:
                agent._model_override = model_override

            # Filesystem latitude for tool-launch runs (Labs). The launched skill
            # (e.g. Brand Maker / Forge) must read its references (/opt/skills, via
            # the /opt/data/.claude/skills symlinks), the user's uploaded docs
            # (/opt/data/uploads), and write artifacts to the vault Brands mount
            # (HERMES_VAULT_PATH, rw). These live outside the CLI cwd, so without
            # --add-dir + a widened allow-list every Read/Bash/Write is blocked by a
            # headless permission prompt. The fast voice/chat path goes through the
            # api_server chat route (NOT _start_run), so it stays locked to the
            # curated mcp__hermes-tools allow-list — unchanged here.
            agent._extra_dirs = [
                d for d in (
                    "/opt/skills",
                    "/opt/data",
                    os.environ.get("HERMES_VAULT_PATH", "/vault"),
                ) if d and os.path.isdir(d)
            ]
            agent._allowed_tools_override = os.environ.get(
                "CLAUDE_TOOL_LAUNCH_ALLOWED_TOOLS",
                "mcp__hermes-tools Read Glob Grep Edit Write Bash "
                "WebFetch WebSearch TodoWrite",
            )

            # Swarm tools (e.g. the brainstorm PM) orchestrate a sub-agent fleet:
            # widen the allow-list with the native Task tool + the claude-flow
            # (Ruflo) MCP, and register that MCP server for this run only. The
            # default tool/chat path is untouched (swarm defaults False).
            if swarm:
                default_allowed = agent._allowed_tools_override + " Agent Task mcp__claude-flow"
                extra_servers = dict(_SWARM_MCP_SERVERS)
                # 21st.dev magic MCP for the frontend/UX agents, when configured.
                if _MAGIC_MCP_SERVERS:
                    extra_servers.update(_MAGIC_MCP_SERVERS)
                    default_allowed += " mcp__magic"
                agent._allowed_tools_override = os.environ.get(
                    "CLAUDE_TOOL_LAUNCH_SWARM_ALLOWED_TOOLS", default_allowed,
                )
                agent._extra_mcp_servers = extra_servers
                # Tail each spawned specialist's transcript so its live thinking/
                # text/tools surface in the dashboard (the CLI doesn't stream
                # sub-agent internals to the parent process).
                agent._subagent_tail = True

            # Workspace runs operate on the project folder (BMAD skills, git, builds).
            if run_cwd:
                agent._run_cwd = run_cwd

            def _approval_notify(approval_data: Dict[str, Any]) -> None:
                event = dict(approval_data or {})
                event.update({
                    "event": "approval.request",
                    "run_id": run_id,
                    "timestamp": time.time(),
                    "choices": ["once", "session", "always", "deny"],
                })
                adapter._set_run_status(run_id, "waiting_for_approval",
                                        last_event="approval.request")
                try:
                    loop.call_soon_threadsafe(q.put_nowait, event)
                except Exception:
                    pass

            def _run_turn(prompt: str) -> Any:
                """Run one agent turn synchronously (called from executor)."""
                from gateway.session_context import clear_session_vars, set_session_vars
                from tools.approval import (
                    register_gateway_notify,
                    reset_current_session_key,
                    set_current_session_key,
                    unregister_gateway_notify,
                )
                approval_token = None
                session_tokens: List[Any] = []
                try:
                    approval_token = set_current_session_key(approval_session_key)
                    session_tokens = set_session_vars(
                        platform="api_server",
                        session_key=approval_session_key,
                    )
                    register_gateway_notify(approval_session_key, _approval_notify)
                    result = agent.run_conversation(
                        user_message=prompt,
                        conversation_history=[],
                        task_id=session_id,
                    )
                    return result
                finally:
                    try:
                        unregister_gateway_notify(approval_session_key)
                    finally:
                        if approval_token is not None:
                            try:
                                reset_current_session_key(approval_token)
                            except Exception:
                                pass
                        if session_tokens:
                            try:
                                clear_session_vars(session_tokens)
                            except Exception:
                                pass

            def _run_sync() -> Any:
                return _run_turn(user_message)

            if goal_manager is not None:
                # Goal mode: Ralph-style judge loop.
                result = await loop.run_in_executor(None, _run_sync)
                turns_used = 0

                while True:
                    turns_used += 1
                    final_response = (
                        result.get("final_response", "") if isinstance(result, dict) else ""
                    )
                    decision = goal_manager.evaluate_after_turn(
                        final_response, user_initiated=(turns_used == 1)
                    )

                    # Emit verdict event so client can track progress.
                    # Use q.put_nowait directly: _run_and_close is an asyncio
                    # coroutine already running in the event loop, so
                    # call_soon_threadsafe would defer to the next tick and
                    # arrive AFTER the run.completed put_nowait below.
                    try:
                        q.put_nowait({
                            "event": "goal.verdict",
                            "run_id": run_id,
                            "timestamp": time.time(),
                            "verdict": decision.get("verdict"),
                            "reason": decision.get("reason", ""),
                            "status": decision.get("status"),
                            "turns_used": turns_used,
                            "message": decision.get("message", ""),
                        })
                    except Exception:
                        pass

                    if not decision.get("should_continue"):
                        # Done, paused, or error — emit final run event.
                        verdict = decision.get("verdict")
                        if verdict == "done":
                            q.put_nowait({
                                "event": "run.completed",
                                "run_id": run_id,
                                "timestamp": time.time(),
                                "output": final_response,
                                "goal_status": "done",
                                "reason": decision.get("reason", ""),
                            })
                            adapter._set_run_status(
                                run_id, "completed",
                                output=final_response,
                                last_event="run.completed",
                            )
                        else:
                            q.put_nowait({
                                "event": "run.completed",
                                "run_id": run_id,
                                "timestamp": time.time(),
                                "output": final_response,
                                "goal_status": decision.get("status"),
                                "reason": decision.get("reason", ""),
                            })
                            adapter._set_run_status(
                                run_id, "completed",
                                last_event="run.completed",
                            )
                        break

                    continuation = decision.get("continuation_prompt", "")
                    if not continuation:
                        break

                    def _cont_turn(p: str = continuation) -> Any:
                        return _run_turn(p)

                    result = await loop.run_in_executor(None, _cont_turn)

            else:
                # Plain tool-launch run — single conversation turn. Read real token
                # usage off the agent after the turn (run_conversation returns a
                # dict; the counters live on the agent), not a zeroed placeholder.
                result = await loop.run_in_executor(None, _run_sync)
                usage = {
                    "input_tokens": getattr(agent, "session_prompt_tokens", 0) or 0,
                    "output_tokens": getattr(agent, "session_completion_tokens", 0) or 0,
                    "total_tokens": getattr(agent, "session_total_tokens", 0) or 0,
                }

                # Persist the Claude Code session id so a /message follow-up can
                # --resume this exact conversation (live Workbench).
                if run_record is not None:
                    # Terminal: mark the run complete so the latest-run lookup
                    # can report it (both success and agent-reported failure).
                    run_record["completed"] = True
                    if isinstance(result, dict):
                        csid = result.get("claude_session_id")
                        if csid:
                            run_record["claude_session_id"] = csid
                    # Durable terminal: persist completed + claude_session_id so a
                    # post-restart /message can --resume this exact conversation
                    # and runs/latest reports it as finished.
                    _persist_run(run_id, run_record)

                if isinstance(result, dict) and result.get("failed"):
                    error_msg = result.get("error") or "agent run failed"
                    q.put_nowait({
                        "event": "run.failed",
                        "run_id": run_id,
                        "timestamp": time.time(),
                        "error": error_msg,
                    })
                    adapter._set_run_status(run_id, "failed", error=error_msg,
                                             last_event="run.failed")
                else:
                    final_response = (
                        result.get("final_response", "") if isinstance(result, dict) else ""
                    )
                    usage_out = usage if isinstance(usage, dict) else {}
                    q.put_nowait({
                        "event": "run.completed",
                        "run_id": run_id,
                        "timestamp": time.time(),
                        "output": final_response,
                        "usage": usage_out,
                    })
                    adapter._set_run_status(run_id, "completed",
                                             output=final_response, usage=usage_out,
                                             last_event="run.completed")

        except asyncio.CancelledError:
            adapter._set_run_status(run_id, "cancelled", last_event="run.cancelled")
            try:
                q.put_nowait({
                    "event": "run.cancelled",
                    "run_id": run_id,
                    "timestamp": time.time(),
                })
            except Exception:
                pass
            raise
        except Exception as exc:
            logger.exception("[api_dashboard] run %s failed", run_id)
            adapter._set_run_status(run_id, "failed", error=str(exc),
                                     last_event="run.failed")
            try:
                q.put_nowait({
                    "event": "run.failed",
                    "run_id": run_id,
                    "timestamp": time.time(),
                    "error": str(exc),
                })
            except Exception:
                pass
        finally:
            try:
                from tools.approval import unregister_gateway_notify
                unregister_gateway_notify(approval_session_key)
            except Exception:
                pass
            # Turn settled (success, failure, cancel, or error): clear the
            # concurrency guard so the next /message can resume the session.
            if run_record is not None:
                run_record["busy"] = False
                # Capture the adapter's canonical terminal status (completed /
                # failed / cancelled) so the persisted record + liveness endpoint
                # report it accurately after a restart.
                try:
                    st = adapter._run_statuses.get(run_id) or {}
                    if st.get("status"):
                        run_record["status"] = st["status"]
                except Exception:
                    pass
                # Persist the settled state (busy is in-memory only, but this
                # also captures status + claude_session_id set this turn).
                _persist_run(run_id, run_record)
            # Sentinel: signal SSE stream to close.
            try:
                q.put_nowait(None)
            except Exception:
                pass
            adapter._active_run_agents.pop(run_id, None)
            adapter._active_run_tasks.pop(run_id, None)
            adapter._run_approval_sessions.pop(run_id, None)

    task = asyncio.create_task(_run_and_close())
    adapter._active_run_tasks[run_id] = task
    try:
        adapter._background_tasks.add(task)
    except (TypeError, AttributeError):
        pass
    if hasattr(task, "add_done_callback"):
        try:
            task.add_done_callback(adapter._background_tasks.discard)
        except AttributeError:
            pass


# ---------------------------------------------------------------------------
# Helpers: tool-input file uploads (POST /v1/tools/{tool_id}/upload)
# ---------------------------------------------------------------------------

# Per-file cap and the field-id charset allowlist. Files land under the
# writable data root only (``/opt/data/uploads`` == host ``~/.hermes/uploads``);
# ``/vault`` and ``/opt/skills`` are read-only and are never written here.
_UPLOAD_MAX_BYTES = 25 * 1024 * 1024  # 25 MB per file
_UPLOAD_FIELD_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
# Brand-asset uploads land in the rw /vault Brands mount and may include video,
# so they get a larger per-file cap than the data-root tool uploads above.
_BRAND_ASSET_MAX_BYTES = 200 * 1024 * 1024  # 200 MB per file


def _uploads_root() -> Path:
    """Resolve the writable uploads root: ``/opt/data/uploads`` in-container.

    Derives the read-WRITE data root from ``HERMES_TOOL_ROOTS`` (canonical
    deployment ``/opt/skills:/opt/data/skills``) — the writable skills root's
    parent is the ``~/.hermes`` mount (``/opt/data``).  Mirrors
    ``tool_builder._writable_root``'s env-driven selection so we never write to
    the read-only ``/opt/skills`` or ``/vault`` mounts.  Falls back to
    ``~/.hermes`` (local/dev) when the env is unset.
    """
    env = os.environ.get("HERMES_TOOL_ROOTS", "").strip()
    if env:
        roots = [p for p in env.split(os.pathsep) if p.strip()]
        for raw in reversed(roots):
            candidate = Path(raw).expanduser()
            try:
                candidate.mkdir(parents=True, exist_ok=True)
                if os.access(candidate, os.W_OK):
                    # ``.../skills`` → data root is its parent.
                    return candidate.parent / "uploads"
            except OSError:
                continue
    try:
        from hermes_constants import get_hermes_home
        data_root = get_hermes_home()
    except Exception:
        data_root = Path(os.path.expanduser("~/.hermes"))
    return data_root / "uploads"


def _sanitize_upload_filename(name: Optional[str]) -> Optional[str]:
    """Reduce an uploaded part's filename to a safe basename.

    Strips any directory components (path-separator agnostic), rejects traversal
    and hidden/empty names, and allowlists a conservative charset.  Returns the
    safe basename, or ``None`` when no usable name can be produced (caller 4xx).
    """
    if not isinstance(name, str):
        return None
    # Basename only — drop everything up to the last '/' or '\\'.
    base = re.split(r"[\\/]", name)[-1].strip()
    if not base or base in {".", ".."} or ".." in base:
        return None
    # Collapse disallowed characters to '_'; keep word chars, dot, dash, space.
    base = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip(" .")
    if not base or base in {".", ".."}:
        return None
    return base[:128]


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------

def register_dashboard_routes(app: "Any", adapter: "Any") -> None:
    """Register the dashboard data routes on the api_server's aiohttp app.

    Pre-wired in Phase 0; handlers below replace the Phase-0 stubs.
    Idempotent-safe (aiohttp raises on duplicate route; api_server wraps
    this call in try/except so a double-registration won't break startup).
    """
    from aiohttp import web  # local import to match api_server's lazy pattern

    # ------------------------------------------------------------------
    # GET /v1/tasks — Kanban board → Task[]
    # ------------------------------------------------------------------
    async def _tasks(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            kb, conn = _connect_kanban()
            try:
                rows = kb.list_tasks(conn, include_archived=False, limit=200)
                tasks = [_task_to_dict(t) for t in rows]
            finally:
                conn.close()
            return web.json_response({"tasks": tasks})
        except ImportError:
            logger.debug("/v1/tasks: hermes_cli not available")
            return web.json_response({"tasks": [], "error": "kanban_db unavailable"})
        except Exception as exc:
            logger.exception("/v1/tasks failed")
            return web.json_response({"tasks": [], "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/memory — vault note titles → MemoryGraph
    # ------------------------------------------------------------------
    async def _memory(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            labels = _vault_labels(cap=40)
            graph = _build_galaxy(labels)
            return web.json_response({"graph": graph})
        except Exception as exc:
            logger.exception("/v1/memory failed; returning fallback galaxy")
            fallback = _build_galaxy(_FALLBACK_LABELS)
            return web.json_response({"graph": fallback, "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/memory/graph — full vault graph (nodes + [[wikilink]] edges)
    # Cached in-process (mtime/TTL) so the ~3,500-file scan isn't per-request.
    # ------------------------------------------------------------------
    async def _memory_graph(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from gateway.platforms import vault_graph
            loop = asyncio.get_running_loop()
            graph = await loop.run_in_executor(None, vault_graph.build_graph)
            return web.json_response(graph)
        except Exception as exc:
            logger.exception("/v1/memory/graph failed")
            return web.json_response(
                {"nodes": [], "links": [], "projects": [], "error": str(exc)},
                status=500,
            )

    # ------------------------------------------------------------------
    # GET /v1/memory/note?path=<id> — note detail (content + links/backlinks).
    # Path is validated to stay within the vault root (traversal → 400).
    # ------------------------------------------------------------------
    async def _memory_note(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        rel_path = request.query.get("path", "")
        if not rel_path:
            return web.json_response(
                {"error": "missing_path", "detail": "'path' query param required"},
                status=400,
            )
        try:
            from gateway.platforms import vault_graph
            loop = asyncio.get_running_loop()
            note = await loop.run_in_executor(None, vault_graph.read_note, rel_path)
        except Exception as exc:
            logger.exception("/v1/memory/note failed for %r", rel_path)
            return web.json_response({"error": "read_error", "detail": str(exc)}, status=500)
        if note is None:
            return web.json_response(
                {"error": "invalid_path",
                 "detail": "path not found or outside the vault"},
                status=400,
            )
        return web.json_response(note)

    # ------------------------------------------------------------------
    # GET /v1/memory/search?q=&k= — Brain semantic search with a filesystem
    # full-text fallback. ``source`` reports which lane produced the results.
    # ------------------------------------------------------------------
    async def _memory_search(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        query = (request.query.get("q") or "").strip()
        try:
            k = int(request.query.get("k", "10"))
        except (TypeError, ValueError):
            k = 10
        k = max(1, min(k, 50))
        if not query:
            return web.json_response({"results": [], "source": "filesystem"})

        loop = asyncio.get_running_loop()

        # Lane 1: Brain semantic retrieval. Defensive — a missing/unindexed
        # Brain (Qdrant unreachable, HERMES_BRAIN_INJECT off) must never 500.
        brain_results: list[dict] = []
        try:
            from gateway.platforms import vault_graph

            def _brain_query() -> list[dict]:
                from agent.brain import Brain
                brain = Brain(vault_dir=vault_graph.VAULT_ROOT)
                result = brain.retrieve(query, k=k)

                graph = vault_graph.build_graph()
                meta = {n["id"]: n for n in graph["nodes"]}
                stem_index: dict[str, str] = {}
                for n in graph["nodes"]:
                    stem_index.setdefault(Path(n["id"]).stem.lower(), n["id"])

                def _resolve(src: str) -> Optional[str]:
                    """Map a Brain fact source (abs path / rel path / stem) → node id."""
                    if not src:
                        return None
                    try:
                        cand = Path(src)
                        if cand.is_absolute():
                            nid = cand.resolve().relative_to(vault_graph.VAULT_ROOT).as_posix()
                            return nid if nid in meta else None
                    except Exception:
                        pass
                    rel = src.lstrip("/")
                    if rel in meta:
                        return rel
                    return stem_index.get(Path(src).stem.lower())

                out: list[dict] = []
                seen_ids: set[str] = set()
                for fact in result.similar:
                    nid = _resolve(fact.source or "")
                    if nid is None or nid not in meta or nid in seen_ids:
                        continue
                    seen_ids.add(nid)
                    m = meta[nid]
                    out.append({
                        "id": nid,
                        "title": m["title"],
                        "folder": m["folder"],
                        "project": m["project"],
                        "score": float(fact.score),
                        "snippet": (fact.content or m.get("snippet") or "")[:220],
                    })
                    if len(out) >= k:
                        break
                return out

            brain_results = await loop.run_in_executor(None, _brain_query)
        except Exception:
            logger.debug("/v1/memory/search: Brain lane failed (non-fatal)", exc_info=True)
            brain_results = []

        if brain_results:
            return web.json_response({"results": brain_results, "source": "brain"})

        # Lane 2: filesystem full-text fallback.
        try:
            from gateway.platforms import vault_graph
            results = await loop.run_in_executor(None, vault_graph.fts_search, query, k)
            return web.json_response({"results": results, "source": "filesystem"})
        except Exception as exc:
            logger.exception("/v1/memory/search filesystem fallback failed")
            return web.json_response(
                {"results": [], "source": "filesystem", "error": str(exc)},
                status=500,
            )

    # ------------------------------------------------------------------
    # GET /v1/events — global SSE TaskEvent stream (5-second poll loop)
    # ------------------------------------------------------------------
    async def _events(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        resp = web.StreamResponse(
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            }
        )
        await resp.prepare(request)

        # Track last-seen status per task so we only emit on changes.
        seen_status: dict[str, str] = {}

        async def _poll_and_emit() -> None:
            try:
                kb, conn = _connect_kanban()
                try:
                    rows = kb.list_tasks(conn, include_archived=False, limit=200)
                finally:
                    conn.close()
            except Exception:
                logger.debug("/v1/events poll failed", exc_info=True)
                return

            now_ms = int(time.time() * 1000)
            for t in rows:
                prev = seen_status.get(t.id)
                if prev != t.status:
                    seen_status[t.id] = t.status
                    if prev is not None:
                        # Only emit on actual transitions (skip the first scan)
                        event: dict = {
                            "id": f"ev-{now_ms}-{t.id}",
                            "taskId": t.id,
                            "kind": "status_changed",
                            "message": f"{t.title} → {t.status}",
                            "ts": now_ms,
                        }
                        payload = ("data: " + json.dumps(event) + "\n\n").encode()
                        await resp.write(payload)

        try:
            while True:
                # Keepalive comment so proxies and browsers don't time out
                try:
                    await resp.write(b": keepalive\n\n")
                except (ConnectionResetError, asyncio.CancelledError):
                    break

                await _poll_and_emit()

                try:
                    await asyncio.sleep(5)
                except asyncio.CancelledError:
                    break
        except (ConnectionResetError, asyncio.CancelledError):
            pass  # client disconnected — clean exit
        finally:
            return resp  # noqa: B012 — aiohttp requires returning the prepared response

    # ------------------------------------------------------------------
    # GET /v1/tools — agent-tool manifests → ToolManifest[] (Launchpad)
    # ------------------------------------------------------------------
    async def _tools(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
            tools = [_manifest_to_dict(m) for m in manifests]
            return web.json_response({"tools": tools})
        except Exception as exc:
            logger.exception("/v1/tools failed")
            return web.json_response({"tools": [], "error": str(exc)})

    # ------------------------------------------------------------------
    # GET /v1/approvals — pending approvals across active runs (Trust Rail)
    # Aggregates the per-run approval queues (tools.approval) keyed by the
    # run→session map the api_server maintains. Resolve via the existing
    # POST /v1/runs/{run_id}/approval endpoint.
    # ------------------------------------------------------------------
    async def _approvals(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            from tools.approval import pending_for_session
        except Exception:
            return web.json_response({"approvals": []})

        sessions = dict(getattr(adapter, "_run_approval_sessions", {}) or {})
        now_ms = int(time.time() * 1000)
        out: list[dict] = []
        for run_id, session_key in sessions.items():
            try:
                pend = pending_for_session(session_key)
            except Exception:
                logger.debug("pending_for_session failed for %s", run_id, exc_info=True)
                continue
            for i, data in enumerate(pend):
                text = (
                    data.get("description")
                    or data.get("command")
                    or "Approval requested"
                )
                out.append({
                    "id": f"{run_id}:{i}",
                    "runId": run_id,
                    "text": text,
                    "choices": list(data.get("choices") or _APPROVAL_CHOICES),
                    "ts": now_ms,
                })
        return web.json_response({"approvals": out})

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
            view["services"] = _build_services()
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
                {"models": _MODEL_CATALOG, "tiers": _ROUTING_TIERS, **cfg, "error": str(exc)}
            )
        return web.json_response({"models": _MODEL_CATALOG, "tiers": _ROUTING_TIERS, **cfg})

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

        valid_ids = {m["id"] for m in _MODEL_CATALOG}
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

    # ------------------------------------------------------------------
    # POST /v1/tools/{tool_id}/launch — start a run bound to a tool's skill
    # for the Workbench (Wave 3 / B2). Loads the manifest by id via
    # discover_manifests(), builds a skill-invocation prompt from the
    # tool's launch.skill + caller-supplied inputs, starts a run on the
    # adapter (reusing _start_run), and returns {run_id}.  The client
    # streams progress via GET /v1/runs/{run_id}/events.
    # ------------------------------------------------------------------
    async def _tool_launch(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]

        # Validate tool_id — no path traversal characters.
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        # Load manifests and look up by tool field (= id in the TS type).
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s/launch: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)},
                status=500,
            )

        manifest_map = {m.tool: m for m in manifests}
        manifest = manifest_map.get(tool_id)
        if manifest is None:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool manifest for id={tool_id!r}"},
                status=404,
            )

        # Parse optional inputs body — accept missing / non-JSON body gracefully.
        # An optional top-level "seed" string lets the dashboard resume an
        # existing project (e.g. tell the skill which stages are done + to read
        # existing artifacts and continue). Truncated defensively.
        inputs: Dict[str, Any] = {}
        seed = ""
        try:
            body = await request.json()
            if isinstance(body, dict):
                raw_inputs = body.get("inputs")
                if isinstance(raw_inputs, dict):
                    inputs = raw_inputs
                raw_seed = body.get("seed")
                if isinstance(raw_seed, str):
                    seed = raw_seed.strip()[:4000]
        except Exception:
            pass  # empty or non-JSON body → inputs stays {}

        # Build user_message: invoke the skill, passing inputs as context, then
        # the optional resume seed AFTER the Inputs line. No seed → unchanged.
        skill = manifest.skill
        if inputs:
            try:
                inputs_text = json.dumps(inputs, ensure_ascii=False)
            except Exception:
                inputs_text = str(inputs)
            user_message = f"/{skill}\n\nInputs: {inputs_text}"
        else:
            user_message = f"/{skill}"
        if seed:
            user_message = f"{user_message}\n\n{seed}"

        run_id = f"run_{uuid.uuid4().hex}"
        # Per-tool session: tools share continuity within a session key based on
        # the tool slug so successive launches of the same tool resume context.
        session_id = f"tool-{tool_id}-{uuid.uuid4().hex[:8]}"

        # Register the run so the live-Workbench resume + artifacts endpoints can
        # resolve it. ``brand`` (when supplied as an input) seeds the artifacts
        # dir; ``claude_session_id`` is filled in by _start_run on completion.
        # The primary slug input: ``brand`` for Brand Maker, ``project`` for the
        # brainstorm swarm. Stored under ``brand`` so the whole durable/artifacts/
        # latest-run plumbing resolves it uniformly.
        slug_value = inputs.get("brand") or inputs.get("project")
        brand = slug_value if isinstance(slug_value, str) else ""
        record: Dict[str, Any] = {
            "session_id": session_id,
            "tool_id": tool_id,
            "inputs": inputs,
            "brand": brand,
            "claude_session_id": None,
            "created": time.time(),
            "completed": False,
            # Stage 0 starts running immediately below; the concurrency guard in
            # _run_message rejects an overlapping /message until this clears
            # (reset in _run_and_close's finally).
            "busy": True,
        }
        _run_registry()[run_id] = record
        # Durable mirror so runs/latest + artifacts resolve this run after a
        # restart (best-effort; never blocks the launch).
        _persist_run(run_id, record)

        # Swarm tools: provision the session folder (dir + steering CLAUDE.md +
        # ruflo init) before the agent's first turn so its swarm tools are ready,
        # then tell the agent the EXACT absolute folder so it never guesses a path
        # (the UI reads artifacts from this same engine-resolved dir).
        if getattr(manifest, "swarm", False) and brand:
            try:
                brief = inputs.get("brief") if isinstance(inputs.get("brief"), str) else ""
                folder = _provision_swarm_session(manifest, _kebab(brand), brand, brief or "")
                if folder is not None:
                    user_message += (
                        "\n\nSESSION_FOLDER (absolute path — this exact directory is "
                        "where you MUST write qna.json, readiness.json, prd.md and every "
                        "artifact, and where your steering CLAUDE.md already lives; do "
                        f"NOT invent another path): {folder}"
                    )
            except Exception:
                logger.warning("swarm provision failed for %s", tool_id, exc_info=True)

        _start_run(adapter, run_id, user_message, session_id, run_record=record,
                   append_system_prompt=_STEP_GATE_SYSTEM_PROMPT,
                   swarm=bool(getattr(manifest, "swarm", False)))

        logger.debug(
            "tool launch: tool_id=%s run_id=%s session_id=%s skill=%s",
            tool_id, run_id, session_id, skill,
        )
        return web.json_response({"run_id": run_id, "session_id": session_id}, status=202)

    # ------------------------------------------------------------------
    # POST /v1/runs/{run_id}/message — resume a tool run's Claude Code
    # session with a RAW user turn (live Workbench). Body {"text": "..."}.
    # Streams run events with the SAME frame shape as GET
    # /v1/runs/{run_id}/events so the frontend reuses its parser. Reuses
    # _start_run with the run's stored session_id + claude_session_id so
    # Forge continues its conversation (does NOT re-invoke /{skill}).
    # 404 if run_id unknown; 400 on empty text.
    # ------------------------------------------------------------------
    async def _run_message(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        run_id = request.match_info["run_id"]
        record = _run_registry().get(run_id)
        if record is None:
            return web.json_response(
                {"error": "run_not_found", "detail": f"No run for id={run_id!r}"},
                status=404,
            )

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid_json", "detail": "request body must be JSON"},
                status=400,
            )
        text = body.get("text") if isinstance(body, dict) else None
        if not isinstance(text, str) or not text.strip():
            return web.json_response(
                {"error": "empty_text", "detail": "'text' must be a non-empty string"},
                status=400,
            )
        text = text.strip()

        # Concurrency guard: a tool run executes one turn at a time on a single
        # Claude Code session. If a turn is already in flight (initial launch or a
        # prior /message), starting another would resume the same session mid-turn
        # and interrupt/corrupt the running generation (e.g. a half-written
        # artifact). Reject the overlap so the caller can wait for the turn to
        # settle. The dashboard also disables its send/approve controls while
        # streaming; this is the server-side backstop.
        if record.get("busy"):
            return web.json_response(
                {"error": "run_busy",
                 "detail": "a turn is already in progress for this run"},
                status=409,
            )

        # Start a fresh run on the SAME session_id, resuming the same Claude
        # Code conversation. Reuse the run_id so the SSE stream stays bound to
        # the original run (its _run_streams queue is re-created by _start_run).
        record["busy"] = True
        _persist_run(run_id, record)
        session_id = record["session_id"]
        # Swarm tools need the Task tool + Ruflo on resume turns too (the refine
        # loop re-spawns specialists), so carry the manifest's swarm flag through.
        tool_id = record.get("tool_id") or ""
        is_swarm = bool(getattr(_manifest_for(tool_id), "swarm", False))
        # Workspace runs operate on the project folder — resume turns (every
        # directive: start design, approve, implement…) MUST run there too, else
        # the orchestrator resumes in engine_root and can't find the workspace.
        # Prefer the record's stored cwd; derive from the artifacts dir after a
        # restart (when the in-memory cwd is gone).
        run_cwd = record.get("run_cwd")
        if not run_cwd and tool_id == "workspace":
            wsdir = _artifacts_dir_for(tool_id, record)
            run_cwd = str(wsdir) if wsdir else None
        _start_run(
            adapter, run_id, text, session_id,
            resume_claude_session_id=record.get("claude_session_id"),
            run_record=record,
            append_system_prompt=_STEP_GATE_SYSTEM_PROMPT,
            swarm=is_swarm,
            run_cwd=run_cwd,
        )

        # Stream the run events with the identical frame shape as
        # _handle_run_events: a `data: {json}\n\n` SSE line per event, closing
        # on the None sentinel. We drain the adapter's per-run queue directly.
        for _ in range(20):
            if run_id in adapter._run_streams:
                break
            await asyncio.sleep(0.05)
        q = adapter._run_streams.get(run_id)
        if q is None:
            # The run task is in flight but never registered a stream — clear any
            # stale created-marker so /status doesn't report this run "live"
            # forever (the dashboard would subscribe to a queue that never fills).
            try:
                adapter._run_streams.pop(run_id, None)
                getattr(adapter, "_run_streams_created", {}).pop(run_id, None)
            except Exception:
                pass
            return web.json_response(
                {"error": "stream_unavailable", "detail": "run stream not ready"},
                status=500,
            )

        response = web.StreamResponse(
            status=200,
            headers={
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )
        await response.prepare(request)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    await response.write(b": keepalive\n\n")
                    continue
                if event is None:
                    await response.write(b": stream closed\n\n")
                    break
                await response.write(f"data: {json.dumps(event)}\n\n".encode())
        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            # Identity-checked pop: only remove the queue WE drained. A client
            # disconnect mid-turn must not delete a queue a subsequent /message
            # turn has since registered under the same run_id.
            if adapter._run_streams.get(run_id) is q:
                adapter._run_streams.pop(run_id, None)
                adapter._run_streams_created.pop(run_id, None)
        return response

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/artifacts?run={run_id} — list files the run
    # produced under ${HERMES_VAULT_PATH}/30_Resources/Brands/{brand}, where
    # brand = kebab-case of the run's `brand` input. Walks recursively; each
    # entry is {name, relpath, kind, size, mtime}, sorted by mtime desc.
    # Missing dir → {"files": []} (not an error).
    # ------------------------------------------------------------------
    async def _tool_artifacts(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )
        run_id = request.query.get("run", "")
        record = _run_registry().get(run_id)
        if record is None:
            return web.json_response(
                {"error": "run_not_found", "detail": f"No run for id={run_id!r}"},
                status=404,
            )

        artifacts_dir = _artifacts_dir_for(tool_id, record)
        if artifacts_dir is None:
            return web.json_response({"files": []})

        def _list() -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            if not artifacts_dir.is_dir():
                return out
            for p in artifacts_dir.rglob("*"):
                if not p.is_file():
                    continue
                try:
                    st = p.stat()
                except OSError:
                    continue
                out.append({
                    "name": p.name,
                    "relpath": p.relative_to(artifacts_dir).as_posix(),
                    "kind": _artifact_kind(p.name),
                    "size": st.st_size,
                    "mtime": st.st_mtime,
                })
            out.sort(key=lambda f: f["mtime"], reverse=True)
            return out

        loop = asyncio.get_running_loop()
        try:
            files = await loop.run_in_executor(None, _list)
        except Exception as exc:
            logger.exception("/v1/tools/%s/artifacts failed", tool_id)
            return web.json_response(
                {"files": [], "error": str(exc)}, status=500
            )
        return web.json_response({"files": files})

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/artifacts/raw?run={run_id}&path={relpath} —
    # stream one artifact's bytes with a correct Content-Type (text/html so
    # it renders in an iframe; text/markdown; image/* per ext; octet-stream
    # else). Resolves (artifacts_dir / relpath) and asserts containment with
    # the same validate_within_dir helper the upload endpoint uses; a path
    # confined to the uploads root is also allowed. 400 on ../ escape, 404 if
    # missing. Never serves outside the allowed roots / leaks host paths.
    # ------------------------------------------------------------------
    async def _tool_artifacts_raw(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )
        run_id = request.query.get("run", "")
        rel_path = request.query.get("path", "")
        record = _run_registry().get(run_id)
        if record is None:
            return web.json_response(
                {"error": "run_not_found", "detail": f"No run for id={run_id!r}"},
                status=404,
            )
        if not rel_path:
            return web.json_response(
                {"error": "missing_path", "detail": "'path' query param required"},
                status=400,
            )

        from tools.path_security import validate_within_dir

        artifacts_dir = _artifacts_dir_for(tool_id, record)
        uploads_root = _uploads_root()

        # Resolve against the artifacts dir first, then the uploads root. A
        # candidate is only usable if it (a) stays contained in that root
        # (reject ../ escapes) and (b) names an existing file there. We track
        # whether the path was contained in ANY allowed root so a pure traversal
        # attempt yields 400, while a contained-but-missing path yields 404.
        dest: Optional[Path] = None
        any_contained = False
        for root in (artifacts_dir, uploads_root):
            if root is None:
                continue
            candidate = root / rel_path
            if validate_within_dir(candidate, root) is not None:
                continue
            any_contained = True
            # Reject symlinked artifacts (or any symlinked path component): a
            # launched agent could plant one to read arbitrary host files. Treat
            # as not-found rather than serving it.
            if _artifact_is_symlinked(candidate, root):
                continue
            if candidate.is_file():
                dest = candidate
                break
        if dest is None:
            if not any_contained:
                return web.json_response(
                    {"error": "path_escape",
                     "detail": "path escapes the allowed artifact roots"},
                    status=400,
                )
            return web.json_response(
                {"error": "file_not_found", "detail": "artifact not found"},
                status=404,
            )

        content_type = _artifact_content_type(dest.name)
        try:
            return web.FileResponse(
                dest, headers={"Content-Type": content_type, "Cache-Control": "no-cache"}
            )
        except Exception:
            logger.exception("/v1/tools/%s/artifacts/raw stream failed", tool_id)
            return web.json_response(
                {"error": "read_error", "detail": "could not read artifact"},
                status=500,
            )

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/projects — list past projects (brand folders)
    # straight from disk under _brands_root(), independent of the EPHEMERAL
    # _RUN_REGISTRY (wiped on restart). Each entry is
    # {id, name, artifact_count, updated, kinds[]} where id = the (already
    # kebab) folder name, name = a title-cased display name, updated = the max
    # file mtime in the folder, artifact_count = recursive file count, kinds =
    # sorted unique _artifact_kind values present. Only folders with ≥1 file
    # are included; sorted by `updated` desc. Missing/empty root → {"projects":
    # []}. Reads _brands_root(): tools without a brands dir just yield [].
    # ------------------------------------------------------------------
    async def _tool_projects(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        root = _collection_root_for(tool_id)

        is_workspace = tool_id == "workspace"

        def _list() -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            if not root.is_dir():
                return out
            for folder in root.iterdir():
                if not folder.is_dir():
                    continue
                marker = folder / _WORKSPACE_MARKER
                if marker.exists():
                    # Marked workspace: describe it from the marker + workspace.json
                    # — NO tree walk (10_Projects can hold huge foreign projects).
                    try:
                        meta = json.loads(marker.read_text(encoding="utf-8")) or {}
                    except Exception:
                        meta = {}
                    ws = folder / "workspace.json"
                    phase = None
                    scripts: Dict[str, Any] = {}
                    try:
                        updated = ws.stat().st_mtime if ws.exists() else marker.stat().st_mtime
                    except OSError:
                        updated = float(meta.get("created") or 0.0)
                    if ws.exists():
                        try:
                            doc = json.loads(ws.read_text(encoding="utf-8")) or {}
                            phase = doc.get("phase")
                            if isinstance(doc.get("scripts"), dict):
                                scripts = doc["scripts"]
                        except Exception:
                            pass
                    # Fall back to scripts present on disk so the card's actions work
                    # even before workspace.json records them.
                    for kind in _WORKSPACE_SCRIPTS:
                        if kind not in scripts and (folder / "scripts" / f"{kind}.sh").is_file():
                            scripts[kind] = f"scripts/{kind}.sh"
                    out.append({
                        "id": folder.name,
                        "name": meta.get("name") or _titleize(folder.name),
                        "artifact_count": 0,
                        "updated": updated,
                        "kinds": ["workspace"],
                        "phase": phase or meta.get("phase"),
                        "scripts": scripts,
                    })
                    continue
                # Unmarked folder. Under the workspace collection these are the
                # user's own projects → skip. Other collections (Brands/Brainstorms)
                # hold only the tool's own outputs → walk + count as before.
                if is_workspace:
                    continue
                count = 0
                latest = 0.0
                kinds: set = set()
                for p in folder.rglob("*"):
                    if not p.is_file():
                        continue
                    try:
                        st = p.stat()
                    except OSError:
                        continue
                    count += 1
                    if st.st_mtime > latest:
                        latest = st.st_mtime
                    kinds.add(_artifact_kind(p.name))
                if count == 0:
                    continue
                out.append({
                    "id": folder.name,
                    "name": _titleize(folder.name),
                    "artifact_count": count,
                    "updated": latest,
                    "kinds": sorted(kinds),
                })
            out.sort(key=lambda f: f["updated"], reverse=True)
            return out

        loop = asyncio.get_running_loop()
        try:
            projects = await loop.run_in_executor(None, _list)
        except Exception as exc:
            logger.exception("/v1/tools/%s/projects failed", tool_id)
            return web.json_response(
                {"projects": [], "error": str(exc)}, status=500
            )
        return web.json_response({"projects": projects})

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/projects/{brand_id}/artifacts — list a single
    # project's artifacts straight from disk (no run lookup). dir =
    # _brands_root()/_kebab(brand_id); recursive walk, each entry is
    # {name, relpath, kind, size, mtime} sorted by mtime desc — SAME shape as
    # the run-scoped list so the client reuses its ArtifactFile type. Missing
    # dir → {"files": []} (NOT 404).
    # ------------------------------------------------------------------
    async def _tool_project_artifacts(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        brand = _kebab(request.match_info.get("brand_id", ""))
        if not brand:
            return web.json_response({"files": []})
        artifacts_dir = _collection_root_for(tool_id) / brand

        def _list() -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            if not artifacts_dir.is_dir():
                return out
            for p in artifacts_dir.rglob("*"):
                if not p.is_file():
                    continue
                try:
                    st = p.stat()
                except OSError:
                    continue
                out.append({
                    "name": p.name,
                    "relpath": p.relative_to(artifacts_dir).as_posix(),
                    "kind": _artifact_kind(p.name),
                    "size": st.st_size,
                    "mtime": st.st_mtime,
                })
            out.sort(key=lambda f: f["mtime"], reverse=True)
            return out

        loop = asyncio.get_running_loop()
        try:
            files = await loop.run_in_executor(None, _list)
        except Exception as exc:
            logger.exception("/v1/tools/%s/projects/%s/artifacts failed", tool_id, brand)
            return web.json_response(
                {"files": [], "error": str(exc)}, status=500
            )
        return web.json_response({"files": files})

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/projects/{brand_id}/artifacts/raw?path={relpath}
    # — stream one project artifact's bytes with a correct Content-Type
    # (text/html so it iframes). dir = _brands_root()/_kebab(brand_id); resolves
    # (dir / path) and asserts containment via validate_within_dir (../ escape →
    # 400). 404 if missing. Never serves outside the brand dir / leaks host
    # paths. No run lookup.
    # ------------------------------------------------------------------
    async def _tool_project_artifacts_raw(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        brand = _kebab(request.match_info.get("brand_id", ""))
        rel_path = request.query.get("path", "")
        if not brand:
            return web.json_response(
                {"error": "file_not_found", "detail": "artifact not found"},
                status=404,
            )
        if not rel_path:
            return web.json_response(
                {"error": "missing_path", "detail": "'path' query param required"},
                status=400,
            )

        from tools.path_security import validate_within_dir

        artifacts_dir = _collection_root_for(tool_id) / brand
        candidate = artifacts_dir / rel_path
        if validate_within_dir(candidate, artifacts_dir) is not None:
            return web.json_response(
                {"error": "path_escape",
                 "detail": "path escapes the project artifact dir"},
                status=400,
            )
        # Reject symlinked artifacts (or symlinked path components): a launched
        # agent could plant one to read arbitrary host files. 404, not served.
        if _artifact_is_symlinked(candidate, artifacts_dir):
            return web.json_response(
                {"error": "file_not_found", "detail": "artifact not found"},
                status=404,
            )
        if not candidate.is_file():
            return web.json_response(
                {"error": "file_not_found", "detail": "artifact not found"},
                status=404,
            )

        content_type = _artifact_content_type(candidate.name)
        try:
            return web.FileResponse(
                candidate,
                headers={"Content-Type": content_type, "Cache-Control": "no-cache"},
            )
        except Exception:
            logger.exception(
                "/v1/tools/%s/projects/%s/artifacts/raw stream failed", tool_id, brand
            )
            return web.json_response(
                {"error": "read_error", "detail": "could not read artifact"},
                status=500,
            )

    # ------------------------------------------------------------------
    # POST /v1/goal — start a goal-mode run (objective + judge loop) for
    # the Goal Mode surface (Wave 3 / B2).  Validates the body, sets up a
    # GoalManager for the session, starts a run that drives the Ralph-style
    # judge loop, and returns {run_id, session_id}.  Judge verdicts arrive
    # as goal.verdict events on GET /v1/runs/{run_id}/events.
    # ------------------------------------------------------------------
    async def _goal(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid_json", "detail": "request body must be JSON"},
                status=400,
            )

        if not isinstance(body, dict):
            return web.json_response(
                {"error": "invalid_body", "detail": "request body must be a JSON object"},
                status=400,
            )

        objective = body.get("objective") or body.get("goal") or ""
        if not isinstance(objective, str) or not objective.strip():
            return web.json_response(
                {"error": "missing_objective",
                 "detail": "'objective' must be a non-empty string"},
                status=400,
            )
        objective = objective.strip()

        raw_max_turns = body.get("max_turns")
        max_turns: Optional[int] = None
        if raw_max_turns is not None:
            try:
                max_turns = int(raw_max_turns)
                if max_turns < 1:
                    return web.json_response(
                        {"error": "invalid_max_turns",
                         "detail": "'max_turns' must be a positive integer"},
                        status=400,
                    )
            except (TypeError, ValueError):
                return web.json_response(
                    {"error": "invalid_max_turns",
                     "detail": "'max_turns' must be an integer"},
                    status=400,
                )

        # Allow caller to resume into an existing session.
        session_id = (body.get("session_id") or "").strip() or f"goal-{uuid.uuid4().hex[:8]}"

        # Initialise GoalManager and persist the goal state.
        try:
            from hermes_cli.goals import GoalManager
            gm = GoalManager(session_id)
            gm.set(objective, max_turns=max_turns)
        except Exception as exc:
            logger.exception("/v1/goal: GoalManager init failed")
            return web.json_response(
                {"error": "goal_init_error", "detail": str(exc)},
                status=500,
            )

        run_id = f"run_{uuid.uuid4().hex}"
        _start_run(adapter, run_id, objective, session_id, goal_manager=gm)

        logger.debug(
            "goal run: run_id=%s session_id=%s max_turns=%s objective=%.80s",
            run_id, session_id, max_turns, objective,
        )
        return web.json_response(
            {"run_id": run_id, "session_id": session_id},
            status=202,
        )

    # ------------------------------------------------------------------
    # POST /v1/tools/build — Labs "UI Agent Builder" publish.
    # Body: {draft: BuilderState}. (1) deterministically scaffold a valid
    # tool.yaml + SKILL.md + references/ (guarantees a runnable tool even if
    # the agent step fails); (2) spawn an Opus-4.8 ENRICH agent (builder
    # persona) to enrich the scaffold, streamed as a run. Returns 202
    # {tool_id, run_id}.
    # ------------------------------------------------------------------
    async def _tool_build(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid_json", "detail": "request body must be JSON"},
                status=400,
            )
        if not isinstance(body, dict):
            return web.json_response(
                {"error": "invalid_body", "detail": "request body must be a JSON object"},
                status=400,
            )

        draft = body.get("draft")
        if not isinstance(draft, dict):
            return web.json_response(
                {"error": "missing_draft", "detail": "'draft' (BuilderState) is required"},
                status=400,
            )

        # (1) Deterministic scaffold — fail at boundary on invalid draft / schema.
        try:
            from gateway.platforms.tool_builder import scaffold_tool
            loop = asyncio.get_running_loop()
            slug, skill_dir = await loop.run_in_executor(None, scaffold_tool, draft)
        except ValueError as exc:
            return web.json_response(
                {"error": "invalid_draft", "detail": str(exc)}, status=400
            )
        except Exception as exc:
            logger.exception("/v1/tools/build: scaffold failed")
            return web.json_response(
                {"error": "scaffold_error", "detail": str(exc)}, status=500
            )

        # (2) Spawn the Opus-4.8 ENRICH agent. Feed it the draft + scaffold paths;
        # the persona tells it to enrich, not re-ask. Non-determinism here never
        # blocks the build — the scaffold above already produced a runnable tool.
        try:
            draft_json = json.dumps(draft, ensure_ascii=False)
        except Exception:
            draft_json = str(draft)
        enrich_message = (
            f"A new tool '{slug}' has been scaffolded at: {skill_dir}\n\n"
            f"Form draft (BuilderState):\n{draft_json}\n\n"
            "Enrich the scaffold now: improve SKILL.md and flesh out each "
            "references/<step>.md from the draft's goals and steps. Use your "
            "file tools to read the current scaffold and edit it in place. "
            "Do not change tool.yaml's tool/launch.skill/steps ids."
        )

        run_id = f"run_{uuid.uuid4().hex}"
        session_id = f"toolbuild-{slug}-{uuid.uuid4().hex[:8]}"
        _start_run(
            adapter, run_id, enrich_message, session_id,
            model_override=_builder_model(),
            append_system_prompt=_TOOL_BUILDER_ENRICH_PERSONA,
        )

        logger.debug(
            "tool build: tool_id=%s run_id=%s dir=%s", slug, run_id, skill_dir
        )
        return web.json_response({"tool_id": slug, "run_id": run_id}, status=202)

    # ------------------------------------------------------------------
    # POST /v1/tools/refine — stream an Opus-4.8 tool-builder agent
    # critiquing/improving a draft. Body: {draft, messages:[{role,content}]}.
    # Returns an OpenAI-style SSE stream (data: {choices:[{delta:{content}}]})
    # ending with data:[DONE]. Reuses the chat SSE path + the _model_override
    # and _append_system_prompt hooks.
    # ------------------------------------------------------------------
    async def _tool_refine(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        try:
            body = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid_json", "detail": "request body must be JSON"},
                status=400,
            )
        if not isinstance(body, dict):
            return web.json_response(
                {"error": "invalid_body", "detail": "request body must be a JSON object"},
                status=400,
            )

        draft = body.get("draft")
        if not isinstance(draft, dict):
            return web.json_response(
                {"error": "missing_draft", "detail": "'draft' (BuilderState) is required"},
                status=400,
            )
        raw_messages = body.get("messages")
        chat_messages: List[Dict[str, str]] = []
        if isinstance(raw_messages, list):
            for m in raw_messages:
                if not isinstance(m, dict):
                    continue
                role = m.get("role")
                content = m.get("content")
                if role in {"user", "assistant"} and isinstance(content, str):
                    chat_messages.append({"role": role, "content": content})

        # Build the agent's user prompt: the draft as context + the latest user
        # turn. History (prior assistant/user turns) is folded into the prompt so
        # the single-turn claude_code path sees the full refinement thread.
        try:
            draft_json = json.dumps(draft, ensure_ascii=False)
        except Exception:
            draft_json = str(draft)

        history_text = ""
        last_user = ""
        if chat_messages:
            # Last user message is the active request; everything before is context.
            for m in reversed(chat_messages):
                if m["role"] == "user":
                    last_user = m["content"]
                    break
            prior = chat_messages[:-1] if chat_messages[-1]["role"] == "user" else chat_messages
            if prior:
                history_text = "\n".join(
                    f"{m['role'].upper()}: {m['content']}" for m in prior
                )
        if not last_user:
            last_user = "Critique this draft and suggest concrete improvements."

        prompt_parts = [f"Tool draft (BuilderState):\n{draft_json}"]
        if history_text:
            prompt_parts.append(f"Conversation so far:\n{history_text}")
        prompt_parts.append(f"User: {last_user}")
        user_message = "\n\n".join(prompt_parts)

        # Stream via the same SSE shape as chat-completions. We run the agent in a
        # background thread (run_conversation is sync) and drain its delta queue.
        import queue as _q

        completion_id = f"refine-{uuid.uuid4().hex[:24]}"
        created = int(time.time())
        session_id = f"toolrefine-{uuid.uuid4().hex[:8]}"
        stream_q: "_q.Queue" = _q.Queue()
        loop = asyncio.get_running_loop()

        def _on_delta(delta: Optional[str]) -> None:
            if delta is not None:
                stream_q.put(delta)

        def _run_refine() -> None:
            try:
                agent = adapter._create_agent(
                    session_id=session_id,
                    stream_delta_callback=_on_delta,
                    ephemeral_system_prompt=_TOOL_BUILDER_REFINE_PERSONA,
                    tier="t2",
                )
                agent._append_system_prompt = _TOOL_BUILDER_REFINE_PERSONA
                agent._model_override = _builder_model()
                agent.run_conversation(
                    user_message=user_message,
                    conversation_history=[],
                    task_id=session_id,
                )
            except Exception as exc:
                logger.exception("/v1/tools/refine agent run failed")
                stream_q.put(f"\n[refine error: {exc}]")
            finally:
                stream_q.put(None)

        agent_task = loop.run_in_executor(None, _run_refine)

        sse_headers = {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
        response = web.StreamResponse(status=200, headers=sse_headers)
        await response.prepare(request)

        def _chunk(content: str) -> bytes:
            payload = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
            }
            return f"data: {json.dumps(payload)}\n\n".encode()

        try:
            while True:
                try:
                    item = await loop.run_in_executor(
                        None, lambda: stream_q.get(timeout=0.5)
                    )
                except _q.Empty:
                    if agent_task.done():
                        # Drain remaining items then stop.
                        while True:
                            try:
                                item = stream_q.get_nowait()
                            except _q.Empty:
                                item = None
                            if item is None:
                                break
                            await response.write(_chunk(item))
                        break
                    await response.write(b": keepalive\n\n")
                    continue
                if item is None:
                    break
                await response.write(_chunk(item))

            done = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": created,
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            await response.write(f"data: {json.dumps(done)}\n\n".encode())
            await response.write(b"data: [DONE]\n\n")
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
            logger.info("/v1/tools/refine SSE client disconnected (%s)", completion_id)
        finally:
            try:
                await agent_task
            except Exception:
                pass
        return response

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id} — single full manifest for the detail view.
    # Filters discover_manifests() by id. 404 if missing.
    # ------------------------------------------------------------------
    async def _tool_get(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)}, status=500
            )

        manifest = next((m for m in manifests if m.tool == tool_id), None)
        if manifest is None:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool for id={tool_id!r}"},
                status=404,
            )
        return web.json_response(_manifest_to_dict(manifest))

    # ------------------------------------------------------------------
    # POST /v1/tools/{tool_id}/upload — accept file/image uploads for a
    # tool's run form (Labs "Run tool"). multipart/form-data; each part's
    # form-field NAME is the manifest input id it belongs to (multiple parts
    # may share one name → multi-file inputs). Files are written UNDER THE
    # WRITABLE DATA ROOT ONLY: /opt/data/uploads/{tool_id}/{ts-rand}/{field}/
    # {safe_filename}. Returns {"files": {"<field_id>": ["<container path>",
    # ...]}} — these /opt/data/uploads/... paths are passed back inside the
    # launch ``inputs`` map; the launched skill reads them.
    # ------------------------------------------------------------------
    async def _tool_upload(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        # Validate tool_id — no path traversal characters (mirrors _tool_launch).
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        # Resolve the tool via the same discover_manifests() path as launch/get.
        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s/upload: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)}, status=500
            )

        manifest = next((m for m in manifests if m.tool == tool_id), None)
        if manifest is None:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool manifest for id={tool_id!r}"},
                status=404,
            )

        # Require a multipart body.
        if not (request.content_type or "").startswith("multipart/"):
            return web.json_response(
                {"error": "invalid_content_type",
                 "detail": "expected multipart/form-data"},
                status=400,
            )

        # Per-request destination: /opt/data/uploads/{tool_id}/{ts-rand}.
        uploads_root = _uploads_root()
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        batch_dir = uploads_root / tool_id / f"{stamp}-{uuid.uuid4().hex[:8]}"

        files: Dict[str, List[str]] = {}
        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response(
                {"error": "invalid_multipart", "detail": "could not parse multipart body"},
                status=400,
            )

        loop = asyncio.get_running_loop()
        while True:
            part = await reader.next()
            if part is None:
                break
            # The form-field NAME is the manifest input id this file belongs to.
            field_id = part.name
            if not field_id or not _UPLOAD_FIELD_ID_RE.match(field_id):
                return web.json_response(
                    {"error": "invalid_field",
                     "detail": "each upload part needs a valid input-id field name"},
                    status=400,
                )
            # Only file parts carry a filename; reject bare form fields.
            safe_name = _sanitize_upload_filename(part.filename)
            if safe_name is None:
                return web.json_response(
                    {"error": "invalid_filename",
                     "detail": f"part {field_id!r} has a missing or unsafe filename"},
                    status=400,
                )

            field_dir = batch_dir / field_id
            dest = field_dir / safe_name
            # Confine the resolved write target to the uploads root (defense in
            # depth on top of the per-component sanitization above).
            from tools.path_security import validate_within_dir
            if validate_within_dir(dest, uploads_root) is not None:
                return web.json_response(
                    {"error": "path_escape",
                     "detail": "upload target escapes the uploads root"},
                    status=400,
                )

            # Stream to disk with a per-file size cap; reject empties.
            written = 0
            try:
                await loop.run_in_executor(
                    None, lambda d=field_dir: d.mkdir(parents=True, exist_ok=True)
                )
                with open(dest, "wb") as fh:
                    while True:
                        chunk = await part.read_chunk()
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > _UPLOAD_MAX_BYTES:
                            fh.close()
                            os.unlink(dest)
                            return web.json_response(
                                {"error": "file_too_large",
                                 "detail": f"{field_id}/{safe_name} exceeds "
                                           f"{_UPLOAD_MAX_BYTES // (1024 * 1024)} MB"},
                                status=413,
                            )
                        fh.write(chunk)
            except Exception as exc:
                logger.exception("/v1/tools/%s/upload: write failed", tool_id)
                # Roll back the partial batch; don't leak host paths.
                try:
                    import shutil
                    shutil.rmtree(batch_dir, ignore_errors=True)
                except Exception:
                    pass
                return web.json_response(
                    {"error": "write_error", "detail": str(exc)}, status=500
                )

            if written == 0:
                os.unlink(dest)
                return web.json_response(
                    {"error": "empty_file",
                     "detail": f"part {field_id}/{safe_name} is empty"},
                    status=400,
                )

            files.setdefault(field_id, []).append(str(dest))

        if not files:
            return web.json_response(
                {"error": "no_files", "detail": "no file parts in upload"},
                status=400,
            )

        logger.info(
            "tool upload: tool_id=%s fields=%s files=%d",
            tool_id, list(files), sum(len(v) for v in files.values()),
        )
        return web.json_response({"files": files})

    # ------------------------------------------------------------------
    # POST /v1/tools/{tool_id}/brand-assets?run={run_id} — save GENERATED
    # images/videos from the Brand Maker run screen into the brand's vault
    # folder. multipart/form-data; one or more file parts under ANY field name
    # (e.g. "assets"). Files land under the rw /vault Brands mount at
    # ${HERMES_VAULT_PATH}/30_Resources/Brands/{brand}/assets/{safe_filename},
    # where brand = kebab-case of the run's `brand` input (same derivation the
    # artifacts list uses). Returns {"files": [{name, relpath, kind, size,
    # mtime}]} where relpath is RELATIVE TO THE BRAND DIR ("assets/<name>") so
    # the existing artifacts list and /artifacts/raw?path=assets/<name> serve
    # them unchanged. Video gets a larger per-file cap (200 MB).
    # ------------------------------------------------------------------
    async def _tool_brand_assets(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        # Validate tool_id — no path traversal characters (mirrors the siblings).
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        run_id = request.query.get("run", "")
        record = _run_registry().get(run_id)
        if record is None:
            return web.json_response(
                {"error": "run_not_found", "detail": f"No run for id={run_id!r}"},
                status=404,
            )

        # Brand dir = same derivation as _tool_artifacts. The /assets subdir
        # lives under the rw /vault/30_Resources/Brands mount, so it IS
        # writable; never write under read-only roots.
        brand = _kebab(record.get("brand") or "")
        if not brand:
            return web.json_response(
                {"error": "run_not_found",
                 "detail": "run has no resolvable brand for asset storage"},
                status=404,
            )
        brand_dir = _collection_root_for(tool_id) / brand
        assets_dir = brand_dir / "assets"

        # Require a multipart body.
        if not (request.content_type or "").startswith("multipart/"):
            return web.json_response(
                {"error": "invalid_content_type",
                 "detail": "expected multipart/form-data"},
                status=400,
            )

        try:
            reader = await request.multipart()
        except Exception:
            return web.json_response(
                {"error": "invalid_multipart", "detail": "could not parse multipart body"},
                status=400,
            )

        from tools.path_security import validate_within_dir

        loop = asyncio.get_running_loop()
        files: List[Dict[str, Any]] = []
        while True:
            part = await reader.next()
            if part is None:
                break
            # File parts under ANY field name; reject bare form fields (no name).
            safe_name = _sanitize_upload_filename(part.filename)
            if safe_name is None:
                return web.json_response(
                    {"error": "invalid_filename",
                     "detail": "each upload part needs a safe filename"},
                    status=400,
                )

            dest = assets_dir / safe_name
            # Confine the resolved write target to <brand_dir>/assets (defense in
            # depth on top of the per-component sanitization above).
            if validate_within_dir(dest, assets_dir) is not None:
                return web.json_response(
                    {"error": "path_escape",
                     "detail": "asset target escapes the brand assets dir"},
                    status=400,
                )

            # Stream to disk with a per-file size cap; reject empties.
            written = 0
            try:
                await loop.run_in_executor(
                    None, lambda d=assets_dir: d.mkdir(parents=True, exist_ok=True)
                )
                with open(dest, "wb") as fh:
                    while True:
                        chunk = await part.read_chunk()
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > _BRAND_ASSET_MAX_BYTES:
                            fh.close()
                            os.unlink(dest)
                            return web.json_response(
                                {"error": "file_too_large",
                                 "detail": f"{safe_name} exceeds "
                                           f"{_BRAND_ASSET_MAX_BYTES // (1024 * 1024)} MB"},
                                status=413,
                            )
                        fh.write(chunk)
            except Exception as exc:
                logger.exception("/v1/tools/%s/brand-assets: write failed", tool_id)
                # Clean up just this file; don't leak host paths.
                try:
                    os.unlink(dest)
                except OSError:
                    pass
                return web.json_response(
                    {"error": "write_error", "detail": str(exc)}, status=500
                )

            if written == 0:
                os.unlink(dest)
                return web.json_response(
                    {"error": "empty_file", "detail": f"part {safe_name} is empty"},
                    status=400,
                )

            try:
                st = dest.stat()
            except OSError:
                st = None
            files.append({
                "name": safe_name,
                "relpath": dest.relative_to(brand_dir).as_posix(),
                "kind": _artifact_kind(safe_name),
                "size": st.st_size if st else written,
                "mtime": st.st_mtime if st else None,
            })

        if not files:
            return web.json_response(
                {"error": "no_files", "detail": "no file parts in upload"},
                status=400,
            )

        logger.info(
            "brand-assets: tool_id=%s run=%s brand=%s files=%d",
            tool_id, run_id, brand, len(files),
        )
        return web.json_response({"files": files})

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/runs/latest?brand={brand_id} — deep-link resume.
    # POST /v1/tools/workspace/create — ingest a project (local folder / public
    # GitHub repo / promoted brainstorm) into 10_Projects/{slug}, then launch the
    # Architect orchestrator run against it (cwd = workspace). Body:
    # {name, source_type: folder|github|brainstorm, source_ref}.
    #   202 → {workspace_id, run_id, session_id, path}
    # ------------------------------------------------------------------
    async def _workspace_create(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        body = body if isinstance(body, dict) else {}
        name = body.get("name") if isinstance(body.get("name"), str) else ""
        source_type = body.get("source_type") if isinstance(body.get("source_type"), str) else ""
        source_ref = body.get("source_ref") if isinstance(body.get("source_ref"), str) else ""
        slug = _kebab(name)
        if not slug or source_type not in ("folder", "github", "brainstorm") or not source_ref:
            return web.json_response(
                {"error": "invalid_request",
                 "detail": "require name, source_type (folder|github|brainstorm), source_ref"},
                status=400,
            )

        try:
            from tools.tool_manifest import discover_manifests
            manifest = {m.tool: m for m in discover_manifests()}.get("workspace")
        except Exception as exc:
            logger.exception("workspace create: manifest load failed")
            return web.json_response({"error": "manifest_error", "detail": str(exc)}, status=500)
        if manifest is None:
            return web.json_response({"error": "tool_not_found", "detail": "workspace manifest missing"}, status=404)

        workspaces_root = _collection_root_for("workspace")
        loop = asyncio.get_running_loop()

        # A local folder that already lives directly under the workspaces root is
        # onboarded IN PLACE (no copy onto itself) — its basename is the slug.
        in_place = False
        if source_type == "folder":
            try:
                src = Path(source_ref).resolve()
            except Exception:
                src = None
            if src is not None and src.is_dir() and src.parent == workspaces_root.resolve():
                in_place, slug, dest = True, src.name, src
        if not in_place:
            dest = workspaces_root / slug

        # Already a workspace? Surface it so the UI can offer "Open existing".
        if (dest / _WORKSPACE_MARKER).exists():
            return web.json_response(
                {"error": "already_onboarded",
                 "detail": f"'{slug}' is already onboarded as a workspace",
                 "workspace_id": slug, "slug": slug, "path": str(dest)},
                status=409,
            )

        # Copy/clone into place (skip for in-place onboarding of an existing folder).
        if not in_place:
            try:
                await loop.run_in_executor(None, _ingest_workspace, source_type, source_ref, dest)
            except Exception as exc:
                logger.warning("workspace ingest failed for %s", slug, exc_info=True)
                return web.json_response({"error": "ingest_failed", "detail": str(exc)}, status=400)

        # Stamp the marker so the list endpoint surfaces this folder (and ignores
        # the user's other projects under 10_Projects).
        _write_workspace_marker(dest, {
            "name": name, "slug": slug,
            "source": {"type": source_type, "ref": source_ref},
            "created": time.time(),
        })

        # Launch the orchestrator run against the ingested folder.
        skill = manifest.skill
        inputs = {"name": name, "source_type": source_type, "source_ref": source_ref}
        user_message = f"/{skill}\n\nInputs: {json.dumps(inputs, ensure_ascii=False)}"
        run_id = f"run_{uuid.uuid4().hex}"
        session_id = f"tool-workspace-{uuid.uuid4().hex[:8]}"
        record: Dict[str, Any] = {
            "session_id": session_id, "tool_id": "workspace", "inputs": inputs,
            "brand": name, "claude_session_id": None, "created": time.time(),
            "completed": False, "busy": True,
            # The run's working directory — reused by /message resume turns.
            "run_cwd": str(dest),
        }
        _run_registry()[run_id] = record
        _persist_run(run_id, record)

        try:
            folder = _provision_swarm_session(manifest, slug, name, "")
            if folder is not None:
                user_message += (
                    "\n\nSESSION_FOLDER (absolute path — this exact directory is the "
                    "workspace root and your cwd; write workspace.json and every artifact "
                    f"here, do NOT invent another path): {folder}"
                )
        except Exception:
            logger.warning("workspace provision failed for %s", slug, exc_info=True)

        _start_run(adapter, run_id, user_message, session_id, run_record=record,
                   append_system_prompt=_STEP_GATE_SYSTEM_PROMPT, swarm=True, run_cwd=str(dest))
        return web.json_response(
            {"workspace_id": slug, "run_id": run_id, "session_id": session_id, "path": str(dest)},
            status=202,
        )

    # ------------------------------------------------------------------
    # POST /v1/tools/workspace/exec — run a workspace's build/run/test script
    # (scripts/{script}.sh) in the workspace folder and stream stdout/stderr as
    # SSE (`data: {type,...}` frames). Body {slug, script: build|run|test}. Only
    # the three named scripts run — never arbitrary commands. The process lives as
    # long as the stream (or until /exec/stop); closing it kills the whole tree.
    # ------------------------------------------------------------------
    async def _workspace_exec(request: "web.Request") -> "web.StreamResponse":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        body = body if isinstance(body, dict) else {}
        slug = _kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        script = body.get("script") if isinstance(body.get("script"), str) else ""
        if not slug or script not in _WORKSPACE_SCRIPTS:
            return web.json_response(
                {"error": "invalid_request", "detail": "require slug + script (build|run|test)"},
                status=400,
            )
        ws = _collection_root_for("workspace") / slug
        if not (ws / _WORKSPACE_MARKER).exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)
        script_path = ws / "scripts" / f"{script}.sh"
        # Symlink/traversal guard: a malicious ingested repo could ship
        # scripts/{kind}.sh as a symlink to an arbitrary host file. Reject any
        # symlink or a path that resolves outside the workspace's scripts/ dir.
        try:
            resolved = script_path.resolve()
            safe = (not script_path.is_symlink()
                    and resolved.is_relative_to((ws / "scripts").resolve())
                    and resolved.is_file())
        except Exception:
            safe = False
        if not safe:
            return web.json_response(
                {"error": "script_missing",
                 "detail": f"scripts/{script}.sh not found (or not a regular file in this workspace)"},
                status=404,
            )

        key = f"{slug}:{script}"
        existing = _WORKSPACE_EXEC_PROCS.get(key)
        if existing is not None and existing.returncode is None:
            return web.json_response(
                {"error": "already_running", "detail": "that script is already running — stop it first"},
                status=409,
            )

        try:
            proc = await asyncio.create_subprocess_exec(
                "bash", str(script_path),
                cwd=str(ws),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                start_new_session=True,  # own process group → kill the whole tree
            )
        except Exception as exc:
            logger.exception("workspace exec failed to start: %s", key)
            return web.json_response({"error": "spawn_failed", "detail": str(exc)}, status=500)
        _WORKSPACE_EXEC_PROCS[key] = proc

        resp = web.StreamResponse(
            status=200,
            headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
        await resp.prepare(request)

        async def _send(obj: Dict[str, Any]) -> None:
            await resp.write(f"data: {json.dumps(obj)}\n\n".encode())

        await _send({"type": "start", "slug": slug, "script": script})
        # Output cap (prevent a chatty/runaway script flooding the client) and a
        # wall-clock cap for build/test (a hung build leaks otherwise). `run` is
        # long-lived (dev servers) so it is not time-capped — the stream/stop kills it.
        import time as _time
        max_lines = int(os.environ.get("HERMES_EXEC_MAX_LINES", "50000"))
        deadline = None if script == "run" else _time.monotonic() + int(os.environ.get("HERMES_EXEC_TIMEOUT", "1800"))
        sent = 0
        truncated = False
        try:
            stream = proc.stdout
            assert stream is not None
            while True:
                if deadline is not None:
                    remaining = deadline - _time.monotonic()
                    if remaining <= 0:
                        await _send({"type": "line", "text": "— timed out (build/test exceeded the time limit)"})
                        break
                    try:
                        line = await asyncio.wait_for(stream.readline(), timeout=remaining)
                    except asyncio.TimeoutError:
                        await _send({"type": "line", "text": "— timed out (build/test exceeded the time limit)"})
                        break
                else:
                    line = await stream.readline()
                if not line:
                    break
                if sent < max_lines:
                    await _send({"type": "line", "text": line.decode("utf-8", "replace").rstrip("\n")})
                    sent += 1
                elif not truncated:
                    truncated = True
                    await _send({"type": "line", "text": "— output truncated (too many lines); still running…"})
                # past the cap: keep draining (so the pipe doesn't block the proc) but don't forward
            code = await proc.wait()
            await _send({"type": "exit", "code": code})
        except (asyncio.CancelledError, ConnectionResetError):
            raise
        except Exception as exc:
            logger.exception("workspace exec stream error: %s", key)
            try:
                await _send({"type": "error", "detail": str(exc)})
            except Exception:
                pass
        finally:
            # Closing the stream (or a crash) kills the script tree so nothing leaks.
            _kill_proc_group(proc)  # SIGTERM the group
            # Escalate to SIGKILL shortly if it ignores SIGTERM (detached so this
            # finally — which may run under cancellation — never blocks/awaits).
            def _escalate(p: Any) -> None:
                import os as _os
                import signal as _sig
                try:
                    if p.returncode is None:
                        _os.killpg(_os.getpgid(p.pid), _sig.SIGKILL)
                except Exception:
                    pass
            try:
                asyncio.get_running_loop().call_later(3.0, _escalate, proc)
            except Exception:
                pass
            if _WORKSPACE_EXEC_PROCS.get(key) is proc:
                _WORKSPACE_EXEC_PROCS.pop(key, None)
            try:
                await resp.write_eof()
            except Exception:
                pass
        return resp

    # ------------------------------------------------------------------
    # GET /v1/tools/workspace/browse?path=… — list sub-folders for the "local
    # folder" picker. Scoped to the browsable root (the mounted vault) so the
    # selected path is one the engine can actually copy from; traversal above
    # the root is rejected and symlinks/heavy build dirs are skipped.
    # ------------------------------------------------------------------
    async def _workspace_browse(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        root = _browse_root().resolve()
        raw = request.query.get("path") or str(root)
        try:
            target = Path(raw).resolve()
        except Exception:
            target = root
        # Containment: never escape the browse root.
        if not (target == root or target.is_relative_to(root)):
            target = root
        if not target.is_dir():
            target = root

        def _list() -> List[Dict[str, str]]:
            out: List[Dict[str, str]] = []
            try:
                children = sorted(target.iterdir(), key=lambda p: p.name.lower())
            except OSError:
                return out
            for child in children:
                if child.is_symlink() or not child.is_dir():
                    continue
                if child.name.startswith(".") or child.name in _BROWSE_SKIP:
                    continue
                out.append({"name": child.name, "path": str(child)})
            return out

        entries = await asyncio.get_running_loop().run_in_executor(None, _list)
        return web.json_response({
            "root": str(root),
            "path": str(target),
            "parent": (str(target.parent) if target != root else None),
            "entries": entries,
        })

    # POST /v1/tools/workspace/exec/stop — kill a running build/run/test script.
    async def _workspace_exec_stop(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            body = {}
        body = body if isinstance(body, dict) else {}
        slug = _kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        script = body.get("script") if isinstance(body.get("script"), str) else ""
        if script not in _WORKSPACE_SCRIPTS:
            return web.json_response(
                {"error": "invalid_request", "detail": "script must be build|run|test"}, status=400)
        proc = _WORKSPACE_EXEC_PROCS.get(f"{slug}:{script}")
        if proc is None or proc.returncode is not None:
            return web.json_response({"stopped": False, "detail": "not running"})
        _kill_proc_group(proc)
        _WORKSPACE_EXEC_PROCS.pop(f"{slug}:{script}", None)
        return web.json_response({"stopped": True})

    # POST /v1/tools/workspace/rename — update a workspace's display name (the
    # marker + workspace.json). Body {slug, name}. The folder/slug is unchanged.
    async def _workspace_rename(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        body = body if isinstance(body, dict) else {}
        slug = _kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        name = (body.get("name") if isinstance(body.get("name"), str) else "").strip()
        # Strip control chars and cap length so a huge/garbage name can't bloat
        # workspace.json / the marker (re-read on every projects listing).
        name = "".join(ch for ch in name if ch >= " " or ch == "\t")[:200].strip()
        if not slug or not name:
            return web.json_response(
                {"error": "invalid_request", "detail": "require slug + name"}, status=400)
        ws = _collection_root_for("workspace") / slug
        marker = ws / _WORKSPACE_MARKER
        if not marker.exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)
        try:
            meta = json.loads(marker.read_text(encoding="utf-8")) or {}
        except Exception:
            meta = {}
        meta["name"] = name
        _write_workspace_marker(ws, meta)
        wsjson = ws / "workspace.json"
        if wsjson.exists():
            try:
                doc = json.loads(wsjson.read_text(encoding="utf-8")) or {}
                doc["name"] = name
                wsjson.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                logger.warning("rename: could not update workspace.json for %s", slug, exc_info=True)
        return web.json_response({"ok": True, "slug": slug, "name": name})

    # Returns the MOST RECENT run in _RUN_REGISTRY whose tool_id matches and
    # POST /v1/tools/{tool_id}/promote — copy a completed brainstorm session
    # folder (Ruflo state + qna.json/readiness.json/prd.md + CLAUDE.md) into the
    # workspaces root so the architect/dev phase can pick it up. Body: {run} or
    # {slug}/{brand}. Idempotent overwrite. 200 → {workspace_id, path}.
    # ------------------------------------------------------------------
    async def _tool_promote(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        try:
            body = await request.json()
        except Exception:
            body = {}
        body = body if isinstance(body, dict) else {}

        # Resolve the source dir: prefer an explicit run, else slug/brand input.
        record: Optional[Dict[str, Any]] = None
        run_id = body.get("run") if isinstance(body.get("run"), str) else ""
        if run_id:
            record = _run_registry().get(run_id)
        slug = _kebab(
            (record or {}).get("brand")
            or body.get("slug")
            or body.get("brand")
            or ""
        )
        if not slug:
            return web.json_response(
                {"error": "missing_slug", "detail": "provide run, slug, or brand"},
                status=400,
            )

        src = _artifacts_dir_for(tool_id, {"brand": slug})
        if src is None or not src.is_dir():
            return web.json_response(
                {"error": "session_not_found", "detail": f"no session folder for {slug!r}"},
                status=404,
            )
        dest = _workspaces_root() / slug

        def _copy() -> str:
            import shutil
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dest, dirs_exist_ok=True)
            return str(dest)

        loop = asyncio.get_running_loop()
        try:
            path = await loop.run_in_executor(None, _copy)
        except Exception as exc:
            logger.exception("/v1/tools/%s/promote copy failed", tool_id)
            return web.json_response(
                {"error": "copy_failed", "detail": str(exc)}, status=500
            )
        return web.json_response({"workspace_id": slug, "path": path})

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/runs/{run_id}/transcript — replay a run's full
    # execution log from the persisted Claude Code transcripts (main + each
    # sub-agent), projected into the SAME lane events the live stream emits, so a
    # refreshed/reopened (non-live) run can rebuild its agent logs. 200 → {events}.
    # ------------------------------------------------------------------
    async def _tool_run_transcript(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        run_id = request.match_info["run_id"]
        record = _run_registry().get(run_id)
        if record is None:
            try:
                from gateway.platforms import labs_store
                record = labs_store.get_run(run_id)
            except Exception:
                record = None
        if record is None:
            return web.json_response(
                {"error": "run_not_found", "detail": f"No run for id={run_id!r}"},
                status=404,
            )
        csid = record.get("claude_session_id")
        if not csid:
            return web.json_response({"events": []})

        from agent.claude_code_runtime import _SubagentTailer

        def _collect() -> List[Dict[str, Any]]:
            events: List[Dict[str, Any]] = []
            tailer = _SubagentTailer(
                session_id=csid, on_event=events.append, run_id=run_id,
                include_main=True, include_main_text=True,
            )
            tailer._poll()  # one-shot full read (offsets empty → from the start)
            return events

        loop = asyncio.get_running_loop()
        try:
            events = await loop.run_in_executor(None, _collect)
        except Exception as exc:
            logger.exception("/v1/tools/%s/runs/%s/transcript failed",
                             request.match_info.get("tool_id"), run_id)
            return web.json_response({"events": [], "error": str(exc)}, status=500)
        return web.json_response({"events": events})

    # ------------------------------------------------------------------
    # GET /v1/tools/{tool_id}/runs/latest?brand={brand} — recover the most
    # recent run for a (tool, brand). Scans the (hydrated) run registry for runs
    # whose brand input kebab-normalizes to brand_id (so "Acme Co" and
    # "acme-co" match). "Most recent" = max(created). The /v1/runs/{id}/events
    # stream is LIVE-ONLY (no replay), so a reloaded screen uses this to recover
    # {run_id, session_id} and rebuild its transcript from the session messages
    # + artifacts endpoints.
    #   200 → {run_id, session_id, brand, created, completed}
    #   404 → {error: "no_run_for_brand"} when none match.
    # ------------------------------------------------------------------
    async def _tool_runs_latest(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        brand_id = _kebab(request.query.get("brand", ""))
        if not brand_id:
            return web.json_response(
                {"error": "missing_brand", "detail": "'brand' query param required"},
                status=400,
            )

        # Most-recent matching run by created timestamp. Compare both sides via
        # _kebab so the stored brand input and the query param normalize alike.
        best_id: Optional[str] = None
        best_rec: Optional[Dict[str, Any]] = None
        for rid, rec in _run_registry().items():
            if rec.get("tool_id") != tool_id:
                continue
            if _kebab(rec.get("brand") or "") != brand_id:
                continue
            if best_rec is None or (rec.get("created") or 0) > (best_rec.get("created") or 0):
                best_id, best_rec = rid, rec

        if best_rec is None:
            return web.json_response(
                {"error": "no_run_for_brand",
                 "detail": f"no run for tool={tool_id!r} brand={brand_id!r}"},
                status=404,
            )

        return web.json_response({
            "run_id": best_id,
            "session_id": best_rec.get("session_id"),
            "brand": best_rec.get("brand") or "",
            "created": best_rec.get("created"),
            "completed": bool(best_rec.get("completed")),
        })

    # ------------------------------------------------------------------
    # GET /v1/runs/{run_id}/status — durable run liveness for the dashboard.
    # Returns {"run_id", "status", "completed": bool, "live": bool} where
    # ``live`` = an active SSE event stream exists for this run RIGHT NOW
    # (run_id in adapter._run_streams). This is the SEAM the dashboard uses to
    # avoid streaming a dead (restart-killed) run: a persisted-but-not-live run
    # is resumed via /message rather than subscribed to /events.
    #
    # Backed by the persisted store so it survives restarts. Resolution order:
    # in-memory registry (hydrated from SQLite on first use) → direct DB lookup
    # → adapter._run_statuses (covers non-tool runs the dashboard may poll).
    # Unknown run → 404. NOTE: api_server.py owns the bare GET /v1/runs/{run_id}
    # route (registered first, so it wins); this companion /status path carries
    # the pinned durable shape without touching that file.
    # ------------------------------------------------------------------
    async def _run_status(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        run_id = request.match_info["run_id"]
        record = _run_registry().get(run_id)
        if record is None:
            # Not in the hot cache — try a direct durable lookup (defensive; the
            # registry is normally already hydrated, but a row could post-date it).
            try:
                from gateway.platforms import labs_store

                record = labs_store.get_run(run_id)
            except Exception:
                record = None

        live = run_id in adapter._run_streams

        if record is not None:
            status = record.get("status")
            completed = bool(record.get("completed"))
            if not status:
                status = "completed" if completed else ("running" if live else "pending")
            return web.json_response({
                "run_id": run_id,
                "status": status,
                "completed": completed,
                "live": live,
            })

        # Fall back to the adapter's run-status table for non-tool runs (Goal
        # Mode, /v1/runs) the dashboard may also poll through this path.
        st = adapter._run_statuses.get(run_id)
        if st is not None:
            status = st.get("status", "running")
            return web.json_response({
                "run_id": run_id,
                "status": status,
                "completed": status in {"completed", "failed", "cancelled"},
                "live": live,
            })

        return web.json_response(
            {"error": "run_not_found", "detail": f"No run for id={run_id!r}"},
            status=404,
        )

    # ------------------------------------------------------------------
    # DELETE /v1/tools/{tool_id} — remove a user-built tool. Only a dir under
    # the writable tool root (/opt/data/skills) may be deleted; built-ins
    # under the read-only /opt/skills are refused with 403.
    # ------------------------------------------------------------------
    async def _tool_delete(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth

        tool_id = request.match_info["tool_id"]
        if not tool_id or "/" in tool_id or "\\" in tool_id or ".." in tool_id:
            return web.json_response(
                {"error": "invalid_tool_id", "detail": "tool_id must be a simple slug"},
                status=400,
            )

        try:
            from tools.tool_manifest import discover_manifests
            manifests = discover_manifests()
        except Exception as exc:
            logger.exception("/v1/tools/%s DELETE: discover_manifests failed", tool_id)
            return web.json_response(
                {"error": "manifest_error", "detail": str(exc)}, status=500
            )

        manifest = next((m for m in manifests if m.tool == tool_id), None)
        if manifest is None or not manifest.source_path:
            return web.json_response(
                {"error": "tool_not_found", "detail": f"No tool for id={tool_id!r}"},
                status=404,
            )

        # The tool's skill dir is the parent of its tool.yaml.
        skill_dir = Path(manifest.source_path).parent

        # Confine deletion to the writable tool root; refuse read-only built-ins.
        from gateway.platforms.tool_builder import is_within_writable_root
        resolved = is_within_writable_root(skill_dir)
        if resolved is None:
            return web.json_response(
                {"error": "forbidden",
                 "detail": "Only user-built tools (under the writable tool root) "
                           "can be deleted; built-in tools are read-only."},
                status=403,
            )

        try:
            import shutil
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, lambda: shutil.rmtree(resolved))
        except Exception as exc:
            logger.exception("/v1/tools/%s DELETE: rmtree failed", tool_id)
            return web.json_response(
                {"error": "delete_error", "detail": str(exc)}, status=500
            )

        logger.info("deleted user-built tool %s at %s", tool_id, resolved)
        return web.json_response({"deleted": True})

    app.router.add_get("/v1/tasks", _tasks)
    app.router.add_get("/v1/memory", _memory)
    app.router.add_get("/v1/memory/graph", _memory_graph)
    app.router.add_get("/v1/memory/note", _memory_note)
    app.router.add_get("/v1/memory/search", _memory_search)
    app.router.add_get("/v1/events", _events)
    app.router.add_get("/v1/tools", _tools)
    app.router.add_get("/v1/approvals", _approvals)
    # Control screen: Overview usage rollup + Models roster/routing persistence.
    app.router.add_get("/v1/usage", _usage)
    app.router.add_get("/v1/model-config", _model_config_get)
    app.router.add_put("/v1/model-config", _model_config_put)
    # Planner: live Jira issues + Gmail inbox (fall back to mock when unconfigured).
    app.router.add_get("/v1/integrations/jira/items", _jira_items)
    app.router.add_get("/v1/integrations/gmail/messages", _gmail_messages)
    # Labs "UI Agent Builder" — static build/refine paths registered BEFORE the
    # parameterized {tool_id} routes so "build"/"refine" never match as an id.
    app.router.add_post("/v1/tools/build", _tool_build)
    app.router.add_post("/v1/tools/refine", _tool_refine)
    # Literal routes before the generic {tool_id} routes so they aren't shadowed.
    app.router.add_post("/v1/tools/workspace/create", _workspace_create)
    app.router.add_get("/v1/tools/workspace/browse", _workspace_browse)
    app.router.add_post("/v1/tools/workspace/rename", _workspace_rename)
    app.router.add_post("/v1/tools/workspace/exec", _workspace_exec)
    app.router.add_post("/v1/tools/workspace/exec/stop", _workspace_exec_stop)
    app.router.add_post("/v1/tools/{tool_id}/launch", _tool_launch)
    app.router.add_post("/v1/tools/{tool_id}/promote", _tool_promote)
    app.router.add_post("/v1/tools/{tool_id}/upload", _tool_upload)
    # Brand Maker run screen: save generated images/videos into the brand vault.
    app.router.add_post("/v1/tools/{tool_id}/brand-assets", _tool_brand_assets)
    # Live Workbench: artifacts read-back (more-specific /raw first) + run-resume.
    app.router.add_get("/v1/tools/{tool_id}/artifacts/raw", _tool_artifacts_raw)
    app.router.add_get("/v1/tools/{tool_id}/artifacts", _tool_artifacts)
    # Brand-scoped projects (read straight from disk, no run lookup). Register
    # the deepest /projects/{brand_id}/artifacts/raw FIRST so it never shadows.
    app.router.add_get(
        "/v1/tools/{tool_id}/projects/{brand_id}/artifacts/raw",
        _tool_project_artifacts_raw,
    )
    app.router.add_get(
        "/v1/tools/{tool_id}/projects/{brand_id}/artifacts",
        _tool_project_artifacts,
    )
    app.router.add_get("/v1/tools/{tool_id}/projects", _tool_projects)
    # Deep-link resume: latest run for a (tool, brand) — registered before the
    # bare {tool_id} GET (deeper path, so no shadowing either way).
    app.router.add_get("/v1/tools/{tool_id}/runs/{run_id}/transcript", _tool_run_transcript)
    app.router.add_get("/v1/tools/{tool_id}/runs/latest", _tool_runs_latest)
    app.router.add_get("/v1/tools/{tool_id}", _tool_get)
    app.router.add_delete("/v1/tools/{tool_id}", _tool_delete)
    app.router.add_get("/v1/runs/{run_id}/status", _run_status)
    app.router.add_post("/v1/runs/{run_id}/message", _run_message)
    app.router.add_post("/v1/goal", _goal)
    logger.debug(
        "dashboard data routes registered (/v1/tasks, /v1/memory, /v1/events, "
        "/v1/tools, /v1/approvals, /v1/tools/build, /v1/tools/refine, "
        "/v1/tools/{id}, /v1/tools/{id}/launch, /v1/tools/{id}/upload, "
        "/v1/tools/{id}/brand-assets, "
        "/v1/tools/{id}/artifacts, /v1/tools/{id}/artifacts/raw, "
        "/v1/tools/{id}/projects, /v1/tools/{id}/projects/{brand}/artifacts, "
        "/v1/tools/{id}/projects/{brand}/artifacts/raw, "
        "/v1/tools/{id}/runs/latest, "
        "/v1/runs/{id}/message, /v1/goal)"
    )
