# Stage 0 — Discovery (QnA gate)

Nail down exactly what the new tool is before writing a line of it. Spawn the `pm`
(and `tool-architect`) via `Task` to interrogate the idea; consolidate into a brief.

## Resolve the basics
- **slug** = kebab-case of `name` (e.g. "Recipe Remixer" → `recipe-remixer`). This is the
  folder name under the writable tool root and the manifest `tool` id.
- **mode** = create (default) or edit (if the slug already exists under the writable root → load
  `references/edit.md`).

## Decide (with the user, via qna.json)
Drive these to clarity. Anything you can't decide from `goal` → write to `qna.json`
(schema `engine/schemas/tool_qna.schema.json`) and **halt**:
1. **Outcome** — what artifact(s) does the tool deliver, and what does "done" look like?
2. **Inputs** — the launch form fields (id, label, type: text/textarea/file[]/image[]/select, required).
3. **Stages** — the ordered steps (one per turn), each with its artifact(s) and which need a user gate.
4. **The tool's agent team** — the orchestrator persona + 2–5 specialists it spawns, and who owns what.
   (Every tool is a swarm — decide the roster that gives the best collective result for THIS problem.)
5. **Where artifacts live** — a writable `artifacts_root` (under `/opt/data/...` or a vault rw subtree).

Tag each question with the teammate (`agent`) who needs it and a `why`. On the next turn the
answers arrive in an `ANSWERS (JSON)` block — apply them, mark answered, continue.

## Output
When the picture is complete, write `tool-brief.md` (run folder): the slug, outcome, inputs,
the stage list (id/title/artifacts/gate), the agent roster (role → owns), and the artifacts_root.
Set the discovery questions answered, then proceed to `references/1-author.md` (next turn or this
turn if no blocking questions remain).
