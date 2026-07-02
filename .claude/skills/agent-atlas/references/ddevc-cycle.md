# The DDEVC Cycle

This is how Atlas implements **one block** — completely. Run the full cycle for each block in the Work Ledger, in order, and do not begin the next block until this one is `DONE (verified)`. The five phases are **Discover → Design → Execute → Validate → Compact**.

The cycle exists to stop the single most common failure: jumping straight to typing code, declaring it "done," and moving on while it's actually a hollow shell. Discover and Design force understanding before action. Execute forbids hollow shells. Validate forbids unproven claims. Compact keeps context lean *without* sacrificing completeness.

Open **every phase** with a Thinking Protocol reasoning block (`references/thinking-protocol.md`). Consult the web whenever certainty is missing (`references/web-research-protocol.md`). These are not optional.

---

## D — Discover

**Goal:** Know exactly what this block must do and everything it touches, before designing anything.

- Re-read the **original requirement** and this block's **acceptance criteria** from the Work Ledger. Restate the block's intent in your own words and tie it back to the requirement it serves.
- Explore the real code this block will touch and integrate with: the functions you'll call, the patterns and conventions in play, the data shapes, the error-handling style, the tests that already exist. Read the actual code, not just signatures.
- Identify **every** integration point and ripple: callers, callees, config, schemas, migrations, types, docs, tests. A block isn't just the new code — it's everything that must change for the new code to be real.
- Research anything uncertain against current sources — API signatures, version behavior, idioms, gotchas. Resolve unknowns now; do not design around guesses.
- Surface ambiguities. Resolve trivial ones with recorded decisions; escalate genuine forks to the user.

**Exit when:** you can describe what "fully working" means for this block concretely, you know every place it touches, and you have zero unresolved unknowns that affect the design.

## D — Design

**Goal:** Decide the approach deliberately, so Execute is faithful transcription rather than improvisation.

- Consider at least two viable approaches and choose with stated trade-offs (simplicity, fit with existing patterns, performance, testability, blast radius). Prefer the approach that fits the codebase's existing conventions unless there's a clear reason not to.
- Specify the concrete shape: interfaces/signatures, data structures, control flow, and **error handling and edge cases** explicitly enumerated (empty inputs, nulls, boundaries, concurrency, failure paths, large inputs — whatever applies). Edge cases named here are edge cases that will get implemented; edge cases left implicit are edge cases that get skipped.
- Define the **verification strategy** up front: exactly how you will prove this block works (which tests, which commands, what observable behavior). If it can't be verified, the design isn't done.
- **Pre-mortem:** "Assume I will later discover this block was secretly incomplete. Why?" Answer honestly and fold the answers back into the design so they can't happen.

**Exit when:** you have a concrete implementation plan and a concrete proof plan, and the pre-mortem's failure modes are designed out.

## E — Execute

**Goal:** Build it for real — fully, faithfully, and wired end to end.

- Implement the design completely. **No stubs, no `TODO`/`FIXME` left behind, no placeholder returns, no mocked-out internals presented as real, no "this part is left as an exercise."** Every path the design specified is implemented and connected.
- Wire it into the system: update the callers, types, config, schemas, exports, and docs the Discover phase identified. The feature must be reachable and usable, not an island.
- Follow the codebase's existing conventions and style. New code should look like it was always there.
- Implement the error handling and edge cases named in Design — not just the happy path.
- **Self-review after each meaningful edit:** read your own diff and ask "does this achieve the intent, and what could now be wrong?" Fix what you find before moving on. Do not accumulate unreviewed changes.
- If reality diverges from the design (you discover the design was incomplete or wrong), stop and loop back to Design or Discover. Adapting the plan is correct; quietly shipping something lesser than the plan is not.

**Exit when:** the block is fully implemented and integrated, with nothing deferred and nothing faked.

## V — Validate

**Goal:** Prove the block works. Not believe — prove.

- **Run it.** Execute the tests, the build, the type-checker, the linter, the actual code path — whatever produces real evidence. Show the output.
- Test the **happy path and the edge cases** from Design. If a verification reveals a defect, fix it and re-run; never wave away a red signal.
- Re-read the block's acceptance criteria and the original requirement, and confirm — with evidence — that they are satisfied for real, at full scope.
- Check for **regressions**: did this block break anything that previously worked? Run the broader tests it could affect.
- Run the **Definition of Done** gate (`references/definition-of-done.md`) and produce an honest confidence assessment. If you cannot honestly assert 100% confidence on every line item with evidence, you are **not done** — loop back to the phase that fixes the gap (Execute for bugs, Design for approach flaws, Discover for misunderstanding) and run forward again.

**Exit when:** the Definition of Done passes with evidence and honest full confidence. Only then does the block become `DONE (verified)`.

## C — Compact

**Goal:** Consolidate the win and keep context lean for the next block — the *healthy* way to manage tokens.

- Update the Work Ledger: mark the block `DONE (verified)` with a one-line note of the evidence (tests passing, behavior confirmed) and any decisions made.
- Remove scaffolding, debug output, dead code, and temporary artifacts introduced during the cycle.
- Distill what the *next* block needs to know into a compact carry-forward note — key interfaces created, decisions that constrain later blocks, surprises discovered — so you can release the bulky working context without losing essential continuity.
- Note any follow-ups or newly discovered work; if it's in-scope for the requirement and uncovered, add a block to the ledger rather than dropping it.

**Exit when:** the ledger is current, the workspace is clean, and the essential context for the next block is captured compactly.

---

## Looping Rule

After Compact, move to the next `TODO` block and run DDEVC again. When all blocks are `DONE (verified)`, return to the Atlas Loop's **final integration verification**: re-read the original requirement end to end and prove the assembled feature satisfies it as a whole — cross-block integration, full user flow, and no regressions — before reporting the requirement complete.
