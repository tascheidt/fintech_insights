/**
 * CompaniesLens — segmented control on the Companies index toolbar.
 *
 * Five tabs: All / Pivoting now / Accelerating / Going quiet / Continuity.
 * State is mirrored to the `?lens=` URL param so the page server component
 * can read it and pre-filter rows.
 *
 * Reference: lens block in
 * /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  List,
  Sparkle,
  TrendingUp,
  TrendingDown,
  Minus,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type LensKey = "all" | "new" | "accel" | "quiet" | "cont" | "incumbent";

// `incumbent` is placed last, after `cont`. It uses the same segmented-control
// styling as every other tab — no special color (Phase 2 spec §Surface 4).
const TABS: Array<{ key: LensKey; label: string; Icon: LucideIcon }> = [
  { key: "all", label: "All", Icon: List },
  { key: "new", label: "Pivoting now", Icon: Sparkle },
  { key: "accel", label: "Accelerating", Icon: TrendingUp },
  { key: "quiet", label: "Going quiet", Icon: TrendingDown },
  { key: "cont", label: "Continuity", Icon: Minus },
  { key: "incumbent", label: "Incumbents", Icon: Landmark },
];

export interface CompaniesLensProps {
  active: LensKey;
  counts: Record<LensKey, number>;
  /**
   * Whether to show the Incumbents tab. Off when incumbent tracking is
   * disabled — the tab (and the TABS entry) are kept in code, just not rendered.
   */
  showIncumbent?: boolean;
}

export function CompaniesLens({ active, counts, showIncumbent = true }: CompaniesLensProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs = showIncumbent ? TABS : TABS.filter((t) => t.key !== "incumbent");

  const onSelect = React.useCallback(
    (key: LensKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === "all") params.delete("lens");
      else params.set("lens", key);
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  return (
    <div className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-background p-1">
      {tabs.map(({ key, label, Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            // `shrink-0` + `whitespace-nowrap` keep each chip on a single
            // line; the parent toolbar wraps in `overflow-x-auto` so the
            // user gets a horizontal scroll affordance instead of "Going
            // quiet" wrapping mid-label.
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              isActive
                ? "bg-primary text-white"
                : "bg-transparent text-muted-foreground hover:text-foreground"
            )}
            aria-label={`${label} (${counts[key] ?? 0})`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{label}</span>
            <span className="ml-0.5 font-mono text-[10.5px] opacity-85 tabular-nums">
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
