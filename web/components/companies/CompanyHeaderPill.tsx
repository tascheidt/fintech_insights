/**
 * CompanyHeaderPill — the "{N} active postings" pill that lives in the
 * company drill-down header meta row. Clicking it opens the all-jobs view
 * of the JobsScopeDrawer.
 *
 * Cross-component coordination: the drawer state lives in
 * `CompanyOverviewBets`. We dispatch a custom DOM event scoped to the
 * page so the bets wrapper can react. This avoids hoisting state above
 * the (server) page component or threading a closure across the
 * server/client boundary.
 */

"use client";

import { ArrowUpRight, Briefcase } from "lucide-react";

export const COMPANY_DRAWER_OPEN_EVENT = "company-drawer:open-all" as const;

export interface CompanyHeaderPillProps {
  activeJobCount: number;
  companyName: string;
}

export function CompanyHeaderPill({
  activeJobCount,
  companyName,
}: CompanyHeaderPillProps) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent(COMPANY_DRAWER_OPEN_EVENT))
      }
      title={`See all open roles at ${companyName}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-pacific-200 bg-pacific-50 px-2.5 py-1 font-sans text-[12px] font-medium text-primary transition-colors hover:bg-pacific-100"
    >
      <Briefcase className="h-3 w-3" aria-hidden />
      <span className="font-mono font-bold tabular-nums text-foreground">
        {activeJobCount}
      </span>
      active postings
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </button>
  );
}
