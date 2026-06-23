# Contributing to Eona OS

First off — thank you. Eona OS is built to be forked, extended, and improved, and contributions of every size are welcome: code, docs, new skills, bug reports, and ideas.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- 🐛 **Report a bug** — open a [bug report](https://github.com/livelong99/eona-os/issues/new/choose) with steps to reproduce.
- 💡 **Request a feature** — open a [feature request](https://github.com/livelong99/eona-os/issues/new/choose) describing the problem, not just the solution.
- 🧩 **Add a skill** — drop a `SKILL.md` + `tool.yaml` under the engine's skills path; it becomes discoverable at `/v1/tools`.
- 🎨 **Polish the dashboard** — UI/UX, accessibility, performance.
- 📖 **Improve docs** — even fixing a typo helps the next person.

If your change is large or architectural, please open an issue to discuss it **before** writing a lot of code.

## Development setup

> Prerequisites: Docker Desktop (Compose v2), the `claude` CLI, Node.js 22 LTS, and Python 3.11–3.13.

```bash
git clone https://github.com/livelong99/eona-os.git
cd eona-os

# Dashboard (Vite + React)
cd dashboard
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # strict TypeScript — must pass

# Engine (Python / FastAPI)
cd ../engine
python -m pip install -e .
```

For the full stack (engine + search + vectors + dashboard) use `scripts/install.sh`; see the [README quickstart](README.md#-quickstart).

## Project layout

| Path | What it is |
|------|------------|
| `dashboard/` | Vite/React mission-control SPA |
| `engine/` | Forked Hermes Agent + FastAPI gateway (Python) |
| `hermes/` | Config, agent profiles, bundled skills |
| `scripts/` | Install, doctor, and the Claude bridge |
| `docs/` | Architecture and design references |
| `infra/` | Service configuration (SearXNG, etc.) |

## Pull request process

1. **Fork** the repo and create a branch from `main`:
   `git checkout -b feat/short-description`
2. **Make focused changes.** Keep one logical change per PR; keep files small and cohesive.
3. **Verify locally** before pushing:
   ```bash
   cd dashboard && npm run typecheck && npm run build   # frontend
   python -m compileall engine                          # backend syntax
   # run any tests relevant to your change
   ```
4. **Write a clear PR description** — what changed, why, and how you tested it. Link related issues (`Closes #123`).
5. **Keep secrets out.** Never commit `~/.hermes/.env`, tokens, or anything personal. The `.gitignore` covers the usual suspects — double-check your diff.

We use [Conventional Commits](https://www.conventionalcommits.org/) for messages:

```
feat: add planner sprint export
fix: prevent dock icon fl/ash on route change
docs: clarify Claude bridge setup
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

## Coding standards

- **TypeScript** — strict mode, explicit types on public APIs/props, no `any` in app code, immutable updates. `npm run typecheck` must pass.
- **Python** — type hints, validate input at boundaries, handle errors explicitly, keep functions small.
- **General** — many small files over few large ones (aim < 500 lines), no hardcoded secrets, clear names.

## Reporting security issues

Please **do not** file public issues for vulnerabilities — follow [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
