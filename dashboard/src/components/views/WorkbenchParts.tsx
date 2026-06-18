"use client";

// WorkbenchParts — internal sub-components for WorkbenchView (U4, Wave 3).
// Kept in a separate file so WorkbenchView stays under 500 lines.
// NOT a public API — only WorkbenchView imports from here.

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";
import { GlowCard } from "@/components/ui/GlowCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { LAYER_VARIANTS, LAYER_ITEM } from "@/lib/aurora";
import type { ToolInput, ToolStage } from "@/lib/tools";
import type { CockpitRow } from "@/lib/cockpit";

// ---------------------------------------------------------------------------
// StepRail
// ---------------------------------------------------------------------------

export interface StepRailProps {
  steps: ToolStage[];
  activeIdx: number;
}

export function StepRail({ steps, activeIdx }: StepRailProps) {
  const reduced = useReducedMotion();

  return (
    <nav aria-label="Tool steps" className="flex flex-col gap-2 min-w-[200px]">
      {steps.map((step, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;

        return (
          <GlowCard
            key={step.id}
            as="div"
            glow={isActive ? "md" : "sm"}
            active={isActive}
            className="flex items-start gap-3 px-3 py-2.5"
          >
            <span className="mt-0.5 shrink-0" aria-hidden>
              {isDone ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : isActive ? (
                <motion.span
                  animate={reduced ? {} : { opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                >
                  <Circle className="h-4 w-4 text-[var(--accent)]" />
                </motion.span>
              ) : (
                <Circle className="h-4 w-4" style={{ color: "var(--muted)" }} />
              )}
            </span>
            <div className="min-w-0">
              <p
                className="text-xs font-medium leading-snug"
                style={{ color: isActive ? "var(--foreground)" : "var(--muted)" }}
              >
                {step.title}
              </p>
              {step.hitl && (
                <span className="text-[10px] text-amber-400 font-medium">
                  Human review
                </span>
              )}
            </div>
          </GlowCard>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// InputForm
// ---------------------------------------------------------------------------

const INPUT_BASE = [
  "w-full rounded-lg px-3 py-2 text-sm",
  "bg-transparent border transition-colors duration-150",
  "placeholder:text-[var(--muted)] text-[var(--foreground)]",
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]",
  "border-[var(--glass-border)] focus:border-[var(--accent)]/60",
].join(" ");

export interface InputFormProps {
  inputs: ToolInput[];
  values: Record<string, string>;
  onChange: (id: string, val: string) => void;
  onRun: () => void;
  running: boolean;
}

export function InputForm({ inputs, values, onChange, onRun, running }: InputFormProps) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!running) onRun();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {inputs.map((input) => (
        <div key={input.id} className="flex flex-col gap-1.5">
          <label
            htmlFor={`wb-input-${input.id}`}
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--muted)" }}
          >
            {input.label}
            {input.required && <span className="text-rose-400 ml-1">*</span>}
          </label>

          {input.type === "textarea" ? (
            <textarea
              id={`wb-input-${input.id}`}
              rows={4}
              value={values[input.id] ?? ""}
              onChange={(e) => onChange(input.id, e.target.value)}
              required={input.required}
              disabled={running}
              className={[INPUT_BASE, "resize-y"].join(" ")}
            />
          ) : input.type === "select" ? (
            <select
              id={`wb-input-${input.id}`}
              value={values[input.id] ?? ""}
              onChange={(e) => onChange(input.id, e.target.value)}
              required={input.required}
              disabled={running}
              className={INPUT_BASE}
              style={{ background: "var(--glass-bg)" }}
            >
              <option value="">Select…</option>
              {(input.options ?? []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : input.type === "file" || input.type === "file[]" ? (
            <input
              id={`wb-input-${input.id}`}
              type="file"
              multiple={input.type === "file[]"}
              onChange={(e) => onChange(input.id, e.target.value)}
              disabled={running}
              className={[INPUT_BASE, "cursor-pointer file:cursor-pointer"].join(" ")}
            />
          ) : (
            <input
              id={`wb-input-${input.id}`}
              type="text"
              value={values[input.id] ?? ""}
              onChange={(e) => onChange(input.id, e.target.value)}
              required={input.required}
              disabled={running}
              placeholder={input.label}
              className={INPUT_BASE}
            />
          )}
        </div>
      ))}

      <RunButton running={running} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// RunButton — shared by InputForm and the no-inputs path
// ---------------------------------------------------------------------------

export function RunButton({ running, onClick }: { running: boolean; onClick?: () => void }) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      disabled={running}
      onClick={onClick}
      className={[
        "cursor-pointer w-full flex items-center justify-center gap-2 rounded-full py-2.5",
        "text-sm font-semibold uppercase tracking-wide border transition-colors duration-150",
        running
          ? "opacity-50 cursor-not-allowed bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20"
          : "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40 hover:bg-[var(--accent)]/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      ].join(" ")}
    >
      {running ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Play className="h-4 w-4" aria-hidden />
      )}
      {running ? "Running…" : "Run"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// RunPane — event trace
// ---------------------------------------------------------------------------

const ROW_COLOR: Partial<Record<string, string>> = {
  message:   "var(--foreground)",
  reasoning: "var(--muted)",
  tool:      "var(--aurora-teal)",
  subagent:  "var(--aurora-indigo)",
  diff:      "var(--aurora-violet)",
  approval:  "#f59e0b",
  lifecycle: "var(--foreground)",
  header:    "var(--muted)",
  terminal:  "var(--muted)",
  raw:       "var(--muted)",
};

function RowLine({ row }: { row: CockpitRow }) {
  const color = ROW_COLOR[row.kind] ?? "var(--muted)";

  if (row.kind === "tool") {
    const icon =
      row.status === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" style={{ color }} aria-hidden />
      ) : row.status === "error" ? (
        <XCircle className="h-3 w-3 shrink-0 text-rose-400" aria-hidden />
      ) : (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden />
      );
    return (
      <div className="flex items-start gap-2 font-mono text-xs">
        {icon}
        <span style={{ color }}>
          {row.tool}
          {row.preview ? ` — ${row.preview}` : ""}
          {row.duration != null ? ` (${row.duration}ms)` : ""}
        </span>
      </div>
    );
  }
  if (row.kind === "diff") {
    return <p className="font-mono text-xs" style={{ color }}>diff {row.path}</p>;
  }
  if (row.kind === "lifecycle") {
    return (
      <p className="font-mono text-xs font-semibold" style={{ color }}>
        {row.event}{typeof row.error === "string" ? ` — ${row.error}` : ""}
      </p>
    );
  }
  if (row.kind === "approval") {
    return (
      <p className="font-mono text-xs" style={{ color: "#f59e0b" }}>
        approval: {row.responded
          ? `responded (${row.choice})`
          : `waiting — ${(row.choices ?? []).join(" / ")}`}
      </p>
    );
  }
  const txt = row.text ?? row.event ?? "";
  if (!txt) return null;
  return (
    <p className="font-mono text-xs whitespace-pre-wrap break-words" style={{ color }}>
      {txt}
    </p>
  );
}

export interface RunPaneProps {
  rows: CockpitRow[];
  isRunning: boolean;
}

export function RunPane({ rows, isRunning }: RunPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRunning) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [rows.length, isRunning]);

  if (rows.length === 0) return null;

  return (
    <GlassCard className="p-4 max-h-64 overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <RowLine key={row.id} row={row} />
        ))}
      </div>
      <div ref={bottomRef} />
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// ArtifactStage
// ---------------------------------------------------------------------------

export interface ArtifactStageProps {
  rows: CockpitRow[];
  activeStep: ToolStage | undefined;
}

export function ArtifactStage({ rows, activeStep }: ArtifactStageProps) {
  const artifactRows = rows.filter(
    (r) => r.kind === "lifecycle" && r.event === "run.completed" && r.output,
  );
  const isIframe = activeStep?.ui === "artifact-iframe";
  const iframeOutput = artifactRows[0]?.output;

  if (artifactRows.length === 0 && !isIframe) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--muted)" }}
      >
        Artifacts
      </h3>

      {isIframe && iframeOutput ? (
        <GlassCard className="overflow-hidden rounded-xl">
          <iframe
            title="Tool artifact"
            srcDoc={iframeOutput}
            sandbox="allow-scripts"
            className="w-full h-64 border-0"
          />
        </GlassCard>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-3"
          variants={LAYER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {artifactRows.map((row) => (
            <motion.div key={row.id} variants={LAYER_ITEM}>
              <GlowCard as="div" glow="sm" className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} aria-hidden />
                <p className="text-xs font-mono truncate flex-1" style={{ color: "var(--foreground)" }}>
                  {row.output ?? "artifact"}
                </p>
              </GlowCard>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
