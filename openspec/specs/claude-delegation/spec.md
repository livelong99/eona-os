# Capability: Claude Delegation

The engine performs all model work by delegating to the host `claude` CLI using the user's Claude Code
subscription, rather than calling a metered provider API. (Established behavior — `engine/agent/claude_code_runtime.py`,
`engine/agent/transports/hermes_tools_mcp_server.py`, `scripts/claude-bridge.py`.)

## Requirements

### Requirement: Turns SHALL be executed via the host `claude` CLI

The engine SHALL run each agent turn by invoking the host `claude` CLI as a subprocess and SHALL NOT
require a per-token provider API key for execution.

#### Scenario: A chat completion is requested with claude_code mode

- **WHEN** `hermes/config.yaml` sets the API mode to `claude_code` and a turn is requested
- **THEN** the engine spawns `claude -p` with `--output-format stream-json` and streams the result back,
  consuming the Claude Code subscription rather than billing a provider API

#### Scenario: No subscription token is configured

- **WHEN** `CLAUDE_CODE_OAUTH_TOKEN` is absent from `~/.hermes/.env`
- **THEN** delegation fails with a clear error and the turn does not silently fall back to a metered API

### Requirement: Hermes tools SHALL be exposed to the delegated Claude over stdio MCP

The engine SHALL expose its tools (web_search, web_extract, browser_*, vision_analyze, image_generate,
skill_manage, kanban_*) to the spawned `claude` process via the stdio MCP bridge, while excluding tools that
require live `AIAgent` context (delegate_task, memory, session_search, todo).

#### Scenario: A delegated turn needs to search the web

- **WHEN** the delegated `claude` process calls `web_search`
- **THEN** the request is served by the engine's `hermes_tools_mcp_server` against the self-hosted SearXNG,
  and the result is returned to the Claude subprocess

### Requirement: The host bridge SHALL be token-gated

The host-side delegation bridge (`scripts/claude-bridge.py`, default `127.0.0.1:8765`) SHALL require a
shared `CLAUDE_BRIDGE_TOKEN` on each request.

#### Scenario: A request arrives without a valid bridge token

- **WHEN** a `POST` to the bridge omits or mismatches the `X-Bridge-Token` header
- **THEN** the bridge rejects the request and does not run `claude` on the host
