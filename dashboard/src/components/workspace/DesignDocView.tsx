import { FileText, Loader } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

interface Props {
  markdown: string | null;
  generating?: boolean;
}

// DesignDocView — renders the workspace architecture/design doc (architecture.md)
// in dark-glass markdown, with a file chip and a "drafting" banner while in flight.
export function DesignDocView({ markdown, generating = false }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-2.5">
        <FileText className="h-4 w-4 text-[#7c9cff]" />
        <span className="font-mono text-[12.5px] text-white/65">architecture.md</span>
        {generating && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#f4c14d]/12 px-2.5 py-0.5 text-[11px] font-medium text-[#f4c14d]">
            <Loader className="h-3 w-3 animate-spin" />
            drafting
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {markdown ? (
          <Markdown>{markdown}</Markdown>
        ) : (
          <p className="py-10 text-center text-[12.5px] text-white/40">
            The design appears here once the Architect drafts it.
          </p>
        )}
      </div>
    </div>
  );
}
