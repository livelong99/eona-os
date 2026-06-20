import type { FC } from "react";

export type AgentState = "idle" | "listening" | "thinking" | "working";

export interface AuroraOrbProps {
  /** Controlled state. If omitted, the orb gently cycles all states. */
  state?: AgentState;
  /** Square size in px. */
  size?: number;
  /** Auto-cycle states when uncontrolled (default true). */
  cycle?: boolean;
  className?: string;
}

declare const AuroraOrb: FC<AuroraOrbProps>;
export default AuroraOrb;
