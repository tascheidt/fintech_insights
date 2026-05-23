/**
 * TierBadge — the shared "Incumbent" pill marking Big-6 bank companies/jobs.
 * Renders nothing for tier='fintech' (fintech is the unmarked default).
 *
 * The incumbent visual token is defined ONCE here; do not restyle it at
 * call sites and do not introduce a color. Per the Phase 2 design spec,
 * "incumbent" is communicated by typography, the literal word, and
 * placement — never by a competing hue against the warm-sand neutral ramp.
 */
import { cn } from "@/lib/utils";

export interface TierBadgeProps {
  tier: "fintech" | "incumbent" | string | null | undefined;
  /** "sm" for dense table rows (default); "md" for page headers. */
  size?: "sm" | "md";
  className?: string;
}

export function TierBadge({ tier, size = "sm", className }: TierBadgeProps) {
  if (tier !== "incumbent") return null;
  return (
    <span
      aria-label="Incumbent bank"
      className={cn(
        "inline-flex shrink-0 items-center rounded-[4px] bg-secondary font-mono",
        "font-medium uppercase tracking-[0.08em] text-muted-foreground",
        size === "sm"
          ? "px-1.5 py-0.5 text-[10px] leading-none"
          : "px-2 py-1 text-[11px] leading-none",
        className,
      )}
    >
      Incumbent
    </span>
  );
}
