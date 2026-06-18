"use client";

// KanbanView — dark-glass reskin (Wave 3).
//
// Wave 2 → Wave 3 changes:
//   • SpatialStage / ParallaxLayer removed — glass + glow provides depth
//   • Toolbar replaced with CascadeHeading + inline LivePill
//   • Task cards: TiltCard → GlowCard (glow "sm", raises on hover)
//   • Column troughs: GlassCard kept (correct back-plane glass panel)
//   • Live event ticker: GlassCard kept
//   • All live data wiring (getTasks / subscribeEvents) preserved verbatim

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { KANBAN_COLUMNS, type Task, type TaskEvent } from "@/lib/types";
import { getTasks, subscribeEvents } from "@/lib/hermes";
import { AGENTS } from "@/lib/nav";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { LivePill } from "@/components/ui/LivePill";
import { CascadeHeading } from "@/components/ui/CascadeHeading";
import { GlowCard } from "@/components/ui/GlowCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { LAYER_VARIANTS, LAYER_ITEM } from "@/lib/aurora";

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
      {/* Screen heading with live pill */}
      <div className="flex items-end justify-between px-8 pt-8 pb-4">
        <CascadeHeading
          text="Kanban"
          subtitle="Hermes dispatcher · one prompt → many profiles"
        />
        <div className="mb-1">
          <LivePill live={live} />
        </div>
      </div>

      {/* Board — scrollable horizontally; columns are glass troughs */}
      <div className="flex-1 overflow-x-auto px-6 pb-4">
        <div className="flex min-w-max gap-4 pb-2">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status);
            return (
              <div key={col.status} className="w-64 shrink-0">
                {/* Column trough — back-plane glass panel */}
                <GlassCard elevation={1} className="flex flex-col gap-2 p-3">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <h3 className="text-sm font-medium text-foreground/80">
                      {col.label}
                    </h3>
                    <span className="text-xs text-muted">{colTasks.length}</span>
                  </div>

                  {colTasks.length === 0 ? (
                    <EmptyState
                      title="Empty"
                      hint={`No tasks in ${col.label}`}
                      className="py-6"
                    />
                  ) : (
                    <motion.ul
                      className="flex flex-col gap-2"
                      variants={LAYER_VARIANTS}
                      initial="hidden"
                      animate="visible"
                    >
                      {colTasks.map((t) => (
                        <motion.li key={t.id} variants={LAYER_ITEM}>
                          {/* Task card — GlowCard raises glow tier on hover */}
                          <GlowCard
                            as="li"
                            glow="sm"
                            aria-label={t.title}
                            className="p-3"
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
                          </GlowCard>
                        </motion.li>
                      ))}
                    </motion.ul>
                  )}
                </GlassCard>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live event ticker — glass footer panel */}
      <GlassCard
        as="aside"
        elevation={1}
        className="mx-6 mb-4 rounded-xl px-5 py-3"
      >
        <p className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
          Task Events (Live)
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
      </GlassCard>
    </div>
  );
}
