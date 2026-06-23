import type { ArtifactFile, ToolStep } from "@/lib/labs/toolsClient";
import { matchesGlobs } from "@/components/labs/workbenchText";

// Per-step completion derived from a project's artifacts on disk. A step is DONE
// when any artifact's relpath or name matches the step's declared `artifacts`
// globs (the manifest's step→artifact map). `file` is the matching artifact, if
// any, so the step view can render it directly.
export interface StageState {
  done: boolean;
  file: ArtifactFile | null;
}

// Returns the first artifact matching a step's globs (relpath, then name).
export function matchStepArtifact(
  step: ToolStep,
  files: ArtifactFile[],
): ArtifactFile | null {
  return (
    files.find(
      (f) => matchesGlobs(f.relpath, step.artifacts) || matchesGlobs(f.name, step.artifacts),
    ) ?? null
  );
}

// Computes done/file for every step against a project's artifacts.
export function computeStageStates(
  steps: ToolStep[],
  files: ArtifactFile[],
): StageState[] {
  return steps.map((step) => {
    const file = matchStepArtifact(step, files);
    return { done: Boolean(file), file };
  });
}

// The first step that is NOT done (the place to resume), or the last step index
// when every stage is complete. Empty step lists yield 0.
export function firstIncompleteStep(states: StageState[]): number {
  const idx = states.findIndex((s) => !s.done);
  if (idx >= 0) return idx;
  return Math.max(0, states.length - 1);
}

// The HIGHEST-index step that has an artifact — the most-recently-produced stage,
// which becomes the CURRENT (active, editable) step when opening a project. Falls
// back to step 0 when nothing has been produced yet.
export function lastArtifactStep(states: StageState[]): number {
  for (let i = states.length - 1; i >= 0; i--) {
    if (states[i].done) return i;
  }
  return 0;
}

// The completed (locked, read-only review) steps: every step WITH an artifact
// EXCEPT the active one (the last-artifact step is the current editable stage).
export function reviewDoneIndices(states: StageState[], activeStep: number): Set<number> {
  const done = new Set<number>();
  states.forEach((s, i) => {
    if (s.done && i !== activeStep) done.add(i);
  });
  return done;
}
