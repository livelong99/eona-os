// Typed tool-manifest loader for the Agent-Tools Launchpad.
//
// Fetches GET /v1/tools via the /api/hermes proxy (same pattern as getTasks /
// getMemory). Falls back to SAMPLE_TOOLS when the endpoint is absent so the
// Launchpad is demoable offline. The TS types mirror engine/schemas/
// tool_manifest.schema.json and the Python ToolManifest dataclass —
// keep them in lockstep when the engine schema evolves.
//
// BACKEND FLAG #1: Engine needs GET /v1/tools that serialises
//   discover_manifests() output as { tools: ToolManifest[] }. The endpoint is
//   a thin wrapper: scan _DEFAULT_ROOTS, validate each tool.yaml, return JSON.
//   Without it the Launchpad uses the SAMPLE_TOOLS fallback below.

const BASE = "/api/hermes";
const HEALTH_TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Types — mirror engine/schemas/tool_manifest.schema.json
// ---------------------------------------------------------------------------

export type ToolInputType = "text" | "textarea" | "file" | "file[]" | "select";
export type ToolStageUi = "chat" | "form" | "artifact-iframe" | "file-cards" | "custom";

export interface ToolInput {
  id: string;
  label: string;
  type?: ToolInputType;
  required?: boolean;
  options?: string[];
}

export interface ToolStage {
  id: string;
  title: string;
  /** Path to the skill reference/stage doc. */
  ref?: string;
  /** Human-in-the-loop gate. */
  hitl: boolean;
  /** Output globs this step produces. */
  artifacts: string[];
  /** Per-step UI hint for the Workbench. */
  ui: ToolStageUi;
}

export interface ToolManifest {
  /** Stable slug (= tool field in YAML). */
  id: string;
  title: string;
  description?: string;
  /** The skill this tool drives (= launch.skill). */
  skill: string;
  steps: ToolStage[];
  inputs: ToolInput[];
}

// ---------------------------------------------------------------------------
// Minimal fetch helper (mirrors hermes.ts tryFetch, scoped to this module)
// ---------------------------------------------------------------------------

async function tryFetch<T>(path: string): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Fetch the tool manifest list from GET /v1/tools.
 * Falls back to SAMPLE_TOOLS when the engine is unreachable so the Launchpad
 * remains demoable offline — mirrors the getTasks() / getMemory() pattern.
 */
export async function getTools(): Promise<{ tools: ToolManifest[]; live: boolean }> {
  const data = await tryFetch<{ tools: ToolManifest[] }>("/v1/tools");
  if (data?.tools?.length) {
    return { tools: data.tools, live: true };
  }
  return { tools: SAMPLE_TOOLS, live: false };
}

// ---------------------------------------------------------------------------
// Bundled sample — derived from the real brand-maker fixture
// (tests/tools/fixtures/gds-agent-brand-maker/tool.yaml).
// The first entry is genuine; additional entries are labeled demo examples.
// The "Demo data" badge in the UI covers the offline-fallback disclosure.
// ---------------------------------------------------------------------------

export const SAMPLE_TOOLS: ToolManifest[] = [
  // -- Genuine fixture from tests/tools/fixtures/gds-agent-brand-maker/tool.yaml
  {
    id: "brand-maker",
    title: "Brand Maker (Forge)",
    description:
      "Mockup-first brand identity creator. Runs an anti-cliché creative pipeline — " +
      "deconstruct the brand, spar on breakthrough metaphors, design interactive HTML " +
      "logo mockups the user finalizes, then write model-tuned image prompts and " +
      "marketing-video prompts. Delivers Google Flow-ready packets for every asset.",
    skill: "gds-agent-brand-maker",
    inputs: [
      { id: "brand", label: "Brand / product name", type: "text", required: true },
      { id: "brief_docs", label: "Brand / product docs (optional)", type: "file[]", required: false },
      { id: "color_refs", label: "Color references (optional)", type: "file[]", required: false },
    ],
    steps: [
      { id: "stage0", title: "Brand Intake Q&A",           hitl: true,  artifacts: [],                                  ui: "chat" },
      { id: "stage1", title: "Deconstruction & Anti-Bias", hitl: true,  artifacts: ["deconstruct-antibias.md"],          ui: "chat" },
      { id: "stage2", title: "Domain Shifting & Sparring",  hitl: true,  artifacts: ["domain-shift-spar.md"],            ui: "chat" },
      { id: "stage3", title: "HTML Mockup Studio",          hitl: true,  artifacts: ["mockup.html", "design-brief.md"],  ui: "artifact-iframe" },
      { id: "stage4", title: "Image Prompt Generation",     hitl: false, artifacts: ["*.md"],                            ui: "file-cards" },
      { id: "stage5", title: "Marketing Campaign Video",    hitl: false, artifacts: ["video-prompt.md"],                 ui: "file-cards" },
    ],
  },

  // -- Demo examples (clearly labeled via the "Demo data" badge in the UI)
  {
    id: "game-designer",
    title: "Game Designer",
    description:
      "Interactive game concept studio. Ideates mechanics, writes narrative arcs, " +
      "and generates a prototype-ready GDD from a single concept brief.",
    skill: "gds-agent-game-designer",
    inputs: [
      { id: "concept", label: "Game concept / genre", type: "text", required: true },
    ],
    steps: [
      { id: "stage0", title: "Concept & Inspiration",  hitl: true,  artifacts: [],              ui: "chat" },
      { id: "stage1", title: "Mechanics Design",       hitl: true,  artifacts: ["mechanics.md"], ui: "chat" },
      { id: "stage2", title: "Narrative & World",      hitl: false, artifacts: ["narrative.md"], ui: "chat" },
      { id: "stage3", title: "GDD Prototype Output",   hitl: false, artifacts: ["gdd.md"],       ui: "file-cards" },
    ],
  },
  {
    id: "agent-architect",
    title: "Agent Architect",
    description:
      "System-design companion for multi-agent pipelines. Produces a full " +
      "architecture doc, agent-communication topology, and a wiring spec.",
    skill: "bmad-agent-architect",
    inputs: [
      { id: "goal", label: "Agent system goal", type: "textarea", required: true },
    ],
    steps: [
      { id: "stage0", title: "Requirements Elicitation", hitl: true,  artifacts: [],                ui: "chat" },
      { id: "stage1", title: "Architecture Design",      hitl: true,  artifacts: ["arch.md"],       ui: "chat" },
      { id: "stage2", title: "Wiring Spec Review",       hitl: true,  artifacts: ["wiring-spec.md"], ui: "file-cards" },
    ],
  },
  {
    id: "seo-writer",
    title: "SEO Content Writer",
    description:
      "Keyword-first content pipeline. Researches SERP intent, drafts long-form " +
      "articles, and delivers an optimized final piece with meta copy.",
    skill: "bmad-agent-pm",
    inputs: [
      { id: "topic",   label: "Topic / target keyword", type: "text", required: true },
      { id: "url",     label: "Competitor URL (optional)", type: "text", required: false },
    ],
    steps: [
      { id: "stage0", title: "Keyword Research",  hitl: false, artifacts: ["keywords.md"], ui: "chat" },
      { id: "stage1", title: "Draft Article",     hitl: true,  artifacts: ["draft.md"],    ui: "chat" },
      { id: "stage2", title: "SEO Optimization",  hitl: false, artifacts: ["final.md"],    ui: "file-cards" },
    ],
  },
];
