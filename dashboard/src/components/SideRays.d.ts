import type { FC } from "react";

// Type declaration for the React Bits SideRays.jsx component (untyped JS).
export type SideRaysOrigin =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface SideRaysProps {
  speed?: number;
  rayColor1?: string;
  rayColor2?: string;
  intensity?: number;
  spread?: number;
  origin?: SideRaysOrigin;
  tilt?: number;
  saturation?: number;
  blend?: number;
  falloff?: number;
  opacity?: number;
  className?: string;
}

declare const SideRays: FC<SideRaysProps>;
export default SideRays;
