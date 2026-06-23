import { useState } from "react";
import { Gauge, Cpu, ToggleRight, Bot, TerminalSquare, NotebookPen, SlidersHorizontal } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";
import { SECTIONS, HERMES_SETTINGS, CLAUDE_SETTINGS, OBSIDIAN_SETTINGS, type SectionId } from "@/lib/control";
import { OverviewSection, ModelsSection, FeaturesSection } from "@/components/control/sections";
import { SettingsPanel } from "@/components/control/SettingsPanel";
import { SectionHeader } from "@/components/control/primitives";

const NAV_ICON = { gauge: Gauge, cpu: Cpu, toggle: ToggleRight, bot: Bot, terminal: TerminalSquare, vault: NotebookPen } as const;

// ControlScreen — Mission Control. A left section-rail switches between Overview
// (usage/health), Models, Features, and the end-to-end settings for the Hermes
// agent, Claude Code, and Obsidian.
export function ControlScreen() {
  const [section, setSection] = useState<SectionId>("overview");

  return (
    <section className="absolute inset-0 z-10 flex justify-center px-[3vw] pb-5 pt-20">
      <GlassPanel className="w-full max-w-[1440px]">
        <div className="flex h-full min-h-0">
          {/* Section rail */}
          <aside className="hidden w-[230px] shrink-0 flex-col border-r border-white/[0.08] p-4 sm:flex">
            <div className="mb-4 flex items-center gap-2.5 px-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#5227FF]/20">
                <SlidersHorizontal className="h-5 w-5 text-[#a78bfa]" />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">Eona OS</p>
                <p className="text-[14px] font-semibold tracking-tight text-white">Control</p>
              </div>
            </div>

            <nav className="space-y-1">
              {SECTIONS.map((s) => {
                const Icon = NAV_ICON[s.icon];
                const active = section === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSection(s.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200 cursor-pointer ${
                      active ? "bg-white/[0.08] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${active ? "text-[#a78bfa]" : "text-white/50"}`} />
                    <span className="min-w-0">
                      <span className={`block text-[13px] font-medium ${active ? "text-white" : "text-white/75"}`}>{s.label}</span>
                      <span className="block truncate text-[11px] text-white/40">{s.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {section === "overview" && <OverviewSection />}
            {section === "models" && <ModelsSection />}
            {section === "features" && <FeaturesSection />}
            {section === "hermes" && (
              <>
                <SectionHeader title="Hermes agent" blurb="Autonomy bounds, budget, and the voice front-end." />
                <SettingsPanel groups={HERMES_SETTINGS} />
              </>
            )}
            {section === "claude" && (
              <>
                <SectionHeader title="Claude Code" blurb="Model, adaptive thinking, permissions, hooks & MCP." />
                <SettingsPanel groups={CLAUDE_SETTINGS} />
              </>
            )}
            {section === "obsidian" && (
              <>
                <SectionHeader title="Obsidian" blurb="Vault access, the knowledge index, and write guardrails." />
                <SettingsPanel groups={OBSIDIAN_SETTINGS} />
              </>
            )}
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}
