import { Webhook, Settings2, CircleCheck, TriangleAlert, ExternalLink } from "lucide-react";
import { logoUrl } from "@/lib/integrations";
import {
  type IntegrationView,
  type DisplayStatus,
  STATUS_META,
  displayStatus,
} from "@/lib/integrations/view";
import { Toggle } from "@/components/control/primitives";

interface IntegrationCardProps {
  integration: IntegrationView;
  /** Enable/disable a configured platform; busy disables the toggle. */
  onToggleEnabled: (uiId: string, enabled: boolean) => void;
  onManage: (uiId: string) => void;
  busy?: boolean;
}

// IntegrationCard — one channel/service tile. Brand logo, live status, and an
// honest action: configured platforms get an Enable/Disable toggle; unconfigured
// ones get a muted "Add <ENV> to enable" hint; hard ones get a docs link; MCP
// items show configured/not-configured (no toggle the engine can't honor).
export function IntegrationCard({ integration: it, onToggleEnabled, onManage, busy }: IntegrationCardProps) {
  const e = it.engine;
  const status = displayStatus(it);
  const meta = STATUS_META[status];
  const url = logoUrl(it);

  const isPlatform = e?.kind === "platform";
  const isMcp = e?.kind === "mcp";
  const configured = !!e?.configured;
  const missingEnv = e?.missingEnv ?? [];

  return (
    <div className="group relative flex flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.05]">
      {/* accent glow */}
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-30" style={{ background: it.color }} />

      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
          {url ? (
            <img src={url} alt={it.name} className="h-6 w-6" />
          ) : (
            <Webhook className="h-5 w-5" style={{ color: it.color }} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold text-white">{it.name}</h3>
          <span className="text-[11px] font-medium uppercase tracking-wide text-white/35">{it.category}</span>
        </div>
        <StatusDot status={status} color={meta.color} />
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.4em] text-[12.5px] leading-relaxed text-white/50">
        {it.desc}
      </p>

      {configured && e?.account && (
        <p className="mt-2 truncate font-mono text-[11px] text-white/40">{e.account}</p>
      )}

      {/* Accurate setup instruction for integrations whose credential isn't a
          single env var (WhatsApp QR pairing, Gmail OAuth MCP, …). */}
      {it.setupHint && status !== "connected" && (
        <p className="mt-2 text-[11.5px] leading-snug text-[#a78bfa]/85">
          {it.setupHint}
          {it.docs && (
            <>
              {" "}
              <a href={it.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[#a78bfa] underline decoration-white/20 underline-offset-2 hover:decoration-white/50">
                docs<ExternalLink className="h-2.5 w-2.5" />
              </a>
            </>
          )}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: meta.color }}>
          {status === "connected" && <CircleCheck className="h-3.5 w-3.5" />}
          {status === "error" && <TriangleAlert className="h-3.5 w-3.5" />}
          {statusLabel(status, isMcp, configured)}
        </span>

        <CardAction
          it={it}
          configured={configured}
          isPlatform={isPlatform}
          isMcp={isMcp}
          missingEnv={missingEnv}
          enabled={!!e?.enabled}
          busy={busy}
          onToggleEnabled={onToggleEnabled}
          onManage={onManage}
        />
      </div>
    </div>
  );
}

// Status text shown bottom-left — tuned per kind so MCP items don't say "Enable".
function statusLabel(status: DisplayStatus, isMcp: boolean, configured: boolean): string {
  if (isMcp) return configured ? "Configured" : "Not configured";
  return STATUS_META[status].label;
}

interface CardActionProps {
  it: IntegrationView;
  configured: boolean;
  isPlatform: boolean;
  isMcp: boolean;
  missingEnv: string[];
  enabled: boolean;
  busy?: boolean;
  onToggleEnabled: (uiId: string, enabled: boolean) => void;
  onManage: (uiId: string) => void;
}

// The bottom-right action — the honest part. We only ever show a control the
// engine can actually fulfill for this integration.
function CardAction({
  it, configured, isPlatform, isMcp, missingEnv, enabled, busy, onToggleEnabled, onManage,
}: CardActionProps) {
  // Hard integrations (whatsapp/signal/teams/googlechat) need a bridge/manual
  // setup we can't trigger from here — point at the docs instead of faking a button.
  if (it.setup === "hard" && !configured) {
    return (
      <a
        href={it.docs ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.08] cursor-pointer"
      >
        Needs setup
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  // Configured platform → real Enable/Disable toggle (round-trips to the engine).
  if (isPlatform && configured) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onManage(it.id)}
          className="grid h-7 w-7 place-items-center rounded-lg border border-white/12 bg-white/[0.05] text-white/70 transition-colors duration-200 hover:bg-white/[0.1] cursor-pointer"
          aria-label={`Manage ${it.name}`}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
        <Toggle
          checked={enabled}
          onChange={(v) => { if (!busy) onToggleEnabled(it.id, v); }}
          label={`Enable ${it.name}`}
        />
      </div>
    );
  }

  // Configured MCP server → no enable API; offer Manage to inspect details.
  if (isMcp && configured) {
    return (
      <button
        type="button"
        onClick={() => onManage(it.id)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition-colors duration-200 hover:bg-white/[0.1] cursor-pointer"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Manage
      </button>
    );
  }

  // Unconfigured (platform or MCP) → an honest, muted hint naming the env var to add.
  // No button that pretends to connect — secrets live in ~/.hermes, not the UI.
  const envHint = missingEnv[0];
  if (envHint) {
    return (
      <span className="truncate text-right text-[11.5px] font-medium text-white/45">
        Add <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[10.5px] text-white/60">{envHint}</code> to enable
      </span>
    );
  }
  // No single env var (OAuth / bridge / MCP) — the setupHint above carries the
  // real instruction; offer a docs link rather than a misleading "add token".
  if (it.docs) {
    return (
      <a
        href={it.docs}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/70 transition-colors duration-200 hover:bg-white/[0.08] cursor-pointer"
      >
        Set up<ExternalLink className="h-3 w-3" />
      </a>
    );
  }
  return (
    <span className="truncate text-right text-[11.5px] font-medium text-white/45">
      Configure in ~/.hermes
    </span>
  );
}

function StatusDot({ status, color }: { status: DisplayStatus; color: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {status === "connected" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      )}
      <span className="relative h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}
