"""Workspace routes — ingest/exec/browse/rename for the workspace tool.

Extracted verbatim from ``api_dashboard.py``. All shared helpers and module
state are referenced through the ``api_dashboard`` module object (``_ad``) so a
test monkeypatching e.g. ``api_dashboard._collection_root_for`` still steers
these handlers, and the single registry/state lives in one place.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List

from gateway.platforms import api_dashboard as _ad

if TYPE_CHECKING:  # pragma: no cover
    from aiohttp import web

logger = logging.getLogger(__name__)

_GIT_UNIT = "\x1f"  # field separator for git log --pretty


def _git_status_sync(ws: Path) -> Dict[str, Any]:
    """Read-only git snapshot of a workspace folder (blocking; via executor)."""
    import subprocess
    git = os.environ.get("GIT_BIN", "git")

    def run(*args: str, timeout: float = 15.0) -> "subprocess.CompletedProcess":
        return subprocess.run([git, "-C", str(ws), *args], capture_output=True, text=True, timeout=timeout)

    try:
        if run("rev-parse", "--is-inside-work-tree").stdout.strip() != "true":
            return {"is_repo": False}
        # Only the workspace's OWN repo counts — if `git` resolves to a PARENT
        # repo (e.g. the vault the folder sits in), the workspace isn't a repo.
        toplevel = run("rev-parse", "--show-toplevel").stdout.strip()
        if not toplevel or Path(toplevel).resolve() != ws.resolve():
            return {"is_repo": False, "in_parent_repo": True}
    except Exception:
        return {"is_repo": False}

    branch = run("rev-parse", "--abbrev-ref", "HEAD").stdout.strip() or "HEAD"
    remote_p = run("remote", "get-url", "origin")
    remote = remote_p.stdout.strip() if remote_p.returncode == 0 else None
    dirty = len([ln for ln in run("status", "--porcelain").stdout.splitlines() if ln.strip()])

    ahead = behind = None
    upstream = run("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
    has_upstream = upstream.returncode == 0
    if has_upstream:
        counts = run("rev-list", "--left-right", "--count", "@{u}...HEAD").stdout.strip().split()
        if len(counts) == 2:
            behind, ahead = int(counts[0]), int(counts[1])

    commits: List[Dict[str, str]] = []
    log = run("log", "-25", f"--pretty=format:%h{_GIT_UNIT}%s{_GIT_UNIT}%an{_GIT_UNIT}%ar")
    for line in log.stdout.splitlines():
        parts = line.split(_GIT_UNIT)
        if len(parts) == 4:
            commits.append({"hash": parts[0], "subject": parts[1], "author": parts[2], "date": parts[3]})

    return {
        "is_repo": True, "branch": branch, "remote": remote, "dirty": dirty,
        "ahead": ahead, "behind": behind, "has_upstream": has_upstream, "commits": commits,
    }


def _git_init_sync(ws: Path) -> Dict[str, Any]:
    """Initialize a git repo FOR THIS FOLDER (its own repo, even if it sits inside
    a parent repo) and make an initial commit so the branch + history show."""
    import subprocess
    git = os.environ.get("GIT_BIN", "git")
    ident = ["-c", "user.name=Agent OS", "-c", "user.email=agent-os@local"]
    try:
        init = subprocess.run([git, "-C", str(ws), "init"], capture_output=True, text=True, timeout=30)
        if init.returncode != 0:
            return {"ok": False, "output": (init.stderr or init.stdout).strip()[:1000]}
        subprocess.run([git, "-C", str(ws), "add", "-A"], capture_output=True, text=True, timeout=60)
        commit = subprocess.run(
            [git, "-C", str(ws), *ident, "commit", "-m", "Initial commit", "--allow-empty"],
            capture_output=True, text=True, timeout=60,
        )
        out = (commit.stdout + commit.stderr).strip()
        return {"ok": True, "output": out[:1000] or "initialized"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": "git init timed out"}
    except Exception as exc:
        return {"ok": False, "output": str(exc)}


def _git_push_sync(ws: Path) -> Dict[str, Any]:
    """Push the workspace's current branch (user-initiated; blocking)."""
    import subprocess
    git = os.environ.get("GIT_BIN", "git")
    try:
        proc = subprocess.run([git, "-C", str(ws), "push"], capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        return {"ok": False, "output": "git push timed out after 120s"}
    except Exception as exc:
        return {"ok": False, "output": str(exc)}
    out = (proc.stdout + proc.stderr).strip()
    return {"ok": proc.returncode == 0, "output": out[:2000] or ("pushed" if proc.returncode == 0 else "push failed")}


def register(app: "Any", adapter: "Any") -> None:
    """Register the workspace tool routes on the api_server's aiohttp app."""
    from aiohttp import web  # local import to match api_server's lazy pattern

    # ------------------------------------------------------------------
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
        slug = _ad._kebab(name)
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

        workspaces_root = _ad._collection_root_for("workspace")
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
        if (dest / _ad._WORKSPACE_MARKER).exists():
            return web.json_response(
                {"error": "already_onboarded",
                 "detail": f"'{slug}' is already onboarded as a workspace",
                 "workspace_id": slug, "slug": slug, "path": str(dest)},
                status=409,
            )

        # Copy/clone into place (skip for in-place onboarding of an existing folder).
        if not in_place:
            try:
                await loop.run_in_executor(None, _ad._ingest_workspace, source_type, source_ref, dest)
            except Exception as exc:
                logger.warning("workspace ingest failed for %s", slug, exc_info=True)
                return web.json_response({"error": "ingest_failed", "detail": str(exc)}, status=400)

        # Stamp the marker so the list endpoint surfaces this folder (and ignores
        # the user's other projects under 10_Projects).
        _ad._write_workspace_marker(dest, {
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
        _ad._run_registry()[run_id] = record
        _ad._persist_run(run_id, record)

        try:
            folder = _ad._provision_swarm_session(manifest, slug, name, "")
            if folder is not None:
                user_message += (
                    "\n\nSESSION_FOLDER (absolute path — this exact directory is the "
                    "workspace root and your cwd; write workspace.json and every artifact "
                    f"here, do NOT invent another path): {folder}"
                )
        except Exception:
            logger.warning("workspace provision failed for %s", slug, exc_info=True)

        _ad._start_run(adapter, run_id, user_message, session_id, run_record=record,
                       append_system_prompt=_ad._STEP_GATE_SYSTEM_PROMPT, swarm=True, run_cwd=str(dest))
        return web.json_response(
            {"workspace_id": slug, "run_id": run_id, "session_id": session_id, "path": str(dest)},
            status=202,
        )

    # ------------------------------------------------------------------
    # POST /v1/tools/workspace/resume — relaunch the orchestrator against an
    # EXISTING workspace folder (no ingest, no re-provision of the team). Used
    # when the in-memory run was lost (engine restart) so the dashboard can keep
    # driving the workspace. Body {slug}. 202 → {workspace_id, run_id, session_id, path}.
    # ------------------------------------------------------------------
    async def _workspace_resume(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        body = body if isinstance(body, dict) else {}
        slug = _ad._kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        if not slug:
            return web.json_response({"error": "invalid_request", "detail": "require slug"}, status=400)
        dest = _ad._collection_root_for("workspace") / slug
        if not (dest / _ad._WORKSPACE_MARKER).exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)

        # Recover the display name from workspace.json (else the marker).
        name = slug
        for src_file in (dest / "workspace.json", dest / _ad._WORKSPACE_MARKER):
            try:
                name = (json.loads(src_file.read_text(encoding="utf-8")) or {}).get("name") or name
                break
            except Exception:
                continue

        try:
            from tools.tool_manifest import discover_manifests
            manifest = {m.tool: m for m in discover_manifests()}.get("workspace")
        except Exception as exc:
            logger.exception("workspace resume: manifest load failed")
            return web.json_response({"error": "manifest_error", "detail": str(exc)}, status=500)
        if manifest is None:
            return web.json_response({"error": "tool_not_found", "detail": "workspace manifest missing"}, status=404)

        skill = manifest.skill
        inputs = {"name": name, "source_type": "resume", "source_ref": slug}
        user_message = (
            f"/{skill}\n\nResume the EXISTING workspace at SESSION_FOLDER — it is already ingested and "
            "provisioned. Read workspace.json to recover the current phase + active_feature and continue "
            "from there. Do NOT re-ingest or re-generate the team; greet briefly and tell the user where "
            "things stand and what's the next gate.\n\n"
            f"Inputs: {json.dumps(inputs, ensure_ascii=False)}"
        )
        run_id = f"run_{uuid.uuid4().hex}"
        session_id = f"tool-workspace-{uuid.uuid4().hex[:8]}"
        record: Dict[str, Any] = {
            "session_id": session_id, "tool_id": "workspace", "inputs": inputs,
            "brand": name, "claude_session_id": None, "created": time.time(),
            "completed": False, "busy": True, "run_cwd": str(dest),
        }
        _ad._run_registry()[run_id] = record
        _ad._persist_run(run_id, record)

        try:
            folder = _ad._provision_swarm_session(manifest, slug, name, "")  # idempotent
            if folder is not None:
                user_message += (
                    "\n\nSESSION_FOLDER (absolute path — your cwd, the workspace root; write every "
                    f"artifact here): {folder}"
                )
        except Exception:
            logger.warning("workspace resume provision failed for %s", slug, exc_info=True)

        _ad._start_run(adapter, run_id, user_message, session_id, run_record=record,
                       append_system_prompt=_ad._STEP_GATE_SYSTEM_PROMPT, swarm=True, run_cwd=str(dest))
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
        slug = _ad._kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        script = body.get("script") if isinstance(body.get("script"), str) else ""
        if not slug or script not in _ad._WORKSPACE_SCRIPTS:
            return web.json_response(
                {"error": "invalid_request", "detail": "require slug + script (build|run|test)"},
                status=400,
            )
        ws = _ad._collection_root_for("workspace") / slug
        if not (ws / _ad._WORKSPACE_MARKER).exists():
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
        existing = _ad._WORKSPACE_EXEC_PROCS.get(key)
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
        _ad._WORKSPACE_EXEC_PROCS[key] = proc

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
            _ad._kill_proc_group(proc)  # SIGTERM the group
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
            if _ad._WORKSPACE_EXEC_PROCS.get(key) is proc:
                _ad._WORKSPACE_EXEC_PROCS.pop(key, None)
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
        root = _ad._browse_root().resolve()
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
                if child.name.startswith(".") or child.name in _ad._BROWSE_SKIP:
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
        slug = _ad._kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        script = body.get("script") if isinstance(body.get("script"), str) else ""
        if script not in _ad._WORKSPACE_SCRIPTS:
            return web.json_response(
                {"error": "invalid_request", "detail": "script must be build|run|test"}, status=400)
        proc = _ad._WORKSPACE_EXEC_PROCS.get(f"{slug}:{script}")
        if proc is None or proc.returncode is not None:
            return web.json_response({"stopped": False, "detail": "not running"})
        _ad._kill_proc_group(proc)
        _ad._WORKSPACE_EXEC_PROCS.pop(f"{slug}:{script}", None)
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
        slug = _ad._kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        name = (body.get("name") if isinstance(body.get("name"), str) else "").strip()
        # Strip control chars and cap length so a huge/garbage name can't bloat
        # workspace.json / the marker (re-read on every projects listing).
        name = "".join(ch for ch in name if ch >= " " or ch == "\t")[:200].strip()
        if not slug or not name:
            return web.json_response(
                {"error": "invalid_request", "detail": "require slug + name"}, status=400)
        ws = _ad._collection_root_for("workspace") / slug
        marker = ws / _ad._WORKSPACE_MARKER
        if not marker.exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)
        try:
            meta = json.loads(marker.read_text(encoding="utf-8")) or {}
        except Exception:
            meta = {}
        meta["name"] = name
        _ad._write_workspace_marker(ws, meta)
        wsjson = ws / "workspace.json"
        if wsjson.exists():
            try:
                doc = json.loads(wsjson.read_text(encoding="utf-8")) or {}
                doc["name"] = name
                wsjson.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                logger.warning("rename: could not update workspace.json for %s", slug, exc_info=True)
        return web.json_response({"ok": True, "slug": slug, "name": name})

    # GET /v1/tools/workspace/git?slug=… — read-only branch + recent commits +
    # ahead/behind/dirty status for the workspace folder. {is_repo:false} if not a repo.
    async def _workspace_git(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        slug = _ad._kebab(request.query.get("slug") or "")
        if not slug:
            return web.json_response({"error": "invalid_request", "detail": "require slug"}, status=400)
        ws = _ad._collection_root_for("workspace") / slug
        if not (ws / _ad._WORKSPACE_MARKER).exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)
        res = await asyncio.get_running_loop().run_in_executor(None, _git_status_sync, ws)
        return web.json_response(res)

    # POST /v1/tools/workspace/git/push — push the workspace's current branch.
    # User-initiated (the agent never auto-pushes). Body {slug}.
    async def _workspace_git_push(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        body = body if isinstance(body, dict) else {}
        slug = _ad._kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        if not slug:
            return web.json_response({"error": "invalid_request", "detail": "require slug"}, status=400)
        ws = _ad._collection_root_for("workspace") / slug
        if not (ws / _ad._WORKSPACE_MARKER).exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)
        res = await asyncio.get_running_loop().run_in_executor(None, _git_push_sync, ws)
        return web.json_response(res, status=(200 if res.get("ok") else 502))

    # POST /v1/tools/workspace/git/init — initialize a git repo for the workspace
    # folder (its own repo) + an initial commit. Body {slug}.
    async def _workspace_git_init(request: "web.Request") -> "web.Response":
        if (auth := adapter._check_auth(request)) is not None:
            return auth
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "invalid_json"}, status=400)
        body = body if isinstance(body, dict) else {}
        slug = _ad._kebab(body.get("slug") if isinstance(body.get("slug"), str) else "")
        if not slug:
            return web.json_response({"error": "invalid_request", "detail": "require slug"}, status=400)
        ws = _ad._collection_root_for("workspace") / slug
        if not (ws / _ad._WORKSPACE_MARKER).exists():
            return web.json_response({"error": "not_a_workspace", "detail": "unknown workspace"}, status=404)
        res = await asyncio.get_running_loop().run_in_executor(None, _git_init_sync, ws)
        return web.json_response(res, status=(200 if res.get("ok") else 502))

    # Literal routes before the generic {tool_id} routes so they aren't shadowed.
    app.router.add_post("/v1/tools/workspace/create", _workspace_create)
    app.router.add_post("/v1/tools/workspace/resume", _workspace_resume)
    app.router.add_get("/v1/tools/workspace/browse", _workspace_browse)
    app.router.add_post("/v1/tools/workspace/rename", _workspace_rename)
    app.router.add_post("/v1/tools/workspace/exec", _workspace_exec)
    app.router.add_post("/v1/tools/workspace/exec/stop", _workspace_exec_stop)
    app.router.add_get("/v1/tools/workspace/git", _workspace_git)
    app.router.add_post("/v1/tools/workspace/git/push", _workspace_git_push)
    app.router.add_post("/v1/tools/workspace/git/init", _workspace_git_init)
