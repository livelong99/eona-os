# Capability: Agent Memory — Dual-Brain (engine)

Established capability spec (folded from the cognee-dual-brain change on completion). The vault is the source of truth in every mode; the Cognee layer is a derived, rebuildable, fail-open index.

## Requirements
### Requirement: The Brain SHALL support a switchable retrieval mode

The Brain SHALL read a retrieval mode from `HERMES_BRAIN_MODE` (one of `obsidian`, `cognee`,
`unified`), falling back to the `brain.mode` key in `hermes/config.yaml`, and defaulting to
`obsidian` when neither is set or the value is unrecognized. The mode SHALL gate which similarity
lanes contribute to `BrainResult.similar`, and SHALL NOT change the `BrainFact` or `BrainResult`
dataclass signatures consumed by the Chronicle (L3), the one-brain wiring (§8.2), and the
Evolution Engine (L5).

#### Scenario: Default mode preserves current behavior

- **WHEN** `HERMES_BRAIN_MODE` is unset (or set to an unrecognized value)
- **THEN** the Brain runs in `obsidian` mode and `retrieve()` assembles `similar` from the
  holographic lane plus the Qdrant lane via `_merge_dedupe`, identical to the pre-change behavior

#### Scenario: Cognee-only mode

- **WHEN** `HERMES_BRAIN_MODE=cognee`
- **THEN** `retrieve()` assembles `similar` from the Cognee lane only (holographic and Qdrant
  lanes are skipped), and the temporal, strategy, and preference lanes are unchanged

#### Scenario: Unified mode fuses all similarity lanes

- **WHEN** `HERMES_BRAIN_MODE=unified`
- **THEN** `retrieve()` assembles `similar` from the holographic, Qdrant, and Cognee lanes fused
  through the existing `_merge_dedupe`, deduplicated and ranked by score

#### Scenario: Env overrides config

- **WHEN** `hermes/config.yaml` sets `brain.mode: cognee` and `HERMES_BRAIN_MODE=obsidian` is set
- **THEN** the Brain runs in `obsidian` mode (env precedence over config)

### Requirement: The Brain SHALL provide a fail-open Cognee recall lane

The Brain SHALL provide a `_similar_via_cognee()` lane that queries the Cognee service over its
REST interface and maps results to `BrainFact` with `provenance="vault"`. The lane SHALL return
an empty list on any failure (service down, unreachable, timeout, malformed response, or
not-yet-ingested) and SHALL NOT raise, exactly as the existing Qdrant lane does.

#### Scenario: Cognee service is unreachable

- **WHEN** the Cognee lane runs and the Cognee service cannot be reached or times out
- **THEN** the lane returns `[]`, logs at debug level, retrieval continues with whatever other
  lanes the mode enabled, and the turn is not blocked

#### Scenario: Cognee returns graph hits

- **WHEN** the Cognee lane runs in `cognee` or `unified` mode and Cognee returns recall hits
- **THEN** each hit is mapped to a `BrainFact` (content from the entity text/description, score
  from Cognee, source set to the originating vault note or entity) and contributes to `similar`

### Requirement: The engine SHALL expose a Cognee graph endpoint mirroring the vault graph contract

The engine SHALL register `GET /v1/memory/cognee/graph` that returns the Cognee knowledge graph
in the **same JSON shape** as `GET /v1/memory/graph` — `{nodes, links, softLinks, projects}` with
the established node shape (`id, title, folder, project, tags, degree, updated, snippet, pinned`)
and edge shape (`{source, target}`) — so the existing 3D renderer is reused unchanged. The
endpoint SHALL be authenticated like the other memory routes and SHALL NOT modify `vault_graph.py`.

#### Scenario: Cognee graph is requested

- **WHEN** an authenticated client requests `GET /v1/memory/cognee/graph`
- **THEN** the engine returns Cognee entities as `nodes` and typed relationships as `links` in the
  vault-graph contract, carrying per-node `description`, `relations`, and `sources` for the detail
  panel, with `softLinks: []`

#### Scenario: Cognee service is down

- **WHEN** the Cognee service is unavailable and the endpoint is requested
- **THEN** the engine returns `{nodes: [], links: [], softLinks: [], projects: [], error: <msg>}`
  rather than failing the request in a way that breaks the Memory screen

#### Scenario: Request is unauthenticated

- **WHEN** the request omits or mismatches the API server bearer key
- **THEN** the engine rejects it with the same auth response as the other `/v1/memory/*` routes

### Requirement: The memory search source SHALL report the Cognee lane

When the Brain answers `/v1/memory/search` and the Cognee lane produced the results, the response
`source` field SHALL be `"cognee"` (extending the existing `"brain" | "filesystem"` values), so the
dashboard can show which brain answered.

#### Scenario: Cognee answers a search

- **WHEN** `HERMES_BRAIN_MODE` includes Cognee and the Cognee lane produces the search hits
- **THEN** `/v1/memory/search` returns `source: "cognee"` alongside the results

### Requirement: Cognee SHALL be a derived, rebuildable index — never the source of truth

Cognee SHALL be built from the read-only `/vault` mount and SHALL NOT write back to the vault. The
vault SHALL remain the canonical store in every mode, such that switching modes requires no data
migration and wiping the Cognee store loses nothing canonical.

#### Scenario: Switching modes needs no migration

- **WHEN** the operator changes `HERMES_BRAIN_MODE` between `obsidian`, `cognee`, and `unified`
- **THEN** no vault data is migrated or altered, and reverting to `obsidian` restores the exact
  prior behavior

#### Scenario: Cognee store is wiped

- **WHEN** the Cognee volume is deleted
- **THEN** no canonical data is lost (it is rebuildable by re-ingesting the vault), and the Brain
  continues to serve in `obsidian` mode

### Requirement: The Cognee service SHALL deploy fully-local, default-off, on 127.0.0.1

The `cognee` service SHALL be added to `docker-compose.yml` using the local stack
(SQLite + LanceDB + KuzuDB), behind a compose `profile` so it is **off** in the default
`docker compose up`, publishing only to `127.0.0.1`, mounting `/vault` read-only, with a named
volume and a healthcheck. The `hermes` service SHALL NOT `depends_on` Cognee (so the engine starts
and serves when Cognee is absent). Its LLM key SHALL come from `~/.hermes/.env`, never inline.

#### Scenario: Default stack excludes Cognee

- **WHEN** the operator runs `docker compose up` without the `cognee` profile
- **THEN** the Cognee service does not start, the engine runs in `obsidian` mode, and
  `scripts/doctor.sh` stays green (127.0.0.1-only bindings, no plaintext secrets)

#### Scenario: Operator opts into Cognee

- **WHEN** the operator starts the stack with the `cognee` profile and sets the cognify LLM key in
  `~/.hermes/.env`
- **THEN** the Cognee service starts, ingests from the read-only `/vault`, and the engine can serve
  `cognee`/`unified` modes and the `/v1/memory/cognee/graph` endpoint
