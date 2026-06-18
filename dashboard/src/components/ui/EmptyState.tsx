import type { EmptyStateProps } from "./contracts";

// ---------------------------------------------------------------------------
// EmptyState — centered placeholder for a surface with no data yet (§7).
//
// Layout: icon → title → hint → optional action, all center-aligned.
// Chrome is intentionally minimal — a subtle dashed border is enough to
// frame the space without competing with the surrounding glass surfaces.
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: "1px dashed var(--border)",
      }}
      className={[
        "flex flex-col items-center justify-center gap-3 px-8 py-12 text-center",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Icon — rendered at a larger size, muted */}
      {icon && (
        <span
          aria-hidden="true"
          className="text-muted [&>svg]:h-10 [&>svg]:w-10"
        >
          {icon}
        </span>
      )}

      {/* Title */}
      <p className="text-sm font-semibold text-foreground leading-snug max-w-[20rem]">
        {title}
      </p>

      {/* Hint — smaller muted text */}
      {hint && (
        <p className="text-[0.8125rem] text-muted leading-relaxed max-w-[22rem]">
          {hint}
        </p>
      )}

      {/* Optional primary action */}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
