// Glass Cockpit row model + reducer.
//
// The raw RunEvent stream is fine-grained (many tiny `message.delta` /
// `reasoning.available` / `terminal` chunks). For a legible "watch Claude work"
// timeline we coalesce consecutive text chunks into single growing rows and pair
// tool.started/completed (and subagent start/complete) into one stateful row.
//
// `reduceRows` is PURE and immutable — it returns a new array — so it is unit
// testable and free of React concerns.

import type { RunEvent } from "./types";

export type CockpitRowKind =
  | "header"
  | "reasoning"
  | "message"
  | "tool"
  | "diff"
  | "terminal"
  | "subagent"
  | "approval"
  | "lifecycle"
  | "raw";

export type ToolStatus = "running" | "done" | "error";

export interface CockpitRow {
  id: string;
  kind: CockpitRowKind;
  ts: number;
  // text rows (reasoning / message / terminal)
  text?: string;
  // tool
  tool?: string;
  preview?: string;
  status?: ToolStatus;
  duration?: number;
  // diff
  path?: string;
  patch?: string;
  // subagent
  subagentType?: string;
  spanId?: string;
  // approval
  choices?: string[];
  choice?: string;
  responded?: boolean;
  // header
  model?: string;
  tools?: string[];
  mcpServers?: string[];
  // lifecycle / raw
  event?: string;
  output?: string;
  error?: boolean | string;
  usage?: Record<string, unknown>;
}

const TEXT_COALESCE: Record<string, CockpitRowKind> = {
  "message.delta": "message",
  "reasoning.available": "reasoning",
  "terminal": "terminal",
};

function last(rows: CockpitRow[]): CockpitRow | undefined {
  return rows.length ? rows[rows.length - 1] : undefined;
}

/** Replace the row at index `i` with `next` (immutable). */
function replaceAt(rows: CockpitRow[], i: number, next: CockpitRow): CockpitRow[] {
  return rows.map((r, idx) => (idx === i ? next : r));
}

/**
 * Fold one RunEvent into the row list. `id` is a freshly-unique id used only
 * when a new row is created (coalesced updates reuse the existing row's id).
 */
export function reduceRows(
  rows: CockpitRow[],
  ev: RunEvent,
  id: string,
): CockpitRow[] {
  const ts = ev.timestamp || Date.now();

  // 1) Coalesce streaming text into the trailing row of the same kind.
  const textKind = TEXT_COALESCE[ev.event];
  if (textKind) {
    const tail = last(rows);
    const chunk = ev.text ?? "";
    if (tail && tail.kind === textKind) {
      return replaceAt(rows, rows.length - 1, {
        ...tail,
        text: (tail.text ?? "") + chunk,
        ts,
      });
    }
    return [...rows, { id, kind: textKind, text: chunk, ts }];
  }

  switch (ev.event) {
    case "run.header":
      return [
        ...rows,
        {
          id,
          kind: "header",
          ts,
          model: ev.model,
          tools: ev.tools,
          mcpServers: ev.mcpServers,
        },
      ];

    case "tool.started":
      return [
        ...rows,
        {
          id,
          kind: "tool",
          ts,
          tool: ev.tool,
          preview: ev.preview,
          status: "running",
        },
      ];

    case "tool.completed": {
      // Pair with the most recent still-running tool row.
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.kind === "tool" && r.status === "running") {
          const failed = ev.error === true || typeof ev.error === "string";
          return replaceAt(rows, i, {
            ...r,
            status: failed ? "error" : "done",
            duration: ev.duration,
            preview: ev.preview ?? r.preview,
            ts,
          });
        }
      }
      // No matching start — surface it standalone.
      return [
        ...rows,
        { id, kind: "tool", ts, tool: ev.tool, status: "done", duration: ev.duration },
      ];
    }

    case "diff":
      return [...rows, { id, kind: "diff", ts, path: ev.path, patch: ev.patch }];

    case "subagent.started":
      return [
        ...rows,
        {
          id,
          kind: "subagent",
          ts,
          subagentType: ev.subagentType,
          spanId: ev.spanId,
          status: "running",
        },
      ];

    case "subagent.completed": {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.kind === "subagent" && r.status === "running" &&
            (!ev.spanId || r.spanId === ev.spanId)) {
          return replaceAt(rows, i, { ...r, status: "done", ts });
        }
      }
      return [
        ...rows,
        { id, kind: "subagent", ts, subagentType: ev.subagentType, status: "done" },
      ];
    }

    case "approval.request":
      return [
        ...rows,
        { id, kind: "approval", ts, choices: ev.choices, responded: false },
      ];

    case "approval.responded": {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.kind === "approval" && !r.responded) {
          return replaceAt(rows, i, { ...r, choice: ev.choice, responded: true, ts });
        }
      }
      return [...rows, { id, kind: "approval", ts, choice: ev.choice, responded: true }];
    }

    case "run.completed":
    case "run.failed":
    case "run.cancelled":
      return [
        ...rows,
        {
          id,
          kind: "lifecycle",
          ts,
          event: ev.event,
          output: ev.output,
          error: ev.error,
          usage: ev.usage,
        },
      ];

    default:
      // Unknown kind — render generically, never drop.
      return [...rows, { id, kind: "raw", ts, event: ev.event, text: ev.text }];
  }
}

/** Terminal run states that close the cockpit's busy indicator. */
export const TERMINAL_EVENTS = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
]);
