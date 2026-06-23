# Security Policy

Agent Home is **local-first**: every service binds to `127.0.0.1`, no secrets are committed to the repository, and the only credential required is your own Claude subscription token. Still, security issues happen — and we want to hear about them.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, use one of these private channels:

1. **GitHub Security Advisories** (preferred) — go to the repository's **Security → Report a vulnerability** tab to open a private advisory.
2. **Email** — `va11251999@gmail.com`.

Please include:

- A description of the issue and its impact
- Steps to reproduce (proof-of-concept if possible)
- Affected component(s) and version/commit
- Any suggested remediation

You can expect an initial acknowledgement within **72 hours**, and we'll keep you updated as we work toward a fix. We'll credit you in the release notes unless you prefer to remain anonymous.

## Scope

In scope:

- The engine API (`:8642`) and Claude delegation bridge (`:8765`)
- The dashboard SPA and its API proxy
- The Docker Compose stack and install scripts
- Handling of secrets in `~/.hermes/`

Out of scope:

- Vulnerabilities in upstream projects (report those to [Hermes Agent](https://github.com/NousResearch/hermes-agent), SearXNG, Crawl4AI, Qdrant, etc. directly)
- Issues that require a compromised host or physical access
- Missing best-practice hardening that has no concrete exploit

## Good security hygiene for operators

- Never commit `~/.hermes/.env` or place tokens inside your Obsidian vault.
- Keep all ports bound to `127.0.0.1` (the defaults); do not expose them publicly without an auth proxy.
- Rotate `API_SERVER_KEY` and `CLAUDE_BRIDGE_TOKEN` if you suspect exposure (`scripts/install.sh` regenerates missing tokens).
- Treat the vault as sensitive — it's the agents' shared memory.

Thank you for helping keep Agent Home and its users safe.
