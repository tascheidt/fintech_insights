/**
 * HotRolesFeed — most recent job postings.
 *
 * Visual contract (design system):
 * - 22×22 rounded company avatar with brand-toned initial.
 * - Title in foreground, company in muted-foreground.
 * - "new" chip (`bg-accent-soft`) when first-seen <48h.
 * - Posted age in mono tabular-nums, muted.
 */

"use client";

import Link from "next/link";
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  differenceInWeeks,
} from "date-fns";
import { Briefcase } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CompanyAvatar } from "@/components/companies/CompanyAvatar";
import type { HotRole } from "@/lib/dashboard-queries";

function compactTimeAgo(date: Date): string {
  const now = new Date();
  const mins = differenceInMinutes(now, date);
  if (mins < 60) return `${mins}m`;
  const hrs = differenceInHours(now, date);
  if (hrs < 24) return `${hrs}h`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days}d`;
  const weeks = differenceInWeeks(now, date);
  return `${weeks}w`;
}

function isNew(date: Date): boolean {
  return differenceInHours(new Date(), date) < 48;
}

export function HotRolesFeed({ roles }: { roles: HotRole[] }) {
  if (roles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Hot Roles
          </CardTitle>
          <CardDescription>Most recent job postings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recent postings yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Hot Roles
        </CardTitle>
        <CardDescription>Most recent job postings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-y-auto space-y-0.5 -mx-2">
          {roles.map((role) => {
            const firstSeen = new Date(role.firstSeenDate);
            return (
              <Link
                key={role.id}
                href={`/jobs/${role.id}`}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary"
              >
                <CompanyAvatar name={role.companyName} size={22} />
                <span className="truncate font-medium text-foreground">
                  {role.title}
                </span>
                {isNew(firstSeen) && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent-soft text-accent-soft-foreground shrink-0">
                    new
                  </span>
                )}
                <span className="ml-auto flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {role.companyName}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {compactTimeAgo(firstSeen)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
