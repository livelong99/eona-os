// Mock data for the Brainstorm screen — where an idea brief is refined by a team
// of creative agents into a full PRD. Sessions, agents, Q&A, and PRD markdown.
// Mockup only — no engine wiring.

// ── Sessions ─────────────────────────────────────────────────────────────────
export type BrainstormStatus = "drafting" | "refining" | "prd-ready";

export interface BrainstormSession {
  id: string;
  title: string;
  brief: string;
  status: BrainstormStatus;
  updated: string;
  /** 0–100 refinement progress. */
  progress: number;
  questionsOpen: number;
  questionsAnswered: number;
  agentsActive: number;
}

export const BRAINSTORM_STATUS_META: Record<
  BrainstormStatus,
  { label: string; color: string; pulse: boolean }
> = {
  drafting: { label: "Drafting", color: "#f4c14d", pulse: true },
  refining: { label: "Refining", color: "#4f8cff", pulse: true },
  "prd-ready": { label: "PRD ready", color: "#34d399", pulse: false },
};

export const SESSIONS: BrainstormSession[] = [
  {
    id: "voice-journal",
    title: "Voice-first daily journal",
    brief: "An ambient journaling companion that captures spoken reflections and surfaces patterns over time.",
    status: "prd-ready",
    updated: "8m ago",
    progress: 100,
    questionsOpen: 0,
    questionsAnswered: 9,
    agentsActive: 0,
  },
  {
    id: "team-standup",
    title: "Async standup synthesizer",
    brief: "Collects written updates across the team and produces a single narrative digest with blockers flagged.",
    status: "refining",
    updated: "now",
    progress: 64,
    questionsOpen: 3,
    questionsAnswered: 5,
    agentsActive: 4,
  },
  {
    id: "recipe-remix",
    title: "Pantry-aware recipe remixer",
    brief: "Suggests recipes from what's already in the fridge and adapts them to dietary constraints.",
    status: "drafting",
    updated: "1h ago",
    progress: 22,
    questionsOpen: 6,
    questionsAnswered: 1,
    agentsActive: 3,
  },
  {
    id: "focus-coach",
    title: "Adaptive focus coach",
    brief: "Learns your attention rhythms and schedules deep-work blocks with gentle nudges.",
    status: "prd-ready",
    updated: "yesterday",
    progress: 100,
    questionsOpen: 0,
    questionsAnswered: 11,
    agentsActive: 0,
  },
];

export function sessionById(id?: string): BrainstormSession | undefined {
  return SESSIONS.find((s) => s.id === id);
}

// ── Creative agents (the "agent home") ───────────────────────────────────────
export type CreativeStatus = "thinking" | "writing" | "reviewing" | "idle";

export interface CreativeAgent {
  id: string;
  name: string;
  role: string;
  status: CreativeStatus;
  task: string;
}

export const CREATIVE_STATUS_META: Record<
  CreativeStatus,
  { label: string; color: string; pulse: boolean }
> = {
  thinking: { label: "Thinking", color: "#a78bfa", pulse: true },
  writing: { label: "Writing", color: "#34d399", pulse: true },
  reviewing: { label: "Reviewing", color: "#4f8cff", pulse: true },
  idle: { label: "Idle", color: "#8a8fa3", pulse: false },
};

// icon keys map to lucide icons in the AgentHome component.
export interface CreativeAgentSeed extends CreativeAgent {
  icon: "lightbulb" | "telescope" | "clipboard" | "pen" | "scale" | "scroll";
}

export const CREATIVE_AGENTS: CreativeAgentSeed[] = [
  { id: "muse", name: "Muse", role: "Ideator", status: "thinking", task: "Expanding the core concept into directions", icon: "lightbulb" },
  { id: "scout", name: "Scout", role: "Researcher", status: "reviewing", task: "Scanning comparable products & gaps", icon: "telescope" },
  { id: "piper", name: "Piper", role: "Product Manager", status: "writing", task: "Shaping scope, goals & success metrics", icon: "clipboard" },
  { id: "nova", name: "Nova", role: "UX Strategist", status: "thinking", task: "Mapping primary user journeys", icon: "pen" },
  { id: "cit", name: "Cit", role: "Critic", status: "idle", task: "Waiting to stress-test assumptions", icon: "scale" },
  { id: "quill", name: "Quill", role: "PRD Writer", status: "writing", task: "Assembling prd.md from agent inputs", icon: "scroll" },
];

// ── Q&A — clarifying questions the team asks to refine the idea ───────────────
export interface BrainstormQuestion {
  id: string;
  agent: string;
  category: string;
  question: string;
  answer: string;
  answered: boolean;
}

export const QUESTIONS: BrainstormQuestion[] = [
  { id: "q1", agent: "Piper", category: "Audience", question: "Who is the primary user — solo individuals, or teams sharing a workspace?", answer: "Solo individuals first; team sharing is a later phase.", answered: true },
  { id: "q2", agent: "Nova", category: "Core flow", question: "What is the single most important action a user takes in a typical session?", answer: "Capturing a quick spoken update and getting an instant digest back.", answered: true },
  { id: "q3", agent: "Scout", category: "Differentiation", question: "What should this do that existing tools don't?", answer: "", answered: false },
  { id: "q4", agent: "Cit", category: "Constraints", question: "Are there privacy constraints? Should processing stay on-device?", answer: "", answered: false },
  { id: "q5", agent: "Muse", category: "Vision", question: "Six months in, what does a delighted power-user say about it?", answer: "", answered: false },
];

// ── PRD markdown (rendered in the Requirement view) ──────────────────────────
export const PRD_MARKDOWN = `# Async Standup Synthesizer — Product Requirements

> **Status:** Draft v0.3 · refined by the brainstorm team
> **Owner:** Piper (Product) · **Contributors:** Muse, Scout, Nova, Cit, Quill

## 1. Overview

A lightweight tool that collects written status updates from each team member
and synthesizes them into a single, readable narrative digest — surfacing
blockers, decisions, and momentum without a synchronous meeting.

## 2. Problem

Daily standups cost a distributed team 4–6 hours of collective time per week and
still leave context scattered across threads. Written updates exist, but nobody
reads all of them, and blockers surface late.

## 3. Goals

- Replace the synchronous standup for distributed teams
- Produce a digest a busy lead can read in **under 60 seconds**
- Surface blockers and cross-dependencies **automatically**

### Non-goals

- Real-time chat or video
- Task management (integrates with existing trackers instead)

## 4. Primary persona

| Persona | Need | Pain today |
| --- | --- | --- |
| Team lead | Fast situational awareness | Reads 12 updates, misses the 2 that matter |
| Engineer | Low-friction reporting | Standups interrupt deep work |

## 5. Core features

1. **Update capture** — each member submits a short written or voice update
2. **Narrative digest** — agent composes a single story-form summary
3. **Blocker radar** — flags blockers and who can unblock them
4. **Momentum view** — week-over-week signal on progress

## 6. Success metrics

- 70% of teams drop their live standup within 3 weeks
- Median digest read-time < 60s
- ≥ 1 blocker surfaced per digest on average

## 7. Open questions

- On-device vs. cloud processing for privacy-sensitive teams?
- How much should the digest editorialize vs. quote verbatim?
`;

export const PRD_DRAFT_MARKDOWN = `# Pantry-aware Recipe Remixer — Working Draft

> The team is still gathering answers — this PRD will fill in as questions are resolved.

## 1. Overview

Suggests recipes from ingredients you already have and adapts them to dietary
constraints, reducing food waste and decision fatigue.

## 2. Problem

_Being drafted by Piper…_

## 3. Goals

- Turn "what's in the fridge" into a confident dinner decision
- Respect dietary constraints without extra setup each time

_More sections unlock as the Q&A is answered._
`;
