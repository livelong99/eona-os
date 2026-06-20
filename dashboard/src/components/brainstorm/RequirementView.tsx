import { FileText, Loader } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

interface RequirementViewProps {
  markdown: string;
  /** Drafting sessions show a "still generating" banner. */
  generating?: boolean;
}

// RequirementView — renders the generated prd.md in dark-glass markdown. Shows a
// file chip header and, while drafting, a gentle "generating" banner.
export function RequirementView({ markdown, generating = false }: RequirementViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* file chip bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2.5">
        <FileText className="h-4 w-4 text-[#7c9cff]" />
        <span className="font-mono text-[12.5px] text-white/65">prd.md</span>
        {generating && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#f4c14d]/12 px-2.5 py-0.5 text-[11px] font-medium text-[#f4c14d]">
            <Loader className="h-3 w-3 animate-spin" />
            generating
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <Markdown>{markdown}</Markdown>
      </div>
    </div>
  );
}
