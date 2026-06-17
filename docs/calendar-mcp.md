# Calendar MCP — Wiring Guide for the Steward (L3)

The **Steward** (§4.4 of `agent-os-architecture.md`) is a calendar/commitment
defense loop. It needs to read and write the user's calendar to protect time
and follow through on commitments. This document describes how to wire a Google
Calendar MCP into Hermes so the Steward (and any other L3/L4 loop) can call
calendar tools.

**Do not edit `.mcp.json`, `hermes/config.yaml`, or `.env` directly.**
Copy the snippets below into those files once you have the required credentials.

---

## Recommended MCP: `@modelcontextprotocol/server-google-calendar`

The official MCP server for Google Calendar. It exposes:

| Tool | Description |
|------|-------------|
| `list_calendars` | List all calendars in the account |
| `list_events` | List events in a calendar (supports time range) |
| `create_event` | Create a new calendar event |
| `update_event` | Update an existing event |
| `delete_event` | Delete an event |
| `get_event` | Fetch a single event by ID |

### Installation

```bash
npm install -g @modelcontextprotocol/server-google-calendar
```

Or run via `npx` without a global install (see snippet below).

---

## Required credentials — user must supply these

> **FLAG: Three secrets are required. None are defaults; you must obtain them
> from the Google Cloud Console before the Steward can access your calendar.**

| Secret | How to obtain | Where to set |
|--------|--------------|--------------|
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client ID | `.env` in the project root |
| `GOOGLE_CLIENT_SECRET` | Same OAuth 2.0 Client ID page (shown once; copy immediately) | `.env` |
| `GOOGLE_REFRESH_TOKEN` | Run the one-time OAuth flow below | `.env` |

### Step 1 — Create an OAuth 2.0 Client ID

1. Go to [console.cloud.google.com](https://console.cloud.google.com/).
2. Create a project (or use an existing one).
3. Enable the **Google Calendar API** under *APIs & Services → Library*.
4. Go to *APIs & Services → Credentials → Create Credentials → OAuth client ID*.
5. Application type: **Desktop app** (or *Web application* if you prefer).
6. Copy the **Client ID** and **Client Secret** — these are `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET`.

### Step 2 — Obtain a refresh token (one-time OAuth flow)

```bash
# Install the helper (or use any OAuth flow tool you prefer)
pip install google-auth-oauthlib

python3 - <<'EOF'
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/calendar"]

flow = InstalledAppFlow.from_client_config(
    {
        "installed": {
            "client_id": "REPLACE_WITH_YOUR_CLIENT_ID",
            "client_secret": "REPLACE_WITH_YOUR_CLIENT_SECRET",
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    },
    SCOPES,
)
creds = flow.run_local_server(port=0)
print("REFRESH TOKEN:", creds.refresh_token)
EOF
```

Copy the printed refresh token into `.env` as `GOOGLE_REFRESH_TOKEN`.

### Step 3 — Add secrets to `.env`

```bash
# .env (never commit this file)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

---

## `.mcp.json` snippet (add to the project `.mcp.json`)

```jsonc
// Proposed addition to .mcp.json — copy this block into the "mcpServers" object.
// Do NOT edit .mcp.json directly in this branch; coordinate with the repo owner.
{
  "google-calendar": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-google-calendar"],
    "env": {
      "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
      "GOOGLE_CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}",
      "GOOGLE_REFRESH_TOKEN": "${GOOGLE_REFRESH_TOKEN}"
    }
  }
}
```

The `${VAR}` syntax is resolved from the process environment at startup —
Hermes will pick up the values from `.env` if you load it via
`dotenv` / `docker-compose` (already in `docker-compose.yml`).

---

## Alternative: Service Account (for headless / server use)

If you are running Hermes on a server without browser access, use a
**Google service account** instead of an OAuth refresh token:

1. In the Cloud Console: *IAM & Admin → Service Accounts → Create*.
2. Grant the service account read/write access to your calendar
   (share the calendar with the service account email in Google Calendar settings).
3. Create a JSON key: *Service Account → Keys → Add Key → JSON*.
4. Save the file as `google-service-account.json` (outside the repo, or in a
   secrets manager).

```jsonc
// Alternative .mcp.json snippet for service-account auth:
{
  "google-calendar": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-google-calendar"],
    "env": {
      "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "/run/secrets/google-service-account.json"
    }
  }
}
```

> **FLAG: Service account key files must never be committed to git.**
> Add `google-service-account.json` to `.gitignore` and store it in a
> secrets manager or Docker secret.

---

## `hermes/config.yaml` snippet (enable calendar platform for cron)

```yaml
# Proposed addition to hermes/config.yaml — do NOT edit the file directly
# in this branch; coordinate with the repo owner.
#
# This makes the calendar MCP available as a toolset named "calendar"
# that cron jobs can request via enabled_toolsets.
mcp:
  servers:
    - name: google-calendar
      enabled: true

# Optionally restrict calendar tools to specific cron jobs:
# cron:
#   enabled_toolsets: [calendar]   # apply globally to all cron agents
```

---

## How the Steward will use the calendar

The Steward cron job (to be created in `engine/cron/jobs.py` or via the
`cronjob` tool) should be configured with:

```python
# Example — future Steward job registration:
create_job(
    name="steward-calendar-defense",
    prompt=(
        "You are the Steward. Check today's calendar for upcoming commitments "
        "and protected focus blocks. Flag any conflicts, double-bookings, or "
        "shallow-work invasions. Append a Steward brief to today's vault note "
        "at AI/sessions/YYYY-MM-DD.md under ## Steward Brief."
    ),
    schedule="0 7 * * *",   # 07:00 every morning
    enabled_toolsets=["calendar", "vault"],
    autonomy="guarded",      # edits auto-apply; shell requires approval
    deliver="origin",
)
```

The `enabled_toolsets=["calendar"]` key passes the calendar MCP tools to the
Steward's claude_code turn via the existing `_resolve_cron_enabled_toolsets`
path in `engine/cron/scheduler.py`.

---

## Security notes

- All calendar writes are **L1-gated** (guarded autonomy tier): edits
  auto-apply but Bash and sensitive tools still route through approval, and
  Tirith pre-exec scanning stays in force.
- Mass outbound calendar actions (e.g. declining many invites) require
  **Conclave** consensus before executing (§6.1 irreversible tier).
- The refresh token / service-account key must never cross the serverless
  burst boundary (§6.4) — burst environments must not receive these secrets.
- Rotate the refresh token immediately if it is ever logged or exposed.
