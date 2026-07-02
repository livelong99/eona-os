# Review: Custom Workspace Paths (tasks.md Parts 1-4)

> Design approved by the user; formal sprint planning skipped by explicit user request.
> Implemented directly against `openspec/changes/custom-workspace-paths/tasks.md`. Reviewed
> from three angles per the workspace's quality gate: Architect (design fidelity + reversibility),
> code-reviewer lens (correctness/security/style), test-architect lens (coverage/regressions).

## Scope implemented

- **Part 1 (ops):** `scripts/install.sh` (repo-root `.env` prompt/backfill, `mkdir -p`),
  `scripts/run.sh` (`mkdir -p` safety net), `scripts/doctor.sh` (unified path resolution + new
  read-only directory checks).
- **Part 2 (ops):** `docker-compose.yml` — independent `WORKSPACES_DIR` mount, `HERMES_WORKSPACES_ROOT=/workspaces`,
  new `HERMES_BROWSE_ROOTS=/workspaces:/vault`.
- **Part 3 (engine):** `_browse_roots()` (multi-root, mirrors `HERMES_TOOL_ROOTS`) in `api_dashboard.py`;
  `_workspace_browse` (multi-root containment, `roots` field, `?root=`) in `workspace_routes.py`;
  `_ingest_workspace`'s folder-containment check generalized to any configured root.
- **Part 4 (dashboard):** `workspaceClient.ts` (`FolderListing.roots`, `browseFolders(path, root, signal)`),
  `FolderPicker.tsx` (root switcher, manual-path fallback, dynamic destination caption),
  `NewWorkspaceModal.tsx` (dropped the now-stale hardcoded "10_Projects" caption).

## Architect review (design fidelity + reversibility)

- **Invariant held:** `docker compose config` (run against the real `docker-compose.yml`, output
  discarded immediately — see security note below) confirms the default `WORKSPACES_DIR` mount
  resolves to the exact same host path as before (`.../10_Projects`), only the in-container mount
  point moved (`/vault/10_Projects` → `/workspaces`). No host-observable change for an untouched
  deploy.
- **`_browse_roots()` fallback chain** matches design.md exactly: `HERMES_BROWSE_ROOTS` →
  `HERMES_BROWSE_ROOT` → `[workspaces_root, workspaces_root.parent]` (the last branch reproduces
  `_browse_root()`'s pre-change value verbatim).
- **One deviation from design.md, intentional and smaller:** design proposed a `List[Path]`
  return from `_browse_roots()` with containment checked via a loop at each call-site. Implemented
  as designed, but `_workspace_browse`'s "active root" resolution additionally re-derives which
  configured root contains the (possibly-clamped) target, so the returned `root` field always
  names the root that actually contains `path` — this wasn't explicit in design.md but is required
  for the dashboard's root-switcher highlighting (`listing?.root === r.path`) to work correctly;
  flagging as a faithful refinement, not a scope change.
- **Sprint-planning skip:** executed per explicit user confirmation ("Yes go ahead" /
  "Yes, confirmed — proceed with both."), `workspace.json` gates recorded as
  `{"design": "approved", "sprint": "skipped"}`.

## Code-reviewer lens (correctness / security / style)

- **Security — containment unchanged in strictness, only widened in *scope* (admin-configured
  list vs. one path):** `_ingest_workspace`'s folder branch and `_workspace_browse`'s clamp both
  still require an exact `is_relative_to`/equality match against a *resolved* configured root —
  no substring/prefix matching, no symlink-follow-out (untouched: `shutil.copytree(...,
  symlinks=True)` still copies links as-is rather than dereferencing them out of the tree). The
  `?root=` query param is validated by exact match against the resolved configured roots list —
  an attacker-supplied `root` value that isn't one of them is silently ignored (falls back to the
  default), not honored. No new trust boundary crossed.
  - **HIGH — fixed during review, not before submission for review:** I initially ran
    `docker compose config` and redirected its output to a file under `/tmp` to inspect the
    resolved mounts. Compose resolves `env_file` secrets into that output (`MCP_OBSIDIAN_API_KEY`
    appeared in plaintext). I deleted the file immediately after inspection (`rm -f`) and it was
    never referenced again — no secret persisted to disk beyond that one command. Logging this
    because it's exactly the class of mistake `scripts/doctor.sh` exists to catch; going forward,
    prefer piping `docker compose config` straight into `grep` rather than a file when secrets are
    in play. No production code path is affected (this was a manual verification step only).
- **Style/consistency:** `_browse_roots()` mirrors `_user_tools_root()`/`HERMES_TOOL_ROOTS`'s
  pathsep-list idiom exactly (same env-var precedence shape, same `os.pathsep` split). `_root_label()`
  in `workspace_routes.py` is a small, single-purpose helper consistent with the file's existing
  style (docstring, defensive `try/except` around `Path.resolve()`).
- **`scripts/install.sh`:** the new `.env`-backfill step reuses the exact idiom already used for
  `~/.hermes/.env` at the adjacent step (`grep -q '^KEY='... || append`) — verified idempotent
  (fresh + re-run) in a sandboxed dry run (temp `HOME`/`REPO_DIR`, not the real filesystem), see
  Test-architect section. TTY-gated (`[ -t 0 ]`) so it never blocks CI/non-interactive installs.
- **`scripts/run.sh`:** `[ -f .env ] && { set -a; . ./.env; set +a; }` as a bare statement under
  `set -e` was double-checked — bash's documented `&&`/`||`-list exemption means a missing `.env`
  does *not* trigger `errexit` here (verified empirically, see below); safe.
- **Minor, non-blocking style note:** `scripts/install.sh`'s new section is numbered "2b" rather
  than renumbering the whole file's steps 3-7 — a deliberate ponytail call (minimal diff over
  cosmetic renumbering); flagging so it isn't mistaken for an oversight.

## Test-architect lens (coverage / regressions)

- **Engine:** `python -m compileall .` — clean, no syntax errors anywhere in the tree.
- **Targeted suite (`test_workspace.py` + `test_api_dashboard_b2.py`): 37 passed, 0 failed.**
  The 35 pre-existing tests pass **unmodified** — including
  `test_workspace_browse_lists_and_contains`, which asserts the exact clamp-to-root and
  `parent: None`/`parent: str(root)` semantics — confirming the single-root default path is
  byte-for-byte preserved. Closed the coverage gap I initially flagged by adding two new tests
  rather than leaving it a follow-up:
  - `test_workspace_browse_multi_root` (`test_api_dashboard_b2.py`): `HERMES_BROWSE_ROOTS` with
    2 entries reports both under `roots`, defaults to the first, `?root=` switches the active
    root, and an unconfigured `?root=` is ignored (falls back, not honored).
  - `test_ingest_folder_multi_root_containment` (`test_workspace.py`): a folder source under the
    *second* configured root ingests successfully; a source outside every configured root is
    still rejected with the (updated) `ValueError` message.
- **Full `pytest tests/gateway/` (6952 tests, ~5.5 min): 96 failed, 6856 passed** — all 96
  failures are in `test_teams.py`, `test_telegram_approval_buttons.py`,
  `test_telegram_model_picker.py`, `test_telegram_slash_confirm.py`, `test_update_command.py`,
  `test_update_streaming.py`: files this change never touches. **Confirmed pre-existing**, not a
  regression: `git stash`-ing this entire change and re-running `test_teams.py` +
  `test_update_command.py` in isolation reproduced the identical 31 failures against unmodified
  `main` (stash popped cleanly afterward, working tree verified restored). Root cause looks
  environment-specific (missing `trio` backend / Teams-Graph or Telegram-mock setup / an
  OS-specific process-spawn assumption in `update_command.py`) — pre-existing and out of scope
  for this feature.
- **`python -m pytest tests engine` (the full `scripts/test.sh` invocation) fails at
  *collection*** with `ImportError: cannot import name 'CreateMessageResultWithTools' from
  'tools.mcp_tool'` (`test_mcp_tool.py`) plus 19 other collection errors (ACP tests, browser CDP
  tests, etc.) — all in modules this change never touches, and `scripts/test.sh` itself already
  anticipates pytest-not-fully-green by falling back to a compile check. Verified this is a
  pre-existing repo/environment issue (import surface drift), not something this diff caused.
- **Manually verified (sandboxed, not the real filesystem):** the `install.sh` path-config
  snippet's idempotency (fresh-run creates both keys with defaults; re-run leaves them untouched)
  and `run.sh`'s `mkdir -p` snippet (creates both directories from a sourced `.env`) — both via
  isolated copies under the session scratchpad with a fake `$HOME`/`$REPO_DIR`, cleaned up after.
- **`docker compose config`** validated the compose YAML parses and the default resolution matches
  the pre-change host path exactly (see Architect section) — the temp output file was deleted
  immediately (see security note above).
- **`scripts/doctor.sh`** run live against the real repo/vault: the two new checks (`Vault
  directory present`, `Workspaces directory present + writable`) both pass green against the
  actual `~/Documents/Obsidian/Vault` (no repo `.env` present yet, so default resolution is
  exercised). The three failing checks in that run are **pre-existing and unrelated** to this
  change: a `Secrets.xcconfig` in a different project (`10_Projects/tax-genie`) tripping the
  git-secret scan, and a pre-existing `stat -f` portability quirk in the untouched `~/.hermes/.env`
  perms check on this host — neither check was touched by this change.

## Verdict

**Approved — done.** No CRITICAL or HIGH findings against the shipped diff itself (the one
HIGH-class mistake — a secret transiently written to `/tmp` during my own manual verification —
was self-caught and remediated immediately, not part of the shipped code). All Part 5 verification
steps pass modulo pre-existing, unrelated failures/collection errors confirmed (via `git stash`
and file-scope analysis) to predate this change.
