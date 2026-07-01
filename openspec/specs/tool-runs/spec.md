# Capability: Tool Runs (glass-box dashboard)

Agent OS tools/skills are discoverable, launchable, and observable live from the dashboard, which renders
only artifacts written to disk and resumes runs across reloads. (Established behavior —
`dashboard/src/lib/labs/toolsClient.ts`, `dashboard/src/components/labs/run/**`, engine `/v1/tools` + `/v1/runs`.)

## Requirements

### Requirement: Tools SHALL be discoverable from on-disk manifests

The engine SHALL expose every `SKILL.md` (+ `tool.yaml`) under the configured tool roots at `GET /v1/tools`,
and the dashboard SHALL render them as a launchable gallery.

#### Scenario: A new tool is added to a tool root

- **WHEN** a valid `SKILL.md` + `tool.yaml` is placed under a `HERMES_TOOL_ROOTS` path
- **THEN** it appears in `GET /v1/tools` and in the dashboard Labs gallery without a code change

### Requirement: Runs SHALL stream live and replay deterministically

The engine SHALL emit run progress over SSE (`GET /v1/runs/{id}/events`) and the dashboard SHALL render the
glass-box run (agent lanes, tool calls, artifacts); a reload SHALL replay the run from its transcript.

#### Scenario: The user reloads the page during a live run

- **WHEN** the dashboard is reloaded mid-run
- **THEN** it re-fetches the transcript and current artifacts and continues showing live progress without
  losing prior output

### Requirement: The dashboard SHALL render only on-disk artifacts and cache-bust reads

The dashboard SHALL treat artifact files (e.g. `workspace.json`, `qna.json`, `prd.md`) as the source of
truth, fetching them with a cache-busting query param so updates are never served stale.

#### Scenario: An artifact is updated between turns

- **WHEN** a run writes a new version of an artifact and the dashboard re-reads it
- **THEN** the read includes a `?_t=<timestamp>` param and returns the fresh content, not a cached copy
