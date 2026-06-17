# Presence (L2) — One Mind, Every Surface

> The same resident agent, reachable on more surfaces. This guide makes three
> Presence wire-ons runnable: the **ACP-Resident** (IDEs), **Mission-Control-as-MCP**
> (Claude Code / Cursor), and **gateway enablement** (Telegram / Discord / WhatsApp).
>
> Architecture: `_bmad-output/planning-artifacts/agent-os-architecture.md` §4.3 (L2 Presence)
> and §2.2 bonus edge B1 (the ACP server is already ahead of upstream).

The contract for every surface (§4.3): a surface adapter only translates an inbound
request into a kernel loop (retrieve → inject → reason → **gate (L1)** → write/act).
Reads are exposed freely; **writes/acts route through the L1 trust gate**. Nothing here
bypasses that.

All three surfaces read and write the *one* Brain (the dated PARA vault + Qdrant +
3-tier memory), so a conversation that starts in an IDE, continues on Telegram, and is
recalled by voice is the same mind — not three copies.

---

## 1. The ACP-Resident — the same mind inside your IDE

The ACP (Agent Client Protocol) server plugs the resident Hermes agent into any
ACP-capable editor (Zed today; the protocol is editor-agnostic). It is **already built
and packaged** — this section documents how to connect, not new code.

**Why it matters (B1):** the fork's ACP server advertises `SessionForkCapabilities`,
`SessionListCapabilities`, and `SessionResumeCapabilities` (`engine/acp_adapter/server.py`),
which is ahead of upstream mainline. That means **fork/list/resume of a single mind across
IDEs** — branch a session, resume it days later, list prior sessions from the editor.

### Runnable entrypoint

The console script ships in `engine/pyproject.toml` (`[project.scripts]`):

```
hermes-acp = "acp_adapter.entry:main"
```

So after `uv pip install -e .` (or the container's bundled install) the agent runs as:

```bash
# Start the ACP stdio server (stdout = JSON-RPC, stderr = logs)
hermes-acp

# Equivalent module form
python -m acp_adapter.entry

# Verify the adapter + ACP deps import cleanly, then exit
hermes-acp --check          # prints "Hermes ACP check OK"

# One-time provider/model setup for ACP terminal auth (see secrets below)
hermes-acp --setup
```

ACP is **stdio-only and local-trust** — the editor launches `hermes-acp` as a subprocess
and speaks JSON-RPC over its stdin/stdout. There is no network port to expose.

### Connect from Zed

Zed connects to an external agent by launching its command. Add an agent-server entry to
Zed `settings.json` (`~/.config/zed/settings.json`):

```jsonc
{
  "agent_servers": {
    "Hermes": {
      "command": "hermes-acp",
      "args": [],
      "env": {
        // Required: the Claude Code subscription token the engine delegates turns to.
        // Generate with:  claude setup-token
        "CLAUDE_CODE_OAUTH_TOKEN": "<your-claude-code-oauth-token>"
      }
    }
  }
}
```

> If `hermes-acp` isn't on Zed's `PATH`, use the absolute path to the venv console
> script (e.g. `"command": "/path/to/.venv/bin/hermes-acp"`), or invoke the module form
> with `"command": "python", "args": ["-m", "acp_adapter.entry"]` and a `cwd`/`PYTHONPATH`
> pointing at `engine/`.

Once connected, the editor's session picker exposes **fork / resume / list** because the
server advertises those capabilities — the same resident agent, branchable per task and
resumable across days.

### STUB / FLAG — what you must supply

- **`CLAUDE_CODE_OAUTH_TOKEN`** — the engine is Claude-only and delegates turns to the
  local `claude` CLI via the `claude_code` runtime, which uses your Claude Code
  *subscription* (no per-token API cost). Generate it with `claude setup-token` and put
  it in `~/.hermes/.env` (the entrypoint loads that file) **or** in the editor's `env`
  block above. Without it, ACP auth has no usable provider and prompts will fail.

---

## 2. Mission-Control-as-MCP — the OS becomes a tool other agents call

`hermes mcp serve` starts a **stdio MCP server** (`engine/mcp_serve.py`) that exposes
Hermes to any MCP client — Claude Code, Cursor, Codex. The OS becomes a set of tools
another agent calls: read the conversation surface, read life-state, and (gated) write
to the brain.

### Runnable entrypoint

```bash
hermes mcp serve            # stdio MCP server
hermes mcp serve --verbose  # DEBUG logging to stderr
```

### Register with Claude Code / Cursor / Claude Desktop

Add to the client's MCP config (e.g. `claude_desktop_config.json`, or the Cursor /
Claude Code equivalent):

```jsonc
{
  "mcpServers": {
    "hermes": {
      "command": "hermes",
      "args": ["mcp", "serve"]
    }
  }
}
```

> If `hermes` isn't on the client's `PATH`, use the absolute venv path
> (`/path/to/.venv/bin/hermes`).

### Tool inventory

**Messaging bridge (10 tools — the channel surface):**

| Tool | R/W | Purpose |
|------|-----|---------|
| `conversations_list` | read | List conversations across connected platforms |
| `conversation_get` | read | Detail for one conversation |
| `messages_read` | read | Message history for a conversation |
| `attachments_fetch` | read | Non-text attachments on a message |
| `events_poll` | read | New conversation events since a cursor |
| `events_wait` | read | Long-poll for the next event |
| `channels_list` | read | Available send targets |
| `permissions_list_open` | read | Pending approval requests seen this session |
| `messages_send` | **write/act** | Send a message to a platform target |
| `permissions_respond` | **write/act** | Resolve a pending approval |

**Mission-Control life-state (6 tools — added by this wire-on):**

| Tool | R/W | Purpose |
|------|-----|---------|
| `kanban_list` | read | List Kanban tasks (status/assignee/board filters) |
| `kanban_get` | read | One Kanban task by id |
| `goal_get` | read | Active Goal Mode state for a session (goal, turn budget, subgoals) |
| `memory_read` | read | Raw `MEMORY.md` / `USER.md` (the brain injected into the system prompt) |
| `memory_note` | **write — gated** | Add a memory entry; routes through the memory write-gate + threat scan |

**Read-free / write-gated split (the §4.3 contract).** Every read tool is exposed freely
(local stdio trust). `memory_note` is the only life-state mutation and it routes through
the existing Hermes **memory write-gate** — in gateway/background contexts the write is
*staged for approval* rather than applied, and content is threat-scanned before it can
enter the system prompt. `messages_send` / `permissions_respond` likewise act on the world.

### STUB / FLAG — what you must supply

- **No secret is required to run the MCP server itself.** The life-state read tools work
  out of the box against the local Hermes home.
- `goal_get` takes a **`session_id`** — get one from `conversations_list` /
  `conversation_get`; goal state is stored per session.
- For the **shared-brain Obsidian path** used by the broader system (not these MCP tools
  directly), see the `MCP_OBSIDIAN_API_KEY` note in the gateway section below.

---

## 3. Gateway enablement — turning on Telegram / Discord / WhatsApp

The messaging platforms are **wired but ship DISABLED** in `hermes/config.yaml` so the
gateway stays healthy before any tokens exist. Enabling a platform makes the agent
reachable from outside `127.0.0.1`, so this is opt-in and secret-gated.

> The snippets below are **templates to copy into your running config** — this doc does
> not edit `hermes/config.yaml` (the live config) or any `.env` file. Apply them yourself.

### The 3-step enable flow (per platform)

1. Add the platform's token(s) to `~/.hermes/.env` (keys listed below).
2. Flip `enabled: false` → `true` for that platform in `hermes/config.yaml`.
3. Restart the gateway: `docker compose restart hermes`.

Tokens use `${ENV}` interpolation, resolved from `~/.hermes/.env` at load.

### config.yaml snippets (already present, just flip `enabled`)

```yaml
# --- ~/.hermes/config.yaml :: platforms ---
unauthorized_dm_behavior: pair   # unknown senders must PAIR before they're served

platforms:
  api_server:
    enabled: true
    port: 8642

  telegram:
    enabled: true                       # was false — set true AFTER token is in .env
    token: "${TELEGRAM_BOT_TOKEN}"
    home_channel:
      platform: telegram
      chat_id: "${TELEGRAM_HOME_CHANNEL}"  # numeric chat id, for cron delivery
      name: Home

  discord:
    enabled: true                       # was false
    token: "${DISCORD_BOT_TOKEN}"
    home_channel:
      platform: discord
      chat_id: "${DISCORD_HOME_CHANNEL}"
      name: Home

  whatsapp_cloud:                        # Meta WhatsApp Cloud API
    enabled: true                       # was false
    extra:
      phone_number_id: "${WHATSAPP_PHONE_ID}"
      access_token: "${WHATSAPP_API_TOKEN}"
    home_channel:
      platform: whatsapp_cloud
      chat_id: "${WHATSAPP_HOME_CHANNEL}"
      name: Home
```

### `~/.hermes/.env` keys to add (templatized — fill in real values)

```bash
# --- Telegram ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_HOME_CHANNEL=            # numeric chat id for cron/home delivery
# TELEGRAM_ALLOWED_USERS=123,456 # optional allowlist (comma-separated user ids)

# --- Discord ---
DISCORD_BOT_TOKEN=
DISCORD_HOME_CHANNEL=
# DISCORD_ALLOWED_USERS=...

# --- WhatsApp Cloud (Meta) ---
WHATSAPP_PHONE_ID=               # phone_number_id from Meta
WHATSAPP_API_TOKEN=              # Cloud API access token
WHATSAPP_HOME_CHANNEL=
# WHATSAPP_ALLOWED_USERS=...
```

> Do **not** edit `~/.hermes/.env` through the agent — it is guarded. Add these keys
> yourself with your real values.

### Security notes (read before enabling)

- **Enabling a platform makes the agent reachable from outside `127.0.0.1`.** Only enable
  a platform once you've decided who may reach it.
- `unauthorized_dm_behavior: pair` (the default) means **unknown senders must pair before
  they are served** — they cannot drive the agent un-paired.
- Restrict further per platform with `*_ALLOWED_USERS` (e.g. `TELEGRAM_ALLOWED_USERS=123,456`).
- **Never** set `GATEWAY_ALLOW_ALL_USERS=true` on an internet-reachable bot.
- Gateways and the dashboard bind to the local host / Docker network by default; external
  exposure is opt-in (§ arch deployment notes).

---

## 4. Secrets you must supply

Everything that requires a user-provided secret, in one place. Nothing here is committed;
all of it lives in `~/.hermes/.env` (or the editor `env` block for the ACP token).

| Secret | Needed for | How to obtain | Without it |
|--------|-----------|---------------|------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | ACP-Resident (§1) — and the engine generally | `claude setup-token` | ACP auth has no provider; prompts fail |
| `TELEGRAM_BOT_TOKEN` | Telegram gateway (§3) | @BotFather | Telegram stays disabled |
| `TELEGRAM_HOME_CHANNEL` | Telegram cron/home delivery | numeric chat id of your Home chat | No home-channel delivery |
| `DISCORD_BOT_TOKEN` | Discord gateway (§3) | Discord Developer Portal → Bot | Discord stays disabled |
| `DISCORD_HOME_CHANNEL` | Discord home delivery | channel/chat id | No home-channel delivery |
| `WHATSAPP_PHONE_ID` | WhatsApp Cloud gateway (§3) | Meta WhatsApp Cloud API setup | WhatsApp stays disabled |
| `WHATSAPP_API_TOKEN` | WhatsApp Cloud gateway (§3) | Meta Cloud API access token | WhatsApp stays disabled |
| `WHATSAPP_HOME_CHANNEL` | WhatsApp home delivery | chat id | No home-channel delivery |
| `MCP_OBSIDIAN_API_KEY` | Shared-brain Obsidian MCP (config.yaml `mcp_servers.obsidian`) | Obsidian Local REST API plugin | Obsidian-backed shared memory unavailable |

> The MC-as-MCP life-state tools (§2) need **no** secret — they read the local Hermes home
> and the memory write goes through the local write-gate.
