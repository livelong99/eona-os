"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";
import type { MemoryGraph, MemoryNode } from "@/lib/types";
import { getMemory } from "@/lib/hermes";
import { SpatialStage, useSpatialPointer } from "@/components/ui/SpatialStage";
import { ParallaxLayer } from "@/components/ui/ParallaxLayer";
import { GlassCard } from "@/components/ui/GlassCard";
import { Toolbar } from "@/components/ui/Toolbar";
import { LivePill } from "@/components/ui/LivePill";
import { SPRING_TILT } from "@/lib/aurora";
import { Brain } from "lucide-react";

// ---------------------------------------------------------------------------
// Depth bands — nodes are grouped into three parallax bands by weight (§1).
// Three bands (not per-node layers) keeps rAF load minimal at 50+ nodes.
// ---------------------------------------------------------------------------

type DepthBand = "back" | "base" | "raise";

function bandOf(weight: number): DepthBand {
  if (weight > 0.7) return "raise";
  if (weight > 0.4) return "base";
  return "back";
}

// Parallax depth factor per band — heavier (nearer) nodes shift more.
const BAND_DEPTH: Record<DepthBand, number> = {
  back: 0.06,
  base: 0.10,
  raise: 0.16,
};

const BAND_OPACITY: Record<DepthBand, number> = {
  back: 0.55,
  base: 0.78,
  raise: 1.0,
};

// ---------------------------------------------------------------------------
// MemoryNodeDot — single node; rises + glows on hover (§3 lift pattern).
// ---------------------------------------------------------------------------

interface NodeProps {
  node: MemoryNode;
  band: DepthBand;
  hovered: boolean;
  onHover: (id: string | null) => void;
}

function MemoryNodeDot({ node, band, hovered, onHover }: NodeProps) {
  const { isStatic, subscribe } = useSpatialPointer();
  const prefersReduced = useReducedMotion();

  // Lift + scale springs for hover rise.
  const liftY = useSpring(0, SPRING_TILT);
  const scaleS = useSpring(1, SPRING_TILT);

  useEffect(() => {
    liftY.set(hovered && !prefersReduced ? -8 : 0);
    scaleS.set(hovered && !prefersReduced ? 1.25 : 1);
  }, [hovered, liftY, scaleS, prefersReduced]);

  // Subtle pointer-tracking nudge on hover (via stage pointer).
  const nudgeX = useSpring(0, SPRING_TILT);
  const nudgeY = useSpring(0, SPRING_TILT);

  useEffect(() => {
    if (isStatic || !hovered) {
      nudgeX.set(0);
      nudgeY.set(0);
      return;
    }
    return subscribe((p) => {
      nudgeX.set(p.x * 6);
      nudgeY.set(p.y * 6);
    });
  }, [isStatic, hovered, subscribe, nudgeX, nudgeY]);

  // Cleanup any dangling rAF on unmount.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const r = 4 + node.weight * 6;
  const opacity = BAND_OPACITY[band];

  return (
    <motion.div
      style={{
        position: "absolute",
        // node.x/y are 0..1 normalized; CSS % maps them to the container.
        left: `${node.x * 100}%`,
        top: `${node.y * 100}%`,
        x: nudgeX,
        y: nudgeY,
        translateY: liftY,
        scale: scaleS,
        translateZ: hovered ? "var(--z-over)" : undefined,
        willChange: hovered ? "transform" : undefined,
        // Shift so the node center sits at the coordinate point.
        marginLeft: -r,
        marginTop: -r,
      }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      className="cursor-pointer"
    >
      {/* Node glow + core */}
      <div
        style={{
          width: r * 2,
          height: r * 2,
          borderRadius: "50%",
          background: hovered
            ? "radial-gradient(circle, #e4d9ff 0%, #7c5cff 55%, #4f3aaa 100%)"
            : "radial-gradient(circle, #c4b5fd 0%, #7c5cff 100%)",
          opacity,
          boxShadow: hovered
            ? `0 0 ${r * 3}px rgba(124,92,255,0.8), 0 0 ${r * 6}px rgba(124,92,255,0.35)`
            : `0 0 ${r * 1.5}px rgba(124,92,255,0.4)`,
          transition: "box-shadow 0.2s ease, background 0.15s ease",
        }}
      />

      {/* Label — glass chip rising above the hovered node (Overlay plane) */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <GlassCard elevation={3} className="px-2 py-1">
            <span
              style={{
                fontSize: "0.6875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--foreground)",
                letterSpacing: "0.06em",
              }}
            >
              {node.label}
            </span>
          </GlassCard>
        </motion.div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// EdgeOverlay — all edges in a single SVG on the back plane.
// ---------------------------------------------------------------------------

function EdgeOverlay({ graph }: { graph: MemoryGraph }) {
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    graph.nodes.forEach((n) => m.set(n.id, { x: n.x, y: n.y }));
    return m;
  }, [graph]);

  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {graph.edges.map((e, i) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#7c5cff"
            strokeOpacity={0.15}
            strokeWidth={0.001}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BackgroundOrbs — decorative aurora wash on the field plane.
// ---------------------------------------------------------------------------

function BackgroundOrbs() {
  return (
    <>
      {[
        { left: "20%", top: "30%", size: 320, color: "#7c5cff", opacity: 0.07 },
        { left: "70%", top: "60%", size: 280, color: "#4fc3f7", opacity: 0.05 },
        { left: "50%", top: "15%", size: 200, color: "#a78bfa", opacity: 0.06 },
      ].map((o, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: o.left,
            top: o.top,
            width: o.size,
            height: o.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${o.color} 0%, transparent 70%)`,
            opacity: o.opacity,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// MemoryView — exported component. Export name + props signature unchanged.
// Data wiring: getMemory() call preserved exactly as in the original.
// ---------------------------------------------------------------------------

export function MemoryView() {
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [live, setLive] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

  // Original data wiring — unchanged.
  useEffect(() => {
    let active = true;
    getMemory().then(({ graph, live }) => {
      if (!active) return;
      setGraph(graph);
      setLive(live);
    });
    return () => {
      active = false;
    };
  }, []);

  // Group nodes into three depth bands once on graph load.
  const bandedNodes = useMemo(() => {
    const acc: Record<DepthBand, MemoryNode[]> = { back: [], base: [], raise: [] };
    graph?.nodes.forEach((n) => acc[bandOf(n.weight)].push(n));
    return acc;
  }, [graph]);

  const nodeCount = graph?.nodes.length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        icon={<Brain className="h-4 w-4" />}
        title="Memory"
        subtitle="Obsidian vault knowledge graph · shared brain"
        actions={<LivePill live={live} />}
      />

      {/* Star-field canvas */}
      <div
        className="relative flex-1 overflow-hidden"
        style={{ background: "var(--background)" }}
      >
        <SpatialStage className="absolute inset-0">
          {/* Field plane — background aurora orbs, barely move (factor 0.02) */}
          <ParallaxLayer depth={0.02} plane="field" className="absolute inset-0">
            <BackgroundOrbs />
          </ParallaxLayer>

          {/* Back plane — SVG edge overlay (single layer, no per-edge parallax) */}
          <ParallaxLayer depth={0.05} plane="back" className="absolute inset-0">
            {graph && <EdgeOverlay graph={graph} />}
          </ParallaxLayer>

          {/* Back-band nodes — faint, small, far */}
          <ParallaxLayer
            depth={BAND_DEPTH.back}
            plane="back"
            className="absolute inset-0"
          >
            {bandedNodes.back.map((n) => (
              <MemoryNodeDot
                key={n.id}
                node={n}
                band="back"
                hovered={hover === n.id}
                onHover={setHover}
              />
            ))}
          </ParallaxLayer>

          {/* Base-band nodes — mid-weight */}
          <ParallaxLayer
            depth={BAND_DEPTH.base}
            plane="base"
            className="absolute inset-0"
          >
            {bandedNodes.base.map((n) => (
              <MemoryNodeDot
                key={n.id}
                node={n}
                band="base"
                hovered={hover === n.id}
                onHover={setHover}
              />
            ))}
          </ParallaxLayer>

          {/* Raise-band nodes — dominant, near */}
          <ParallaxLayer
            depth={BAND_DEPTH.raise}
            plane="raise"
            className="absolute inset-0"
          >
            {bandedNodes.raise.map((n) => (
              <MemoryNodeDot
                key={n.id}
                node={n}
                band="raise"
                hovered={hover === n.id}
                onHover={setHover}
              />
            ))}
          </ParallaxLayer>
        </SpatialStage>

        {/* Node count hint */}
        <p
          className="pointer-events-none absolute bottom-3 left-6 text-xs"
          style={{ color: "var(--muted)" }}
        >
          {nodeCount} notes · hover a node to label it
        </p>
      </div>
    </div>
  );
}
