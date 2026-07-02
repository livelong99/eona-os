---
name: forging-pipeline
description: Master orchestration for Forge — the six-phase forging, phase gates, subagent dispatch strategy, status discipline, and the two loops (card review and compliance). Load first on a Full Forging.
---

# The Forging — Master Orchestration

You are conducting a game from raw idea to validated, deliverable Deckheads package. This file is the spine: it defines the order, the gates between phases, how you dispatch subagents, and how you report. Each phase has its own reference — load it at the phase boundary, do the work, then return here to advance the gate.

## The six phases

| # | Phase                | Produces                                              | Gate to advance |
| - | -------------------- | ---------------------------------------------------- | --------------- |
| 1 | Intake & Rules       | `<game-id>.rules.md` (draft), confirmed game id      | Rules file exists and the owner has confirmed scope (for custom games, the Q&A loop is complete and unambiguous) |
| 2 | Research             | `web-dossier.md`, `code-dossier.md`, enriched rules  | Both dossiers returned; rules file finalized with authoritative ruleset + art direction |
| 3 | Card Art             | Exported deck assets (faces, backs) in working dir   | Owner approved the deck in the review loop; assets exported as files |
| 4 | Config & Validate    | `<game-id>.json` (v3 config) + asset wiring          | `validateConfigV3` passes **and** any targeted validator tests are green |
| 5 | Compliance           | `compliance-report.md`                               | Independent reviewer certifies the config faithfully reproduces the rules file — **zero open discrepancies** |
| 6 | Deliver              | Bundled v3 game + importable `<game-id>.zip`         | Game appears in the bundled set and the ZIP is structurally importable |

**Hard rule on gates:** never advance on "looks right." Phase 4 advances only on a green validator; Phase 5 advances only on a clean compliance report. These are binary.

## The working directory

Everything for one forging lives under `{project-root}/_bmad-output/game-forge/<game-id>/`:

```
<game-id>/
├── <game-id>.rules.md       # canonical rules — the spec compliance is judged against
├── web-dossier.md           # aesthetics + authoritative rules (web research subagent)
├── code-dossier.md          # how this game maps onto v3 (code research subagent)
├── assets/                  # exported card faces, backs, fonts
├── <game-id>.json           # the v3 config under construction
├── validation.log           # latest validateConfigV3 / test output
└── compliance-report.md     # reviewer findings + resolution status
```

Create it at the start of Intake. Treat it as the resumable record — if a session is interrupted, the next run reads these to know where the forging stands.

## Subagent dispatch strategy

Forge is an orchestrator. Dispatch subagents where work is independent and you would otherwise serialize it:

- **Phase 2 — parallel.** Spawn the **web research** and **code research** subagents in a single message, both `run_in_background: true`, then wait for both. They share nothing. (See `research-dispatch.md`.)
- **Phase 3 — delegate.** Hand card design to **Pip** (`agent-card-conjurer`). Forge supplies the art direction from the web dossier and owns the owner-review loop and asset export. (See `card-art.md`.)
- **Phase 5 — independent reviewer.** Spawn a **fresh** research/audit subagent to judge the config against the rules file. It must not be the agent that wrote the config — authors are blind to their own gaps. (See `compliance-loop.md`.)

**Degrade gracefully.** If subagents are unavailable, run each lens yourself, sequentially. The phases, gates, and quality bar do not change — only the parallelism. For Phase 5, you may self-review, but you must do it adversarially against the rules file, line by line, as if you had not written the config.

## The two loops

Two phases are loops, not single passes:

1. **Card review loop (Phase 3):** design → show the owner → gather precise change requests → refine → repeat until the owner approves. The owner is the judge here; taste is theirs.

2. **Compliance loop (Phases 4↔5):** validate → certify against rules → if discrepancies, return to Phase 4, fix the config, **re-validate**, then **re-spawn a fresh compliance review**. Repeat until the reviewer reports zero open discrepancies. The rules file is the judge here; fidelity is objective. Do not hand-wave a discrepancy as acceptable — either the config is wrong (fix it) or the rules file is wrong (correct it with the owner, and note why).

## Status discipline

- Open each phase with a one-line banner: `▶ Phase N · <name> — <what's starting / who's dispatched>`.
- Close each phase with: what came back, the gate result (pass / loop again), and what it feeds next.
- Surface the compliance loop iteration count — `Compliance pass #2: 1 discrepancy remaining (rent table)` — so the owner can see convergence.
- Never silently skip a gate. If you cannot pass one (e.g. the validator depends on a v3 feature that isn't built yet), stop and say so plainly with the blocking detail.

## Known vs custom — the one branch

Intake decides the shape of the whole forging:

- **Known game** (authoritative rules on the web): Research carries the rule-capture load; the rules file is assembled mostly from sources.
- **Custom game** (no web data): Intake runs a brainstorming Q&A loop with the owner *first*, and the rules file is authored entirely from that conversation. Web research then contributes aesthetics only (or is skipped if the game is abstract). The rest of the pipeline is identical — the rules file is the spec either way.

Everything downstream (config authoring, validation, compliance) is the same regardless of branch. Only the source of the rules file differs.
