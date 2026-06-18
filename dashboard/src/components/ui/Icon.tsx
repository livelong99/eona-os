import {
  Bot,
  Kanban,
  LayoutGrid,
  Radio,
  Share2,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

const MAP: Record<IconName, LucideIcon> = {
  grid: LayoutGrid,
  cockpit: Radio,
  kanban: Kanban,
  sparkles: Sparkles,
  share2: Share2,
  target: Target,
  bot: Bot,
};

interface IconProps {
  name: IconName;
  className?: string;
}

export function Icon({ name, className }: IconProps) {
  const Cmp = MAP[name];
  return <Cmp className={className} aria-hidden />;
}
