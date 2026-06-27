# Capability: Memory Dashboard — Dual-Brain Screen

Delta for the Cognee dual-brain change. Adds a brain selector to the Memory screen that lets the
user view the Obsidian vault graph, the Cognee knowledge graph, or both — reusing the existing 3D
renderer — and extends search + node detail to be brain-aware.

(No established `memory-dashboard` spec exists yet, so every requirement below is ADDED.)

## ADDED Requirements

### Requirement: The Memory screen SHALL provide an Obsidian · Cognee · Both selector

The Memory screen SHALL present an accessible segmented control to choose the active brain —
`Obsidian`, `Cognee`, or `Both` — defaulting to `Obsidian` so the current view is unchanged on
load. The control SHALL be keyboard-operable and expose its selected state to assistive tech.

#### Scenario: Default selection

- **WHEN** the Memory screen first loads
- **THEN** the selector is set to `Obsidian` and the live vault graph renders exactly as before

#### Scenario: Switching to Cognee

- **WHEN** the user selects `Cognee`
- **THEN** the screen loads `GET /v1/memory/cognee/graph` and renders it in the same
  `MemorySphere` component with a distinct accent palette from the vault view

#### Scenario: Selecting Both

- **WHEN** the user selects `Both`
- **THEN** the screen shows a split view — the vault graph on the left and the Cognee graph on the
  right — each in its own `MemorySphere` instance

### Requirement: The Cognee graph SHALL reuse the existing 3D renderer

The Cognee view SHALL render through the same `MemorySphere` component as the vault view, fed by
the mirrored graph contract, distinguished only by styling. No second graph renderer SHALL be
introduced.

#### Scenario: Cognee graph renders

- **WHEN** the Cognee graph is loaded
- **THEN** it is passed to `MemorySphere` as `nodes`/`links` in the same shape the vault graph
  uses, and renders without a renderer fork

#### Scenario: Cognee graph fails to load

- **WHEN** the Cognee endpoint returns an error or empty graph
- **THEN** the screen surfaces a graceful, retryable empty/error state (matching the vault graph's
  error handling) and does not crash the screen

### Requirement: The search source chip SHALL report the Cognee brain

The Memory screen's search `source` chip SHALL display a `cognee` state (in addition to `brain`
and `filesystem`) when the search response reports `source: "cognee"`.

#### Scenario: Search answered by Cognee

- **WHEN** a search returns `source: "cognee"`
- **THEN** the chip reads "via cognee" with a distinct accent

### Requirement: Node detail SHALL be brain-aware

When a node is selected, the detail panel SHALL render based on which brain produced it: a vault
node SHALL show the markdown note (title, snippet, tags, links/backlinks, Open-note deep-link) as
today; a Cognee node SHALL show the entity name, its relationships, and its source snippets —
rendered from data already present in the loaded Cognee graph, without an additional network
request.

#### Scenario: Vault node selected

- **WHEN** the user selects a node while viewing the Obsidian brain
- **THEN** the detail panel loads the note via `GET /v1/memory/note` and renders it as today

#### Scenario: Cognee node selected

- **WHEN** the user selects a node while viewing the Cognee brain
- **THEN** the detail panel shows the entity, its typed relationships, and its source snippets from
  the already-loaded graph node, with no extra fetch
