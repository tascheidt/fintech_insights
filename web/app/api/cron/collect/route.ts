import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded, refreshNewsCacheForActiveCompanies, pruneJobRunRetention } from "@/lib/jobs";
import { requireCronSecret } from "@/lib/auth/guards";
import { checkAndAlertScraperHealth } from "@/lib/email/scraper-health";
import { STALE_JOB_THRESHOLD_MS } from "@/lib/jobs/constants";
import { getIncumbentTrackingEnabled } from "@/lib/settings/incumbent-tracking";
import { log } from "@/lib/log";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Validate cron authentication
  const denied = requireCronSecret(req);
  if (denied) return denied;

  // Sentry monitor — alerts when the daily collect cron is missed.
  return Sentry.withMonitor(
    "cron-collect",
    () => runCollect(req),
    { schedule: { type: "crontab", value: "0 6 * * *" } }
  );
}

async function runCollect(req: NextRequest) {
  log.info({ path: req.nextUrl.pathname }, "Cron job started: collect");

  try {
    const supabase = createAdminClient();

    // Inline cleanup: mark any job_runs/tasks stuck in "running" past the stale threshold as failed
    const staleThreshold = new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString();
    const { data: staleTasks } = await supabase
      .from("job_run_tasks")
      .select("id, job_run_id")
      .eq("status", "running")
      .lt("started_at", staleThreshold);

    if (staleTasks && staleTasks.length > 0) {
      await supabase
        .from("job_run_tasks")
        .update({ status: "failed", error_message: "Timed out", completed_at: new Date().toISOString() })
        .in("id", staleTasks.map((t) => t.id));

      // Mark parent job_runs as failed if all their tasks are now failed
      const staleJobRunIds = [...new Set(staleTasks.map((t) => t.job_run_id))];
      for (const runId of staleJobRunIds) {
        const { data: remaining } = await supabase
          .from("job_run_tasks").select("status").eq("job_run_id", runId);
        const allDone = (remaining ?? []).every((t) => t.status !== "running" && t.status !== "pending");
        if (allDone) {
          await supabase
            .from("job_runs")
            .update({ status: "failed", completed_at: new Date().toISOString(), error_message: "Tasks timed out" })
            .eq("id", runId).eq("status", "running");
        }
      }
      log.info({ staleTaskCount: staleTasks.length }, "Cleaned up stale tasks before collection run");
    }

    // Retention: keep job_run_tasks bounded. scraped_data snapshots are only
    // read back by a same-run `startFromStage:'ingest'` resume (25-min window);
    // after that they are dead weight — letting them accumulate put the DB at
    // 224% of the free-tier quota (June 2026). Null them past the resume window
    // and prune ancient run metadata. Best-effort: never aborts collection.
    const retention = await pruneJobRunRetention(supabase);
    log.info(retention, "Retention sweep complete");

    // Get all active companies. Skip sub-brands that piggy-back on a
    // parent's scrape (parent_company_id IS NOT NULL) — their jobs land
    // via the parent's scraper with `companySlugOverride` routing.
    //
    // Incumbent gate (primary cost control): when incumbent tracking is off we
    // exclude tier='incumbent' banks here, which stops their scraping AND the
    // downstream Flash-extract + Pro-analyze hot path — both run only on the
    // companies returned by this query. Defaults to off; flip from Admin > Settings.
    const incumbentEnabled = await getIncumbentTrackingEnabled(supabase);
    const { data: allCompanies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, ats_type, tier")
      .eq("is_active", true)
      .is("parent_company_id", null);

    if (companiesError) {
      log.error({ err: companiesError.message }, "Failed to fetch companies");
      return NextResponse.json(
        { success: false, error: companiesError.message },
        { status: 500 }
      );
    }

    let companies = allCompanies;
    if (companies && !incumbentEnabled) {
      // An incumbent-tier parent whose scrape also feeds an active fintech
      // sub-brand (e.g. Simplii piggy-backs on CIBC's Workday tenant, see
      // `workday-cibc.ts`) must still be scraped even with the flag off, or
      // its fintech sub-brand silently stops updating too. `runIngestStage`
      // enforces the actual cost control: for these parents it keeps only
      // the jobs the classifier routed to the sub-brand and drops the
      // parent's own postings, so CIBC itself still isn't scraped/analyzed.
      const { data: fintechChildren } = await supabase
        .from("companies")
        .select("parent_company_id")
        .eq("is_active", true)
        .eq("tier", "fintech")
        .not("parent_company_id", "is", null);
      const incumbentParentsWithFintechChild = new Set(
        (fintechChildren ?? []).map((c) => c.parent_company_id as string)
      );
      companies = companies.filter(
        (c) => c.tier === "fintech" || incumbentParentsWithFintechChild.has(c.id)
      );
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ success: true, message: "No active companies to process" });
    }

    log.info(
      { count: companies.length, incumbentEnabled, companies: companies.map((c) => `${c.name} (${c.ats_type})`) },
      "Processing companies"
    );

    // Phase 1: Collection
    // Resume a recent in-flight collect run (started within STALE_JOB_THRESHOLD_MS) to avoid
    // starving tail companies. Older "running" jobs are stale (Vercel killed them) — don't resume.
    const resumeWindow = new Date(Date.now() - STALE_JOB_THRESHOLD_MS).toISOString();
    const { data: existingRun } = await supabase
      .from("job_runs")
      .select("id")
      .eq("job_type", "collect")
      .in("status", ["pending", "running"])
      .gte("started_at", resumeWindow)
      .order("started_at", { ascending: true, nullsFirst: true })
      .limit(1)
      .maybeSingle();

    const jobRunId =
      existingRun?.id ??
      (await createJobRun({
        jobType: "collect",
        triggerType: "cron",
        companyIds: companies.map((c) => c.id),
      }));

    log.info(
      { jobRunId, resumed: Boolean(existingRun?.id) },
      existingRun?.id ? "Resuming collect job run" : "Created job run"
    );

    const result = await executeCollectionJob(jobRunId);

    log.info({ stats: result.stats }, "Collection completed");

    // Check scraper health and alert admins if any companies have issues.
    // Runs for both completed and failed runs so failed tasks are also caught.
    checkAndAlertScraperHealth(jobRunId).catch((err) =>
      log.error({ err }, "Scraper health check error")
    );

    // Only trigger analysis/news once all collection tasks are terminal.
    if (result.status === "completed") {
      // Phase 2: Analysis (auto-triggered if there are new jobs to analyze)
      await triggerAnalysisJobIfNeeded(jobRunId);

      // Phase 3: News cache refresh
      try {
        await refreshNewsCacheForActiveCompanies(jobRunId, {
          parallelism: 2,
          skipIfCached: true,
        });
      } catch (err) {
        log.error({ err }, "News cache refresh error");
      }
    } else {
      log.info({ jobRunId }, "Collection job still in progress; skipping analysis/news until completion");
    }

    // Phase 4: Tech stack refresh — fire off in a separate serverless invocation
    // so it gets its own timeout budget (collection alone can take 4-9 min)
    // Use req.nextUrl.origin so the URL is always correct regardless of deployment alias
    const baseUrl = req.nextUrl.origin;
    fetch(`${baseUrl}/api/internal/tech-stack-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({ jobRunId }),
    }).catch((err) => log.error({ err }, "Failed to trigger tech stack refresh"));

    return NextResponse.json({
      success: true,
      jobRunId,
      ...result.stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error({ err: errorMessage }, "Cron collect failed");

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
