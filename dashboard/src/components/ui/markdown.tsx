import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  children: string;
  className?: string;
}

// Element → dark-theme classes. Keeps the renderer self-contained (no Tailwind
// typography plugin needed) and consistent with the glass aesthetic.
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 text-[22px] font-semibold tracking-tight text-white first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-2.5 border-b border-white/10 pb-1.5 text-[17px] font-semibold tracking-tight text-white/95">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-[14px] font-semibold uppercase tracking-wide text-white/70">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="my-2.5 text-[13.5px] leading-relaxed text-white/70">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-2.5 space-y-1.5 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2.5 list-decimal space-y-1.5 pl-5 marker:text-white/40">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 text-[13.5px] leading-relaxed text-white/70 [ol_&]:list-item [ol_&]:pl-1">
      <span className="mt-2 hidden h-1 w-1 shrink-0 rounded-full bg-[#5227FF] [ul_&]:block" />
      <span className="min-w-0">{children}</span>
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white/90">{children}</strong>
  ),
  em: ({ children }) => <em className="text-white/55">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} className="text-[#7c9cff] underline decoration-white/20 underline-offset-2 hover:decoration-white/50">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-[#5227FF]/60 bg-white/[0.03] py-1.5 pl-3.5 pr-3 text-[13px] text-white/55 [&_p]:my-1 [&_p]:text-white/55">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12px] text-[#e2c08d]">
      {children}
    </code>
  ),
  hr: () => <hr className="my-5 border-white/10" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.05]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-white/10 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-white/70">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-white/[0.06] px-3 py-2 align-top text-white/65">{children}</td>
  ),
};

// Markdown — renders GitHub-flavored markdown with dark-glass styling.
export function Markdown({ children, className = "" }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
