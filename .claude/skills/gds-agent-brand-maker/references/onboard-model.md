# Capability: Onboard a New Model

**Goal:** Add a new image or video model to `assets/model-prompt-rules.json` **once**, with rules detailed enough that Forge can target it like any first-class model thereafter. This is what makes the pipeline model-agnostic — no code changes, just a new registry entry.

## When This Runs

Trigger when the user names a generation model that isn't already in the registry, or asks to onboard/add a model. Onboarding is a one-time investment per model; after it lands, Stages 4/5 use the entry automatically.

## How To Do It

**1. Confirm scope.** Get the model's real identity, modality (`image` | `video`), and how it's accessed in this environment (CLI command, fal.ai `app_id`, API). If the name is informal or ambiguous, identify the most likely model and flag the assumption for the user to confirm.

**2. Research deeply (parallel agents).** Spawn focused research agents to reverse-engineer the model's prompting rules from primary sources (the model maker's docs, fal.ai model pages, reputable prompt guides). Each agent returns a single JSON spec matching the registry schema below. Prioritize whatever maximizes output quality and **brand/asset consistency** for that model — that's the whole point.

**3. Synthesize into a registry entry.** Fold the research into one entry that conforms to the schema. Fill every field with concrete, specific content — no placeholders. Cite sources.

**4. Append, don't overwrite.** Add the new entry to the `models` array in `assets/model-prompt-rules.json`, leaving existing entries untouched. Bump `updated` and add the model `id` to the appropriate `defaults` slot only if the user wants it as the new default. Confirm the addition with the user.

## Registry Entry Schema

Each model in `models[]` must carry these fields (image and video share the core; video adds the motion-specific ones):

**Core (all models):** `id`, `display_name`, `modality`, `provider`, `status`, `access` (`{tool, example_invocation, model_flag_or_env, notes}`), `prompt_philosophy`, `prompt_structure` (ordered `[{block, purpose, example}]`), `consistency_techniques[]`, `style_levers[]`, `banned_terms[]`, `negative_prompt_guidance`, `parameters{}`, `failure_modes[]`, `gold_example_prompt`, `sources[]`.

**Image models add:** `when_to_use` (vs. siblings), `text_rendering`, `reference_image_support`.

**Video models add:** `shot_and_camera_language[]`, `image_to_video`, `marketing_best_practices[]`, and `alternative_candidates[]` (programmatic fallbacks when the primary isn't API-accessible).

## What Good Looks Like

A new model becomes usable across the whole pipeline with zero changes to the stage references — they read the registry generically. The entry is dense and executable: another operator could write a perfect prompt for that model from the entry alone. Existing entries are preserved; nothing is improvised from memory at generation time.
