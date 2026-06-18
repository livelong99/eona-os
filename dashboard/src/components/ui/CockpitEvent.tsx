"use client";

import { motion } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  CircleDot,
  FileDiff,
  Loader2,
  MessageSquare,
  Radio,
  ShieldAlert,
  Terminal as TerminalIcon,
  Users,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { CockpitRow } from "@/lib/cockpit";
import { LAYER_ITEM } from "@/lib/aurora";

interface CockpitEventProps {
  row: CockpitRow;
}

interface Visual {
  Icon: LucideIcon;
  /** tailwind text-color class for the gutter icon */
  tint: string;
  /** tailwind border-color class for the left accent strip */
  borderTint: string;
  label: string;
}

function visualFor(row: CockpitRow): Visual {
  switch (row.kind) {
    case "header":
      return { Icon: Radio, tint: "text-aurora-teal", borderTint: "border-teal-500/40", label: "Run started" };
    case "reasoning":
      return { Icon: Brain, tint: "text-violet-300", borderTint: "border-violet-500/40", label: "Thinking" };
    case "message":
      return { Icon: MessageSquare, tint: "text-foreground/70", borderTint: "border-foreground/20", label: "Claude" };
    case "tool":
      return { Icon: Wrench, tint: "text-amber-300", borderTint: "border-amber-500/40", label: row.tool ?? "Tool" };
    case "diff":
      return { Icon: FileDiff, tint: "text-emerald-300", borderTint: "border-emerald-500/40", label: "Edit" };
    case "terminal":
      return { Icon: TerminalIcon, tint: "text-sky-300", borderTint: "border-sky-500/40", label: "Terminal" };
    case "subagent":
      return { Icon: Users, tint: "text-fuchsia-300", borderTint: "border-fuchsia-500/40", label: "Sub-agent" };
    case "approval":
      return { Icon: ShieldAlert, tint: "text-orange-300", borderTint: "border-orange-500/40", label: "Approval" };
    case "lifecycle":
      return row.event === "run.completed"
        ? { Icon: CheckCircle2, tint: "text-emerald-400", borderTint: "border-emerald-500/50", label: "Completed" }
        : { Icon: XCircle, tint: "text-rose-400", borderTint: "border-rose-500/50", label: "Ended" };
    default:
      return { Icon: CircleDot, tint: "text-muted", borderTint: "border-border", label: row.event ?? "Event" };
  }
}

function StatusDot({ status }: { status?: string }) {
  if (status === "running") {
    return <Loader2 className="h-3 w-3 animate-spin text-amber-300" aria-hidden />;
  }
  if (status === "error") {
    return <XCircle className="h-3 w-3 text-rose-400" aria-hidden />;
  }
  if (status === "done") {
    return <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden />;
  }
  return null;
}

export function CockpitEvent({ row }: CockpitEventProps) {
  const { Icon, tint, borderTint, label } = visualFor(row);

  return (
    // motion.li participates in the parent LAYER_VARIANTS stagger.
    <motion.li
      variants={LAYER_ITEM}
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        borderRadius: "var(--radius-md)",
        // Wave 3: glow-sm at rest; glow-md on hover (via class override below)
        boxShadow: "var(--glow-sm), var(--glass-edge)",
      }}
      className={[
        "flex gap-3 border border-[var(--glass-border)] px-3 py-2.5",
        // Left accent strip by event kind — 2px colored left border.
        `border-l-2 ${borderTint}`,
        "transition-[border-color,box-shadow] duration-200",
        "hover:[box-shadow:var(--glow-md),var(--glass-edge)]",
      ].join(" ")}
    >
      <div className="flex flex-col items-center pt-0.5">
        <Icon className={`h-4 w-4 shrink-0 ${tint}`} aria-hidden />
      </div>

      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-foreground/80">{label}</span>
          {row.kind === "tool" && <StatusDot status={row.status} />}
          {row.kind === "subagent" && <StatusDot status={row.status} />}
          {typeof row.duration === "number" && (
            <span className="text-muted">{row.duration.toFixed(1)}s</span>
          )}
          {row.kind === "subagent" && row.subagentType && (
            <span className="text-muted">{row.subagentType}</span>
          )}
        </div>

        <RowBody row={row} />
      </div>
    </motion.li>
  );
}

function RowBody({ row }: { row: CockpitRow }) {
  switch (row.kind) {
    case "reasoning":
      return row.text ? (
        <p className="mt-0.5 whitespace-pre-wrap text-sm italic text-muted">
          {row.text}
        </p>
      ) : null;

    case "message":
      return row.text ? (
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/90">
          {row.text}
        </p>
      ) : null;

    case "tool":
      return row.preview ? (
        <p className="mt-0.5 truncate font-mono text-xs text-muted">{row.preview}</p>
      ) : null;

    case "diff":
      return (
        <div className="mt-1">
          {row.path && (
            <p className="font-mono text-xs text-emerald-300/90">{row.path}</p>
          )}
          {row.patch && (
            <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-surface-2/60 p-2 font-mono text-[11px] leading-relaxed">
              {row.patch.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+") && !line.startsWith("+++")
                      ? "text-emerald-300"
                      : line.startsWith("-") && !line.startsWith("---")
                        ? "text-rose-300"
                        : "text-muted"
                  }
                >
                  {line || " "}
                </div>
              ))}
            </pre>
          )}
        </div>
      );

    case "terminal":
      return row.text ? (
        <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-border bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-sky-200/90">
          {row.text}
        </pre>
      ) : null;

    case "header":
      return (
        <p className="mt-0.5 text-xs text-muted">
          {row.model && <span className="font-mono">{row.model}</span>}
          {row.tools?.length ? <span> · {row.tools.length} tools</span> : null}
          {row.mcpServers?.length ? (
            <span> · {row.mcpServers.length} MCP</span>
          ) : null}
        </p>
      );

    case "approval":
      return (
        <p className="mt-0.5 text-xs text-muted">
          {row.responded ? (
            <>
              responded: <span className="text-foreground/80">{row.choice}</span>
            </>
          ) : (
            <>awaiting approval{row.choices?.length ? `: ${row.choices.join(" · ")}` : ""}</>
          )}
        </p>
      );

    case "lifecycle":
      return (
        <div className="mt-0.5 text-xs">
          {typeof row.error === "string" && (
            <p className="text-rose-300">{row.error}</p>
          )}
          {row.output && (
            <p className="line-clamp-3 whitespace-pre-wrap text-muted">{row.output}</p>
          )}
        </div>
      );

    default:
      return row.text ? (
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted">{row.text}</p>
      ) : null;
  }
}
