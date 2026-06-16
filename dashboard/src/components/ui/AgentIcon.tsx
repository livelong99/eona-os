import type { Agent } from "@/lib/types";

interface AgentIconProps {
  agent: Agent;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-11 w-11 text-sm",
} as const;

/** Circular gradient badge with the agent's initial (matches the reference UI). */
export function AgentIcon({ agent, size = "sm" }: AgentIconProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-inner ${agent.gradient} ${SIZES[size]}`}
    >
      {agent.name.charAt(0)}
    </span>
  );
}
