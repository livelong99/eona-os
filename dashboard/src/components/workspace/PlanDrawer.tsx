import { Check, LoaderCircle, Circle, X } from "lucide-react";
import {
  PLAN,
  AGENT_STATUS_META,
  agentById,
  type PlanStep,
} from "@/lib/workspace-detail";

interface PlanDrawerProps {
  onClose: () => void;
}

function StepIcon({ status }: { status: PlanStep["status"] }) {
  if (status === "done")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#34d399]/15">
        <Check className="h-3 w-3 text-[#34d399]" />
      </span>
    );
  if (status === "active")
    return (
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[#4f8cff]/15">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#4f8cff]" />
      </span>
    );
  return (
    <span className="grid h-5 w-5 place-items-center rounded-full bg-white/[0.06]">
      <Circle className="h-3 w-3 text-white/35" />
    </span>
  );
}

// PlanDrawer — slides in from the right; shows the full current plan: the goal,
// overall progress, and every step with its assigned agent + status.
export function PlanDrawer({ onClose }: PlanDrawerProps) {
  const done = PLAN.steps.filter((s) => s.status === "done").length;
  const total = PLAN.steps.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div
      className="absolute inset-0 z-40 flex justify-end overflow-hidden rounded-[28px]"
      style={{ background: "rgba(2,3,8,0.5)" }}
      onClick={onClose}
    >
      <aside
        className="flex h-full w-[min(440px,94vw)] flex-col border-l border-white/12"
        style={{
          background: "rgba(16,17,26,0.9)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "-30px 0 120px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-white/10 px-6 py-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
              Current plan
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight text-white">
              {PLAN.title}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">
              {PLAN.goal}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close plan"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/85 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 pb-4 pt-4">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-white/55">{done} of {total} steps complete</span>
            <span className="font-medium text-white/75">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: "linear-gradient(90deg,#5227FF,#4f8cff)" }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <ol className="relative space-y-1">
            {PLAN.steps.map((step, i) => {
              const agent = agentById(step.agentId);
              const agentColor = agent
                ? AGENT_STATUS_META[agent.status].color
                : "#8a8fa3";
              return (
                <li key={step.id} className="relative flex gap-3 pb-3">
                  {/* connector */}
                  {i < PLAN.steps.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-[9px] top-6 h-full w-px bg-white/10"
                    />
                  )}
                  <div className="relative z-10 pt-0.5">
                    <StepIcon status={step.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[13.5px] font-medium ${
                        step.status === "pending" ? "text-white/55" : "text-white/90"
                      }`}
                    >
                      {step.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {agent && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-white/60">
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: agentColor }}
                          />
                          {agent.name}
                          <span className="text-white/30">· {agent.role}</span>
                        </span>
                      )}
                      {step.note && (
                        <span className="text-[11px] text-white/40">{step.note}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    </div>
  );
}
