"use client";

// MDViewer — markdown reader with a TOC rail (reapollo/table-of-contents, hand-rolled).
//
// Structure: left TOC rail (sticky, glass panel) listing h1–h4 headings with
// level-based indentation + active-heading highlight via IntersectionObserver.
// Right body renders minimal converted markdown HTML in a prose-style container.
//
// Markdown rendering: lightweight inline converter handles headings, bold, italic,
// inline code, fenced code blocks, blockquotes, hr, and paragraphs — no heavy deps.
// Props wire to MDViewerProps contract (contracts.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { MDViewerProps, MDHeading } from "./contracts";
import { TRANSITION_MICRO } from "@/lib/aurora";

// ---------------------------------------------------------------------------
// parseHeadings — extract h1–h4 from raw markdown for the TOC rail.
// ---------------------------------------------------------------------------

function parseHeadings(markdown: string): MDHeading[] {
  const lines = markdown.split("\n");
  const headings: MDHeading[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    headings.push({ id, text, level });
  }
  return headings;
}

// ---------------------------------------------------------------------------
// convertMarkdown — minimal markdown → HTML string, no external deps.
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(text: string): string {
  return escHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
}

function convertMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];
  let inBlockquote = false;

  function flushBlockquote(acc: string[]) {
    if (!inBlockquote) return;
    html.push(
      `<blockquote>${acc.map(inlineMarkdown).join("<br>")}</blockquote>`,
    );
    inBlockquote = false;
    acc.length = 0;
  }

  const bqLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Fenced code blocks
    if (raw.startsWith("```")) {
      if (!inCode) {
        flushBlockquote(bqLines);
        inCode = true;
        codeLang = raw.slice(3).trim();
        codeLines = [];
      } else {
        const langAttr = codeLang ? ` class="language-${escHtml(codeLang)}"` : "";
        html.push(
          `<pre><code${langAttr}>${codeLines.map(escHtml).join("\n")}</code></pre>`,
        );
        inCode = false;
        codeLang = "";
        codeLines = [];
      }
      continue;
    }
    if (inCode) {
      codeLines.push(raw);
      continue;
    }

    // Blockquotes
    if (raw.startsWith("> ")) {
      inBlockquote = true;
      bqLines.push(raw.slice(2));
      continue;
    } else if (inBlockquote) {
      flushBlockquote(bqLines);
    }

    // Headings
    const hm = raw.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      html.push(
        `<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`,
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(raw.trim()) || /^\*\*\*+$/.test(raw.trim())) {
      html.push("<hr>");
      continue;
    }

    // Empty line (paragraph break)
    if (raw.trim() === "") {
      html.push("");
      continue;
    }

    // Unordered list item
    const ulm = raw.match(/^[-*+]\s+(.+)$/);
    if (ulm) {
      html.push(`<li>${inlineMarkdown(ulm[1])}</li>`);
      continue;
    }

    // Ordered list item
    const olm = raw.match(/^\d+\.\s+(.+)$/);
    if (olm) {
      html.push(`<li>${inlineMarkdown(olm[1])}</li>`);
      continue;
    }

    // Paragraph
    html.push(`<p>${inlineMarkdown(raw)}</p>`);
  }

  // Close any open code block
  if (inCode && codeLines.length > 0) {
    html.push(`<pre><code>${codeLines.map(escHtml).join("\n")}</code></pre>`);
  }
  flushBlockquote(bqLines);

  return html.join("\n");
}

// ---------------------------------------------------------------------------
// TOC Rail — glass panel listing headings; highlights the active one.
// ---------------------------------------------------------------------------

interface TocRailProps {
  headings: MDHeading[];
  activeId: string | null;
}

const INDENT_PX: Record<number, number> = { 1: 0, 2: 8, 3: 16, 4: 24 };

function TocRail({ headings, activeId }: TocRailProps) {
  if (headings.length === 0) return null;

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      aria-label="Table of contents"
      className="flex-shrink-0 overflow-y-auto"
      style={{
        width: 200,
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        borderRight: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
        padding: "1rem 0.75rem",
        boxShadow: "var(--glow-sm)",
      }}
    >
      <p
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--muted)" }}
      >
        Contents
      </p>
      <ul className="space-y-0.5" role="list">
        {headings.map((h) => {
          const isActive = h.id === activeId;
          return (
            <li key={h.id}>
              <motion.button
                type="button"
                onClick={() => scrollTo(h.id)}
                whileTap={{ scale: 0.97 }}
                transition={TRANSITION_MICRO}
                style={{
                  paddingLeft: INDENT_PX[h.level] ?? 0,
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  background: isActive
                    ? "rgba(124,92,255,0.10)"
                    : "transparent",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: isActive ? 500 : 400,
                  transition: "color 0.15s ease, background 0.15s ease",
                }}
                className="block w-full cursor-pointer px-2 py-1 text-left text-xs leading-snug hover:text-foreground"
                aria-current={isActive ? "true" : undefined}
              >
                {h.text}
              </motion.button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// MDViewer — exported component.
// ---------------------------------------------------------------------------

export function MDViewer({ markdown, title, className = "" }: MDViewerProps) {
  const headings = useMemo(() => parseHeadings(markdown), [markdown]);
  const bodyHtml = useMemo(() => convertMarkdown(markdown), [markdown]);
  const [activeId, setActiveId] = useState<string | null>(
    headings[0]?.id ?? null,
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver: highlight whichever heading is nearest the top.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || headings.length === 0) return;

    const els = headings
      .map((h) => body.querySelector(`#${CSS.escape(h.id)}`))
      .filter((el): el is Element => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the first heading currently intersecting.
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (intersecting.length > 0) {
          setActiveId(intersecting[0].target.id);
        }
      },
      { rootMargin: "-10% 0px -80% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  return (
    <div
      className={[
        "flex min-h-0 overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--glass-border)",
        boxShadow: "var(--glow-sm), var(--glass-edge)",
      }}
    >
      {/* TOC Rail */}
      <TocRail headings={headings} activeId={activeId} />

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--glass-blur))",
          WebkitBackdropFilter: "blur(var(--glass-blur))",
          padding: "1.5rem 2rem",
        }}
      >
        {title && (
          <h1
            className="mb-4 text-lg font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {title}
          </h1>
        )}

        {/* Rendered markdown body */}
        <div
          ref={bodyRef}
          className="md-body"
          style={{
            color: "var(--foreground)",
            fontSize: "0.875rem",
            lineHeight: 1.7,
          }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {/* Inline prose styles for the md-body (scoped via parent class) */}
        <style>{`
          .md-body h1,.md-body h2,.md-body h3,.md-body h4 {
            color: var(--foreground);
            font-weight: 600;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            scroll-margin-top: 1rem;
          }
          .md-body h1 { font-size: 1.25rem; }
          .md-body h2 { font-size: 1.1rem; }
          .md-body h3 { font-size: 1rem; }
          .md-body h4 { font-size: 0.9rem; }
          .md-body p  { margin-bottom: 0.85em; }
          .md-body hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
          .md-body code {
            font-family: var(--font-mono);
            font-size: 0.8em;
            background: var(--surface-2);
            border-radius: 4px;
            padding: 0.15em 0.4em;
            color: var(--aurora-violet);
          }
          .md-body pre {
            background: var(--surface-2);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            padding: 1em;
            overflow-x: auto;
            margin-bottom: 1em;
          }
          .md-body pre code {
            background: none;
            padding: 0;
            font-size: 0.8em;
            color: var(--foreground);
          }
          .md-body blockquote {
            border-left: 3px solid var(--accent);
            margin: 1em 0;
            padding: 0.5em 1em;
            color: var(--muted);
            font-style: italic;
          }
          .md-body strong { font-weight: 600; color: var(--foreground); }
          .md-body em { font-style: italic; }
          .md-body li { margin-bottom: 0.3em; padding-left: 1.25em; list-style: disc; }
          .md-body a { color: var(--accent); text-decoration: underline; }
        `}</style>
      </div>
    </div>
  );
}
