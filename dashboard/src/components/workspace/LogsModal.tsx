import { Terminal } from "lucide-react";
import { LogsPanel } from "@/components/workspace/LogsPanel";
import type { ScriptKind } from "@/lib/workspace/workspaceClient";

interface Props {
  slug: string;
  name: string;
  scripts?: { build?: string; run?: string; test?: string };
  autoStart?: ScriptKind;
  onClose: () => void;
}

// LogsModal — a centered overlay hosting LogsPanel, used to Build/Run/Test a
// workspace from the /workspace list without leaving the screen.
export function LogsModal({ slug, name, scripts, autoStart, onClose }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[28px] p-4"
      style={{ background: "rgba(2,3,8,0.55)" }}
      onClick={onClose}
    >
      <div
        className="flex h-[70vh] w-[min(820px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/12"
        style={{ background: "rgba(16,17,26,0.94)", backdropFilter: "blur(24px)", boxShadow: "0 30px 120px rgba(0,0,0,0.6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
          <Terminal className="h-4 w-4 text-[#a78bfa]" />
          <span className="text-[14px] font-semibold text-white">{name}</span>
          <span className="font-mono text-[11.5px] text-white/35">10_Projects/{slug}</span>
        </div>
        <div className="min-h-0 flex-1">
          <LogsPanel slug={slug} scripts={scripts} autoStart={autoStart} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
