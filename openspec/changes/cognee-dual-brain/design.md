# Design: Cognee Dual-Brain

> Technical approach, touch-points (file:line, verified against the working tree), and the two
> invariants that make this reversible. Ponytail throughout: every part climbs to the lowest
> rung that holds — reuse the renderer, reuse the lane-fusion + dedupe, mirror the existing
> graph contract, copy the `qdrant` compose service as the template.

## The two invariants (hold the line on these)

1. **Vault stays the source of truth in EVERY mode.** Cognee — like Qdrant today — is a
   **derived, rebuildable index** built *from* the vault, never the canonical store. The vault
   is mounted **read-only** at `/vault` (`docker-compose.yml:69`); Cognee ingests *from* it and
   may **never** write back to it. Consequence: switching modes is reversible and needs no data
   migration; wiping the Cognee volume loses nothing canonical; there is no lock-in.
2. **The Cognee lane is fail-open.** Service down / unreachable / not yet ingested → the lane
   returns `[]`, memory degrades gracefully, and a turn is **never** blocked. This mirrors
   `_similar_via_qdrant` exactly (`engine/agent/brain.py:146-163`, `:275-292`), where every
   network failure is caught and logged at `debug`, returning `[]`.

---

## Part 1 — Brain-mode switch + Cognee recall lane (engine)

### Grounding (verified)

- `Brain.retrieve()` fuses lanes at `engine/agent/brain.py:398-446`. Lane 1 (similarity) runs
  `_similar_via_holographic` + `_similar_via_qdrant` then `_merge_dedupe(... , k)` at `:424-429`.
  Lanes 2–4 (temporal, strategies, preferences) run at `:431-438`.
- `_merge_dedupe` (`:96-109`) sorts by score desc and dedupes by `content.strip()[:200]` — it
  already takes a flat `List[BrainFact]`, so a third similarity lane drops in with no signature
  change.
- `_similar_via_qdrant` (`:275-292`) is the template: embed → search → map hits to `BrainFact`,
  `[]` on any failure. `_qdrant_search` (`:146-163`) is the fail-open network call to copy.
- The frozen contract is `BrainFact` (`:71-78`) and `BrainResult` (`:81-89`). The module docstring
  (`:8-21`) names the consumers that must not break: the Chronicle (L3), one-brain §8.2, and the
  Evolution Engine (L5). **We add no field and change no signature.**
- Config today: `brain.py` reads only **env** (`VAULT_DIR`/`HERMES_VAULT_PATH` `:39-47`,
  `QDRANT_URL` `:55`). There is no YAML reader in `brain.py`, and no `brain:` block in
  `hermes/config.yaml` (model block at `:16-19`, memory at `:32-35`).

### Approach

Add a module-level mode reader and one new lane; gate the fused lanes by mode.

```python
# brain.py — module level, mirrors the existing env reads
_VALID_MODES = ("obsidian", "cognee", "unified")
def _brain_mode() -> str:
    m = (os.environ.get("HERMES_BRAIN_MODE") or "obsidian").strip().lower()
    return m if m in _VALID_MODES else "obsidian"   # validate at the boundary; bad value → safe default

_COGNEE_URL = os.environ.get("COGNEE_URL", "http://127.0.0.1:8765").rstrip("/")  # see note on port
```

New lane beside `_similar_via_qdrant`, same fail-open shape:

```python
def _similar_via_cognee(self, query: str, *, k: int) -> List[BrainFact]:
    """Cognee graph `recall` lane. Returns [] on any failure (fail-open)."""
    hits = _cognee_recall(query, k)          # urllib POST to Cognee REST, [] on error
    return [
        BrainFact(
            content=hit.get("text") or hit.get("description") or "",
            score=float(hit.get("score", 0.0)),
            provenance="vault",               # derived FROM the vault — still vault-provenanced
            source=hit.get("source_path") or hit.get("entity"),
            metadata={"cognee_entity": hit.get("entity"), "relations": hit.get("relations", [])},
        )
        for hit in hits if (hit.get("text") or hit.get("description"))
    ]
```

### Lane-gating logic (the only change to `retrieve()`)

`retrieve()` keeps its signature. Replace the fixed Lane-1 block (`:424-429`) with mode-gated
assembly; Lanes 2–4 are unchanged:

| Mode | Lane 1 (similar) assembled from |
|------|---------------------------------|
| `obsidian` (default) | holographic + qdrant → `_merge_dedupe` — **identical to today** |
| `cognee` | cognee only → `_merge_dedupe` |
| `unified` | holographic + qdrant + cognee → `_merge_dedupe` (same dedupe path) |

```python
mode = _brain_mode()
parts: List[BrainFact] = []
if mode in ("obsidian", "unified"):
    parts += self._similar_via_holographic(query, k=k, min_trust=min_trust)
    parts += self._similar_via_qdrant(query, k=k)
if mode in ("cognee", "unified"):
    parts += self._similar_via_cognee(query, k=k)
similar = _merge_dedupe(parts, k=k)
```

Ponytail: no new dedupe, no new result type, no fused-lane rewrite — the existing
`_merge_dedupe` already merges N lanes. The default branch is byte-for-byte today's behavior.

### Config surface

- **Env is the runtime source of truth** (`HERMES_BRAIN_MODE`), mirroring how `HERMES_API_MODE`
  works (`docker-compose.yml:26`). Add the var to the `hermes` service env in compose.
- **`hermes/config.yaml` gains a `brain:` block** (`mode: obsidian`) as the documented,
  declarative default — placed beside `memory:` (`config.yaml:31-35`). Precedence:
  `HERMES_BRAIN_MODE` env **>** `config.yaml brain.mode` **>** `obsidian`. To avoid coupling
  `brain.py` to a YAML parser (it has none today), the engine boot path that already reads
  config exports `brain.mode` into the env when the env is unset — same pattern Hermes uses to
  resolve `api_mode` from config into `HERMES_API_MODE`. (If wiring that export proves larger
  than a few lines, ship env-only for v1 and treat the config key as documentation — flagged as
  an open question below.)

### Cognee client transport

Cognee ships a Python SDK, a REST API, and an MCP server exposing `remember`/`recall`/`forget`.
Ponytail rung: **reuse the existing transport idiom**. `brain.py` already does fail-open recall
over **`urllib` REST** (`_qdrant_search`, `_gemini_embed`) — no SDK dependency, no async. So the
Cognee lane calls Cognee's **REST `search`/`recall`** endpoint with `urllib`, 10s timeout, `[]`
on any exception. We do **not** add the Cognee Python SDK to the exact-pinned `engine/pyproject.toml`
(supply-chain hygiene, `project-context.md` landmine #7) — the lane is a thin HTTP client.

---

## Part 2 — `/v1/memory/cognee/graph` endpoint (engine)

### Grounding (verified)

- Routes are registered in `memory_routes.register()` (`memory_routes.py:22`, wired at
  `api_dashboard.py:2995-2997`). The vault graph route `_memory_graph` (`memory_routes.py:45-58`)
  runs `vault_graph.build_graph` in an executor and returns it, `{nodes:[],links:[],...}` + 500
  on error.
- The graph **contract** the renderer consumes is produced by `vault_graph._build_graph_uncached`
  (`vault_graph.py:391-396`): `{nodes, links, softLinks, projects}`. Node shape (`:291-301`):
  `{id, title, folder, project, tags, degree, updated, snippet, pinned}`. Edge shape (`:357`):
  `{source, target}`. Project shape (`:382-389`): `{id, label, color}`. The TS mirror is
  `MemoryGraph` in `engineClient.ts:61-67` (+ `GraphNode` `:22-35`, `GraphEdge` `:38-41`).

### Approach

Add `_memory_cognee_graph` to `memory_routes.register` (one handler + one `add_get`), backed by
a **new small module** `engine/gateway/platforms/cognee_graph.py` (keeps `vault_graph.py`
untouched, honors the "many small files" + "don't patch existing module" preference). It:

1. Reads Cognee's graph (KuzuDB nodes/edges) via the Cognee REST graph/visualization endpoint
   (or SDK-free REST equivalent), fail-open → `{nodes:[],links:[],softLinks:[],projects:[],error}`.
2. **Maps Cognee → the frozen graph contract** so the renderer is reused **unchanged**:

| Graph field | Vault source | Cognee mapping |
|-------------|--------------|----------------|
| `nodes[].id` | vault-relative path | stable Cognee entity id |
| `nodes[].title` | note title | entity name/label |
| `nodes[].folder` | PARA folder | entity **type** bucketed to a folder-like label |
| `nodes[].project` | `10_Projects/<slug>` | entity type (drives cluster color) or `null` |
| `nodes[].tags` | frontmatter tags | entity type(s) |
| `nodes[].degree` | wikilink count | relationship count (drives node size) |
| `nodes[].updated` | relative mtime | `""` (Cognee has no per-entity mtime) — renderer tolerates |
| `nodes[].snippet` | first sentences | entity description |
| `nodes[].pinned` | frontmatter | `false` |
| `links[]` | `{source,target}` | `{source,target}` per typed relationship (+ optional `label`/`kind`, ignored by the renderer) |
| `softLinks[]` | tag/folder stars | `[]` (Cognee edges are all real relations) |
| `projects[]` | project clusters | entity-type clusters, colored from the same palette idea |

   Extra per-node fields for the detail panel — `description` and `sources[]` (source note
   snippets) and `relations[]` — ride along on the node; the renderer ignores unknown keys, and
   the Cognee NodeDetail reads them from the already-loaded graph (no second fetch needed).

3. Caching: same TTL idiom as `vault_graph.build_graph` (`vault_graph.py:473-489`) so the
   Cognee graph read isn't per-request.

**Cognee node detail = no new endpoint.** The graph payload carries enough per Cognee node
(`description`, `relations`, `sources`) for the detail card, so we do **not** add a
`/v1/memory/cognee/note` route (vault `/v1/memory/note` reads a real file; Cognee entities aren't
files). Smallest change that holds.

### Search lane (Part 1 ↔ Part 4 bridge)

`/v1/memory/search` (`memory_routes.py:92-177`) already reports `source: "brain" | "filesystem"`.
When `HERMES_BRAIN_MODE` includes Cognee and the Cognee lane produced the hits, the handler
reports `source: "cognee"`. The Brain result resolution loop (`:141-157`) currently resolves a
fact's `source` to a **vault node id**; Cognee facts whose `source` is an entity (not a vault
path) won't resolve to a vault node — for those the handler returns the fact directly with a
`cognee` source flag rather than dropping it. (This keeps the search chip honest in `cognee`/
`unified` mode; detailed in the spec delta.)

---

## Part 3 — Cognee compose service (ops)

### Grounding (verified)

- The `qdrant` service (`docker-compose.yml:146-163`) is the template: `image`, `restart:
  unless-stopped`, named `volumes:` mount, `127.0.0.1`-only port publish, TCP healthcheck,
  `depends_on … service_healthy`. Named volume declared at `:191-193` (`qdrant_data`).
- The vault is mounted **ro** at `/vault` (`:69`); `~/.hermes/.env` is the secret source
  (`:19-21`, `:172-174`); `HERMES_BRAIN_INJECT` is left **off** by default (`:61`).

### Approach — new `cognee` service (copy the qdrant shape)

```yaml
  cognee:                       # graph brain over the vault — fully-local (SQLite+LanceDB+KuzuDB)
    image: cognee/cognee:<pin>  # pin after first pull (same "verify/pin" convention as qdrant)
    container_name: agenthome-cognee
    restart: unless-stopped
    profiles: ["cognee"]        # OFF by default — only starts with `--profile cognee`
    env_file:
      - path: ${HOME}/.hermes/.env
        required: false
    environment:
      - VECTOR_DB_PROVIDER=lancedb        # local
      - GRAPH_DATABASE_PROVIDER=kuzu      # local
      - DB_PROVIDER=sqlite                # local relational
      # cognify/extraction LLM — the per-document token cost. Keyed from ~/.hermes/.env.
      - LLM_API_KEY=${COGNEE_LLM_API_KEY:-}
    volumes:
      - cognee_data:/cognee/.data         # local stores (sqlite + lancedb + kuzu)
      - "${VAULT_DIR:-${HOME}/Documents/Obsidian/Vault}:/vault:ro"   # ingest source — READ-ONLY
    ports:
      - "127.0.0.1:<cognee_port>:8000"    # 127.0.0.1 only (doctor.sh would fail on 0.0.0.0)
    healthcheck:
      test: ["CMD-SHELL", "..."]          # mirror qdrant's TCP/health probe idiom
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3
```

And `cognee_data:` under the top-level `volumes:` (`:191-193`). The `hermes` service gains
`COGNEE_URL=http://cognee:8000` and `HERMES_BRAIN_MODE` to its `environment:`.

Decisions:
- **`profiles: ["cognee"]`** keeps the service off in the default `docker compose up` — the
  default-off identity (matches `HERMES_BRAIN_INJECT` off, `:61`). It starts only with
  `--profile cognee` (or `COMPOSE_PROFILES=cognee`).
- **No `depends_on` from `hermes`** — because the Cognee lane is fail-open, `hermes` must start
  and serve fine when `cognee` isn't running. Adding `depends_on: cognee` would couple startup
  and break the default-off mode.
- **Local stack only** (SQLite+LanceDB+KuzuDB) — no managed/cloud vector or graph DB, bounding
  infra cost. The only external cost is the cognify LLM key.
- **Secrets** stay in `~/.hermes/.env` (`COGNEE_LLM_API_KEY`), never inline (doctor.sh scans).
- **Port** published on `127.0.0.1` only; verify no clash (qdrant already moved off 6333 → 6533
  for this reason, `:153-155`). `doctor.sh` must stay green.
- **Ingest** is a one-time/periodic batch over `/vault` (a `scripts/` step or a Cognee
  bootstrap), **not** per-turn — keeps the token cost bounded and predictable.

---

## Part 4 — Dual-brain Memory screen (dashboard)

### Grounding (verified)

- `MemoryScreen.tsx` loads the graph via `getMemoryGraph` on mount (`MemoryScreen.tsx:34-51`),
  renders `<MemorySphere>` with `nodes/links/softLinks` (`:265-278`), shows the search `source`
  chip ("via brain"/"via filesystem", `:209-217`), and opens `<NodeDetail>` on select
  (`:280-286`). `NodeDetail` fetches `getNote(nodeId)` (`NodeDetail.tsx:66`).
- `engineClient.ts` exposes `getMemoryGraph` (`:98-112`), `searchMemory` (`:134-153`, `source:
  "brain" | "filesystem"`), and the `MemoryGraph` types (`:61-95`).

### Approach

- **Segmented control `Obsidian · Cognee · Both`** — a new small component
  (`dashboard/src/components/memory/BrainToggle.tsx`), styled with the dark-glass tokens, with
  `aria-pressed`/`role="tablist"` for accessibility. Held in `MemoryScreen` state
  (`brain: "obsidian" | "cognee" | "both"`), default `obsidian` (current view unchanged).
- **`engineClient.ts` gains `getCogneeGraph(signal)`** → `GET /v1/memory/cognee/graph`, returning
  the **same `MemoryGraph` type** (the contract is mirrored, so no new type). The `source` union
  on `SearchResponse` (`:91-95`) extends to `"brain" | "filesystem" | "cognee"`.
- **Rendering, reusing `MemorySphere` unchanged:**
  - `obsidian` → vault graph (today).
  - `cognee` → `getCogneeGraph()` into the **same** `<MemorySphere>`, with a distinct accent
    (e.g. a cyan/teal palette vs the vault purple) so the two brains read differently.
  - `both` → **split view**: vault sphere left, Cognee sphere right (two `MemorySphere`
    instances in a flex row). Overlay-into-one-sphere is explicitly a **later** option, not v1
    (YAGNI) — split is the smaller change and avoids id-collision/fusion logic.
- **Search `source` chip** (`:209-217`) gains a `cognee` branch (label "via cognee", teal accent).
- **Node detail:** vault nodes → today's `<NodeDetail>` (markdown note via `getNote`). Cognee
  nodes → a **branch in NodeDetail** (or a sibling `CogneeNodeDetail`) that renders entity name,
  **relationships**, and **source snippets** straight from the node object already in the loaded
  Cognee graph — **no network fetch** (the data rode along on the graph payload, Part 2). The
  card decides which renderer by which brain produced the selected node.

Ponytail: one new toggle component, one new client function, one render branch, one detail
branch. `MemorySphere` is reused verbatim — distinct styling is a prop/palette, not a fork.

---

## Risks & open questions

- **Cognee API churn.** Cognee is young; its REST/SDK surface moves. Mitigation: the lane and
  the graph reader are **thin, fail-open HTTP clients** — if an endpoint shape changes, the lane
  returns `[]`/empty graph and the rest of Eona OS is unaffected. Pin the image tag.
- **Ingest token cost.** `cognify` costs LLM tokens **per document** over ~3,500 vault notes —
  the real tension with the "no per-token bill" identity. Mitigation: default-off profile,
  local stack, batch (not per-turn) ingest, and a documented opt-in. **Open:** which LLM
  backs cognify (a cheap model? the user's own key?) and how often re-ingest runs.
- **Dedup maturity across brains.** In `unified` mode, `_merge_dedupe` dedupes by
  `content[:200]` — a Cognee entity snippet and a vault chunk about the same fact may *not*
  collide, so the user could see near-duplicate hits. Acceptable for v1 (both are surfaced as
  USER-message context, not authoritative); a smarter cross-brain dedupe is future work.
- **Config precedence wiring.** Whether `config.yaml brain.mode` is exported into
  `HERMES_BRAIN_MODE` at boot, or v1 ships **env-only** with the YAML key as documentation —
  decide during implementation based on how large the export wiring is (see Part 1).
- **Cognee port** — confirm a free `127.0.0.1` port (qdrant already dodged 6333). `doctor.sh`
  must stay green (127.0.0.1-only, no plaintext secrets).
