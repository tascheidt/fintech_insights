/**
 * Dashboard Page - Intelligence-first competitive intelligence dashboard.
 *
 * Layout:
 * - ROW 0: Time Range Selector (right-aligned)
 * - ROW 1: Stat Cards with sparklines
 * - ROW 2: Weekly Intel Banner (AI digest narrative)
 * - ROW 3: Net Hiring Flow chart (full width)
 * - ROW 4: Competitive Matrix (2/3) + Function Mix donut (1/3)
 * - ROW 5: Hot Roles Feed (1/2) + Strategy Signals (1/2)
 */

import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { TimeRangeSelector } from "@/components/dashboard/TimeRangeSelector";
import { WeeklyIntelBanner } from "@/components/dashboard/WeeklyIntelBanner";
import { NetHiringFlowChart } from "@/components/dashboard/charts/PostingTrendChart";
import { FunctionBreakdownContainer } from "@/components/dashboard/charts/FunctionBreakdownContainer";
import { CompetitiveMatrix } from "@/components/dashboard/CompaniesOverview";
import { StrategySignals } from "@/components/dashboard/StrategicHighlights";
import { HotRolesFeed } from "@/components/dashboard/HotRolesFeed";
import {
  getCompanyBackfillCutoffs,
  getPostingTrends,
  getRawFunctionData,
  getNetHiringFlow,
  getCompetitiveMatrixData,
  getLatestDigest,
  getHotRoles,
  getNetThisWeek,
} from "@/lib/dashboard-queries";

const RANGE_TO_DAYS: Record<string, number> = {
  "2w": 14,
  "1m": 30,
  "3m": 90,
  "6m": 180,
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    matrixWindow?: string;
    matrixScope?: string;
  }>;
}) {
  const params = await searchParams;
  const range = params.range || "3m";
  const days = RANGE_TO_DAYS[range] ?? 90;

  // Matrix-specific params (independent of chart time range)
  const matrixWindow = params.matrixWindow || "current";
  const matrixWindowDays =
    matrixWindow === "current" ? null : parseInt(matrixWindow, 10) || null;
  const matrixScope = params.matrixScope || "active";
  const matrixIncludeClosed = matrixScope === "all";

  const supabase = await createClient();

  // Fetch backfill cutoffs first (needed by most queries)
  const cutoffs = await getCompanyBackfillCutoffs();

  // Fetch all data in parallel
  const [
    { count: activeJobs },
    netThisWeek,
    postingTrends,
    netHiringFlow,
    rawFunctionData,
    competitiveMatrix,
    latestDigest,
    hotRoles,
    { data: companiesRaw },
  ] = await Promise.all([
    // Active jobs count (current snapshot, no backfill filter needed)
    supabase
      .from("job_postings")
      .select("*, companies!inner(is_active)", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("companies.is_active", true),
    // Net new/closed this week
    getNetThisWeek(cutoffs),
    // Posting trends for sparkline
    getPostingTrends(days, cutoffs),
    // Net hiring flow chart data
    getNetHiringFlow(days, cutoffs),
    // Raw function data for donut chart
    getRawFunctionData(days, cutoffs),
    // Competitive matrix
    getCompetitiveMatrixData(cutoffs, {
      windowDays: matrixWindowDays,
      includeClosed: matrixIncludeClosed,
    }),
    // Latest digest
    getLatestDigest(),
    // Hot roles feed
    getHotRoles(cutoffs),
    // Companies for filter dropdown
    supabase
      .from("companies")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  // Compute derived values
  const avgWeeklyVelocity =
    postingTrends.length > 0
      ? Math.round(
          postingTrends.reduce((sum, t) => sum + t.count, 0) /
            postingTrends.length
        )
      : 0;

  const companiesTracked = companiesRaw?.length ?? 0;

  // Sparkline: use last 8 weeks of posting trend data
  const sparklineData = postingTrends.slice(-8).map((t) => t.count);

  // Company list for filter
  const companyList = (companiesRaw ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ROW 0: Time Range Selector */}
      <div className="flex justify-end">
        <Suspense fallback={null}>
          <TimeRangeSelector currentRange={range} />
        </Suspense>
      </div>

      {/* ROW 1: Stat Cards */}
      <StatsCards
        activeJobs={activeJobs ?? 0}
        netThisWeek={netThisWeek}
        avgWeeklyVelocity={avgWeeklyVelocity}
        companiesTracked={companiesTracked}
        sparklineData={sparklineData}
      />

      {/* ROW 2: Weekly Intel Banner */}
      <WeeklyIntelBanner digest={latestDigest} />

      {/* ROW 3: Net Hiring Flow Chart */}
      <NetHiringFlowChart data={netHiringFlow} />

      {/* ROW 4: Competitive Matrix (2/3) + Function Mix donut (1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <CompetitiveMatrix
          data={competitiveMatrix}
          matrixWindow={matrixWindow}
          matrixScope={matrixScope}
          className="lg:col-span-2"
        />
        <FunctionBreakdownContainer
          rawData={rawFunctionData}
          companies={companyList}
        />
      </div>

      {/* ROW 5: Hot Roles Feed (1/2) + Strategy Signals (1/2) */}
      <div className="grid gap-6 lg:grid-cols-2">
        <HotRolesFeed roles={hotRoles} />
        <StrategySignals digest={latestDigest} />
      </div>
    </div>
  );
}
