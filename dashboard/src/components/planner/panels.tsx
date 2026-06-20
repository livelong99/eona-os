import { useState } from "react";
import {
  Video, Focus, Coffee, ListTodo, Mail, Pencil, Sparkles, Plus,
  RotateCw, ArrowRight, CircleCheck, Circle, Clock,
} from "lucide-react";
import {
  AGENDA, EVENT_META, TASKS, SOURCE_META, PRIORITY_META,
  MAILS, MAIL_TIER_META, JIRA_ITEMS, JIRA_STATUS_META,
  type AgendaEvent, type Task, type TaskBucket, type TaskSource,
} from "@/lib/planner";

// shared panel shell
export function Panel({ title, icon, action, children, className = "" }: {
  title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] ${className}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        {icon && <span className="text-white/55">{icon}</span>}
        <h2 className="text-[13.5px] font-semibold tracking-tight text-white">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

// ── Agenda timeline ──────────────────────────────────────────────────────────
const KIND_ICON = { meeting: Video, focus: Focus, break: Coffee, task: ListTodo } as const;

export function AgendaPanel() {
  return (
    <Panel
      title="Today"
      icon={<Clock className="h-4 w-4" />}
      action={
        <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-[#5227FF] px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-[#6438ff] cursor-pointer">
          <Sparkles className="h-3.5 w-3.5" /> Plan my day
        </button>
      }
    >
      <div className="space-y-1">
        {AGENDA.map((e) => <AgendaRow key={e.id} e={e} />)}
      </div>
    </Panel>
  );
}

function AgendaRow({ e }: { e: AgendaEvent }) {
  const meta = EVENT_META[e.kind];
  const Icon = KIND_ICON[e.kind];
  return (
    <div className={`flex gap-3 rounded-xl border px-3 py-2.5 transition-colors ${e.live ? "border-[#34d399]/40 bg-[#34d399]/[0.07]" : "border-transparent hover:bg-white/[0.04]"}`}>
      <div className="w-11 shrink-0 pt-0.5 text-right">
        <p className="text-[12px] font-medium tabular-nums text-white/75">{e.time}</p>
        <p className="text-[10px] tabular-nums text-white/35">{e.end}</p>
      </div>
      <div className="relative flex flex-col items-center">
        <span className="mt-1 grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${meta.color}22` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
        </span>
        <span className="mt-1 w-px flex-1 bg-white/10" />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-medium text-white/90">{e.title}</p>
          {e.live && <span className="inline-flex items-center gap-1 rounded-full bg-[#34d399]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#34d399]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#34d399]" />now</span>}
        </div>
        {e.detail && <p className="mt-0.5 truncate text-[11.5px] text-white/45">{e.detail}</p>}
      </div>
    </div>
  );
}

// ── Tasks ────────────────────────────────────────────────────────────────────
const SOURCE_ICON = { mail: Mail, agent: Sparkles, pencil: Pencil } as const;
const BUCKETS: { id: TaskBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
];

export function TasksPanel() {
  const [tasks, setTasks] = useState<Task[]>(TASKS);
  const [draft, setDraft] = useState("");

  const toggle = (id: string) => setTasks((p) => p.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const add = () => {
    if (!draft.trim()) return;
    setTasks((p) => [{ id: `t${Date.now()}`, title: draft.trim(), source: "manual", priority: "med", due: "Today", bucket: "today", done: false }, ...p]);
    setDraft("");
  };

  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <Panel
      title="Tasks"
      icon={<ListTodo className="h-4 w-4" />}
      action={<span className="text-[11px] text-white/40">{remaining} open</span>}
    >
      {/* quick add */}
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
        <Plus className="h-4 w-4 shrink-0 text-white/40" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Quick add a task…"
          aria-label="Quick add a task"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
        />
      </div>

      <div className="space-y-4">
        {BUCKETS.map((b) => {
          const rows = tasks.filter((t) => t.bucket === b.id);
          if (rows.length === 0) return null;
          return (
            <div key={b.id}>
              <p className={`mb-1.5 text-[11px] font-medium uppercase tracking-wide ${b.id === "overdue" ? "text-[#f4694d]/80" : "text-white/40"}`}>{b.label}</p>
              <div className="space-y-1">
                {rows.map((t) => <TaskRow key={t.id} t={t} onToggle={() => toggle(t.id)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function SourceBadge({ source, ref: refId }: { source: TaskSource; ref?: string }) {
  const meta = SOURCE_META[source];
  const Icon = meta.icon ? SOURCE_ICON[meta.icon] : null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium" style={{ color: meta.color }}>
      {meta.slug ? <img src={`https://cdn.simpleicons.org/${meta.slug}`} alt="" className="h-3 w-3" /> : Icon ? <Icon className="h-3 w-3" /> : null}
      {refId ?? meta.label}
    </span>
  );
}

function TaskRow({ t, onToggle }: { t: Task; onToggle: () => void }) {
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
      <button type="button" onClick={onToggle} aria-label={t.done ? "Mark incomplete" : "Mark complete"} className="shrink-0 cursor-pointer">
        {t.done ? <CircleCheck className="h-[18px] w-[18px] text-[#34d399]" /> : <Circle className="h-[18px] w-[18px] text-white/30 transition-colors group-hover:text-white/55" />}
      </button>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: PRIORITY_META[t.priority].color }} title={PRIORITY_META[t.priority].label} />
      <span className={`min-w-0 flex-1 truncate text-[13px] ${t.done ? "text-white/35 line-through" : "text-white/85"}`}>{t.title}</span>
      <SourceBadge source={t.source} ref={t.ref} />
      <span className="w-16 shrink-0 text-right text-[11px] text-white/40">{t.due}</span>
    </div>
  );
}

// ── Mail triage ──────────────────────────────────────────────────────────────
export function MailPanel() {
  return (
    <Panel
      title="Inbox triage"
      icon={<img src="https://cdn.simpleicons.org/gmail" alt="" className="h-4 w-4" />}
      action={<span className="text-[11px] text-white/40">{MAILS.length} sorted</span>}
    >
      <div className="space-y-1.5">
        {MAILS.map((m) => {
          const meta = MAIL_TIER_META[m.tier];
          return (
            <div key={m.id} className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${meta.color}1f`, color: meta.color }}>{meta.label}</span>
                <span className="truncate text-[12.5px] font-medium text-white/85">{m.from}</span>
                <span className="ml-auto shrink-0 text-[11px] text-white/35">{m.time}</span>
              </div>
              <p className="mt-1.5 truncate text-[12.5px] text-white/70">{m.subject}</p>
              <p className="mt-0.5 line-clamp-1 text-[11.5px] text-white/40">{m.preview}</p>
              {m.tier === "action" && (
                <button type="button" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-[#a78bfa] transition-colors hover:text-[#c4b5fd] cursor-pointer">
                  <Plus className="h-3 w-3" /> Convert to task
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── JIRA sync ────────────────────────────────────────────────────────────────
export function JiraPanel() {
  const cols: { status: keyof typeof JIRA_STATUS_META }[] = [
    { status: "todo" }, { status: "inprogress" }, { status: "review" }, { status: "done" },
  ];
  return (
    <Panel
      title="JIRA"
      icon={<img src="https://cdn.simpleicons.org/jira" alt="" className="h-4 w-4" />}
      action={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#34d399]/12 px-2 py-0.5 text-[10.5px] font-medium text-[#34d399]">
          <RotateCw className="h-3 w-3" /> synced 2m ago
        </span>
      }
    >
      {/* status summary */}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {cols.map(({ status }) => {
          const meta = JIRA_STATUS_META[status];
          const count = JIRA_ITEMS.filter((j) => j.status === status).length;
          return (
            <div key={status} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-2 text-center">
              <p className="text-[15px] font-semibold tabular-nums text-white">{count}</p>
              <p className="mt-0.5 text-[9.5px] font-medium uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</p>
            </div>
          );
        })}
      </div>
      <div className="space-y-1">
        {JIRA_ITEMS.map((j) => {
          const meta = JIRA_STATUS_META[j.status];
          return (
            <div key={j.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
              <span className="shrink-0 font-mono text-[11px] text-white/50">{j.ref}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80">{j.title}</span>
              <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/55">{j.points} pt</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/0 transition-colors group-hover:text-white/40" />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
