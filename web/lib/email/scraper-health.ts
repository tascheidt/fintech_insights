import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendError } from "@/lib/email/resend-result";
import {
  ScraperAlertEmail,
  type ScraperIssue,
  type ScraperCanary,
} from "./templates/scraper-alert";
import { log } from "@/lib/log";

/**
 * Fragility canary thresholds (Luke #10 — silent partial drops are scarier
 * than outages).
 *
 * `DROP_RATIO`: today's new postings must be below this fraction of the
 *   7-day rolling average to fire (50% drop).
 * `MIN_ROLLING_AVG`: rolling average must exceed this floor or we suppress
 *   the alert. Banks legitimately post 1-2 jobs on a quiet day; we only
 *   want to page on companies with meaningful baseline volume.
 */
export const CANARY_DROP_RATIO = 0.5;
export const CANARY_MIN_ROLLING_AVG = 5;

export interface CanaryInput {
  today: number;
  rolling: number;
}

export type CanaryReason =
  | "fire_partial_corpus_drop"
  | "skip_rolling_avg_below_floor"
  | "skip_today_not_below_threshold";

export interface CanaryDecision {
  fire: boolean;
  reason: CanaryReason;
}

/**
 * Pure threshold check for the partial-corpus-drop canary.
 *
 * Fires when BOTH:
 *  - `today < DROP_RATIO * rolling` (>=50% day-over-day drop), AND
 *  - `rolling > MIN_ROLLING_AVG` (filter out quiet weeks).
 *
 * The strict `>` on the floor means a `rolling === MIN_ROLLING_AVG` boundary
 * is treated as "too quiet to alert on." This intentionally keeps the
 * canary silent on borderline-low-volume companies.
 *
 * No side effects, no DB access — call from anywhere safely.
 */
export function evaluateCanary({ today, rolling }: CanaryInput): CanaryDecision {
  if (!(rolling > CANARY_MIN_ROLLING_AVG)) {
    return { fire: false, reason: "skip_rolling_avg_below_floor" };
  }
  if (!(today < CANARY_DROP_RATIO * rolling)) {
    return { fire: false, reason: "skip_today_not_below_threshold" };
  }
  return { fire: true, reason: "fire_partial_corpus_drop" };
}

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

    // Independent fragility check: partial-corpus drop for incumbent
    // (big-bank) scrapers. A scraper that returns SOME but not all jobs
    // can silently rot the dataset for days; the canary fires when today's
    // new-postings count is well below the 7-day baseline.
    const canaries = await detectIncumbentCanaries(supabase);

    if (issues.length === 0 && canaries.length === 0) {
      log.info("Scraper health check passed — no issues detected.");
      return;
    }

    if (issues.length > 0) {
      log.warn(
        `Scraper health alert: ${issues.length} issue(s) detected for [${issues.map((i) => i.companyName).join(", ")}]`
      );
    }
    if (canaries.length > 0) {
      log.warn(
        `Scraper-break canary: ${canaries.length} incumbent scraper(s) showing partial-corpus drop for [${canaries.map((c) => c.companyName).join(", ")}]`
      );
    }

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

    const issueCount = issues.length;
    const canaryCount = canaries.length;
    const totalCount = issueCount + canaryCount;
    const subject = (() => {
      if (issueCount === 0 && canaryCount > 0) {
        return canaryCount === 1
          ? `⚠️ Scraper-break canary: ${canaries[0].companyName}`
          : `⚠️ Scraper-break canary: ${canaryCount} incumbent scrapers`;
      }
      if (issueCount === 1 && canaryCount === 0) {
        return `⚠️ Scraper alert: ${issues[0].companyName}`;
      }
      return `⚠️ Scraper alert: ${totalCount} ${totalCount === 1 ? "issue" : "issues"} need attention`;
    })();

    const emails = adminEmails.map((email) => ({
      from,
      to: email,
      subject,
      react: ScraperAlertEmail({ issues, canaries, jobRunId, appUrl }),
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

/**
 * Detect incumbent scrapers showing a partial-corpus drop today.
 *
 * For each `tier='incumbent' AND is_active=true` company, computes:
 *   - todayNewJobs: postings with `first_seen_date >= start-of-today (UTC)`.
 *   - rollingAvg7d: avg new-postings per day for the 7 days BEFORE today.
 *
 * Fires the canary when `evaluateCanary` returns true. Read-only; safe to
 * call on every collect run. Errors are swallowed and logged — a failed
 * canary check must never block the existing scraper-health email.
 */
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export async function detectIncumbentCanaries(
  supabase: SupabaseAdminClient
): Promise<ScraperCanary[]> {
  try {
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("tier", "incumbent")
      .eq("is_active", true);

    if (companiesError) {
      log.error(
        { err: companiesError.message },
        "Canary: failed to fetch incumbent companies"
      );
      return [];
    }

    if (!companies || companies.length === 0) return [];

    // UTC day boundaries. "Today" = postings with first_seen_date in the
    // 24h window starting at 00:00 UTC of the current calendar day.
    // "Rolling" = the 7 calendar days before that (UTC).
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const rollingStart = new Date(
      todayStart.getTime() - 7 * 24 * 60 * 60 * 1000
    );
    const todayStartIso = todayStart.toISOString();
    const rollingStartIso = rollingStart.toISOString();

    const companyIds = companies.map((c) => c.id);

    // One round-trip for the last 8 days' worth of incumbent postings.
    // ~7,500 incumbent rows in steady state across 5 banks — this is cheap.
    const { data: rows, error: rowsError } = await supabase
      .from("job_postings")
      .select("company_id, first_seen_date")
      .in("company_id", companyIds)
      .gte("first_seen_date", rollingStartIso)
      .not("first_seen_date", "is", null);

    if (rowsError) {
      log.error(
        { err: rowsError.message },
        "Canary: failed to fetch recent postings"
      );
      return [];
    }

    const todayByCompany = new Map<string, number>();
    const rollingByCompany = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!row.first_seen_date) continue;
      if (row.first_seen_date >= todayStartIso) {
        todayByCompany.set(
          row.company_id,
          (todayByCompany.get(row.company_id) ?? 0) + 1
        );
      } else {
        rollingByCompany.set(
          row.company_id,
          (rollingByCompany.get(row.company_id) ?? 0) + 1
        );
      }
    }

    const canaries: ScraperCanary[] = [];
    for (const company of companies) {
      const today = todayByCompany.get(company.id) ?? 0;
      const rolling = (rollingByCompany.get(company.id) ?? 0) / 7;
      const decision = evaluateCanary({ today, rolling });
      if (!decision.fire) continue;
      canaries.push({
        companyName: company.name,
        companySlug: company.slug,
        todayNewJobs: today,
        rollingAvg7d: Number(rolling.toFixed(2)),
        explanation: `Today's new postings (${today}) are below 50% of the 7-day rolling average (${rolling.toFixed(1)}/day). Likely a partial-corpus scrape — verify the scraper isn't dropping pagination, location filters, or a section of the careers site.`,
      });
    }

    return canaries;
  } catch (err) {
    log.error({ err }, "Canary detection failed");
    return [];
  }
}
