import { CalendarCheck, ListTodo, Mail, Sparkles, RotateCw } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { AgendaPanel, TasksPanel, MailPanel, JiraPanel } from "@/components/planner/panels";
import { PLANNER_STATS, type PlannerStat } from "@/lib/planner";

const STAT_ICON = { calendar: CalendarCheck, list: ListTodo, mail: Mail, jira: RotateCw } as const;

// PlannerScreen — the daily command center. Unifies calendar (agenda), unified
// tasks (JIRA + mail + agent + manual), inbox triage, and live JIRA sync so the
// whole day runs from one surface.
export function PlannerScreen() {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1440px]">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-4 px-6 py-5 sm:px-8">
          <div className="mr-auto flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5227FF]/20">
              <CalendarCheck className="h-5 w-5 text-[#a78bfa]" />
            </span>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">{today}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Planner</h1>
            </div>
          </div>

          {/* stat chips */}
          <div className="flex flex-wrap items-center gap-2">
            {PLANNER_STATS.map((s) => <StatChip key={s.label} stat={s} />)}
          </div>

          <button
            type="button"
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 cursor-pointer"
            style={{ background: "#5227FF" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#6438ff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#5227FF")}
          >
            <Sparkles className="h-4 w-4" />
            Plan my day
          </button>
        </header>

        <div className="h-px w-full bg-white/10" />

        {/* Panels */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-4 sm:px-6 lg:grid-cols-12">
          <div className="min-h-0 lg:col-span-4">
            <AgendaPanel />
          </div>
          <div className="min-h-0 lg:col-span-4">
            <TasksPanel />
          </div>
          <div className="grid min-h-0 grid-rows-2 gap-3 lg:col-span-4">
            <MailPanel />
            <JiraPanel />
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}

function StatChip({ stat }: { stat: PlannerStat }) {
  const Icon = STAT_ICON[stat.icon];
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
      <Icon className="h-4 w-4" style={{ color: stat.accent }} />
      <span className="text-[15px] font-semibold tabular-nums text-white">{stat.value}</span>
      <span className="hidden text-[12px] text-white/45 md:inline">{stat.label}</span>
    </div>
  );
}
