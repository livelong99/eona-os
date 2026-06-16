---
name: prompt-foundry
description: Generate maximally-detailed Google Flow image & video prompts from a brief. Studio v1 — no media-API calls.
---

# Prompt Foundry

Turn a brief (+ optional references) into **maximally-detailed prompts** the user pastes into **Google Flow**
(Veo for video, Imagen for image). This skill produces *prompts only* — it never calls a paid media API.

## Inputs
- A brief: subject, goal, mood, brand/style cues. Pull related context from the scoped vault
  (`10_Projects/agent-home`) — verify any referenced note exists before linking it.
- Target: `image`, `video`, or `both` (default `both`). Optional: aspect ratio, duration, shot count.

## Procedure
1. **Deconstruct** the brief into: subject, setting, action, mood, style, constraints.
2. **Apply the rules registry** at `flow-prompt-rules.md` for the chosen target(s).
3. **Draft** the prompt(s) using the output contract below — be exhaustive, not vague.
4. **Self-check** against the rules checklist; if `target=both`, keep subject/style/continuity consistent
   across the image and video prompts.
5. **Hand to `prompt-judge`** (Goal Mode). Iterate until `{"done": true}`.
6. **Save** the final prompt(s) to a dated vault note (`AI/sessions/` or the project workspace) with
   `[[wikilinks]]` back to the brief. Append-only.

## Output contract
Return a fenced block per prompt, ready to paste into Google Flow:

```
TARGET: image|video
ASPECT: <e.g. 16:9 | 9:16 | 1:1>      DURATION: <video only, e.g. 8s>
SHOT: <single | sequence of N shots>
PROMPT:
<the detailed prompt — see flow-prompt-rules.md for required elements>
NEGATIVE:
<what to avoid>
NOTES:
<continuity / variation guidance for the user>
```

## Guardrails
- Prompts only — defer any media-API integration to a later phase.
- No secrets in outputs. Preserve existing vault `[[wikilinks]]`; never overwrite a note.
- Runs on Gemini Pro (`prompt-writer`), judged by Gemini Flash (`prompt-judge`).
