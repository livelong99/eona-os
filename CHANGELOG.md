# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Open-source community scaffolding: `README`, `CONTRIBUTING`, `CODE_OF_CONDUCT`,
  `SECURITY`, issue/PR templates, and CI.
- Light-theme dock icon suite wired into the dashboard.

## [1.0.0] - 2026-06-24

### Added
- Initial public release of **Agent Home**.
- Mission-control dashboard (Vite 6 · React 19 · three.js) with eight surfaces:
  Home, Workspace, Brainstorm, Labs, Memory, Control, Integrations, Planner.
- Forked Hermes Agent engine exposing an OpenAI-compatible API on `:8642`.
- Claude-subscription execution via a local token-gated delegation bridge.
- Shared Obsidian-vault memory with FTS5 session search and Qdrant vector recall.
- Self-hosted tooling: SearXNG (search) and Crawl4AI (scrape/extract).
- Docker Compose stack with all services bound to `127.0.0.1`.
- `scripts/install.sh` one-shot setup and `scripts/doctor.sh` health checks.

[Unreleased]: https://github.com/livelong99/eona-os/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/livelong99/eona-os/releases/tag/v1.0.0
