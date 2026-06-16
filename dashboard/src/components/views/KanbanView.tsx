"use client";

import { useEffect, useState } from "react";
import { KANBAN_COLUMNS, type Task, type TaskEvent } from "@/lib/types";
import { getTasks, subscribeEvents } from "@/lib/hermes";
import { AGENTS } from "@/lib/nav";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { LivePill } from "@/components/ui/LivePill";

export function KanbanView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let active = true;
    getTasks().then(({ tasks, live }) => {
      if (!active) return;
      setTasks(tasks);
      setLive(live);
    });
    const unsub = subscribeEvents((e) =>
      setEvents((prev) => [e, ...prev].slice(0, 12)),
    );
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Kanban</h2>
          <p className="text-xs text-muted">
            Hermes dispatcher · one prompt → many profiles
          </p>
        </div>
        <LivePill live={live} />
      </header>

      <div className="flex-1 overflow-x-auto px-6 py-5">
        <div className="flex min-w-max gap-4">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <section key={col.status} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-sm font-medium text-foreground/80">
                    {col.label}
                  </h3>
                  <span className="text-xs text-muted">{colTasks.length}</span>
                </div>
                <ul className="space-y-2">
                  {colTasks.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-xl border border-border bg-surface p-3"
                    >
                      <p className="text-sm text-foreground/90">{t.title}</p>
                      {t.assignee && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                          {AGENTS[t.assignee] ? (
                            <AgentIcon agent={AGENTS[t.assignee]} size="sm" />
                          ) : (
                            <span className="h-5 w-5 rounded-full bg-surface-2" />
                          )}
                          {t.assignee}
                        </div>
                      )}
                    </li>
                  ))}
                  {colTasks.length === 0 && (
                    <li className="rounded-xl border border-dashed border-border/60 p-3 text-center text-xs text-muted">
                      empty
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-6 py-3">
        <p className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-muted">
          TASK EVENTS (LIVE)
        </p>
        <ul className="flex flex-col gap-1 font-mono text-xs text-foreground/70">
          {events.length === 0 ? (
            <li className="text-muted">waiting for task_events…</li>
          ) : (
            events.slice(0, 4).map((e) => (
              <li key={e.id} className="truncate">
                <span className="text-accent">{e.kind}</span> · {e.message}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
