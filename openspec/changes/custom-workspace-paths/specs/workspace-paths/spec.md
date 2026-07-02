# Workspace Paths

## ADDED Requirements

### Requirement: Workspace and vault paths SHALL be independently configurable and persisted

The system SHALL allow the workspaces root and the Obsidian vault root to be configured as two
independent host directories, persisted in a repo-root `.env` file (Docker Compose's native
var-substitution source), rather than requiring an ephemeral shell export. Unset SHALL resolve to
today's exact default layout (`WORKSPACES_DIR` = `${VAULT_DIR}/10_Projects`).

#### Scenario: An operator never configures anything

- **WHEN** no repo-root `.env` exists and no `VAULT_DIR`/`WORKSPACES_DIR` env vars are exported
- **THEN** the workspaces root resolves to `${VAULT_DIR default}/10_Projects` and the vault root
  resolves to `${HOME}/Documents/Obsidian/Vault` — identical to pre-change behavior

#### Scenario: An operator sets a custom workspaces directory

- **WHEN** `WORKSPACES_DIR` is set (via the repo `.env` or an exported shell var) to a path
  outside the vault
- **THEN** new workspaces are created under that directory, independent of wherever `VAULT_DIR`
  points

#### Scenario: `scripts/install.sh` is re-run after a path was hand-edited

- **WHEN** the repo-root `.env` already defines `VAULT_DIR` or `WORKSPACES_DIR`
- **THEN** `scripts/install.sh` SHALL NOT overwrite the existing value — it only fills in keys
  that are still missing

### Requirement: The stack SHALL start without a pre-existing Obsidian vault directory

`scripts/install.sh` and `scripts/run.sh` SHALL create the resolved `VAULT_DIR` and
`WORKSPACES_DIR` host directories (if missing) before bringing up the Docker stack, so a missing
Obsidian vault folder never causes a bind-mount failure.

#### Scenario: A user who has never opened Obsidian runs the installer

- **WHEN** `~/Documents/Obsidian/Vault` (the default `VAULT_DIR`) does not exist on disk
- **THEN** `scripts/install.sh` creates it before `docker compose up`, the stack starts
  successfully, and the Memory screen shows an empty (not errored) vault graph

#### Scenario: A user runs `scripts/run.sh` directly without `install.sh`

- **WHEN** the resolved `VAULT_DIR`/`WORKSPACES_DIR` directories do not yet exist
- **THEN** `scripts/run.sh` creates them before `docker compose up -d --build` rather than
  letting Compose fail on a missing bind-mount source

### Requirement: Folder browsing and ingestion SHALL accept multiple configured roots

The engine SHALL resolve the set of browsable/ingestable source roots from `HERMES_BROWSE_ROOTS`
(a pathsep-separated list, falling back to the single-path `HERMES_BROWSE_ROOT`, falling back to
the workspaces root and its parent) and SHALL accept a folder source or browse request whose
resolved path is contained in **any** configured root, not only the first one.

#### Scenario: Two roots are configured (workspaces + vault)

- **WHEN** `HERMES_BROWSE_ROOTS=/workspaces:/vault` and a folder-source request targets a path
  under `/vault`
- **THEN** the request succeeds (contained in the second configured root), identically to a
  request targeting a path under `/workspaces`

#### Scenario: A folder source lies outside every configured root

- **WHEN** a `POST /v1/tools/workspace/create` folder-source request's resolved path is not
  contained in any configured root
- **THEN** the engine SHALL reject it with the existing `ingest_failed` error (no silent
  escape, no partial copy)

#### Scenario: No multi-root configuration is present

- **WHEN** neither `HERMES_BROWSE_ROOTS` nor `HERMES_BROWSE_ROOT` is set
- **THEN** the effective root set is exactly `[workspaces_root, workspaces_root.parent]` — the
  same single-root containment behavior as before this change

### Requirement: The "Add Workspace" folder tab SHALL surface the effective root and support a manual path

The dashboard's local-folder picker SHALL display which root(s) are configured, offer a switcher
when more than one root is configured, and offer a manual path entry fallback so a user can
specify a workspace source folder even when the picker cannot browse to it.

#### Scenario: Only one root is configured (default)

- **WHEN** the browse response reports a single root
- **THEN** the picker renders exactly as before this change — no switcher control appears

#### Scenario: More than one root is configured

- **WHEN** the browse response reports multiple roots
- **THEN** the picker SHALL offer a control to switch which root is being browsed, and label the
  currently active root

#### Scenario: The desired folder is not reachable via the picker

- **WHEN** a user cannot browse to the folder they want (e.g. it lies outside every configured
  root, or the vault mount is a fresh empty directory because Obsidian isn't installed)
- **THEN** the user can toggle to a manual path text entry, submit it as the `source_ref`, and
  receive the same clear error the engine already returns if that path is out of bounds
