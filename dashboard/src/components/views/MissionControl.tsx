"use client";

import { motion } from "framer-motion";
import { AGENTS, NAV, type ViewId } from "@/lib/nav";
import { AgentIcon } from "@/components/ui/AgentIcon";
import { TierBadge } from "@/components/ui/TierBadge";
import { Icon } from "@/components/ui/Icon";
import { SpatialStage } from "@/components/ui/SpatialStage";
import { ParallaxLayer } from "@/components/ui/ParallaxLayer";
import { TiltCard } from "@/components/ui/TiltCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Grid2X2, Radio } from "lucide-react";
import { LAYER_VARIANTS, LAYER_ITEM } from "@/lib/aurora";

interface MissionControlProps {
  onSelect: (id: ViewId) => void;
}

export function MissionControl({ onSelect }: MissionControlProps) {
  const agents = Object.values(AGENTS);
  const shortcuts = NAV.flatMap((g) => g.items).filter(
    (i) => !i.agentId && i.id !== "mission-control",
  );

  return (
    <SpatialStage className="h-full overflow-y-auto">
      <Toolbar
        icon={<Radio className="h-4 w-4" />}
        title="Mission Control"
        subtitle="Local orchestration over Hermes Agent — free-first provider mesh."
      />

      <div className="px-8 py-7">
        {/* Agents constellation */}
        <section className="mt-2">
          <h3 className="mb-4 text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Agents
          </h3>

          {agents.length === 0 ? (
            <EmptyState
              icon={<Radio />}
              title="No agents registered"
              hint="Agents appear here once the Hermes engine is connected."
            />
          ) : (
            <ParallaxLayer depth={0.12} plane="base">
              <motion.div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                variants={LAYER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {agents.map((a) => (
                  <motion.div key={a.id} variants={LAYER_ITEM}>
                    <TiltCard
                      as="button"
                      aria-label={`Open ${a.name}`}
                      onClick={() => onSelect(`agent:${a.id}` as ViewId)}
                      className="w-full p-4 text-left"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <AgentIcon agent={a} size="lg" />
                        <TierBadge tier={a.tier} />
                      </div>
                      <p className="font-medium text-foreground">{a.name}</p>
                      <p className="mt-0.5 text-xs text-muted">{a.blurb}</p>
                    </TiltCard>
                  </motion.div>
                ))}
              </motion.div>
            </ParallaxLayer>
          )}
        </section>

        {/* Workflows constellation */}
        <section className="mt-10">
          <h3 className="mb-4 text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
            Workflows
          </h3>

          {shortcuts.length === 0 ? (
            <EmptyState
              icon={<Grid2X2 />}
              title="No workflows available"
              hint="Workflow shortcuts appear here as surfaces are registered."
            />
          ) : (
            <ParallaxLayer depth={0.08} plane="base">
              <motion.div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
                variants={LAYER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {shortcuts.map((s) => (
                  <motion.div key={s.id} variants={LAYER_ITEM}>
                    <TiltCard
                      as="button"
                      flat
                      aria-label={s.label}
                      onClick={() => onSelect(s.id)}
                      className="flex w-full flex-col items-start gap-2 p-4 text-left"
                    >
                      <Icon name={s.icon} className="h-5 w-5 text-accent" />
                      <span className="text-sm text-foreground">{s.label}</span>
                    </TiltCard>
                  </motion.div>
                ))}
              </motion.div>
            </ParallaxLayer>
          )}
        </section>
      </div>
    </SpatialStage>
  );
}
