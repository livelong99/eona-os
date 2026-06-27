# Ponytail — the binding code standard for every agent in this repo

> Source: https://github.com/DietrichGebert/ponytail
> This standard is binding for every agent that writes or reviews code here
> (the `.agent-os` team, the swarm tool orchestrators + their teammates, and
> Claude Code itself). Read it before writing code.

## The core rule

The rule was **never "fewest tokens."** It is:

> **Write only what the task needs, and never cut validation, error handling,
> security, or accessibility.**

The code ends up small because it is **necessary, not golfed**. Lower cost and
latency are a *side effect* on models that follow the ladder — never the goal. A
terse reasoning model that burns thinking tokens deliberating the rungs can go the
other way; don't optimize for token count, optimize for *necessity*.

## The ladder — climb it before writing code

For anything you're about to add, go down these rungs in order and stop at the
first that works:

1. **Does this need to exist?** → Skip it. (YAGNI)
2. **Already in this codebase?** → Reuse it; don't rewrite.
3. **Stdlib does it?** → Use the standard library.
4. **Native platform feature?** → Use the built-in capability.
5. **Installed dependency?** → Use a dependency the project already has.
6. **One line?** → Write the single-line solution.
7. **Only then** → write the **minimum that works** — and no more.

## Never on the chopping block

The ladder trims *scope*, never *safety*. These are non-negotiable at every rung:

- **Trust-boundary validation** — validate all input crossing a boundary.
- **Data-loss handling** — handle errors that could lose or corrupt data.
- **Security** — authn/authz, secrets, injection, SSRF, path traversal, etc.
- **Accessibility** — for any user-facing UI.

If trimming would cut one of these, you've left the ladder — stop and keep it.

## Lazy about the solution, never about reading

Pick a rung only after you **understand the problem fully**: read the affected
code, trace the real flow, and confirm what already exists. Skipping work is
earned by reading, not by guessing. Laziness about the *solution* is the point;
laziness about *reading* is the failure mode.

## In practice (checklist before you write)

- [ ] Read the real code/flow this touches — don't guess.
- [ ] Walked the ladder; chose the lowest rung that genuinely works.
- [ ] Reused existing code / stdlib / platform / deps before writing new.
- [ ] Kept validation, error handling, security, and accessibility intact.
- [ ] Wrote the minimum that satisfies the task — nothing speculative.
