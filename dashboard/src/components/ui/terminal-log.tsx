import { useEffect, useRef } from "react";
import type { LogEvent } from "@/lib/workspace-detail";

interface TerminalLogProps {
  events: LogEvent[];
  /** Show a blinking cursor at the end (session still streaming). */
  live?: boolean;
}

// Per-tool dot color — mirrors the feel of the Claude Code CLI's tool markers.
const TOOL_COLOR: Record<string, string> = {
  Bash: "#34d399",
  Read: "#4f8cff",
  Edit: "#f4c14d",
  Write: "#a78bfa",
  Grep: "#22d3ee",
  Glob: "#22d3ee",
};

function toolColor(tool?: string): string {
  return (tool && TOOL_COLOR[tool]) || "#8a8fa3";
}

// TerminalLog — renders a Claude-style execution transcript: user prompts, tool
// calls (● Tool(args)), indented results (⎿ …), assistant text, thinking, and
// errors. Monospace, dim timestamp gutter, auto-scrolls to the latest line.
export function TerminalLog({ events, live = false }: TerminalLogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [events]);

  return (
    <div className="h-full overflow-y-auto px-5 py-4 font-mono text-[12.5px] leading-relaxed">
      {events.map((e) => (
        <LogRow key={e.id} event={e} />
      ))}
      {live && (
        <div className="mt-1 flex items-center gap-2 pl-[4.5rem]">
          <span className="inline-block h-3.5 w-2 animate-pulse bg-[#34d399]" />
          <span className="text-white/30">streaming…</span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function LogRow({ event }: { event: LogEvent }) {
  return (
    <div className="flex gap-3 py-[3px]">
      <span className="w-14 shrink-0 select-none pt-px text-right text-[10.5px] tabular-nums text-white/25">
        {event.time}
      </span>
      <div className="min-w-0 flex-1">
        <RowBody event={event} />
      </div>
    </div>
  );
}

function RowBody({ event }: { event: LogEvent }) {
  switch (event.kind) {
    case "user":
      return (
        <div className="flex gap-2 rounded-md bg-white/[0.05] px-3 py-1.5 text-white/85">
          <span className="select-none text-[#5227FF]">{">"}</span>
          <span className="whitespace-pre-wrap break-words">{event.text}</span>
        </div>
      );

    case "thinking":
      return (
        <p className="flex gap-2 italic text-white/40">
          <span className="select-none not-italic">✻</span>
          <span className="whitespace-pre-wrap break-words">{event.text}</span>
        </p>
      );

    case "assistant":
      return (
        <p className="whitespace-pre-wrap break-words text-white/85">{event.text}</p>
      );

    case "tool":
      return (
        <p className="flex gap-2 break-words text-white/90">
          <span
            className="select-none"
            style={{ color: toolColor(event.tool) }}
          >
            ●
          </span>
          <span>
            <span className="font-semibold text-white">{event.tool}</span>
            <span className="text-white/55">(</span>
            <span className="text-white/80">{event.text}</span>
            <span className="text-white/55">)</span>
          </span>
        </p>
      );

    case "result":
      return (
        <div className="flex gap-2 text-white/45">
          <span className="select-none text-white/30">⎿</span>
          <span className="whitespace-pre-wrap break-words">{event.text}</span>
        </div>
      );

    case "error":
      return (
        <div className="flex gap-2 text-[#f4694d]">
          <span className="select-none">⎿</span>
          <span className="whitespace-pre-wrap break-words">{event.text}</span>
        </div>
      );

    default:
      return <p className="text-white/70">{event.text}</p>;
  }
}
