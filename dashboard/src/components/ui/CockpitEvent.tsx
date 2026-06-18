"use client";

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

interface CockpitEventProps {
  row: CockpitRow;
}

interface Visual {
  Icon: LucideIcon;
  /** tailwind text-color class for the gutter icon */
  tint: string;
  label: string;
}

function visualFor(row: CockpitRow): Visual {
  switch (row.kind) {
    case "header":
      return { Icon: Radio, tint: "text-aurora-teal", label: "Run started" };
    case "reasoning":
      return { Icon: Brain, tint: "text-violet-300", label: "Thinking" };
    case "message":
      return { Icon: MessageSquare, tint: "text-foreground/70", label: "Claude" };
    case "tool":
      return { Icon: Wrench, tint: "text-amber-300", label: row.tool ?? "Tool" };
    case "diff":
      return { Icon: FileDiff, tint: "text-emerald-300", label: "Edit" };
    case "terminal":
      return { Icon: TerminalIcon, tint: "text-sky-300", label: "Terminal" };
    case "subagent":
      return { Icon: Users, tint: "text-fuchsia-300", label: "Sub-agent" };
    case "approval":
      return { Icon: ShieldAlert, tint: "text-orange-300", label: "Approval" };
    case "lifecycle":
      return row.event === "run.completed"
        ? { Icon: CheckCircle2, tint: "text-emerald-400", label: "Completed" }
        : { Icon: XCircle, tint: "text-rose-400", label: "Ended" };
    default:
      return { Icon: CircleDot, tint: "text-muted", label: row.event ?? "Event" };
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
  const { Icon, tint, label } = visualFor(row);

  return (
    <li className="flex gap-3">
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
    </li>
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
                  {line || " "}
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
