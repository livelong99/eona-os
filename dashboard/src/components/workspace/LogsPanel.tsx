import { useEffect, useRef, useState } from "react";
import { Hammer, Play, FlaskConical, Square, Trash2, X, Loader, Terminal } from "lucide-react";
import { runScript, stopScript, type ScriptKind, type ScriptLine } from "@/lib/workspace/workspaceClient";

interface LogEntry {
  text: string;
  tone: "out" | "exit-ok" | "exit-bad" | "meta";
}

interface Props {
  slug: string;
  scripts?: { build?: string; run?: string; test?: string };
  /** Kick off this script once on mount (e.g. opened from a card's Build button). */
  autoStart?: ScriptKind;
  onClose: () => void;
}

const ACTIONS: { kind: ScriptKind; label: string; icon: typeof Hammer; color: string }[] = [
  { kind: "build", label: "Build", icon: Hammer, color: "#7c9cff" },
  { kind: "run", label: "Run", icon: Play, color: "#34d399" },
  { kind: "test", label: "Test", icon: FlaskConical, color: "#f4c14d" },
];

// LogsPanel — Build / Run / Test the workspace via its provisioned scripts, with
// live streamed output. The script tree is killed when stopped or the stream ends.
export function LogsPanel({ slug, scripts, autoStart, onClose }: Props) {
  const [running, setRunning] = useState<ScriptKind | null>(null);
  const [lines, setLines] = useState<LogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Optionally kick off a script once on mount.
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void start(autoStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Cap retained lines to a ring buffer so a chatty/long-running script (e.g. a
  // dev server) can't grow the array unbounded and jank the UI.
  const MAX_LINES = 2000;
  const push = (text: string, tone: LogEntry["tone"] = "out") =>
    setLines((prev) => {
      const next = [...prev, { text, tone }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });

  const start = async (kind: ScriptKind) => {
    if (running) return;
    setRunning(kind);
    setLines([{ text: `$ scripts/${kind}.sh`, tone: "meta" }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await runScript(slug, kind, {
        signal: controller.signal,
        onLine: (l: ScriptLine) => {
          if (l.type === "line") push(l.text ?? "");
          else if (l.type === "exit")
            push(`— exited with code ${l.code}`, l.code === 0 ? "exit-ok" : "exit-bad");
          else if (l.type === "error") push(`error: ${l.detail ?? "unknown"}`, "exit-bad");
        },
      });
    } catch (e) {
      if (!controller.signal.aborted) push(e instanceof Error ? e.message : "failed to run", "exit-bad");
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  };

  const stop = async () => {
    if (!running) return;
    await stopScript(slug, running);
    abortRef.current?.abort();
    push("— stopped", "meta");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
        <Terminal className="h-4 w-4 text-white/45" />
        <span className="text-[12px] font-medium text-white/60">Build · Run · Test</span>
        <div className="ml-2 flex items-center gap-1.5">
          {ACTIONS.map(({ kind, label, icon: Icon, color }) => {
            // When scripts are unknown (no manifest), allow the attempt — the
            // engine 404s with a clear message if the script isn't authored.
            const available = scripts ? Boolean(scripts[kind]) : true;
            const isRunning = running === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => start(kind)}
                disabled={!!running || !available}
                title={available ? `Run scripts/${kind}.sh` : `scripts/${kind}.sh not authored yet`}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[12px] font-medium transition-colors disabled:opacity-35 cursor-pointer hover:bg-white/[0.06]"
                style={{ color }}
              >
                {isRunning ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {running && (
            <button type="button" onClick={stop}
              className="flex items-center gap-1 rounded-lg border border-[#f87171]/30 px-2 py-1 text-[11.5px] font-medium text-[#f87171] transition-colors hover:bg-[#f87171]/10 cursor-pointer">
              <Square className="h-3 w-3" /> Stop
            </button>
          )}
          <button type="button" onClick={() => setLines([])} title="Clear"
            className="grid h-7 w-7 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/10 cursor-pointer">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} title="Close"
            className="grid h-7 w-7 place-items-center rounded-lg text-white/45 transition-colors hover:bg-white/10 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed" style={{ background: "rgba(0,0,0,0.3)" }}>
        {lines.length === 0 ? (
          <p className="py-6 text-center text-white/30">Run Build, Run, or Test to see live logs.</p>
        ) : (
          lines.map((l, i) => (
            <pre key={i} className="whitespace-pre-wrap break-words"
              style={{
                color:
                  l.tone === "exit-ok" ? "#34d399" : l.tone === "exit-bad" ? "#f87171"
                  : l.tone === "meta" ? "#8a8fa3" : "rgba(255,255,255,0.8)",
              }}>
              {l.text}
            </pre>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
