# Proposal: Cognee Dual-Brain

> Switchable, graph-aware second brain for Eona OS — the vault stays the source of truth.

## Why

Today the Brain (`engine/agent/brain.py`) recalls from the vault through two similarity
lanes (holographic FTS5+HRR and Gemini→Qdrant vectors) plus a temporal time-walk. These are
**chunk-similarity** lanes: they find notes that *look like* the query, but they don't model
**typed relationships** between the entities inside those notes ("who decided X", "which tool
depends on Y"). Graph-aware recall is the gap.

[Cognee](https://github.com/topoteretes/cognee) (Apache-2.0) builds a knowledge **graph** from
documents via a `cognify` pipeline (entity + relationship extraction) and answers `recall`
queries over that graph. Adding it as a second brain gives Eona OS:

- **Graph-aware recall** — relationship-typed retrieval beside the existing similarity lanes.
- **A switchable / unified brain** — pick `obsidian` (today's behavior), `cognee` (graph only),
  or `unified` (all lanes fused) per the user's need, with zero data migration to switch.
- **Both brains visible** — the Memory screen can render the vault graph and the Cognee
  knowledge graph side by side, in the same 3D component, so the user *sees* what each knows.

## What Changes

Four parts, each additive and behind a default-off switch:

1. **Brain-mode switch (engine).** `HERMES_BRAIN_MODE` ∈ `obsidian` | `cognee` | `unified`
   (default `obsidian` — current behavior preserved exactly), also declarable as
   `brain.mode` in `hermes/config.yaml`. A new `_similar_via_cognee()` lane is added **beside**
   `_similar_via_qdrant` in `brain.py` with the same fail-open contract. The mode gates which
   lanes run; the frozen `BrainResult` / `BrainFact` dataclasses are **unchanged**.
2. **`/v1/memory/cognee/graph` endpoint (engine).** A new route in
   `engine/gateway/platforms/dashboard/memory_routes.py` that reads Cognee's graph store and
   returns nodes/edges in the **same JSON shape** as the existing `/v1/memory/graph`, so the
   3D renderer is reused unchanged. `vault_graph.py` is untouched.
3. **Cognee compose service (ops).** A new `cognee` service in `docker-compose.yml` (fully-local
   stack: SQLite + LanceDB + KuzuDB) with healthcheck, a named volume, and env. It ingests the
   **same `/vault` notes**. It needs an LLM key for its `cognify` extraction pipeline — a real
   per-document token cost, called out below.
4. **Dual-brain Memory screen (dashboard).** A segmented control `Obsidian · Cognee · Both` on
   `dashboard/src/screens/MemoryScreen.tsx`. Obsidian = today's vault graph; Cognee = the new
   endpoint in the same `MemorySphere` with distinct styling; Both = split view. The search
   `source` chip gains a `cognee` value; Cognee node detail shows entity + relationships +
   source snippets.

## Impact

- **User value:** a switchable + unified brain, graph-aware recall, and both brains on screen —
  without giving up anything the vault brain does today.
- **Reversible by construction:** Cognee is a **derived, rebuildable index** built from the
  vault (exactly like Qdrant today). Switching modes needs no migration; deleting the Cognee
  volume loses nothing canonical. **No lock-in.**
- **Fail-open:** the Cognee lane returns `[]` when the service is down — memory degrades
  gracefully and a turn is never blocked, matching the existing Qdrant lane.
- **Trade-off — the honest cost:** Cognee adds one container and a **per-document LLM token
  cost** at `cognify` time. This is in tension with Eona OS's "no per-token bill" identity
  (execution is the host `claude` subscription). We bound it by: (a) shipping **default-off**
  (`obsidian` mode, no compose profile active); (b) piloting the **fully-local** SQLite+LanceDB
  +KuzuDB stack (no managed vector/graph DB cost); (c) ingest being a one-time/periodic batch,
  not per-turn. The user opts in deliberately, eyes open.
- **Affected specs:** new capability `agent-memory` (brain modes, Cognee recall lane, the
  `/v1/memory/cognee/graph` contract, source-of-truth + fail-open guarantees, the compose
  service) and new capability `memory-dashboard` (the dual-brain screen). Both are net-new spec
  files — there is no established memory spec to MODIFY yet.
- **Touches:** `engine/agent/brain.py`, `engine/gateway/platforms/dashboard/memory_routes.py`,
  `docker-compose.yml`, `hermes/config.yaml`, `dashboard/src/screens/MemoryScreen.tsx`,
  `dashboard/src/lib/memory/engineClient.ts`, and the Memory components
  (`MemorySphere`, `NodeDetail`, `MemorySidebar`). New files: a small `cognee_graph.py` engine
  module and a dashboard segmented-control component. No existing behavior is modified in the
  default mode.
