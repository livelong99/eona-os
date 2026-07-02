# Proposal: Custom Workspace Paths

> Decouple "where projects live" from "where the Obsidian vault lives" — and make both
> configurable and persisted, so Eona OS works fully when Obsidian isn't installed.

## Why

Today three distinct concerns are conflated under one host directory, `VAULT_DIR`
(`docker-compose.yml:76`, default `${HOME}/Documents/Obsidian/Vault`):

1. The **Obsidian vault** — Memory screen graph/search + Brain retrieval. Already optional
   in spirit (`mcp_servers.obsidian` in `hermes/config.yaml:137-143` is a best-effort MCP;
   `scripts/install.sh:82-84` only "reminds" the user to run Obsidian).
2. The **workspaces root** — where "Add Workspace" copies/clones ingested projects
   (`HERMES_WORKSPACES_ROOT`, resolved from the `workspace` tool's `artifacts_root`
   template, `.claude/skills/bmad-agent-workspace/tool.yaml:64`, default
   `/vault/10_Projects`).
3. The **browse root** — the *only* tree the "Local folder" tab in `NewWorkspaceModal.tsx`
   can list or ingest from (`_browse_root()`, `engine/gateway/platforms/api_dashboard.py:684-691`,
   defaults to the parent of #2, i.e. the vault mount).

Three concrete problems fall out of this:

- **Docker won't even start without a real Obsidian vault on disk.** A bind mount source
  that doesn't exist fails `docker compose up` outright — so a user who has never opened
  Obsidian (and so has no `~/Documents/Obsidian/Vault` folder) can't run the stack at all,
  even though Obsidian is supposed to be optional.
- **No way to keep code projects somewhere other than inside the vault.** `WORKSPACES_ROOT`
  is a fixed subpath of `VAULT_DIR` — a user who wants the vault on a synced/cloud drive and
  projects on local/fast disk (or no vault at all) has no lever.
- **No persisted override.** The only way to change `VAULT_DIR` today is exporting it in the
  calling shell before `docker compose up` — lost between terminals, unknown to
  `scripts/install.sh`/`scripts/run.sh`, and undocumented. `scripts/doctor.sh:6` even reads a
  *different* env var name (`HERMES_VAULT_PATH`) for the same host-side check.

## What Changes

Four parts, each reversible and defaulting to today's exact behavior:

1. **A persisted, decoupled path config (ops).** A repo-root `.env` file (Docker Compose's
   native var-substitution mechanism — already gitignored) becomes the one place `VAULT_DIR`
   and a new `WORKSPACES_DIR` live, generated/maintained by `scripts/install.sh`. `WORKSPACES_DIR`
   defaults to `${VAULT_DIR}/10_Projects` (byte-for-byte today's layout) but can point anywhere
   on the host, independent of the vault.
2. **`docker-compose.yml` mounts the workspaces root independently.** A new bind mount
   (`${WORKSPACES_DIR}:/workspaces:rw`) replaces the nested `10_Projects` sub-mount;
   `HERMES_WORKSPACES_ROOT=/workspaces` and a new `HERMES_BROWSE_ROOTS` (pathsep list,
   mirrors the existing `HERMES_TOOL_ROOTS` idiom) replace the vault-anchored defaults.
   `install.sh`/`run.sh` `mkdir -p` both resolved host directories before bringing the stack
   up, so a missing/never-created vault folder no longer hard-fails the deploy.
3. **The engine accepts multiple browse/ingest roots.** `_browse_root()` and the folder-source
   containment check in `_ingest_workspace` generalize from one root to a small configured
   list, so both the workspaces root and the vault (when mounted) are pickable/ingestable —
   no change for the default single-root case.
4. **"Add Workspace" surfaces the configuration.** `NewWorkspaceModal`/`FolderPicker` show which
   root is in effect, offer a root switcher when more than one is configured, and add a manual
   path fallback for when the picker can't reach the desired folder (Obsidian not installed,
   or the target lives outside every configured root).

## Impact

- **User value:** the stack runs with zero Obsidian dependency (vault features degrade to an
  empty graph, not a boot failure), and workspaces can live on any disk the user chooses,
  configured once and persisted.
- **Reversible by construction:** every new env var defaults to today's exact resolved paths;
  an operator who changes nothing sees byte-for-byte the same layout and behavior.
- **Fail-open:** an unmounted/empty vault already produces an empty Memory graph
  (`vault_graph._scan_notes` `os.walk`s and yields `[]` on a missing/empty tree) — no engine
  change needed there, only removing the *deploy-time* hard-fail on a missing host directory.
- **Affected specs:** new capability `workspace-paths` (path config precedence, multi-root
  browse/ingest containment, install/compose behavior, the Add Workspace UI exposure). No
  established spec exists yet for workspace path resolution — this is a net-new spec file.
- **Touches:** `docker-compose.yml`, `scripts/install.sh`, `scripts/run.sh`, `scripts/doctor.sh`,
  `engine/gateway/platforms/api_dashboard.py` (`_browse_root`, `_ingest_workspace`),
  `engine/gateway/platforms/dashboard/workspace_routes.py` (`_workspace_browse`),
  `dashboard/src/components/workspace/NewWorkspaceModal.tsx`,
  `dashboard/src/components/workspace/FolderPicker.tsx`,
  `dashboard/src/lib/workspace/workspaceClient.ts`. New file: repo-root `.env` (gitignored,
  generated by `install.sh`, not committed).
