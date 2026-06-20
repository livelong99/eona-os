import { X, ExternalLink } from "lucide-react";
import { logoUrl, defaultPermissions } from "@/lib/integrations";
import { type IntegrationView } from "@/lib/integrations/view";
import { Toggle, SettingRow } from "@/components/control/primitives";

interface ManageModalProps {
  integration: IntegrationView;
  onClose: () => void;
  /** Enable/disable a configured platform; busy disables the toggle. */
  onToggleEnabled: (uiId: string, enabled: boolean) => void;
  busy?: boolean;
}

// ManageModal — per-integration detail (scoped overlay inside the panel):
// account, required/missing env, the enable toggle (platform only), and the
// read-only permission preview (engine has no permission persistence yet).
export function ManageModal({ integration: it, onClose, onToggleEnabled, busy }: ManageModalProps) {
  const e = it.engine;
  const url = logoUrl(it);
  const isPlatform = e?.kind === "platform";
  const configured = !!e?.configured;
  const requiredEnv = e?.requiredEnv ?? [];
  const missingEnv = new Set(e?.missingEnv ?? []);
  const perms = defaultPermissions(it.category);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden rounded-[28px] p-4"
      style={{ background: "rgba(2,3,8,0.6)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[min(520px,94vw)] flex-col overflow-hidden rounded-2xl border border-white/12"
        style={{ background: "rgba(16,17,26,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", boxShadow: "0 30px 120px rgba(0,0,0,0.6)" }}
        onClick={(ev) => ev.stopPropagation()}
      >
        {/* header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
            {url && <img src={url} alt={it.name} className="h-6 w-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold tracking-tight text-white">{it.name}</h2>
            {e?.account && <p className="truncate font-mono text-[11.5px] text-white/45">{e.account}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white/85 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {/* Enable toggle — platforms only (MCP has no enable API). */}
          {isPlatform && (
            <SettingRow
              label="Enabled"
              desc={configured
                ? "Run this platform's gateway adapter."
                : "Add the required credentials below to enable."}
              control={
                <Toggle
                  checked={!!e?.enabled}
                  onChange={(v) => { if (configured && !busy) onToggleEnabled(it.id, v); }}
                  label={`Enable ${it.name}`}
                />
              }
            />
          )}

          {/* Required environment — what lives in ~/.hermes; never collected here. */}
          {requiredEnv.length > 0 && (
            <div className="mt-2">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/40">
                Required credentials
              </p>
              <div className="space-y-1.5">
                {requiredEnv.map((env) => {
                  const missing = missingEnv.has(env);
                  return (
                    <div key={env} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <code className="truncate font-mono text-[12px] text-white/70">{env}</code>
                      <span
                        className="shrink-0 text-[11px] font-medium"
                        style={{ color: missing ? "#f4694d" : "#34d399" }}
                      >
                        {missing ? "Missing" : "Set"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-white/40">
                Credentials live in <code className="font-mono text-white/55">~/.hermes</code>. The dashboard reads status only — it never stores secrets.
              </p>
            </div>
          )}

          {/* Permission preview — display-only in v1 (no engine persistence yet). */}
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">Permissions</p>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                Coming soon
              </span>
            </div>
            <div className="divide-y divide-white/[0.06] opacity-55">
              {perms.map((p) => (
                <SettingRow
                  key={p.id}
                  label={p.label}
                  desc={p.desc}
                  control={<Toggle checked={p.value} onChange={() => {}} label={p.label} />}
                />
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5">
          {it.docs ? (
            <a
              href={it.docs}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-white/55 transition-colors hover:text-white/80"
            >
              Setup guide
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-200 cursor-pointer"
            style={{ background: "#5227FF" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
