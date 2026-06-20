import {
  Palette,
  WandSparkles,
  Image,
  Type,
  Telescope,
  Braces,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { ToolIconKey } from "@/lib/labs";

// Maps a tool's icon key to a lucide icon. Centralized so cards, the builder,
// and the detail view stay consistent.
export const TOOL_ICONS: Record<ToolIconKey, LucideIcon> = {
  palette: Palette,
  wand: WandSparkles,
  image: Image,
  type: Type,
  telescope: Telescope,
  braces: Braces,
  workflow: Workflow,
};
