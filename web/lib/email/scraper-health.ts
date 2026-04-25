import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendError } from "@/lib/email/resend-result";
import { ScraperAlertEmail, type ScraperIssue } from "./templates/scraper-alert";
import { log } from "@/lib/log";

/**
 * After a collection job run, detect companies with scraper issues and notify
 * admins via email. Non-fatal — errors are logged but do not propagate.
 *
 * Two issue types are detected:
 *  - "failed": the scrape task threw an exception (network error, HTTP 4xx/5xx, etc.)
 *  - "empty": the scraper returned 0 jobs but the company previously had active jobs,
 *             causing all existing postings to be closed (the Wealthsimple pattern).
 */
export async function checkAndAlertScraperHealth(
  jobRunId: string
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    log.warn(
      "RESEND_API_KEY not set, skipping scraper health alert"
    );
    return;
  }

  try {
    const supabase = createAdminClient();

    // Get all tasks for this run with their outcomes
    const { data: tasks } = await supabase
      .from("job_run_tasks")
      .select(
        "company_id, status, new_jobs, updated_jobs, closed_jobs, error_message"
      )
      .eq("job_run_id", jobRunId);

    if (!tasks || tasks.length === 0) return;

    const companyIds = tasks.map((t) => t.company_id);

    // Fetch company details and current active job counts in parallel
    const [{ data: companies }, { data: activeJobRows }] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, slug")
        .in("id", companyIds),
      supabase
        .from("job_postings")
        .select("company_id")
        .in("company_id", companyIds)
        .eq("is_active", true),
    ]);

    const companyMap = new Map(
      (companies ?? []).map((c) => [c.id, c])
    );

    // Count active jobs per company
    const activeCountMap = new Map<string, number>();
    for (const row of activeJobRows ?? []) {
      activeCountMap.set(
        row.company_id,
        (activeCountMap.get(row.company_id) || 0) + 1
      );
    }

    // Detect issues
    const issues: ScraperIssue[] = [];

    for (const task of tasks) {
      const company = companyMap.get(task.company_id);
      if (!company) continue;

      const activeJobCount = activeCountMap.get(task.company_id) || 0;
      const closedThisRun = task.closed_jobs || 0;

      if (task.status === "failed") {
        issues.push({
          companyName: company.name,
          companySlug: company.slug,
          issueType: "failed",
          errorMessage: task.error_message ?? undefined,
          activeJobCount,
          closedThisRun,
        });
      } else if (activeJobCount === 0 && closedThisRun > 0) {
        // Scraper returned nothing, wiped all existing jobs
        issues.push({
          companyName: company.name,
          companySlug: company.slug,
          issueType: "empty",
          activeJobCount: 0,
          closedThisRun,
        });
      }
    }

    if (issues.length === 0) {
      log.info("Scraper health check passed — no issues detected.");
      return;
    }

    log.warn(
      `Scraper health alert: ${issues.length} issue(s) detected for [${issues.map((i) => i.companyName).join(", ")}]`
    );

    // Fetch admin emails
    const { data: admins } = await supabase
      .from("profiles")
      .select("email")
      .eq("role", "admin")
      .not("email", "is", null);

    const adminEmails = (admins ?? [])
      .map((a) => a.email)
      .filter((e): e is string => Boolean(e));

    if (adminEmails.length === 0) {
      log.warn("No admin users found for scraper alert");
      return;
    }

    const resend = new Resend(resendKey);
    const from = process.env.RESEND_FROM || "onboarding@resend.dev";
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://fintech-talent-brief.vercel.app";

    const subject =
      issues.length === 1
        ? `⚠️ Scraper alert: ${issues[0].companyName}`
        : `⚠️ Scraper alert: ${issues.length} companies need attention`;

    const emails = adminEmails.map((email) => ({
      from,
      to: email,
      subject,
      react: ScraperAlertEmail({ issues, jobRunId, appUrl }),
    }));

    const result = await resend.batch.send(emails);
    const err = getResendError(result);
    if (err) {
      log.error({ err: err }, "Resend batch error (scraper alert):");
      return;
    }
    log.info(
      `Scraper health alert sent to ${adminEmails.length} admin(s)`
    );
  } catch (err) {
    log.error({ err: err }, "Failed to send scraper health alert:");
  }
}
