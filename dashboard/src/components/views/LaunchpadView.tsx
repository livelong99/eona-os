"use client";

// STUB (Phase 0) — owned by Worker W5. The Agent-Tools Launchpad: a spatial grid
// of agent-tool tiles backed by the Wave-1 tool.yaml manifest loader. W5 replaces
// this body; the route + nav entry are already wired so W5 never edits the shell.
export function LaunchpadView() {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <h2 className="text-2xl font-semibold">Launchpad</h2>
        <p className="mt-2 text-sm text-muted">
          Agent-tools platform — coming in Wave 2 (W5).
        </p>
      </div>
    </div>
  );
}
