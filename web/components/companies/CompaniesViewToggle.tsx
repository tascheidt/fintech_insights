/**
 * CompaniesViewToggle — Signal/Directory toggle on the right of the
 * Companies index toolbar. Mirrors state to the `?view=` URL param.
 *
 *   signal → sort by status priority (new → accel → quiet → cont)
 *   alpha  → alphabetical by company name
 *
 * Reference: viewToggle block in
 * /tmp/design-package-v2/.../CompaniesIndex_v2.jsx
 */
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, ArrowDownAZ } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewKey = "signal" | "alpha";

const TABS: Array<{
  key: ViewKey;
  label: string;
  Icon: typeof Sparkles;
}> = [
  { key: "signal", label: "Signal", Icon: Sparkles },
  { key: "alpha", label: "Directory", Icon: ArrowDownAZ },
];

export interface CompaniesViewToggleProps {
  active: ViewKey;
}

export function CompaniesViewToggle({ active }: CompaniesViewToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const onSelect = React.useCallback(
    (key: ViewKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === "signal") params.delete("view");
      else params.set("view", key);
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  return (
    <div className="inline-flex items-center gap-2.5 text-[12px] font-medium text-muted-foreground">
      {/* "View" label — purely decorative; drop it below sm to save the
          ~30px the toggle needs in tight toolbars. */}
      <span className="hidden sm:inline">View</span>
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-[3px]">
        {TABS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground shadow-[0_0_0_1px_var(--border)]"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
