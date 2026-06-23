import { Check, CircleDot, Circle, Hand } from "lucide-react";
import type { ToolStep } from "@/lib/labs/toolsClient";

type StepStatus = "done" | "active" | "upcoming";

interface WorkbenchStepperProps {
  steps: ToolStep[];
  activeIndex: number;
  /** Focus a completed or the active step. Upcoming steps are not selectable. */
  onSelect: (index: number) => void;
  /** Explicit done steps (project mode). When omitted, every step before the
   * active index is treated as done (live-run mode's linear progression). */
  doneIndices?: Set<number>;
}

function statusOf(index: number, active: number, doneIndices?: Set<number>): StepStatus {
  if (index === active) return "active";
  if (doneIndices) return doneIndices.has(index) ? "done" : "upcoming";
  return index < active ? "done" : "upcoming";
}

// WorkbenchStepper — a vertical rail of the tool's steps with done/active/upcoming
// state and a HITL badge. Clicking a completed or active step focuses it.
export function WorkbenchStepper({
  steps,
  activeIndex,
  onSelect,
  doneIndices,
}: WorkbenchStepperProps) {
  return (
    <ol className="space-y-1.5">
      {steps.map((step, i) => {
        const status = statusOf(i, activeIndex, doneIndices);
        // Done and active steps are reviewable; in project mode an upcoming step
        // that is already done is also reachable (handled by status above).
        const selectable = status !== "upcoming";
        const hitl = step.ui === "artifact-iframe" || step.ui === "file-cards";

        return (
          <li key={step.id || i}>
            <button
              type="button"
              disabled={!selectable}
              onClick={() => selectable && onSelect(i)}
              aria-current={status === "active" ? "step" : undefined}
              className={[
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150",
                status === "active"
                  ? "border-[#5227FF]/40 bg-[#5227FF]/[0.12]"
                  : "border-white/[0.07] bg-white/[0.02]",
                selectable
                  ? "cursor-pointer hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
                  : "cursor-default opacity-55",
              ].join(" ")}
            >
              <span
                className={[
                  "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                  status === "done"
                    ? "bg-[#34d399]/20 text-[#34d399]"
                    : status === "active"
                      ? "bg-[#5227FF]/25 text-white"
                      : "bg-white/[0.05] text-white/45",
                ].join(" ")}
              >
                {status === "done" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : status === "active" ? (
                  <CircleDot className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p
                    className={
                      status === "upcoming"
                        ? "truncate text-[13px] font-medium text-white/45"
                        : "truncate text-[13px] font-medium text-white/90"
                    }
                  >
                    {step.title}
                  </p>
                  {hitl && (
                    <span
                      title="Human-in-the-loop"
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/50"
                    >
                      <Hand className="h-2.5 w-2.5" />
                      HITL
                    </span>
                  )}
                </div>
                {step.detail && (
                  <p className="mt-0.5 truncate text-[11.5px] leading-relaxed text-white/40">
                    {step.detail}
                  </p>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
