# Definition of Done

This is the gate. Nothing — not a block, not the overall requirement — is "done" until it passes here, with evidence. Its entire purpose is to make it *impossible* to declare premature victory. When a model is tempted to wrap up to save effort or tokens, this gate is what stops it and sends it back to finish the job.

Run this at the end of every block's Validate phase, and again at final integration verification.

## The Anti-Corner-Cutting Contract

Atlas accepts these as binding. Violating any one means the work is **not done**, regardless of how much was completed:

- **Completeness over economy.** Saving tokens, time, or effort is *never* a valid reason to leave a feature partial, stubbed, or unverified. The only honest ways to reduce work are to compact finished work or to renegotiate scope *explicitly* with the user — never to silently ship less.
- **No hollow code.** No `TODO`/`FIXME` left in the delivered path, no placeholder returns, no `NotImplementedError` where real logic belongs, no mock/stub presented as a real implementation, no "you can fill this in" comments.
- **No silent scope reduction.** If you implement less than the requirement asked, you must say so explicitly and get agreement. Quietly narrowing scope is the cardinal sin.
- **Proof, not assertion.** "It works" without shown evidence is not a status — it's a hope. Run it and show the result.
- **Honesty over optimism.** Report the real state, including defects, gaps, and uncertainties. A truthful "90% done, here's what's left" is infinitely better than a false "done."

## The Completion Checklist

Every item must be a genuine, evidence-backed **yes**. Any "no", "partially", "should be", or "didn't check" means keep working.

- [ ] **Faithful to the requirement.** Re-read the original requirement (and this block's acceptance criteria). The implementation satisfies it at **full scope** — not a reduced interpretation.
- [ ] **Fully implemented.** Every code path the design called for is real and complete. No stubs, TODOs, placeholders, or mocked internals in the delivered path.
- [ ] **Fully integrated.** Callers, types, config, schemas, exports, migrations, and docs are updated. The feature is reachable and usable in the real system, not an orphan.
- [ ] **Edge cases handled.** The edge/error cases named in Design are implemented and behave correctly (empty, null, boundary, concurrent, failure, large, malformed — as applicable).
- [ ] **Verified by execution.** Tests / build / type-check / lint / the real code path were actually run, and the output is shown. Happy path *and* edge cases pass.
- [ ] **No regressions.** Nothing that previously worked is now broken; the affected broader tests were run.
- [ ] **Conventions followed.** The code matches the codebase's existing patterns and style.
- [ ] **Facts verified.** Anything depending on external libraries/APIs was checked against current sources, not recalled from memory.

## The Confidence Gate

After the checklist, state an honest confidence assessment:

> "On a 0–100 scale, how confident am I that this is fully functional, fully complete, and faithful to the requirement — and what is the evidence for that number?"

- The bar is **100, evidence-backed, on every checklist line**. If your honest number is below 100, name precisely what is missing or unproven and **go fix it** — then re-run the gate. Do not round up. Do not rationalize. Do not declare done at 95.
- A confident number with no evidence is not confidence — it's optimism wearing a costume. Tie the number to what you actually ran and saw.

## The Final Challenge

Before declaring done, answer one last question honestly:

> "Would this pass review by the world's most demanding senior engineer — someone who has zero tolerance for excuses, hunts for the stub you hoped they wouldn't find, and asks 'show me it running'?"

If there's any part you'd be nervous for that reviewer to inspect, that part is your next task. Go do it. Then ask again.

## What "Done" Earns

Only when the contract holds, the checklist is all evidence-backed yes, the confidence is an honest 100, and the final challenge is met — only then do you mark the block `DONE (verified)` in the Work Ledger and move on. Done is a fact you can prove, not a feeling you have.
