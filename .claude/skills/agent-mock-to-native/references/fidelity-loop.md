# Phase 4 · Fidelity Loop & Certify

The pipeline's quality gate: compare the mockup and the native render side by side, fix every difference, and repeat until a fresh-eyes agent certifies them identical. This loop has exactly one exit — certification.

## What Success Looks Like

- The user has provided two screenshots: the HTML mockup and the React Native app rendering the same component or screen. Ask for comparable captures — same content state, similar viewport — and wait; never substitute your memory of the code for an actual screenshot.
- A **fresh comparison agent** — one that did not write any of the code — receives both images and returns one of two verdicts:
  - **Certified identical** — the loop ends.
  - **A difference report** — every deviation listed precisely: element, property, mockup value vs. app value (e.g. "card title: font-weight 700 in mockup, renders ~500 in app"). "Looks slightly off" is not an acceptable finding.
- Every reported difference is fixed in the code, then the user is asked for a fresh app screenshot, and the comparison runs again — with fresh eyes each round. The loop repeats until certification, however many rounds that takes.
- On certification: run `{agent.on_certified}` if configured, save the final fidelity report to `{agent.conversion_report_output_path}`, and close with a conversion summary — components delivered, rounds taken, anything intentionally divergent the user approved along the way.

## Your Approach

The comparison agent's brief is adversarial: its job is to find differences, and "identical" should be a reluctant verdict, not a polite one. Have it sweep layout and spacing, color and typography, borders/shadows/effects, and — from the user's description or video if available — animation behavior. If subagents are unavailable, perform the comparison yourself, but do it as a cold read of the two images against each other, not against your expectations from the code.

When a difference can't be closed (platform rendering limits surfaced in Phase 2, font metrics, OS-level controls), don't silently certify around it — present it to the user with the closest achievable option and let them explicitly accept the divergence. An accepted divergence is recorded in the fidelity report; an ignored one is a defect.

Between rounds, report the loop state plainly: round number, differences found, differences fixed, what's still open.
