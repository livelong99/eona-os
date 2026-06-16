"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemoryGraph } from "@/lib/types";
import { getMemory } from "@/lib/hermes";
import { LivePill } from "@/components/ui/LivePill";

const W = 1000;
const H = 700;

export function MemoryView() {
  const [graph, setGraph] = useState<MemoryGraph | null>(null);
  const [live, setLive] = useState(false);
  const [hover, setHover] = useState<string | null>(null);

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

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    graph?.nodes.forEach((n) => m.set(n.id, { x: n.x * W, y: n.y * H }));
    return m;
  }, [graph]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Memory</h2>
          <p className="text-xs text-muted">
            Obsidian vault knowledge graph · shared brain
          </p>
        </div>
        <LivePill live={live} />
      </header>

      <div className="relative flex-1 overflow-hidden">
        {graph && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <radialGradient id="bg" cx="50%" cy="45%" r="60%">
                <stop offset="0%" stopColor="#1a1530" />
                <stop offset="100%" stopColor="#0a0b0f" />
              </radialGradient>
              <radialGradient id="node" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#c4b5fd" />
                <stop offset="100%" stopColor="#7c5cff" />
              </radialGradient>
            </defs>
            <rect width={W} height={H} fill="url(#bg)" />

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
                  strokeOpacity={0.18}
                  strokeWidth={1}
                />
              );
            })}

            {graph.nodes.map((n) => {
              const p = pos.get(n.id)!;
              const r = 4 + n.weight * 5;
              const active = hover === n.id;
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={active ? r + 3 : r}
                    fill="url(#node)"
                    opacity={active ? 1 : 0.9}
                  />
                  {active && (
                    <text
                      x={p.x + r + 6}
                      y={p.y + 4}
                      fill="#e7e9f0"
                      fontSize={14}
                      className="font-mono"
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        <p className="pointer-events-none absolute bottom-3 left-6 text-xs text-muted">
          {graph?.nodes.length ?? 0} notes · hover a node to label it
        </p>
      </div>
    </div>
  );
}
