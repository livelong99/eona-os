"use client";

// Trust Rail — approval surface. Polls GET /v1/approvals for pending approvals
// aggregated across active runs (real choices: once|session|always|deny) and
// resolves each via POST /v1/runs/{runId}/approval, relaying the decision to the
// waiting agent. Empty state when nothing is pending.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlowCard } from "@/components/ui/GlowCard";
import { CascadeHeading } from "@/components/ui/CascadeHeading";
import { EmptyState } from "@/components/ui/EmptyState";
import { SPRING_GENTLE } from "@/lib/aurora";
import { getApprovals, respondApproval } from "@/lib/hermes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApprovalItem {
  id: string;
  runId: string;
  text?: string;
  /** choices[] from event if available; defaults to ["Approve","Deny"]. */
  choices: string[];
  respondedChoice?: string;
  ts: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Relative-time label, e.g. "2m ago", "just now". */
function relTime(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ---------------------------------------------------------------------------
// Approval card — pending
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  item: ApprovalItem;
  onRespond: (item: ApprovalItem, choice: string) => void;
}

function PendingCard({ item, onRespond }: ApprovalCardProps) {
  const [ts, setTs] = useState(() => relTime(item.ts));

  // Tick relative timestamp every 30s.
  useEffect(() => {
    const t = setInterval(() => setTs(relTime(item.ts)), 30_000);
    return () => clearInterval(t);
  }, [item.ts]);

  function choiceStyle(i: number, total: number): string {
    if (i === 0) {
      // First choice: violet (primary confirm)
      return [
        "rounded-full px-3 py-1 text-xs font-semibold border",
        "bg-[var(--accent)]/20 text-[var(--accent)] border-[var(--accent)]/40",
        "hover:bg-[var(--accent)]/30 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
      ].join(" ");
    }
    if (i === total - 1 && total > 1) {
      // Last choice: rose (destructive / deny)
      return [
        "rounded-full px-3 py-1 text-xs font-semibold border",
        "bg-rose-500/15 text-rose-300 border-rose-500/30",
        "hover:bg-rose-500/25 transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400",
      ].join(" ");
    }
    // Middle choices: sky
    return [
      "rounded-full px-3 py-1 text-xs font-semibold border",
      "bg-sky-500/15 text-sky-300 border-sky-500/30",
      "hover:bg-sky-500/25 transition-colors duration-150",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400",
    ].join(" ");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={SPRING_GENTLE}
      layout
    >
      <GlassCard glow className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          <span className="text-xs font-semibold text-amber-300 uppercase tracking-wide">
            Approval Requested
          </span>
          <span className="ml-auto text-[11px] text-muted">{ts}</span>
        </div>

        {/* Body */}
        {item.text && (
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {item.text}
          </p>
        )}

        {/* Run ID context */}
        <p className="text-[11px] font-mono text-muted">
          run {item.runId}
        </p>

        {/* Choice buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {item.choices.map((choice, i) => (
            <button
              key={choice}
              onClick={() => onRespond(item, choice)}
              className={choiceStyle(i, item.choices.length)}
            >
              {choice}
            </button>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Resolved card — compact
// ---------------------------------------------------------------------------

function ResolvedCard({ item }: { item: ApprovalItem }) {
  return (
    <GlowCard
      as="div"
      glow="sm"
      className="flex items-center gap-3 px-4 py-2.5"
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--muted)" }}>
        {item.text ?? `Run ${item.runId}`}
      </p>
      <span
        className={[
          "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        ].join(" ")}
      >
        {item.respondedChoice}
      </span>
    </GlowCard>
  );
}

// ---------------------------------------------------------------------------
// useApprovals hook
// ---------------------------------------------------------------------------

const MAX_RESOLVED = 20;
const POLL_MS = 3000;

function useApprovals() {
  const [pending, setPending] = useState<ApprovalItem[]>([]);
  const [resolved, setResolved] = useState<ApprovalItem[]>([]);
  // ids we've responded to locally — filtered out of incoming polls until the
  // backend clears them, so an optimistically-resolved card doesn't flicker back.
  const respondedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const { approvals } = await getApprovals();
      if (!active) return;
      setPending(approvals.filter((a) => !respondedIds.current.has(a.id)));
      timer = setTimeout(poll, POLL_MS);
    }
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const respond = useCallback(async (item: ApprovalItem, choice: string) => {
    respondedIds.current.add(item.id);
    setPending((prev) => prev.filter((p) => p.id !== item.id));
    setResolved((r) =>
      [{ ...item, respondedChoice: choice }, ...r].slice(0, MAX_RESOLVED),
    );
    await respondApproval(item.runId, choice);
  }, []);

  return { pending, resolved, respond };
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function TrustRailView() {
  const { pending, resolved, respond } = useApprovals();

  return (
    <div className="flex flex-col h-full px-8 py-7 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <CascadeHeading
          text="Trust Rail"
          subtitle="Agent approval requests"
          level={1}
        />
        {pending.length > 0 && (
          <span
            className={[
              "self-start mt-1 ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold",
              "bg-amber-500/20 text-amber-300 border border-amber-500/30",
            ].join(" ")}
          >
            {pending.length} pending
          </span>
        )}
      </div>

      {/* Empty state */}
      {pending.length === 0 && resolved.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<ShieldCheck />}
            title="No pending approvals"
            hint="Approval requests from running agents appear here."
            className="max-w-sm"
          />
        </div>
      )}

      {/* Pending section */}
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-amber-400">
            Pending
          </h2>
          <div className="flex flex-col gap-3 max-w-2xl">
            <AnimatePresence initial={false}>
              {pending.map((item) => (
                <PendingCard key={item.id} item={item} onRespond={respond} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {/* Resolved section */}
      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Resolved
          </h2>
          <div className="flex flex-col gap-2 max-w-2xl">
            {resolved.map((item) => (
              <ResolvedCard key={`${item.id}-resolved`} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
