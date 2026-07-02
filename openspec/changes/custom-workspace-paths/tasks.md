# Tasks: Custom Workspace Paths

Ordered so each layer is verifiable before the next depends on it: persisted config → compose
mount → engine multi-root → dashboard exposure. The invariant to protect throughout: an operator
who touches nothing new sees byte-for-byte today's paths and behavior.

## Part 1 — Persisted path config (ops)

- [ ] **1.1 Add the `.env` prompt/backfill step to `scripts/install.sh`** — TTY-gated (skip under
  non-interactive/CI), defaults shown = today's resolved paths, only fills missing keys in
  `${REPO_DIR}/.env` (never overwrites an existing key), mirrors the `~/.hermes/.env` backfill
  idiom already at `install.sh:70-71`.
  *Verify:* fresh run with no `.env` creates one with both keys set to today's defaults; a
  second run with a hand-edited `.env` leaves existing keys untouched.
- [ ] **1.2 `mkdir -p` the resolved `VAULT_DIR` and `WORKSPACES_DIR`** in both `install.sh`
  (before `docker compose up`) and `run.sh` (so running it directly without `install.sh` first
  doesn't hard-fail either).
  *Verify:* `docker compose up` succeeds from a machine with no `~/Documents/Obsidian/Vault`
  directory pre-existing.
- [ ] **1.3 Unify `doctor.sh` on the same `.env`** — source `${REPO_DIR}/.env` before its existing
  vault secret-scan check (`doctor.sh:6,31-35`) instead of the separate `HERMES_VAULT_PATH`
  default; add one read-only check that both resolved directories exist.
  *Verify:* `scripts/doctor.sh` stays green with the new `.env` present or absent.

## Part 2 — `docker-compose.yml` independent workspaces mount (ops)

- [ ] **2.1 Add the `WORKSPACES_DIR` bind mount** (`"${WORKSPACES_DIR:-${VAULT_DIR:-…}/10_Projects}:/workspaces:rw"`)
  replacing the nested `10_Projects` sub-mount (`:91-95`); set `HERMES_WORKSPACES_ROOT=/workspaces`
  and `HERMES_BROWSE_ROOTS=/workspaces:/vault` on the `hermes` service environment.
  *Verify:* `docker compose config` validates; with `.env` absent, the resolved mount matches
  today's `${VAULT_DIR}/10_Projects` host path exactly (no behavior change for an untouched deploy).
- [ ] **2.2 Confirm the `workspace` tool manifest still resolves** — `artifacts_root` in
  `.claude/skills/bmad-agent-workspace/tool.yaml:64` already reads `HERMES_WORKSPACES_ROOT`; no
  manifest edit needed, but verify `_root_from_manifest` resolves to `/workspaces` after the
  compose change.
  *Verify:* `POST /v1/tools/workspace/create` lands a new workspace at `/workspaces/{slug}`
  in-container, and the host directory is the same folder as before this change (default config).

## Part 3 — Engine multi-root browse + ingest (engine)

- [ ] **3.1 Add `_browse_roots() -> List[Path]`** beside `_browse_root()` in `api_dashboard.py`
  (`HERMES_BROWSE_ROOTS` pathsep list → `HERMES_BROWSE_ROOT` single → `[workspaces_root,
  workspaces_root.parent]` fallback, mirrors `HERMES_TOOL_ROOTS`/`_user_tools_root()`).
  *Verify:* unit test each precedence branch; unconfigured env reproduces `_browse_root()`'s
  old single-path behavior exactly.
- [ ] **3.2 Update `_workspace_browse`** (`dashboard/workspace_routes.py:448-483`) — containment
  against any root in `_browse_roots()`; response gains `roots: [str,...]`; accept an optional
  `?root=` query param to switch the browse base (validated against the configured list, else
  ignored).
  *Verify:* browsing `/vault` and `/workspaces` both succeed when both are configured; a `?root=`
  outside the configured list is ignored (falls back to the default root), not honored.
- [ ] **3.3 Update `_ingest_workspace`'s folder-source containment** (`api_dashboard.py:756-774`)
  to check membership against any configured root instead of the single `_browse_root()`.
  *Verify:* ingesting a folder under either configured root succeeds; ingesting a folder outside
  all configured roots still raises the existing `ValueError` with an updated (multi-root) message.
- [ ] **3.4 Engine syntax/type + existing tests.** *Verify:* `cd engine && python -m compileall .`
  and `pytest engine/tests/gateway/test_workspace.py engine/tests/gateway/test_api_dashboard_b2.py`
  (both already exercise `HERMES_WORKSPACES_ROOT`/`HERMES_BROWSE_ROOT`) still pass unmodified.

## Part 4 — Dashboard "Add Workspace" exposure (dashboard)

- [ ] **4.1 Extend `workspaceClient.ts`** — `FolderListing` gains optional `roots?: { path: string;
  label: string }[]`; `browseFolders(path?, root?)` passes `?root=` through when provided.
  *Verify:* `cd dashboard && npm run typecheck` passes.
- [ ] **4.2 Add the root switcher to `FolderPicker.tsx`** — renders only when
  `listing.roots.length > 1` (default single-root deploys show nothing new); reuses the existing
  segmented-button styling.
  *Verify:* typecheck + manual check with a 1-root and a 2-root mock response.
- [ ] **4.3 Add the manual-path fallback** — a "Type a path instead" toggle in `FolderPicker.tsx`
  (or a sibling in `NewWorkspaceModal.tsx`'s folder tab) swapping to a plain text input pre-filled
  with the current value; "Browse instead" swaps back. No new client-side path validation — the
  engine's existing containment check is the only gate.
  *Verify:* typing an in-bounds path and submitting creates the workspace; typing an out-of-bounds
  path surfaces the existing `ingest_failed` error message in the modal.
- [ ] **4.4 Replace the hardcoded "It's copied into 10_Projects." caption** with a dynamic one
  sourced from `listing.root`/label.
  *Verify:* caption reflects the actual effective root; `npm run build` passes.

## Closeout

- [ ] **5.1 Full verification.** `cd dashboard && npm run typecheck && npm run build`;
  `cd engine && python -m compileall .` + `pytest engine/tests/gateway/`; `scripts/doctor.sh` green.
- [ ] **5.2 Confirm reversibility.** With no `.env` and default `VAULT_DIR`/`WORKSPACES_DIR`,
  the resolved host paths, mount layout intent, and Add Workspace UI are unchanged from before
  this change (only the in-container mount point for workspaces moves from `/vault/10_Projects`
  to `/workspaces` — not host-observable).
- [ ] **5.3 Verify an existing (pre-change) workspace still resumes** — `POST
  /v1/tools/workspace/resume` for a workspace created before this change lists/opens correctly
  from the new `/workspaces` mount (same host directory, new container path); its stored
  `workspace.json.path` field is stale until the next agent write (cosmetic only, called out in
  design.md — no migration needed).
- [ ] **5.4 Fold deltas into `openspec/specs/workspace-paths/spec.md`** on completion, per the
  project's OpenSpec flow.
