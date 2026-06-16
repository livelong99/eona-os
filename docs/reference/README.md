# Agentic OS — Documentation Package

This zip contains the full analysis of the "New Agent OS is INSANE" (Julian Goldie) video and its
companion transcript, produced for the purpose of building a technical architecture spec to rebuild
the system.

## Contents

| File / Folder | Description |
|---|---|
| `Agentic_OS_Architecture_Spec.md` | The main deliverable — a rebuild-oriented technical architecture specification of Agentic OS / Local Studio, with per-agent integration specs, the Hermes swarm/Kanban/Hive orchestration layer, the Obsidian-vault memory system, Studio media integrations, SELF builder workflows, deployment topologies, extensibility model, a consolidated bill-of-materials, a staged rebuild plan, and caveats. |
| `Agent_OS_Transcript_Formatted.md` | The video's audio narration, formatted into sections by question/topic (wording unchanged). |
| `frames/` | 70 still frames extracted from the video, one every 15 seconds (`frame_001.jpg` = ~0:15, `frame_002.jpg` = ~0:30, … `frame_070.jpg` = ~17:15). These show the actual UI: the localhost:3737 dashboard, the three-group left nav, the Hermes/Kanban/Gemini/Claude/Kimi tabs, the Studio media surface, the Obsidian memory graph, and the community boardroom. |
| `montages/` | Composite grids of selected frames for quick scanning. |

## Frame → timestamp mapping
Each frame is sampled at a 15-second interval. To convert a frame number `N` to its approximate
timestamp: `time = N × 15 seconds`. E.g. `frame_040.jpg` ≈ 40 × 15 = 600s = 10:00.

## Montage index
- `montage1.jpg` — early frames (~0:15–5:15): Hermes tab, Kanban board, Gemini chat, Studio, Antigravity + Google Managed Agents blog.
- `montage2.jpg` — middle frames (~6:00–11:00): Claude tab, Kimi Code tab, the community Boardroom, local-vs-VPS table, Mac Mini M4 discussion.
- `montage3.jpg` — detail frames: the Memory tab with the Obsidian knowledge-graph visualization, expanded left nav, Studio video output, SEO automation section.
- `sidebars.jpg` — enlarged crops of the left navigation, used to read the exact WORKSPACE / AGENTS / SELF labels.

## Source video
`New_Agent_OS_is_INSANE__-_Julian_Goldie_SEO__720p__h264_.mp4`
Duration ≈ 17m37s · 1280×720 · 30fps. (The video itself is not included in this package.)

## Important note
The architecture spec includes a "Caveats" section. In short: agentos.guide is a marketing/affiliate
funnel for a paid community, and several "agents" are branded façades over real open-source tools
(Hermes Agent, OpenClaw, Claude Code, Codex CLI, etc.). The "free" model tiers it relies on are
temporary promo offerings that log your data. Read that section before committing to a rebuild.
