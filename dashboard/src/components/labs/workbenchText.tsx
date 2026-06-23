import type { RunEvent } from "@/lib/labs/toolsClient";

// Lightweight markdown-ish rendering shared by the Workbench chat + previews:
// bold (**x**) and inline code (`x`), newlines preserved. Dependency-free, and
// reads nicely for agent prose. Mirrors RefineChat's renderer.
export function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[12px] text-[#a78bfa]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// The event kind, normalized. The engine carries it in `event`; older/non-engine
// frames may use `type`.
export function eventKind(event: RunEvent): string {
  return (event.event ?? event.type ?? "").toLowerCase();
}

// Streamed assistant text — the actual reply prose (message.delta carries it in
// `delta`). Returns "" for every other frame so callers append only real text.
export function deltaText(event: RunEvent): string {
  if (eventKind(event) === "message.delta") {
    return typeof event.delta === "string" ? event.delta : "";
  }
  return "";
}

// The agent's thinking (reasoning.available). Shown muted/aside, never merged
// into the reply.
export function reasoningText(event: RunEvent): string {
  if (eventKind(event) === "reasoning.available") {
    return typeof event.text === "string" ? event.text : "";
  }
  return "";
}

// A friendly tool-activity label for tool.started/tool.completed — or "" to skip
// (the "trace" pseudo-tool is raw CLI stream-json noise and must never render).
export function toolActivity(event: RunEvent): string {
  const kind = eventKind(event);
  if (kind !== "tool.started" && kind !== "tool.completed") return "";
  const tool = typeof event.tool === "string" ? event.tool.trim() : "";
  if (!tool || tool.toLowerCase() === "trace") return "";
  const preview = typeof event.preview === "string" ? event.preview.trim() : "";
  return preview ? `${tool} · ${preview}` : tool;
}

// Terminal classification from the run.* kinds.
export function terminalState(event: RunEvent): "done" | "failed" | "cancelled" | null {
  switch (eventKind(event)) {
    case "run.completed":
      return "done";
    case "run.failed":
      return "failed";
    case "run.cancelled":
      return "cancelled";
    default:
      return null;
  }
}

// Text attached to a terminal event: the final reply (run.completed.output) or
// the failure detail (run.failed).
export function terminalText(event: RunEvent): string {
  const kind = eventKind(event);
  if (kind === "run.failed") {
    return (
      (typeof event.error === "string" && event.error) ||
      (typeof event.text === "string" && event.text) ||
      "The run failed."
    );
  }
  if (kind === "run.completed") {
    return (
      (typeof event.output === "string" && event.output) ||
      (typeof event.text === "string" && event.text) ||
      ""
    );
  }
  return "";
}

// A run.completed whose `output` is really an error string (e.g. the CLI's
// "Unknown command: /foo") rather than a reply.
export function looksLikeError(text: string): boolean {
  return /^\s*(unknown command|error:|usage:)/i.test(text);
}

// Block-level markdown for streamed agent prose: headings (#/##/###), bullet and
// numbered lists, and paragraphs — each line's inline spans via renderInline.
// Dependency-free; tolerant of partial/streaming input.
export function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items;
    const ordered = list.ordered;
    blocks.push(
      ordered ? (
        <ol key={key++} className="my-1 list-decimal space-y-0.5 pl-5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key++} className="my-1 list-disc space-y-0.5 pl-5">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet) {
      if (list && list.ordered) flushList();
      list = list ?? { ordered: false, items: [] };
      list.items.push(bullet[1]);
      continue;
    }
    if (numbered) {
      if (list && !list.ordered) flushList();
      list = list ?? { ordered: true, items: [] };
      list.items.push(numbered[1]);
      continue;
    }
    flushList();

    if (heading) {
      blocks.push(
        <p key={key++} className="mt-2 mb-0.5 text-[13px] font-semibold text-white/90">
          {renderInline(heading[2])}
        </p>,
      );
      continue;
    }
    if (line.trim() === "") {
      blocks.push(<div key={key++} className="h-2" />);
      continue;
    }
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return blocks;
}

// Human-readable file size for artifact cards.
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// Crude glob → RegExp for matching a step's expected artifact name (supports `*`).
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

// True if a relpath/name matches any of the step's declared artifact globs.
export function matchesGlobs(value: string, globs: string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => globToRegExp(g).test(value));
}
