/**
 * Weekly scraper-drift check — the "did a board move or come back to life?"
 * sweep. Run by `.github/workflows/scraper-drift-check.yml` (Mon 12:00 UTC)
 * or manually:
 *
 *   npx tsx --env-file=.env.local scripts/scraper-drift-check.ts [--dry-run]
 *
 * For every company (sub-brands excluded — they have no board of their own):
 *  - ACTIVE: re-detect the ATS from careers_url and compare to the stored
 *    config (`ats_drift`); for API-probeable ATSes, GET the configured board
 *    endpoint (`dead_config` when it errors).
 *  - INACTIVE fintech: probe the configured board AND try the company slug
 *    on every API-probeable provider (the "slug sweep"). Any live board with
 *    open roles → `dormant_live_board`. This is the probe that would have
 *    caught Koho months earlier (deactivated with a dead Lever config while
 *    jobs.ashbyhq.com/koho filled with roles — July 2026).
 *
 * Findings are emailed to admins via Resend (skipped with --dry-run).
 * Decision rules are pure and unit-tested in `@/lib/scrapers/drift`.
 * Exit code is 0 even with findings — the email is the signal; a non-zero
 * exit is reserved for the script itself breaking.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { detectATSFromUrl } from "@/lib/scrapers/detect-ats";
import {
  API_PROBEABLE_ATS,
  evaluateCompanyDrift,
  isProbeableAts,
  type BoardProbe,
  type DriftFinding,
  type ProbeableAts,
} from "@/lib/scrapers/drift";
import { ScraperDriftAlertEmail } from "@/lib/email/templates/scraper-drift-alert";
import { getResendError } from "@/lib/email/resend-result";
import { Resend } from "resend";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * One cheap GET per provider. These are probe-only surfaces — liveness and
 * a rough job count, NOT scraping (the real scrapers in lib/scrapers own
 * that). Workable's probe uses the public v1 widget endpoint because the
 * scraper's v3 surface is a paginated POST.
 */
async function probeBoard(
  provider: ProbeableAts,
  identifier: string
): Promise<BoardProbe> {
  const urls: Record<ProbeableAts, string> = {
    lever: `https://api.lever.co/v0/postings/${identifier}?mode=json`,
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${identifier}/jobs`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${identifier}`,
    workable: `https://apply.workable.com/api/v1/widget/accounts/${identifier}`,
  };

  try {
    const res = await fetch(urls[provider], {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        provider,
        identifier,
        ok: false,
        jobCount: null,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as unknown;
    const jobCount = Array.isArray(data)
      ? data.length // Lever returns a bare array
      : Array.isArray((data as { jobs?: unknown[] }).jobs)
        ? (data as { jobs: unknown[] }).jobs.length
        : 0;
    return { provider, identifier, ok: true, jobCount };
  } catch (err) {
    return {
      provider,
      identifier,
      ok: false,
      jobCount: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  ats_type: string;
  ats_identifier: string;
  careers_url: string | null;
  is_active: boolean;
  deactivated_reason: string | null;
  parent_company_id: string | null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, slug, tier, ats_type, ats_identifier, careers_url, is_active, deactivated_reason, parent_company_id"
    )
    .order("name");
  if (error) {
    throw new Error(`[drift-check] failed to fetch companies: ${error.message}`);
  }

  const companies = ((data ?? []) as CompanyRow[]).filter(
    // Sub-brands (Simplii) have no board of their own — their config mirrors
    // the parent's for parity and isn't used at runtime.
    (c) => c.parent_company_id === null
  );

  console.log(`[drift-check] checking ${companies.length} companies...`);
  const findings: Array<DriftFinding & { companyName: string; companySlug: string }> = [];

  for (const company of companies) {
    const needsSweep = !company.is_active && company.tier === "fintech";
    const needsConfiguredProbe =
      isProbeableAts(company.ats_type) && (company.is_active || needsSweep);

    const [configuredProbe, sweepProbes] = await Promise.all([
      needsConfiguredProbe
        ? probeBoard(
            company.ats_type.toLowerCase() as ProbeableAts,
            company.ats_identifier
          )
        : Promise.resolve(null),
      // Slug sweep: for active companies it only annotates dead_config
      // findings, so run it there too — 4 GETs per company is cheap at
      // weekly cadence and this corpus size (~15 companies).
      Promise.all(
        API_PROBEABLE_ATS.filter(
          (p) =>
            // Don't re-probe the configured pair twice.
            !(
              p === company.ats_type.toLowerCase() &&
              company.slug === company.ats_identifier
            )
        ).map((p) => probeBoard(p, company.slug))
      ),
    ]);

    const companyFindings = evaluateCompanyDrift({
      isActive: company.is_active,
      tier: company.tier,
      atsType: company.ats_type,
      atsIdentifier: company.ats_identifier,
      urlDetection: company.careers_url
        ? detectATSFromUrl(company.careers_url)
        : null,
      configuredProbe,
      sweepProbes,
      deactivatedReason: company.deactivated_reason,
    });

    const status =
      companyFindings.length > 0
        ? companyFindings.map((f) => f.kind).join(", ")
        : "ok";
    console.log(
      `[drift-check] ${company.name} (${company.slug}, ${
        company.is_active ? "active" : "inactive"
      }, ${company.ats_type}/${company.ats_identifier}): ${status}`
    );
    for (const f of companyFindings) {
      console.log(`  → ${f.detail}`);
      findings.push({
        ...f,
        companyName: company.name,
        companySlug: company.slug,
      });
    }
  }

  console.log(
    `[drift-check] done: ${findings.length} finding(s) across ${companies.length} companies`
  );
  if (findings.length === 0) return;

  if (dryRun) {
    console.log(`[drift-check] --dry-run: skipping admin email`);
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn(`[drift-check] RESEND_API_KEY not set — findings logged only`);
    return;
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .not("email", "is", null);
  const adminEmails = (admins ?? [])
    .map((a) => a.email)
    .filter((e): e is string => Boolean(e));
  if (adminEmails.length === 0) {
    console.warn(`[drift-check] no admin users found — findings logged only`);
    return;
  }

  const resend = new Resend(resendKey);
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://fintech-talent-brief.vercel.app";
  const subject =
    findings.length === 1
      ? `🧭 Scraper drift: ${findings[0].companyName} — ${findings[0].kind.replace(/_/g, " ")}`
      : `🧭 Scraper drift: ${findings.length} findings`;

  const result = await resend.batch.send(
    adminEmails.map((email) => ({
      from,
      to: email,
      subject,
      react: ScraperDriftAlertEmail({ findings, appUrl }),
    }))
  );
  const sendErr = getResendError(result);
  if (sendErr) {
    throw new Error(`[drift-check] Resend batch error: ${sendErr}`);
  }
  console.log(`[drift-check] alert sent to ${adminEmails.length} admin(s)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
