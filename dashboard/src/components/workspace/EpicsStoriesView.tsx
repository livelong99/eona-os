import { ListTree, Loader } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import type { WorkspaceStory } from "@/lib/workspace/workspaceClient";

const STORY_STATUS: Record<string, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "#8a8fa3" },
  "ready-for-dev": { label: "Ready", color: "#7c9cff" },
  "in-progress": { label: "In progress", color: "#f4c14d" },
  review: { label: "Review", color: "#a78bfa" },
  approved: { label: "Approved", color: "#34d399" },
  done: { label: "Done", color: "#34d399" },
  blocked: { label: "Blocked", color: "#f87171" },
};

interface Props {
  epics: string | null;
  stories?: WorkspaceStory[];
  generating?: boolean;
}

// EpicsStoriesView — the sprint plan: the epics.md breakdown + a compact story
// status strip from workspace.json.sprint.stories.
export function EpicsStoriesView({ epics, stories, generating = false }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2.5">
        <ListTree className="h-4 w-4 text-[#7c9cff]" />
        <span className="font-mono text-[12.5px] text-white/65">epics.md</span>
        {stories && stories.length > 0 && (
          <span className="text-[11px] text-white/35">{stories.length} stories</span>
        )}
        {generating && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#f4c14d]/12 px-2.5 py-0.5 text-[11px] font-medium text-[#f4c14d]">
            <Loader className="h-3 w-3 animate-spin" />
            planning
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {stories && stories.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {stories.map((s) => {
              const meta = STORY_STATUS[s.status] ?? STORY_STATUS.backlog;
              return (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                  <span className="font-mono text-[11px] text-white/40">{s.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/80">{s.title || s.id}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: `${meta.color}1f`, color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {epics ? (
          <Markdown>{epics}</Markdown>
        ) : (
          <p className="py-10 text-center text-[12.5px] text-white/40">
            The epics &amp; stories appear here once sprint planning runs.
          </p>
        )}
      </div>
    </div>
  );
}
