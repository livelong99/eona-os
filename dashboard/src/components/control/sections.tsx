import { useEffect, useState } from "react";
import {
  Coins, Zap, Activity, Bot, Brain, ShieldCheck, Wallet, Clock,
  Mic, Target, Globe, Plug, TrendingUp, TrendingDown,
} from "lucide-react";
import {
  USAGE_STATS, SPEND_SERIES, MODEL_USAGE, SERVICES, SERVICE_STATUS_COLOR,
  MODELS, ROUTING, FEATURES,
  type UsageStat, type FeatureFlag, type ModelInfo,
} from "@/lib/control";
import {
  getUsage, getModelConfig, putModelConfig,
  type UsageView, type RoutingTierMeta,
} from "@/lib/control/engineClient";
import {
  Toggle, SelectField, SectionHeader, Card, GroupTitle,
} from "@/components/control/primitives";

const STAT_ICON = { coins: Coins, zap: Zap, activity: Activity, bot: Bot } as const;
const FEATURE_ICON = { brain: Brain, shield: ShieldCheck, wallet: Wallet, clock: Clock, mic: Mic, target: Target, globe: Globe, plug: Plug } as const;

// ── Overview ─────────────────────────────────────────────────────────────────
export function OverviewSection() {
  // Real aggregated usage from the engine; falls back to the mock constants so
  // the panel renders instantly and degrades gracefully when the engine is down.
  const [view, setView] = useState<UsageView | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    getUsage(ac.signal)
      .then((v) => setView(v))
      .catch(() => {
        /* engine unreachable → keep the mock fallback (intentional degradation) */
      });
    return () => ac.abort();
  }, []);

  const stats = view?.stats ?? USAGE_STATS;
  const series = view?.spendSeries ?? SPEND_SERIES;
  const models = view?.modelUsage ?? MODEL_USAGE;
  const services = view?.services ?? SERVICES;
  const maxV = Math.max(...series, 1); // avoid /0 and scale bars to the window peak
  const spend = stats.find((s) => s.label.startsWith("Spend"));

  return (
    <div>
      <SectionHeader title="Mission Control" blurb="Usage, spend, and the health of every system." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} stat={s} />)}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Spend chart */}
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <GroupTitle>Spend · last 14 days</GroupTitle>
            {spend && <span className="text-[12px] text-white/45">{spend.value} {spend.sub}</span>}
          </div>
          <div className="flex h-32 items-end gap-1.5">
            {series.map((v, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-[#5227FF]/40 to-[#7c9cff]/90 transition-all duration-300 hover:from-[#5227FF]/60 hover:to-[#7c9cff]"
                style={{ height: `${Math.max((v / maxV) * 100, 2)}%` }}
              />
            ))}
          </div>
        </Card>

        {/* By model */}
        <Card>
          <GroupTitle>By model</GroupTitle>
          <div className="mt-3 space-y-3">
            {models.map((m) => (
              <div key={m.name}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    {m.name}
                  </span>
                  <span className="text-white/45">{m.cost}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full" style={{ width: `${m.share}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Services */}
      <Card className="mt-4">
        <GroupTitle>System health</GroupTitle>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((svc) => (
            <div key={svc.name} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <span className="relative flex h-2 w-2">
                {svc.status === "healthy" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: SERVICE_STATUS_COLOR[svc.status] }} />}
                <span className="relative h-2 w-2 rounded-full" style={{ background: SERVICE_STATUS_COLOR[svc.status] }} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-white/85">{svc.name}</p>
                <p className="truncate text-[11px] text-white/40">{svc.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ stat }: { stat: UsageStat }) {
  const Icon = STAT_ICON[stat.icon];
  const up = stat.trend > 0, flat = stat.trend === 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#5227FF]/15">
          <Icon className="h-5 w-5 text-[#a78bfa]" />
        </span>
        {!flat && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-[#34d399]" : "text-[#f4694d]"}`}>
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(stat.trend)}%
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{stat.value}</p>
      <p className="text-[12px] text-white/45">{stat.label}</p>
      <p className="mt-0.5 text-[11px] text-white/30">{stat.sub}</p>
    </Card>
  );
}

// ── Models ───────────────────────────────────────────────────────────────────
export function ModelsSection() {
  // Catalog + persisted roster/routing from the engine; mock constants seed the
  // initial render and remain the fallback when the engine is unreachable.
  const [models, setModels] = useState<ModelInfo[]>(MODELS);
  const [tiers, setTiers] = useState<RoutingTierMeta[]>([]);
  const [routing, setRouting] = useState<Record<string, string>>({});

  useEffect(() => {
    const ac = new AbortController();
    getModelConfig(ac.signal)
      .then((cfg) => {
        // Merge persisted enabled-flags onto the catalog.
        setModels(cfg.models.map((m) => ({ ...m, enabled: cfg.roster[m.id] ?? m.enabled })));
        setTiers(cfg.tiers);
        const r: Record<string, string> = {};
        for (const t of cfg.tiers) r[t.id] = cfg.routing[t.id] ?? t.default;
        setRouting(r);
      })
      .catch(() => {
        /* engine unreachable → keep the mock roster; routing stays read-only */
      });
    return () => ac.abort();
  }, []);

  // Persist the roster; revert local state if the write fails.
  const toggle = (id: string) => {
    setModels((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m));
      const roster = Object.fromEntries(next.map((m) => [m.id, m.enabled]));
      putModelConfig({ roster }).catch(() => setModels(prev));
      return next;
    });
  };

  // Map the selected display name back to a model id, persist the tier routing.
  const changeTier = (tierId: string, modelName: string) => {
    const picked = models.find((m) => m.name === modelName);
    if (!picked) return;
    setRouting((prev) => {
      const next = { ...prev, [tierId]: picked.id };
      putModelConfig({ routing: next }).catch(() => setRouting(prev));
      return next;
    });
  };

  const enabledNames = models.filter((m) => m.enabled).map((m) => m.name);
  const nameById = (id: string) => models.find((m) => m.id === id)?.name ?? "";

  return (
    <div>
      <SectionHeader title="Models" blurb="Enable models and route each tier to the right one." />

      <div className="space-y-2.5">
        {models.map((m) => (
          <Card key={m.id} className="flex items-center gap-4 !p-4">
            <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: m.enabled ? m.color : "#3a3d4e" }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-white">{m.name}</h3>
                <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] font-medium text-white/60">{m.tier}</span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-white/45">{m.role}</p>
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[12px] text-white/55">{m.context} ctx</p>
              <p className="text-[11px] text-white/35">{m.cost} /M</p>
            </div>
            <Toggle checked={m.enabled} onChange={() => toggle(m.id)} label={m.name} />
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <GroupTitle>Model routing by surface</GroupTitle>
        <div className="mt-2 space-y-2">
          {tiers.length > 0 ? (
            tiers.map((t) => (
              <Card key={t.id} className="flex items-center gap-4 !p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-white/90">{t.tier}</p>
                  <p className="mt-0.5 text-[12px] text-white/45">{t.desc}</p>
                </div>
                <SelectField
                  value={nameById(routing[t.id]) || nameById(t.default)}
                  options={enabledNames.length > 0 ? enabledNames : [nameById(t.default)]}
                  onChange={(v) => changeTier(t.id, v)}
                  label={t.tier}
                />
              </Card>
            ))
          ) : (
            // Fallback (engine unreachable): the mock routing, read-only.
            ROUTING.map((r) => (
              <Card key={r.id} className="flex items-center gap-4 !p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-white/90">{r.tier}</p>
                  <p className="mt-0.5 text-[12px] text-white/45">{r.desc}</p>
                </div>
                <SelectField value={r.model} options={r.options} onChange={() => {}} label={r.tier} />
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────
export function FeaturesSection() {
  const [flags, setFlags] = useState<FeatureFlag[]>(FEATURES);
  const toggle = (id: string) => setFlags((p) => p.map((f) => (f.id === id ? { ...f, value: !f.value } : f)));

  return (
    <div>
      <SectionHeader title="Features" blurb="Turn capabilities on or off across the platform." />
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {flags.map((f) => {
          const Icon = FEATURE_ICON[f.icon];
          return (
            <Card key={f.id} className="flex items-start gap-3 !p-4">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${f.value ? "bg-[#5227FF]/15" : "bg-white/[0.04]"}`}>
                <Icon className={`h-5 w-5 ${f.value ? "text-[#a78bfa]" : "text-white/45"}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-medium text-white/90">{f.label}</p>
                  {f.risk === "caution" && (
                    <span className="rounded bg-[#f4c14d]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#f4c14d]">caution</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-white/45">{f.desc}</p>
              </div>
              <Toggle checked={f.value} onChange={() => toggle(f.id)} label={f.label} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
