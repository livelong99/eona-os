import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, GitBranch, Search, ListTree } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { TerminalLog } from "@/components/ui/terminal-log";
import {
  WorkspaceSidebar,
  type SidebarView,
} from "@/components/workspace/WorkspaceSidebar";
import { SearchOverlay } from "@/components/workspace/SearchOverlay";
import { PlanDrawer } from "@/components/workspace/PlanDrawer";
import { SessionComposer } from "@/components/workspace/SessionComposer";
import { SEED_WORKSPACES } from "@/lib/workspaces";
import {
  SESSIONS,
  SESSION_STATUS_META,
  PLAN,
  agentById,
} from "@/lib/workspace-detail";

type Overlay = "none" | "search" | "plan";

// WorkspaceDetail — the two-panel view you land on after opening a workspace.
// Left (small): Sessions/Agents toggle + list. Mid (large): the selected
// session's Claude-style execution log, with Search + Plan in the top-right.
export function WorkspaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const workspace = SEED_WORKSPACES.find((w) => w.id === id);
  const workspaceName = workspace?.name ?? id ?? "workspace";
  const branch = workspace?.branch ?? "main";

  const [view, setView] = useState<SidebarView>("sessions");
  const [selectedSessionId, setSelectedSessionId] = useState("s1");
  const [overlay, setOverlay] = useState<Overlay>("none");

  const session = useMemo(
    () => SESSIONS.find((s) => s.id === selectedSessionId) ?? SESSIONS[0],
    [selectedSessionId],
  );
  const owner = agentById(session.agentId);
  const status = SESSION_STATUS_META[session.status];
  const isLive = session.status === "running";
  const activeSteps = PLAN.steps.filter((s) => s.status === "active").length;

  // Keyboard: ⌘K / Ctrl+K toggles file search, Esc closes any overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOverlay((o) => (o === "search" ? "none" : "search"));
      } else if (e.key === "Escape") {
        setOverlay("none");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <div className="relative flex w-full max-w-[1440px] gap-4">
        {/* Left panel (small) */}
        <GlassPanel className="w-[284px] shrink-0">
          <div className="flex h-full flex-col gap-3 p-4">
            <header className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/workspace")}
                aria-label="Back to workspaces"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white/90 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight text-white">
                  {workspaceName}
                </h1>
                <p className="flex items-center gap-1 text-[11px] text-white/45">
                  <GitBranch className="h-3 w-3" />
                  {branch}
                </p>
              </div>
            </header>

            <div className="min-h-0 flex-1">
              <WorkspaceSidebar
                view={view}
                onViewChange={setView}
                selectedSessionId={selectedSessionId}
                onSelectSession={setSelectedSessionId}
              />
            </div>
          </div>
        </GlassPanel>

        {/* Mid panel (large) */}
        <GlassPanel className="min-w-0 flex-1">
          {/* Top bar: session identity + actions */}
          <header className="flex items-center gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${isLive ? "animate-pulse" : ""}`}
                  style={{ background: status.color }}
                />
                <h2 className="truncate text-[15px] font-semibold tracking-tight text-white">
                  {session.title}
                </h2>
              </div>
              <p className="mt-0.5 pl-4 text-[12px] text-white/45">
                {owner?.name} · {owner?.model} · {session.messages} messages
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOverlay("search")}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-white/80 transition-colors duration-200 hover:bg-white/[0.08] cursor-pointer"
              >
                <Search className="h-4 w-4" />
                Search
                <kbd className="ml-1 rounded border border-white/10 bg-white/[0.06] px-1 py-0.5 text-[10px] text-white/45">
                  ⌘K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() => setOverlay("plan")}
                className="relative flex items-center gap-2 rounded-lg border border-[#5227FF]/40 bg-[#5227FF]/15 px-3 py-1.5 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#5227FF]/25 cursor-pointer"
              >
                <ListTree className="h-4 w-4" />
                Plan
                {activeSteps > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#5227FF] px-1 text-[10px] font-semibold text-white">
                    {activeSteps}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Embedded terminal surface + session composer */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
            <div
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08]"
              style={{ background: "rgba(0,0,0,0.32)" }}
            >
              {/* faux terminal title bar */}
              <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
                </span>
                <span className="ml-2 truncate font-mono text-[11.5px] text-white/40">
                  claude — {workspaceName} — {session.title}
                </span>
                {isLive && (
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#34d399]/12 px-2 py-0.5 text-[10.5px] font-medium text-[#34d399]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" />
                    live
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1">
                <TerminalLog events={session.log} live={isLive} />
              </div>
            </div>

            <SessionComposer agentName={owner?.name} />
          </div>
        </GlassPanel>

        {overlay === "search" && <SearchOverlay onClose={() => setOverlay("none")} />}
        {overlay === "plan" && <PlanDrawer onClose={() => setOverlay("none")} />}
      </div>
    </section>
  );
}
