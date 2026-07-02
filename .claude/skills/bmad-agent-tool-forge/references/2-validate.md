# Stage 2 — Validate & publish

The tool is written under `${HERMES_USER_TOOLS_ROOT:-/opt/data/skills}/{slug}/`. Have the
`reviewer` (spawn via `Task`) prove it's runnable before declaring success.

## Validate (hard gate)
1. **Manifest schema** — validate `{target}/tool.yaml` against `engine/schemas/tool_manifest.schema.json`:
   ```bash
   python3 - <<'PY'
   import json, yaml, jsonschema
   schema = json.load(open("/opt/skills/../engine/schemas/tool_manifest.schema.json"))  # or the repo path
   doc = yaml.safe_load(open("<target>/tool.yaml"))
   jsonschema.validate(doc, schema)
   print("manifest OK")
   PY
   ```
   If the schema path isn't reachable, validate structurally: required `tool`, `title`,
   `launch.skill`, ≥1 `steps`, each step has `id`+`title`, `swarm: true`, `steering` set.
2. **Refs exist** — every `steps[].ref` resolves to a real file under `{target}/`.
3. **Skill frontmatter** — `SKILL.md` has `name: {slug}` + a description; `customize.toml` has `[agent]`.
4. **Swarm shape** — `tool.yaml` has `swarm: true` + `steering`; SKILL.md defines a team; at least
   one stage raises `qna.json`.

## Report
Write `forge-report.md` (run folder): PASS/FAIL per check, the file tree, and the tool's
stage + team summary.

- **PASS** → tell the user the tool is published and will appear in **Labs** on the next load
  (discovery re-walks the tool roots per request — no restart). Give its name + what it does.
- **FAIL** → do NOT declare success. List the exact failures, fix them (or raise a `qna.json` if a
  design decision is needed), and re-validate. A tool that doesn't validate is not shipped.

## Done
On PASS, the forge run is complete. The new tool launches like any swarm tool (glass-box lanes +
QnA), and can be re-opened/edited later via `references/edit.md`.
