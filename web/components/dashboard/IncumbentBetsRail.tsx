/**
 * IncumbentBetsRail — Surface 2 of the Phase 2 incumbent integration.
 *
 * A full-width dashboard card surfacing senior Big-6-bank hires as a calm,
 * 30-day reference strip. Banks are columns; role rows are count-first.
 *
 * Design contract (phase2-meredith-design-spec.md §Surface 2):
 * - Standard <Card>, no overrides. Header mirrors StrategySignals.
 * - Landmark icon is `text-muted-foreground` (NOT text-primary) — the honest
 *   "this module is secondary" signal. One <TierBadge> in the header.
 * - "excluded from all dashboard metrics" clause is load-bearing.
 * - Count-first role rows, no `new` chips, no time-ago, no sparklines.
 * - Max 4 roles per bank; overflow → "+N more senior hires →".
 * - Empty state → render null (dashboard/page.tsx omits ROW 6 entirely).
 */

import Link from "next/link";
import { Landmark } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TierBadge } from "@/components/ui/TierBadge";
import { MonogramAvatar } from "@/components/design";
import type { IncumbentBetCompany } from "@/lib/dashboard-queries";

const MAX_ROLES_PER_BANK = 4;

export interface IncumbentBetsRailProps {
  companies: IncumbentBetCompany[];
}

/**
 * Loading skeleton: 2 bank-group columns, each 3 shimmer rows. No spinner.
 * Render this from the page during Suspense; the live rail returns null when
 * empty so a skeleton is never left stranded.
 */
export function IncumbentBetsRailSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            Incumbent Bets
            <TierBadge tier="incumbent" size="sm" />
          </CardTitle>
          <CardDescription>
            Senior bank hires · last 30 days · excluded from all dashboard
            metrics
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-3">
              <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="h-3 w-full animate-pulse rounded bg-secondary"
                />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BankGroup({ company }: { company: IncumbentBetCompany }) {
  const visible = company.roles.slice(0, MAX_ROLES_PER_BANK);
  const overflow = company.signalRoleCount - visible.reduce((s, r) => s + r.count, 0);

  return (
    <div className="min-w-0">
      {/* Bank-group header */}
      <div className="flex items-center gap-2">
        <MonogramAvatar size="sm" name={company.companyName} />
        <span className="truncate text-sm font-semibold text-foreground">
          {company.companyName}
        </span>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {company.signalRoleCount} {company.signalRoleCount === 1 ? "role" : "roles"}
        </span>
      </div>
      <div className="mt-2 border-b border-border/60" />

      {/* Count-first role rows */}
      <div className="mt-2 space-y-0.5">
        {visible.map((role) => (
          <div key={role.sampleJobId} className="py-1">
            <div className="flex items-baseline gap-2.5">
              <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-foreground">
                {role.count}
              </span>
              <span
                className="truncate text-[13px] text-foreground"
                title={role.title}
              >
                {role.title}
              </span>
            </div>
            {role.location && (
              <p className="pl-[26px] text-xs text-muted-foreground">
                {role.location}
              </p>
            )}
          </div>
        ))}
        {overflow > 0 && (
          <Link
            href={`/jobs?tier=incumbent&company=${company.companySlug}`}
            className="block py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            +{overflow} more senior {overflow === 1 ? "hire" : "hires"} →
          </Link>
        )}
      </div>
    </div>
  );
}

export function IncumbentBetsRail({ companies }: IncumbentBetsRailProps) {
  // Empty = absent. The dashboard page also omits ROW 6, but guard here so
  // the component is safe to drop in unconditionally.
  if (companies.length === 0) return null;

  // Sparse fallback: a single bank stretched across 1200px reads as broken —
  // cap content width when there's only one column of data.
  const single = companies.length === 1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            Incumbent Bets
            <TierBadge tier="incumbent" size="sm" />
          </CardTitle>
          <CardDescription>
            Senior bank hires · last 30 days · excluded from all dashboard
            metrics
          </CardDescription>
        </div>
        <Link
          href="/jobs?tier=incumbent"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          See all →
        </Link>
      </CardHeader>
      <CardContent>
        <div
          className={
            single
              ? "max-w-md"
              : "grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3"
          }
        >
          {companies.map((company) => (
            <BankGroup key={company.companyId} company={company} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
