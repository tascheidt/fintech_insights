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
import type { HotRole } from "@/lib/dashboard-queries";

/** Compact relative time: "5m", "3h", "2d", "1w" */
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

export function HotRolesFeed({ roles }: { roles: HotRole[] }) {
  if (roles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
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
          <Briefcase className="h-4 w-4" />
          Hot Roles
        </CardTitle>
        <CardDescription>Most recent job postings</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-y-auto space-y-0.5 -mx-2">
          {roles.map((role) => (
            <Link
              key={role.id}
              href={`/jobs/${role.id}`}
              className="grid grid-cols-[2.5rem_auto_1fr] items-baseline gap-x-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs text-muted-foreground tabular-nums text-right">
                {compactTimeAgo(new Date(role.firstSeenDate))}
              </span>
              <span className="font-medium text-muted-foreground whitespace-nowrap">
                {role.companyName}
              </span>
              <span className="truncate">{role.title}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
