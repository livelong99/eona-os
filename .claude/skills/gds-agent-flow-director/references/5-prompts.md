# Stage 5 — Generate Prompts

**Goal:** turn the structure into finished, copy-paste-ready prompts in the mode's
output schema. No placeholders. Prompt quality is everything.

## Do

1. Read `direction.md`, `structure.md`, `reference-brief.md`, and the mode playbook
   (its **Output schema** + **Prompt directions**). Spawn the mode's prompt
   writer(s) via `Task`.
2. For each block, write the fields the playbook's output schema specifies, using the
   KB templates. Carry the identity/product block **verbatim**, and include a
   **Reference** field naming which uploaded image to upload to Flow as an
   Ingredient/reference frame + the Flow feature.
3. Write **both** `flow-prompts.md` and `flow-prompts.txt` (identical content).

## Output format (the dashboard parses this — keep it exact)

Start with a short **`## {Look Bible | Motion Direction | Content Direction |
Channel & Script Direction}`** preamble (2–4 lines binding the look + the per-block
reference mapping). Then one block per item, separated by `---`:

```
## {Shot | Section | Post | Scene} N — <title>
**<Field label>**
<final, paste-ready value>

**<Field label>**
<final, paste-ready value>
...
```

Rules:
- One `## Shot|Section|Post|Scene N — title` per item; **bold field labels on their
  own line**; `---` between items.
- The field set is the mode playbook's output schema (e.g. film → **Image prompt** /
  **Video prompt** / **Settings** / **Reference** / **Negative** / **Consistency**;
  scroll → **Pattern** / **Scroll-beat spec** / **Asset prompt** / **Reference** /
  **Implementation notes**; social → **Hook** / **Image prompt** / **Video prompt** /
  **On-screen text** / **Caption** / **Hashtags** / **Reference** / **Settings**;
  faceless → **Voiceover** / **On-screen text** / **B-roll prompt** / **Reference** /
  **Stock fallback** / **Edit notes**).
- Every field filled — no "TBD". Never use `**bold**` inside a field value (reserve
  bold for field labels only).

Gate (`hitl: true`): the user copies prompts into Flow (uploading the named reference
images), generates media, then returns for review.
