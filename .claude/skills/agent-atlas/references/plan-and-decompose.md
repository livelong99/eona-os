# Plan & Decompose

This is the first movement of the Atlas Loop. Its purpose is to convert a requirement — however vague, large, or ambitious — into a **research-backed plan** and a **Work Ledger** of small, independently executable, independently verifiable blocks. Get this right and the rest of the work becomes a disciplined march. Get it wrong — by under-researching or by carving blocks that aren't truly complete units — and corners get cut later by necessity.

Apply the Thinking Protocol throughout. Do not skip research to "save time" — the research *is* the work that makes the implementation correct.

## What Success Looks Like

- The **original requirement is preserved verbatim** at the top of the Work Ledger and never edited. It is the contract. Everything traces back to it.
- You understand the requirement deeply enough to explain it to a skeptical senior engineer, including the parts the user left implicit.
- The requirement is decomposed into blocks where **each block is independently executable** (can be built without waiting on a future block's internals) and **independently verifiable** (has its own concrete acceptance criteria you can prove pass/fail).
- **Coverage is total**: the union of all blocks fully satisfies the original requirement. There are no silent gaps, no "we'll figure that part out later," no implied work that isn't a block.
- Blocks are **sequenced by dependency**, and risky/uncertain blocks are surfaced early.
- The user has **seen and confirmed the plan** before execution begins.

## Deep Research First

Before decomposing, build genuine understanding. Cutting research short is the root cause of incomplete implementations later — you can't fully build what you don't fully understand.

- **Interrogate the requirement.** Restate it in your own words. Extract explicit asks, implicit expectations, success criteria, and the *why* behind it. List every assumption you're making and flag the ones that, if wrong, would change the design.
- **Study the codebase.** Find the existing patterns, conventions, abstractions, and integration points this requirement touches. Read the neighboring code you'll be extending — not just file names, the actual code. Identify how similar things are already done here so your work fits in, not fights it.
- **Research the unknowns on the web.** For any library, framework, API, protocol, version-specific behavior, or domain concept you are not certain about, consult current sources before designing around it. Verify signatures, defaults, deprecations, and best practices. (See `references/web-research-protocol.md`.) Never decompose around a guessed API.
- **Resolve ambiguity.** Where the requirement is genuinely ambiguous in a way that changes the outcome, ask the user a sharp, specific question. Where it's ambiguous but you can make a sound, reversible decision, make it and record the rationale in the ledger.

## Decompose Into Blocks

Carve the requirement into the smallest units that are still *whole*. A good block is a complete, shippable slice of behavior — not "write half a function." Use these tests:

- **Executable in isolation:** Can this block be implemented now, given what's already done? If it needs a future block's internals, re-cut the boundary or order it later.
- **Verifiable in isolation:** Can you state concrete acceptance criteria and prove them — a test, a command, an observable behavior? If you can't define "proven done" for the block, it's not a block yet.
- **Single coherent intent:** One block, one clear job. If describing it needs "and also," consider splitting.
- **Traceable:** Every block names which part(s) of the original requirement it satisfies. Every part of the requirement maps to at least one block.

For each block capture: a stable id, a one-line goal, concrete **acceptance criteria** (the proof-of-done, derived from the requirement), dependencies/order, integration points it touches, and known risks or unknowns.

## The Work Ledger

Maintain a living Work Ledger as the single source of truth for the whole effort. Keep it visible and update it at every phase transition — it is how Atlas never loses the thread across many blocks and long context. Structure it like this:

```
# WORK LEDGER — <short requirement title>

## Original Requirement (verbatim — never edit)
<paste the user's requirement exactly as given>

## Assumptions & Decisions
- <assumption / decision> — <rationale> — <reversible? / needs confirmation?>

## Open Questions (blockers)
- <question for the user, if any>

## Blocks
| # | Block | Satisfies (req refs) | Acceptance criteria (proof of done) | Depends on | Status |
|---|-------|----------------------|--------------------------------------|------------|--------|
| 1 | ...   | ...                  | ...                                  | —          | TODO   |

## Coverage Check
- Every requirement element is covered by ≥1 block: <yes/no — if no, what's missing>
```

Status values: `TODO` → `IN PROGRESS` → `DONE (verified)`. A block only reaches `DONE (verified)` after passing its Definition of Done with evidence — never on assertion alone.

## Coverage & Sequencing Check

Before presenting the plan, run an explicit pre-mortem:

- **Gap hunt:** Walk the original requirement clause by clause. For each clause, point to the block(s) that deliver it. Anything with no block is a gap — add a block.
- **Wholeness hunt:** For each block, confirm its acceptance criteria actually prove the requirement's intent, not a watered-down version of it.
- **Order check:** Confirm the sequence respects dependencies and front-loads the riskiest/most-uncertain blocks so surprises surface early.

## Confirm With the User

Present the Work Ledger — blocks, acceptance criteria, sequence, assumptions, and any open questions — and get the user's confirmation (or corrections) before starting execution. This keeps the user in the loop and locks the scope contract before the build begins. Once confirmed, hand off to the DDEVC cycle (`references/ddevc-cycle.md`) for block #1.
