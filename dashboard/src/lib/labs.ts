// Mock data + types for the Labs screen — where the user builds reusable tools
// (like Brand Maker) the agent can run. Tools have a skill, goals, workflow
// steps, and an I/O contract (inputs/outputs + UI requirements). Mockup only.

// ── Tools ────────────────────────────────────────────────────────────────────
export type ToolStatus = "ready" | "draft" | "running";
export type ToolCategory = "Creative" | "Writing" | "Research" | "Data" | "Dev";

export interface Tool {
  id: string;
  name: string;
  tagline: string;
  category: ToolCategory;
  status: ToolStatus;
  icon: ToolIconKey;
  accent: string;
  runs: number;
  steps: number;
  updated: string;
}

export type ToolIconKey =
  | "palette"
  | "wand"
  | "image"
  | "type"
  | "telescope"
  | "braces"
  | "workflow";

export const TOOL_STATUS_META: Record<
  ToolStatus,
  { label: string; color: string; pulse: boolean }
> = {
  ready: { label: "Ready", color: "#34d399", pulse: false },
  draft: { label: "Draft", color: "#f4c14d", pulse: false },
  running: { label: "Running", color: "#4f8cff", pulse: true },
};

export const TOOLS: Tool[] = [
  { id: "brand-maker", name: "Brand Maker", tagline: "Generate a full brand identity from a one-line brief.", category: "Creative", status: "ready", icon: "palette", accent: "#a78bfa", runs: 42, steps: 5, updated: "2d ago" },
  { id: "thumbnail-smith", name: "Thumbnail Smith", tagline: "Turn a title into click-worthy thumbnail concepts.", category: "Creative", status: "ready", icon: "image", accent: "#f472b6", runs: 18, steps: 4, updated: "5d ago" },
  { id: "copy-polish", name: "Copy Polish", tagline: "Tighten and re-voice any draft to your brand tone.", category: "Writing", status: "ready", icon: "type", accent: "#34d399", runs: 67, steps: 3, updated: "1d ago" },
  { id: "market-scout", name: "Market Scout", tagline: "Competitive scan + positioning gaps for any idea.", category: "Research", status: "running", icon: "telescope", accent: "#4f8cff", runs: 9, steps: 6, updated: "now" },
  { id: "schema-forge", name: "Schema Forge", tagline: "Draft typed schemas + sample data from a description.", category: "Dev", status: "draft", icon: "braces", accent: "#22d3ee", runs: 0, steps: 4, updated: "3h ago" },
];

export function toolById(id?: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}

// ── Manifest → card adapter ──────────────────────────────────────────────────
// Maps the engine's loose ToolManifest into the Tool card shape, keeping the
// icon/category/accent presentation the gallery already uses.

const VALID_ICONS = new Set<ToolIconKey>([
  "palette", "wand", "image", "type", "telescope", "braces", "workflow",
]);
const VALID_CATEGORIES = new Set<ToolCategory>([
  "Creative", "Writing", "Research", "Data", "Dev",
]);

// Stable per-category accent so cards stay visually consistent across reloads.
const CATEGORY_ACCENT: Record<ToolCategory, string> = {
  Creative: "#a78bfa",
  Writing: "#34d399",
  Research: "#4f8cff",
  Data: "#22d3ee",
  Dev: "#f472b6",
};

function coerceIcon(icon: string | undefined): ToolIconKey {
  if (icon && VALID_ICONS.has(icon as ToolIconKey)) return icon as ToolIconKey;
  return "wand";
}

function coerceCategory(category: string | undefined): ToolCategory {
  if (category && VALID_CATEGORIES.has(category as ToolCategory)) {
    return category as ToolCategory;
  }
  return "Dev";
}

/** Shape of the engine manifest fields the adapter reads (kept local to avoid a
 *  client import cycle; mirrors toolsClient.ToolManifest). */
export interface ToolManifestLike {
  id: string;
  title: string;
  tagline?: string;
  description?: string;
  category?: string;
  icon?: string;
  accent?: string;
  steps?: { id: string }[];
  runs?: number;
  updated?: string;
}

export function manifestToTool(m: ToolManifestLike): Tool {
  const category = coerceCategory(m.category);
  return {
    id: m.id,
    name: m.title || "Untitled tool",
    tagline: m.tagline || m.description || "A built tool.",
    category,
    status: "ready",
    icon: coerceIcon(m.icon),
    accent: m.accent || CATEGORY_ACCENT[category],
    runs: m.runs ?? 0,
    steps: m.steps?.length ?? 0,
    updated: m.updated || "just now",
  };
}

// ── Builder workflow ─────────────────────────────────────────────────────────
// The "create a new tool" flow walks through these stages.
export interface BuilderStage {
  id: string;
  title: string;
  blurb: string;
  icon: "target" | "wand" | "workflow" | "sliders" | "check" | "sparkles";
}

export const BUILDER_STAGES: BuilderStage[] = [
  { id: "basics", title: "Identity", blurb: "Name, category & what the tool does", icon: "target" },
  { id: "skill", title: "Skill & goals", blurb: "The capability and the outcomes it drives", icon: "wand" },
  { id: "workflow", title: "Workflow", blurb: "Ordered steps the agent runs", icon: "workflow" },
  { id: "io", title: "Inputs & outputs", blurb: "The I/O contract + UI requirements", icon: "sliders" },
  { id: "review", title: "Review", blurb: "Confirm the spec before refining", icon: "check" },
  { id: "refine", title: "Refine with agent", blurb: "Critique & enrich, then publish", icon: "sparkles" },
];

// ── I/O field types (for the inputs/outputs contract) ────────────────────────
export type FieldType = "text" | "longtext" | "number" | "toggle" | "select" | "image" | "file";

export const FIELD_TYPE_META: Record<
  FieldType,
  { label: string; icon: "type" | "hash" | "toggle" | "list" | "image" | "file" }
> = {
  text: { label: "Short text", icon: "type" },
  longtext: { label: "Long text", icon: "type" },
  number: { label: "Number", icon: "hash" },
  toggle: { label: "Toggle", icon: "toggle" },
  select: { label: "Select", icon: "list" },
  image: { label: "Image", icon: "image" },
  file: { label: "File", icon: "file" },
};

export interface IOField {
  id: string;
  label: string;
  type: FieldType;
}

export interface WorkflowStep {
  id: string;
  title: string;
  detail: string;
}

// Seed content shown when the user picks the "Brand Maker"-style template, so the
// builder demonstrates a fully-specified tool.
export const TEMPLATE_GOALS = [
  "Produce a distinctive, non-generic brand identity",
  "Deliver logo concepts the user can refine interactively",
  "Output model-ready prompts for image + video generation",
];

export const TEMPLATE_STEPS: WorkflowStep[] = [
  { id: "s1", title: "Deconstruct the brief", detail: "Extract values, audience, and emotional territory." },
  { id: "s2", title: "Spar on metaphors", detail: "Generate breakthrough concepts, reject clichés." },
  { id: "s3", title: "Design logo mockups", detail: "Interactive HTML mockups the user finalizes." },
  { id: "s4", title: "Write image prompts", detail: "Model-tuned prompts (Nano Banana / Pro)." },
  { id: "s5", title: "Compose campaign", detail: "Marketing-video prompts from the finalized identity." },
];

export const TEMPLATE_INPUTS: IOField[] = [
  { id: "i1", label: "Brand brief", type: "longtext" },
  { id: "i2", label: "Product name", type: "text" },
  { id: "i3", label: "Vibe keywords", type: "text" },
  { id: "i4", label: "Reference image", type: "image" },
];

export const TEMPLATE_OUTPUTS: IOField[] = [
  { id: "o1", label: "Logo mockups", type: "image" },
  { id: "o2", label: "Brand guide", type: "longtext" },
  { id: "o3", label: "Image prompts", type: "longtext" },
];

export const CATEGORIES: ToolCategory[] = ["Creative", "Writing", "Research", "Data", "Dev"];
