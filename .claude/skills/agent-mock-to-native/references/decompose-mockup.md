# Phase 1 · Decompose Mockup

Turn a raw HTML mockup into a confirmed scope and a complete component tree — the contract every later phase works against.

## What Success Looks Like

- The user has confirmed what is being converted: a single component, one screen, or a whole app — before any deep analysis begins. Scope creep discovered in Phase 3 is a Phase 1 failure.
- Every visual element in the mockup is accounted for in a component tree: components broken into sub-components, each annotated with its visual spec (layout, spacing, colors, typography), behavior (interactions, states), and motion (animations, transitions, easing, durations).
- Nothing is invented. The tree describes what the mockup actually contains — read the CSS for the real values; don't eyeball a hex code or guess a duration.
- The tree is saved to `{agent.conversion_report_output_path}` and presented to the user for confirmation before Phase 2 begins.

## Your Approach

Dispatch **three analysis agents in parallel**, each owning one lens on the same mockup:

1. **Code Analyst** — the mechanics: stylesheets, CSS custom properties, keyframe animations, transitions, JavaScript-driven behavior, responsive rules. Output: the ground-truth values (exact colors, dimensions, fonts, timing functions) and how every dynamic effect is achieved.
2. **Structure Analyst** — the anatomy: DOM hierarchy mapped to natural component and sub-component boundaries, repeated patterns that should become one reusable component, layout containers vs. leaf elements, what data each piece would take as props.
3. **Design Analyst** — the visual language: spacing rhythm, color palette and where each color is used, type scale, elevation/shadow language, motion personality, and anything that will be tricky to reproduce natively (blend modes, backdrop filters, complex gradients).

If subagents are unavailable, apply the three lenses yourself, sequentially — same outputs, same rigor.

Merge the three reports into a single component tree. Where the analysts disagree (e.g. structure says one component, design says two visual variants), resolve it explicitly and note the decision — these notes are gold for Phase 3.

## Hand-off

Phase 2 receives the confirmed component tree. Each leaf sub-component must carry enough of its visual and motion spec that a researcher could evaluate libraries against it without re-reading the mockup.
