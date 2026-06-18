"use client";

// STUB (Phase 0) — owned by Worker U4. The Tool Workbench: the bespoke per-tool
// driving surface. A step-rail from the tool manifest's steps[], a main pane that
// streams RunEvents from the launched run (POST /v1/tools/{id}/launch), and an
// artifact stage. Reached from the Launchpad "Launch" action. U4 replaces this
// body; the route + nav entry are already wired so U4 never edits the shell.
export function WorkbenchView() {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <h2 className="text-2xl font-semibold">Workbench</h2>
        <p className="mt-2 text-sm text-muted">
          Tool driving surface — coming in Wave 3 (U4).
        </p>
      </div>
    </div>
  );
}
