/**
 * PivotChip — small mono uppercase chip with an icon describing how a
 * company's hiring is pivoting right now.
 *
 * Used in the Companies index "what's signalling this week" column and in
 * the Strategic Bet cards on the company drill-down.
 *
 * Reference: `CIv2.sigStyle` + `CIv2.sigIcon` in
 * /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 */

import { Sparkles, TrendingUp, TrendingDown, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PivotKind = "new" | "accel" | "quiet" | "cont";

const VARIANTS: Record<
  PivotKind,
  { className: string; Icon: LucideIcon }
> = {
  new: {
    className: "bg-highlight-soft text-highlight-soft-foreground",
    Icon: Sparkles,
  },
  accel: {
    className: "bg-accent-soft text-accent-soft-foreground",
    Icon: TrendingUp,
  },
  quiet: {
    className: "bg-muted text-muted-foreground",
    Icon: TrendingDown,
  },
  cont: {
    className: "bg-transparent text-muted-foreground",
    Icon: Minus,
  },
};

export interface PivotChipProps {
  kind: PivotKind;
  label: string;
  className?: string;
}

export function PivotChip({ kind, label, className }: PivotChipProps) {
  const { className: variantCls, Icon } = VARIANTS[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-mono font-semibold uppercase tracking-wide",
        kind === "cont" ? "px-0 py-[3px]" : "px-[7px] py-[3px]",
        variantCls,
        className
      )}
      style={{ fontSize: 10, lineHeight: 1.2 }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}
