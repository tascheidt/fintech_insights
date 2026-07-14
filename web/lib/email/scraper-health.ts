import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendError } from "@/lib/email/resend-result";
import { getIncumbentTrackingEnabled } from "@/lib/settings/incumbent-tracking";
import {
  ScraperAlertEmail,
  type ScraperIssue,
  type ScraperCanary,
  type StaleCompanyIssue,
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
 * Staleness watchdog threshold: an active company with no successful scrape
 * — or zero active postings — for this many consecutive days is flagged in
 * the daily health email, EVERY day until fixed.
 *
 * The per-run "failed"/"empty" issues above only see the current run, and
 * "empty" only fires on the transition day (`closedThisRun > 0`). Miss that
 * one email and every following day looks healthy: 0 active jobs, 0 closed
 * this run, no alert. That persistence gap is exactly how Koho sat dark for
 * months after its ATS migration (July 2026). The watchdog converts every
 * one-shot miss into a recurring nag.
 */
export const STALE_SCRAPE_THRESHOLD_DAYS = 7;

export interface StalenessInput {
  /** ISO timestamp of the company's last completed scrape task, or null if none exists. */
  lastSuccessAt: string | null;
  /** Current count of `is_active=true` postings for the company. */
  activeJobCount: number;
  /** ISO timestamp the company row was created, or null. */
  companyCreatedAt: string | null;
  /**
   * Sub-brands (parent_company_id set, e.g. Simplii) never get their own
   * scrape task — their jobs land via the parent's scrape — so "no completed
   * task" is meaningless for them. Only the postings signal applies.
   */
  isSubBrand: boolean;
  now: Date;
}

export interface StalenessDecision {
  staleScrape: boolean;
  noActiveJobs: boolean;
  /** Whole days since the last successful scrape; null if never scraped. */
  daysSinceLastSuccess: number | null;
}

/**
 * Pure staleness check — no DB, no side effects.
 *
 * Companies younger than the threshold are always healthy (onboarding grace:
 * a freshly added company legitimately has no scrape history and possibly no
 * postings yet). Past the grace window:
 *  - `staleScrape`: no completed scrape task within the threshold (skipped
 *    for sub-brands — see StalenessInput.isSubBrand).
 *  - `noActiveJobs`: zero active postings. A tracked company whose board is
 *    genuinely empty for a week is rare enough that a recurring flag is
 *    signal, not noise (and the fix — deactivating with a reason — silences it).
 */
export function evaluateStaleness({
  lastSuccessAt,
  activeJobCount,
  companyCreatedAt,
  isSubBrand,
  now,
}: StalenessInput): StalenessDecision {
  const dayMs = 24 * 60 * 60 * 1000;
  const thresholdMs = STALE_SCRAPE_THRESHOLD_DAYS * dayMs;

  const daysSinceLastSuccess = lastSuccessAt
    ? Math.floor((now.getTime() - Date.parse(lastSuccessAt)) / dayMs)
    : null;

  const createdMs = companyCreatedAt ? Date.parse(companyCreatedAt) : null;
  const inOnboardingGrace =
    createdMs !== null && now.getTime() - createdMs < thresholdMs;
  if (inOnboardingGrace) {
    return { staleScrape: false, noActiveJobs: false, daysSinceLastSuccess };
  }

  const staleScrape =
    !isSubBrand &&
    (daysSinceLastSuccess === null ||
      daysSinceLastSuccess >= STALE_SCRAPE_THRESHOLD_DAYS);

  return {
    staleScrape,
    noActiveJobs: activeJobCount === 0,
    daysSinceLastSuccess,
  };
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
    const issueCompanyIds = new Set<string>();

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
        issueCompanyIds.add(task.company_id);
      } else if (activeJobCount === 0 && closedThisRun > 0) {
        // Scraper returned nothing, wiped all existing jobs
        issues.push({
          companyName: company.name,
          companySlug: company.slug,
          issueType: "empty",
          activeJobCount: 0,
          closedThisRun,
        });
        issueCompanyIds.add(task.company_id);
      }
    }

    // The canary's "0 new postings today" signal is only meaningful once a
    // company's scrape for THIS run has actually LANDED. Every incumbent is a
    // heavy browser scraper offloaded to GitHub Actions (processor.ts), so its
    // task sits in 'running' — and today's rows are absent — until the async
    // scrape finishes, which is minutes-to-an-hour AFTER the collect run is
    // marked complete (runner.ts treats offloaded 'running' tasks as
    // non-blocking). Evaluating the canary against a still-'running' incumbent
    // is a guaranteed false "0 new today" — that race is exactly what fired a
    // "6 incumbent scrapers" alert while three of them had simply not ingested
    // yet (June 2026). Restrict the canary to incumbents whose task in this run
    // is terminal, and drop any already surfaced above as a failed/empty issue
    // so a broken bank isn't double-reported in both sections.
    const evaluableCompanyIds = new Set(
      tasks
        .filter(
          (t) =>
            (t.status === "completed" ||
              t.status === "failed" ||
              t.status === "cancelled") &&
            !issueCompanyIds.has(t.company_id)
        )
        .map((t) => t.company_id)
    );

    // Independent fragility check: partial-corpus drop for incumbent
    // (big-bank) scrapers. A scraper that returns SOME but not all jobs
    // can silently rot the dataset for days; the canary fires when today's
    // new-postings count is well below the 7-day baseline.
    const canaries = await detectIncumbentCanaries(supabase, {
      evaluableCompanyIds,
    });

    // Staleness watchdog: unlike everything above, this looks at ALL active
    // companies — not just this run's tasks — and re-fires daily until fixed.
    // Companies already flagged as failed/empty in this run are excluded so
    // they aren't double-reported.
    const staleIssues = await detectStaleCompanies(supabase, {
      excludeCompanyIds: issueCompanyIds,
    });

    if (issues.length === 0 && canaries.length === 0 && staleIssues.length === 0) {
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
    if (staleIssues.length > 0) {
      log.warn(
        `Staleness watchdog: ${staleIssues.length} active compan(ies) stale for ${STALE_SCRAPE_THRESHOLD_DAYS}+ days [${staleIssues.map((s) => s.companyName).join(", ")}]`
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
    const staleCount = staleIssues.length;
    const totalCount = issueCount + canaryCount + staleCount;
    const subject = (() => {
      if (issueCount === 0 && canaryCount === 0 && staleCount > 0) {
        return staleCount === 1
          ? `⚠️ Stale scraper: ${staleIssues[0].companyName} (${STALE_SCRAPE_THRESHOLD_DAYS}+ days)`
          : `⚠️ Stale scrapers: ${staleCount} companies (${STALE_SCRAPE_THRESHOLD_DAYS}+ days)`;
      }
      if (issueCount === 0 && canaryCount > 0 && staleCount === 0) {
        return canaryCount === 1
          ? `⚠️ Scraper-break canary: ${canaries[0].companyName}`
          : `⚠️ Scraper-break canary: ${canaryCount} incumbent scrapers`;
      }
      if (issueCount === 1 && canaryCount === 0 && staleCount === 0) {
        return `⚠️ Scraper alert: ${issues[0].companyName}`;
      }
      return `⚠️ Scraper alert: ${totalCount} ${totalCount === 1 ? "issue" : "issues"} need attention`;
    })();

    const emails = adminEmails.map((email) => ({
      from,
      to: email,
      subject,
      react: ScraperAlertEmail({ issues, canaries, staleIssues, jobRunId, appUrl }),
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
 *
 * `opts.evaluableCompanyIds` (when provided) restricts evaluation to companies
 * whose scrape for the current run has LANDED — i.e. the task is terminal and
 * not already flagged as a failed/empty issue. Incumbents are heavy scrapers
 * offloaded to GitHub Actions, so a still-'running' task means today's rows
 * haven't ingested yet and a "0 new today" reading would be a false positive.
 * Omitting the set (e.g. a manual/standalone invocation) evaluates every
 * active incumbent, preserving the original behaviour.
 */
type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export async function detectIncumbentCanaries(
  supabase: SupabaseAdminClient,
  opts?: { evaluableCompanyIds?: Set<string> }
): Promise<ScraperCanary[]> {
  try {
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, slug, created_at")
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

    // Only judge incumbents whose scrape for this run has actually landed.
    // Without this gate the canary races the offloaded GitHub Actions scrapes
    // and reports every incumbent as "0 new today" before its rows ingest.
    const evaluable = opts?.evaluableCompanyIds
      ? companies.filter((c) => opts.evaluableCompanyIds!.has(c.id))
      : companies;

    if (evaluable.length === 0) return [];

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

    // Per-company count() pairs. The previous implementation pulled every
    // row in the 8-day window into memory, which silently capped at
    // PostgREST's default 1000 rows — at ~6,500+ incumbent rows in the
    // window the cap dropped today's freshly-inserted rows and produced
    // false "0 new today" alerts for half the banks. count(head:true)
    // returns only the aggregate, so no cap applies.
    //
    // The rolling-avg window also excludes the per-company backfill cutoff
    // (created_at + 48h, same definition as `isBackfill` in
    // dashboard-queries.ts). The big-bang onboarding ingest can dwarf
    // organic daily volume by 100×, which would poison the rolling avg
    // for ~7 days after every new incumbent comes online and keep this
    // canary firing daily.
    const counts = await Promise.all(
      evaluable.map(async (company) => {
        const backfillCutoffIso = company.created_at
          ? new Date(
              new Date(company.created_at as string).getTime() + 48 * 60 * 60 * 1000
            ).toISOString()
          : null;
        const rollingFloorIso =
          backfillCutoffIso && backfillCutoffIso > rollingStartIso
            ? backfillCutoffIso
            : rollingStartIso;

        const [{ count: todayCount }, { count: rollingCount }] = await Promise.all([
          supabase
            .from("job_postings")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id)
            .gte("first_seen_date", todayStartIso),
          supabase
            .from("job_postings")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id)
            .gte("first_seen_date", rollingFloorIso)
            .lt("first_seen_date", todayStartIso),
        ]);

        // Number of full days the rolling window actually covers (1-7).
        // A bank onboarded 3 days ago has at most 3 days of organic data;
        // dividing by 7 would understate the average and over-fire.
        const rollingDays = Math.max(
          1,
          Math.min(
            7,
            Math.ceil(
              (todayStart.getTime() - new Date(rollingFloorIso).getTime()) /
                (24 * 60 * 60 * 1000)
            )
          )
        );

        return {
          company,
          today: todayCount ?? 0,
          rollingTotal: rollingCount ?? 0,
          rollingDays,
        };
      })
    );

    const canaries: ScraperCanary[] = [];
    for (const { company, today, rollingTotal, rollingDays } of counts) {
      const rolling = rollingTotal / rollingDays;
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

/**
 * Staleness watchdog: flag every `is_active=true` company that has gone
 * STALE_SCRAPE_THRESHOLD_DAYS+ days with no successful scrape task, or that
 * currently has zero active postings.
 *
 * Deliberately persistent — unlike the per-run failed/empty issues, this
 * re-fires on every daily collect until the company is fixed or deactivated,
 * so a single missed email can't turn into months of silence (the Koho
 * failure mode, July 2026).
 *
 * Scope rules:
 *  - Incumbent-tier companies are excluded while `incumbent_tracking_enabled`
 *    is off — their scrapes are intentionally paused by the flag.
 *  - Sub-brands (parent_company_id set) are only checked on the postings
 *    signal; they never get their own scrape task.
 *  - Companies younger than the threshold are in onboarding grace.
 *  - `opts.excludeCompanyIds`: companies already reported as failed/empty in
 *    the current run, to avoid double-reporting.
 *
 * Read-only; errors are swallowed and logged — the watchdog must never block
 * the existing scraper-health email.
 */
export async function detectStaleCompanies(
  supabase: SupabaseAdminClient,
  opts?: { excludeCompanyIds?: Set<string>; now?: Date }
): Promise<StaleCompanyIssue[]> {
  try {
    const now = opts?.now ?? new Date();

    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, slug, tier, parent_company_id, created_at")
      .eq("is_active", true);

    if (companiesError) {
      log.error(
        { err: companiesError.message },
        "Staleness watchdog: failed to fetch companies"
      );
      return [];
    }
    if (!companies || companies.length === 0) return [];

    const incumbentEnabled = await getIncumbentTrackingEnabled(supabase);
    const candidates = companies.filter(
      (c) =>
        !opts?.excludeCompanyIds?.has(c.id) &&
        (incumbentEnabled || c.tier !== "incumbent")
    );
    if (candidates.length === 0) return [];

    // Per-company pairs of small queries (same shape as the canary check —
    // the active-company set is ~10-20 rows, so parallel point-reads beat
    // an RPC here).
    const results = await Promise.all(
      candidates.map(async (company) => {
        const isSubBrand = company.parent_company_id !== null;

        const [lastTask, { count: activeCount }] = await Promise.all([
          isSubBrand
            ? Promise.resolve(null)
            : supabase
                .from("job_run_tasks")
                .select("completed_at")
                .eq("company_id", company.id)
                .eq("status", "completed")
                .not("completed_at", "is", null)
                .order("completed_at", { ascending: false })
                .limit(1)
                .maybeSingle()
                .then((r) => r.data),
          supabase
            .from("job_postings")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id)
            .eq("is_active", true),
        ]);

        const decision = evaluateStaleness({
          lastSuccessAt: lastTask?.completed_at ?? null,
          activeJobCount: activeCount ?? 0,
          companyCreatedAt: (company.created_at as string | null) ?? null,
          isSubBrand,
          now,
        });

        const issues: StaleCompanyIssue[] = [];
        if (decision.staleScrape) {
          issues.push({
            companyName: company.name,
            companySlug: company.slug,
            kind: "stale_scrape",
            daysSinceLastSuccess: decision.daysSinceLastSuccess,
            activeJobCount: activeCount ?? 0,
            explanation:
              decision.daysSinceLastSuccess === null
                ? `No successful scrape has ever completed for this company. Check its ATS config (ats_type / ats_identifier / careers_url) — the board may have moved.`
                : `Last successful scrape was ${decision.daysSinceLastSuccess} days ago (threshold: ${STALE_SCRAPE_THRESHOLD_DAYS}). Check its ATS config — the board may have moved (the Koho pattern).`,
          });
        }
        if (decision.noActiveJobs) {
          issues.push({
            companyName: company.name,
            companySlug: company.slug,
            kind: "no_active_jobs",
            daysSinceLastSuccess: decision.daysSinceLastSuccess,
            activeJobCount: 0,
            explanation: `Company is active but has zero active postings. Either the board is genuinely empty, or the scraper is pointed at a dead/moved board. If tracking should stop, deactivate the company with a reason instead of leaving it dark.`,
          });
        }
        return issues;
      })
    );

    return results.flat();
  } catch (err) {
    log.error({ err }, "Staleness watchdog failed");
    return [];
  }
}
