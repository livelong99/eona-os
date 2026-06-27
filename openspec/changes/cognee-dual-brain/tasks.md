# Tasks: Cognee Dual-Brain

Ordered so each layer can be built and verified before the next depends on it: engine lane +
mode → Cognee graph endpoint → compose service → frontend selector/view. Each task is
ponytail-scoped (reuse first; smallest change that holds) and carries its own verification.
Default behavior (`obsidian` mode, no Cognee profile) must stay byte-for-byte unchanged until
the operator opts in.

## Part 1 — Brain-mode switch + Cognee recall lane (engine)

- [ ] **1.1 Add the mode reader + Cognee URL constant** to `engine/agent/brain.py` (module level,
  beside the existing env reads at `:39-57`). `_brain_mode()` validates against
  `("obsidian","cognee","unified")` and returns `obsidian` on unset/unknown.
  *Verify:* `python -c` shows each env value maps correctly and a garbage value → `obsidian`.
- [ ] **1.2 Add `_cognee_recall()` + `_similar_via_cognee()`** beside `_qdrant_search` /
  `_similar_via_qdrant` (`:146-163`, `:275-292`) — a `urllib` REST client, 10s timeout, `[]` on
  any exception; map hits → `BrainFact(provenance="vault")`. No SDK dependency added to
  `engine/pyproject.toml`.
  *Verify:* with no Cognee running, `_similar_via_cognee("x", k=5)` returns `[]` and does not raise.
- [ ] **1.3 Gate Lane 1 in `retrieve()` by mode** — replace the fixed holographic+qdrant block
  (`:424-429`) with the mode-gated assembly into one `_merge_dedupe(parts, k)`. Lanes 2–4 and the
  method signature unchanged. `BrainFact`/`BrainResult` untouched.
  *Verify:* in `obsidian` mode the assembled `similar` equals the pre-change result for a fixed
  query (snapshot/diff); `cognee` mode skips the vault lanes; `unified` includes all three.
- [ ] **1.4 Add the `brain:` block to `hermes/config.yaml`** (`mode: obsidian`, beside `memory:`
  at `:31-35`) and add `HERMES_BRAIN_MODE` + `COGNEE_URL` to the `hermes` service `environment:`
  in `docker-compose.yml`. Decide env-only vs config→env export per design Part 1 (keep it ≤ a
  few lines or defer the export and treat the YAML key as documentation).
  *Verify:* `scripts/doctor.sh` stays green; engine boots in `obsidian` mode by default.
- [ ] **1.5 Engine syntax/type check.** *Verify:* `cd engine && python -m compileall agent/brain.py`
  and any `pytest` touching the brain still pass.

## Part 2 — `/v1/memory/cognee/graph` endpoint (engine)

- [ ] **2.1 Add `engine/gateway/platforms/cognee_graph.py`** — a small new module (leave
  `vault_graph.py` untouched) that reads Cognee's graph over REST and maps entities→nodes /
  relationships→links into the frozen graph contract (`{nodes,links,softLinks,projects}`, node
  shape per `vault_graph.py:291-301`), carrying `description`/`relations`/`sources` per node and
  `softLinks: []`. Fail-open → empty graph + `error`. Cache with the TTL idiom from
  `vault_graph.build_graph` (`:473-489`).
  *Verify:* unit test maps a sample Cognee payload to a contract-valid graph; an unreachable
  Cognee yields `{nodes:[],links:[],softLinks:[],projects:[],error}`.
- [ ] **2.2 Register `GET /v1/memory/cognee/graph`** in `memory_routes.register`
  (`memory_routes.py:22`, beside `_memory_graph` at `:45-58`) — auth via `adapter._check_auth`,
  run the reader in an executor, return its JSON; 500-safe.
  *Verify:* authed `curl` returns a contract-shaped body; unauthed request is rejected like the
  sibling routes.
- [ ] **2.3 Report `source: "cognee"`** from `/v1/memory/search` (`memory_routes.py:92-177`) when
  the Cognee lane produced the hits; surface Cognee facts that don't resolve to a vault node id
  rather than dropping them (`:141-157`).
  *Verify:* in `cognee` mode a search returns `source: "cognee"`; in `obsidian` mode the response
  is unchanged.

## Part 3 — Cognee compose service (ops)

- [ ] **3.1 Add the `cognee` service** to `docker-compose.yml` by copying the `qdrant` shape
  (`:146-163`): local stack env (SQLite/LanceDB/KuzuDB), `profiles: ["cognee"]` (default-off),
  `/vault:ro` mount, `127.0.0.1`-only port (confirm no clash), healthcheck, `env_file` for the
  cognify LLM key. Add `cognee_data:` under `volumes:` (`:191-193`). Do **not** add `depends_on:
  cognee` to `hermes`.
  *Verify:* `docker compose config` validates; `docker compose up` (no profile) does **not** start
  cognee; `--profile cognee` starts it and the healthcheck goes healthy.
- [ ] **3.2 Add the ingest step** — a `scripts/` entry (or documented Cognee bootstrap) that
  cognifies the `/vault` notes as a one-time/periodic batch (not per-turn). Document the per-doc
  token cost and the LLM key in `~/.hermes/.env` (e.g. `COGNEE_LLM_API_KEY`).
  *Verify:* after ingest, `/v1/memory/cognee/graph` returns a non-empty graph; secret stays out
  of git and the vault; `scripts/doctor.sh` green.

## Part 4 — Dual-brain Memory screen (dashboard)

- [ ] **4.1 Add `getCogneeGraph(signal)`** to `dashboard/src/lib/memory/engineClient.ts` →
  `GET /v1/memory/cognee/graph`, returning the existing `MemoryGraph` type (no new type), with
  the same defensive defaulting as `getMemoryGraph` (`:98-112`). Extend `SearchResponse.source`
  (`:91-95`) to `"brain" | "filesystem" | "cognee"`.
  *Verify:* `cd dashboard && npm run typecheck` passes.
- [ ] **4.2 Add `BrainToggle` segmented control**
  (`dashboard/src/components/memory/BrainToggle.tsx`) — `Obsidian · Cognee · Both`, dark-glass
  styling, `role="tablist"` + `aria-pressed`, keyboard-operable.
  *Verify:* typecheck passes; keyboard focus + selection work; default is `Obsidian`.
- [ ] **4.3 Wire brain state into `MemoryScreen.tsx`** — `brain` state (default `obsidian`); load
  the vault or Cognee graph accordingly into the existing `<MemorySphere>` (`:265-278`) with a
  distinct Cognee accent; render `Both` as a split view (two spheres). Overlay is explicitly out
  of v1 scope.
  *Verify:* switching renders each graph; `Both` shows side-by-side; Cognee error/empty uses the
  graceful state mirroring the vault error path (`:243-261`).
- [ ] **4.4 Extend the search `source` chip** (`:209-217`) with a `cognee` branch ("via cognee").
  *Verify:* chip reflects each `source` value.
- [ ] **4.5 Make node detail brain-aware** — vault nodes use today's `<NodeDetail>` (`getNote`);
  Cognee nodes render entity + relationships + source snippets from the already-loaded graph node
  (no fetch), via a branch in `NodeDetail` or a sibling `CogneeNodeDetail`.
  *Verify:* selecting a vault node shows the note; selecting a Cognee node shows entity/relations/
  sources with no network call; typecheck + `npm run build` pass.

## Closeout

- [ ] **5.1 Full verification.** `cd dashboard && npm run typecheck && npm run build`;
  `cd engine && python -m compileall .` + relevant `pytest`; `scripts/doctor.sh` green with and
  without the `cognee` profile.
- [ ] **5.2 Confirm reversibility.** Set `HERMES_BRAIN_MODE=obsidian` (or unset) with the Cognee
  profile down → the engine and Memory screen behave exactly as before this change.
- [ ] **5.3 Fold deltas into `openspec/specs/`** (`agent-memory`, `memory-dashboard`) on
  completion, per the project's OpenSpec flow.
