# Edit / upgrade an existing tool

Reached when the named tool already exists under the writable root
(`${HERMES_USER_TOOLS_ROOT:-/opt/data/skills}/{slug}/`) or `mode=edit`. Only user-built tools in
the WRITABLE root can be edited — built-in tools under `/opt/skills` (the read-only `.claude/skills`
mount) cannot be modified here; offer to fork them into the writable root instead.

## Flow
1. **Read the current tool** — `tool.yaml`, `SKILL.md`, `references/*`, `assets/*`. Summarize what
   it does today (stages, team, inputs).
2. **Clarify the change** — what should change (add a stage? a teammate? new inputs? fix a gate?).
   Anything ambiguous → `qna.json` + halt.
3. **Apply** — make the targeted edits (spawn `skill-writer`/`tool-architect` as needed). Keep the
   swarm + QnA shape intact; preserve working stages. Don't rewrite wholesale — edit in place.
4. **Validate & publish** — run `references/2-validate.md` (schema + refs + swarm shape) and report.

Never touch tools outside the writable root. Never publish an edit that fails validation.
