import type { ToolbarProps } from "./contracts";

// ---------------------------------------------------------------------------
// Toolbar — glass header strip for a surface (§6).
//
// Layout: leading icon → title + subtitle (left-aligned) | actions (right).
// Material: glass-bg backdrop-blur, bottom border, top edge-light via
// glass-edge inset shadow so it looks lifted above the content area.
// No framer-motion — static header; leave animation to the parent surface.
// ---------------------------------------------------------------------------

export function Toolbar({
  title,
  subtitle,
  actions,
  icon,
  className = "",
}: ToolbarProps) {
  return (
    <div
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        borderBottom: "1px solid var(--border)",
        // Edge-light on top + faint bottom glow to lift toolbar visually.
        boxShadow: "var(--glass-edge), 0 1px 0 rgba(255,255,255,0.03)",
        borderRadius: "var(--radius-xl) var(--radius-xl) 0 0",
      }}
      className={[
        "flex items-center gap-3 px-5 py-3.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Leading icon slot */}
      {icon && (
        <span
          className="shrink-0 text-muted"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      {/* Title + subtitle */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold leading-tight text-foreground">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[0.6875rem] leading-tight text-muted mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {/* Right-aligned actions */}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
