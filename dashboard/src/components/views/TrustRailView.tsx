"use client";

// STUB (Phase 0) — owned by Worker W5. The Trust Rail: an approval surface that
// consumes approval.request / approval.responded RunEvents and lets the user
// approve/deny consequential actions. W5 replaces this body; the route + nav
// entry are already wired so W5 never edits the shell.
export function TrustRailView() {
  return (
    <div className="flex h-full items-center justify-center px-8 text-center">
      <div className="max-w-md">
        <h2 className="text-2xl font-semibold">Trust Rail</h2>
        <p className="mt-2 text-sm text-muted">
          Approval &amp; trust surface — coming in Wave 2 (W5).
        </p>
      </div>
    </div>
  );
}
