import { UserCheck, Zap } from "lucide-react";

interface Props {
  mode: "manual" | "auto";
  streaming: boolean;
  onChange: (mode: "manual" | "auto") => void;
}

// AutoManualToggle — switches the implementation between per-story manual review
// and autonomous (auto) execution. Sends a directive to the orchestrator, which
// updates workspace.json.mode and behaves accordingly.
export function AutoManualToggle({ mode, streaming, onChange }: Props) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5" title="Review mode">
      <Opt active={mode === "manual"} disabled={streaming} onClick={() => onChange("manual")}
        icon={<UserCheck className="h-3.5 w-3.5" />} label="Manual" />
      <Opt active={mode === "auto"} disabled={streaming} onClick={() => onChange("auto")}
        icon={<Zap className="h-3.5 w-3.5" />} label="Auto" />
    </div>
  );
}

function Opt({
  active, disabled, onClick, icon, label,
}: {
  active: boolean; disabled: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-50 cursor-pointer ${
        active ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
