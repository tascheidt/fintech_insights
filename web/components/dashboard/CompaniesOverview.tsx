"use client";

/**
 * CompaniesOverview - Displays tracked companies with Notion-style card/table toggle.
 * 
 * Shows:
 * - Company name and country
 * - Active job count
 * - Recent job highlights
 * - Link to company detail page
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Building2, MapPin, Briefcase, TrendingUp, ArrowRight } from "lucide-react";
import {
  NotionCard,
  NotionCardContent,
  NotionCardTitle,
  NotionCardDescription,
  NotionCardFooter,
  NotionCardTag,
  NotionCardMetric,
} from "@/components/ui/notion-card";
import { ViewToggle, useViewPreference, ViewMode } from "@/components/ui/view-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Company data structure */
export interface CompanyOverviewData {
  id: string;
  name: string;
  slug: string;
  country: string;
  activeJobCount: number;
  recentHighlight?: string | null;
  atsType: string;
}

interface CompaniesOverviewProps {
  companies: CompanyOverviewData[];
  className?: string;
}

/**
 * Main CompaniesOverview component with view toggle
 */
export function CompaniesOverview({ companies, className }: CompaniesOverviewProps) {
  const [view, setView] = useViewPreference("dashboard-companies", "card");

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Companies Being Tracked</h2>
          <p className="text-sm text-muted-foreground">
            {companies.length} active companies
          </p>
        </div>
        <ViewToggle view={view} onViewChange={setView} />
      </div>

      {/* Content based on view mode */}
      {view === "card" ? (
        <CompaniesCardView companies={companies} />
      ) : (
        <CompaniesTableView companies={companies} />
      )}
    </div>
  );
}

/**
 * Card view - Notion-style cards in a grid
 */
function CompaniesCardView({ companies }: { companies: CompanyOverviewData[] }) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No companies being tracked yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {companies.map((company) => (
        <Link key={company.id} href={`/companies/${company.slug}`}>
          <NotionCard className="h-full">
            <NotionCardContent className="flex-1">
              {/* Company icon and name */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <NotionCardTitle>{company.name}</NotionCardTitle>
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{company.country}</span>
                  </div>
                </div>
              </div>

              {/* Job count metric */}
              <div className="flex items-center gap-2 mt-4">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">{company.activeJobCount}</span>
                <span className="text-sm text-muted-foreground">active jobs</span>
              </div>

              {/* Recent highlight */}
              {company.recentHighlight && (
                <NotionCardDescription className="mt-3 text-xs">
                  <TrendingUp className="inline h-3 w-3 mr-1" />
                  {company.recentHighlight}
                </NotionCardDescription>
              )}

              {/* Footer with tags */}
              <NotionCardFooter className="mt-auto pt-4">
                <NotionCardTag>{company.atsType}</NotionCardTag>
                <ArrowRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </NotionCardFooter>
            </NotionCardContent>
          </NotionCard>
        </Link>
      ))}
    </div>
  );
}

/**
 * Table view - Traditional table layout
 */
function CompaniesTableView({ companies }: { companies: CompanyOverviewData[] }) {
  if (companies.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No companies being tracked yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Country</TableHead>
            <TableHead className="text-right">Active Jobs</TableHead>
            <TableHead>Recent Activity</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{company.name}</span>
                </div>
              </TableCell>
              <TableCell>{company.country}</TableCell>
              <TableCell className="text-right font-semibold">
                {company.activeJobCount}
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                {company.recentHighlight || "—"}
              </TableCell>
              <TableCell>
                <Link
                  href={`/companies/${company.slug}`}
                  className="text-primary text-sm hover:underline"
                >
                  View →
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default CompaniesOverview;
