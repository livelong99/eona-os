---
name: delivery
description: Phase 6 of the forging — install the certified game into the app's bundled v3 set for instant playtest and emit an importable ZIP for the upload pipeline, then certify the delivery.
---

# Phase 6 · Deliver

**Outcome:** the certified game lands in two forms — written into the app's **bundled v3 set** for instant in-app playtest, and packaged as an **importable `<game-id>.zip`** that proves the game installs through the upload pipeline with zero new app code. The forging is finished only when both exist and are structurally sound.

## Confirm what you're delivering

By this point the config is `validateConfigV3`-green and compliance-certified, and the assets are exported in the working dir. Delivery is mechanical, but verify before you copy: the config, its referenced assets, and the rules file are all final in `{project-root}/_bmad-output/game-forge/<game-id>/`.

Read the current install/registry expectations before writing into the app — they may have evolved:

- `deckheads_app/src/games/bundled/v3/` and `deckheads_app/src/games/bundled/index.ts` — how bundled games are registered.
- The ZIP import pipeline (`deckheads_app/services/gameImport.ts` if present) and the registry layout it expects (`documentDirectory/deckheads/games/{id}/`, `registry.json`). This tells you the exact ZIP structure the importer accepts.

## A — Install into the bundled v3 set

For instant playtest in the app:

1. Create `deckheads_app/src/games/bundled/v3/<id>/` (or match whatever layout the existing v3 games use) and place the config + assets there.
2. Register it in `bundled/index.ts` alongside the existing v3 games, matching their import pattern exactly.
3. Confirm it loads: the game should appear in the bundled set and be launchable. If a bundled-games test exists, run it.

## B — Package the importable ZIP

For the upload pipeline (the proof that config is a complete base):

1. Assemble a ZIP whose structure matches what the importer validates — typically the config JSON at a known location plus an `assets/` folder, **JSON + image/font assets only** (no JS, no native code, no nested zips). The import pipeline runs everything through the sandboxed validator and rejects anything else.
2. Name it `<game-id>.zip` and write it to the working dir (and anywhere the owner wants to pick it from).
3. **Self-test the ZIP against the importer's guards** if the import service is available: it must survive the zip-slip, zip-bomb, and format-allowlist checks, re-pass `validateConfigV3`, and have every referenced asset present. A ZIP that the importer rejects is not a delivery.

## Final certify

State the delivery plainly:

- Game id, bundled location, and ZIP path.
- Validator status (green) and compliance status (certified, N passes).
- One line on how to playtest: launch from the bundled set in-app, or import the ZIP from Home / Library.

If anything is partial — e.g. the import service isn't built yet so the ZIP couldn't be self-tested against the importer — say so explicitly rather than implying a clean delivery. The forging ends honest: certified faithful, validated, installed, and packaged.
