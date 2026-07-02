# Phase 3 · Build & Redesign

Turn the component tree and research dossier into working React Native code that matches the mockup's UI and animation exactly — reusing what the codebase already has.

## What Success Looks Like

- Before any component is written, the codebase under `{agent.rn_app_root}` has been scanned for an existing implementation. Every component in the tree is classified **new** or **existing**, and the classification is shown to the user before code changes start.
- **Existing components are redesigned in place** to match the mockup's UI and animation exactly — not duplicated, not forked. Their public interface (props, exports) is preserved unless the mockup makes that impossible, and any breaking change is called out.
- **New components are implemented** using the dossier's recommended modules and written to `{agent.components_output_path}`, following the project's existing conventions — theme system, naming, file layout, state patterns. Code that looks foreign to the codebase is wrong even when it renders correctly.
- Animations match the mockup's spec, not an approximation of it: the easing curves, durations, and choreography from the Phase 1 tree are the requirement.
- The project builds and its tests pass after the changes. A component that breaks the build is not delivered.

## Your Approach

Detection first, as its own checkpoint: search by component name, by rendered role, and by visual signature — a component named differently but doing the same job is still a match. When unsure whether something is a match, ask the user; a wrong "new" verdict creates duplicates, a wrong "existing" verdict mangles an unrelated component.

Build in dependency order — leaf sub-components before their containers — so every parent composes already-verified children. For larger scopes, independent component branches can be built by parallel agents; keep a shared convention brief (theme, naming, chosen libraries) in each agent's prompt so the outputs converge.

Honor the mockup over the libraries: if a recommended module can't hit the spec, drop to a lower-level approach rather than shipping the library's default look.

## Hand-off

Phase 4 receives the list of built/redesigned components and where to see them running. Tell the user how to render the result (screen, story, or route) so they can capture the screenshot the fidelity loop needs.
