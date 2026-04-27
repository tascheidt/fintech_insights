/**
 * CoverageStrip — 4px-wide colored strip rendered inside Companies index
 * rows to indicate the row's pivot status at a glance.
 *
 * The strip is just a `<span>` with a background color; the parent grid
 * gives it height. Marked aria-hidden because it duplicates information
 * already available via the PivotChip.
 *
 * Reference: `CIv2.stripColor` + `S.strip` in
 * /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 */

import { cn } from "@/lib/utils";
import type { PivotKind } from "./PivotChip";

const STRIP_BG: Record<PivotKind, string> = {
  new: "bg-highlight",
  accel: "bg-sun-700",
  quiet: "bg-sand-300",
  cont: "bg-transparent",
};

export interface CoverageStripProps {
  kind: PivotKind;
  className?: string;
}

export function CoverageStrip({ kind, className }: CoverageStripProps) {
  return (
    <span
      aria-hidden
      className={cn("block w-[4px] self-stretch", STRIP_BG[kind], className)}
    />
  );
}
