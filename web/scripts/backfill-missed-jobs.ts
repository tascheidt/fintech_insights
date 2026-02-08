/**
 * Backfill Missed Jobs Script
 *
 * Recovers jobs that were missed during the Jan 30 – Feb 7 scraping gap.
 * - Tangerine: Runs the new scotiabank scraper directly (no browser needed)
 * - Questrade: Triggers GitHub Actions workflow for browser scraping
 *
 * Usage:
 *   cd web
 *   npx tsx --env-file=.env.local scripts/backfill-missed-jobs.ts
 *
 * Options:
 *   --dry-run   Show what would be done without writing to database
 *   --tangerine-only  Only backfill Tangerine
 *   --questrade-only  Only trigger Questrade backfill via GitHub Actions
 */

import { createClient } from "@supabase/supabase-js";
import { fetchJobs, jobToRow, type JobData } from "@/lib/scrapers";
import { extractJobStructure, normalizeJobTitle, isValidDepartment, isValidLocation } from "@/lib/analysis/structure";

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TANGERINE_ONLY = args.includes("--tangerine-only");
const QUESTRADE_ONLY = args.includes("--questrade-only");

// Initialize Supabase admin client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface BackfillResult {
  company: string;
  jobsFetched: number;
  newJobs: number;
  reactivatedJobs: number;
  updatedJobs: number;
  extractionsRun: number;
  extractionsFailed: number;
}

async function backfillCompany(
  companyId: string,
  companyName: string,
  atsType: string,
  atsIdentifier: string,
  careersUrl: string | null
): Promise<BackfillResult> {
  const result: BackfillResult = {
    company: companyName,
    jobsFetched: 0,
    newJobs: 0,
    reactivatedJobs: 0,
    updatedJobs: 0,
    extractionsRun: 0,
    extractionsFailed: 0,
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Backfilling: ${companyName} (${atsType})`);
  console.log(`${"=".repeat(60)}`);

  // Step 1: Fetch current jobs from the scraper
  console.log("\n📡 Fetching jobs from scraper...");
  let jobs: JobData[];
  try {
    jobs = await fetchJobs(atsType, atsIdentifier, careersUrl || undefined);
    result.jobsFetched = jobs.length;
    console.log(`   Found ${jobs.length} jobs`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Scraper failed: ${msg}`);
    return result;
  }

  if (jobs.length === 0) {
    console.log("   No jobs found, skipping");
    return result;
  }

  // Step 2: Get existing job postings for this company
  console.log("\n📊 Checking existing database records...");
  const { data: existing, error: fetchError } = await supabase
    .from("job_postings")
    .select("id, external_id, is_active, first_seen_date, last_seen_date")
    .eq("company_id", companyId);

  if (fetchError) {
    console.error(`   ❌ Failed to fetch existing jobs: ${fetchError.message}`);
    return result;
  }

  const existingMap = new Map(
    (existing ?? []).map((e) => [e.external_id, e])
  );
  console.log(`   ${existingMap.size} existing records in database`);

  // Step 3: Process each scraped job
  console.log("\n💾 Processing jobs...");
  const newJobIds: string[] = [];
  const extractionJobs: Array<{ id: string; title: string; description: string; department?: string | null; location?: string | null }> = [];

  for (const job of jobs) {
    const row = {
      ...jobToRow(job),
      company_id: companyId,
      last_seen_date: new Date().toISOString(),
      is_active: true,
    };

    const existingRecord = existingMap.get(job.external_id);

    if (existingRecord) {
      // Job exists in database
      if (!existingRecord.is_active) {
        // Job was marked as closed during the gap — reactivate it
        if (!DRY_RUN) {
          await supabase
            .from("job_postings")
            .update({
              is_active: true,
              closed_date: null,
              last_seen_date: row.last_seen_date,
            })
            .eq("id", existingRecord.id);
        }
        result.reactivatedJobs++;
        console.log(`   🔄 Reactivated: ${job.title}`);
      } else {
        // Already active, just update last_seen_date
        if (!DRY_RUN) {
          const validatedLocation = isValidLocation(row.location) ? row.location : null;
          await supabase
            .from("job_postings")
            .update({
              last_seen_date: row.last_seen_date,
              location: validatedLocation,
              url: row.url,
            })
            .eq("id", existingRecord.id);
        }
        result.updatedJobs++;
      }
    } else {
      // New job — insert it
      // Use posted_date as first_seen_date if available, otherwise use now
      const firstSeenDate = row.posted_date || row.last_seen_date;

      if (!DRY_RUN) {
        const { data: inserted, error: insertError } = await supabase
          .from("job_postings")
          .insert({
            ...row,
            first_seen_date: firstSeenDate,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error(`   ❌ Failed to insert: ${job.title} — ${insertError.message}`);
          continue;
        }

        if (inserted?.id) {
          newJobIds.push(inserted.id);
          // Queue for extraction if we have a description
          if (row.description_text) {
            extractionJobs.push({
              id: inserted.id,
              title: job.title,
              description: row.description_text,
              department: row.department,
              location: row.location,
            });
          }
        }
      }
      result.newJobs++;
      console.log(`   ✅ New: ${job.title} (posted: ${job.posted_date?.toLocaleDateString() || "unknown"})`);
    }
  }

  // Step 4: Run Silver Layer extraction on new jobs
  if (extractionJobs.length > 0 && !DRY_RUN) {
    console.log(`\n🧠 Running Silver Layer extraction on ${extractionJobs.length} new jobs...`);

    for (const job of extractionJobs) {
      try {
        const structure = await extractJobStructure(job.title, job.description, job.department);
        if (structure) {
          const normalizedTitle = normalizeJobTitle(job.title);
          const cleanedDepartment = isValidDepartment(job.department) ? job.department : null;

          // Build formatted location from structured data
          let formattedLocation: string | null = null;
          if (structure.location_structured?.formatted) {
            formattedLocation = structure.location_structured.formatted;
          } else if (structure.location_structured) {
            const parts: string[] = [];
            if (structure.location_structured.city) parts.push(structure.location_structured.city);
            if (structure.location_structured.state) parts.push(structure.location_structured.state);
            if (structure.location_structured.country) parts.push(structure.location_structured.country);
            formattedLocation = parts.length > 0 ? parts.join(", ") : null;
          }

          const cleanedLocation = isValidLocation(job.location) ? job.location : null;
          const finalLocation = formattedLocation || cleanedLocation || null;

          await supabase
            .from("job_postings")
            .update({
              summary: structure.summary,
              seniority_level: structure.seniority_level,
              salary_min: structure.salary_min,
              salary_max: structure.salary_max,
              salary_currency: structure.salary_currency,
              tech_stack: structure.tech_stack,
              keywords: structure.keywords || [],
              standardized_department: structure.standardized_department,
              function_category: structure.function_category,
              normalized_title: normalizedTitle,
              department: cleanedDepartment,
              location_structured: structure.location_structured,
              location: finalLocation,
            })
            .eq("id", job.id);

          result.extractionsRun++;
        }
      } catch (error) {
        result.extractionsFailed++;
        console.error(`   ⚠️ Extraction failed for ${job.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`   Extractions: ${result.extractionsRun} succeeded, ${result.extractionsFailed} failed`);
  }

  // Step 5: Update company last_collected_at
  if (!DRY_RUN && result.jobsFetched > 0) {
    await supabase
      .from("companies")
      .update({ last_collected_at: new Date().toISOString() })
      .eq("id", companyId);
  }

  return result;
}

async function triggerQuestradeGitHubActions() {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Questrade: Triggering GitHub Actions for browser scraping");
  console.log(`${"=".repeat(60)}`);

  // Get Questrade company ID
  const { data: questrade } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", "questrade")
    .single();

  if (!questrade) {
    console.error("❌ Questrade not found in database");
    return;
  }

  const token = process.env.GJ_GITHUB_TOKEN;
  const owner = process.env.GJ_GITHUB_OWNER;
  const repo = process.env.GJ_GITHUB_REPO;

  if (!token || !owner || !repo) {
    console.error("❌ Missing GJ_GITHUB_TOKEN, GJ_GITHUB_OWNER, or GJ_GITHUB_REPO");
    return;
  }

  if (DRY_RUN) {
    console.log("   [DRY RUN] Would trigger GitHub Actions workflow for Questrade");
    return;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/scrape-heavy.yml/dispatches`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          company_id: questrade.id,
        },
      }),
    });

    if (response.ok || response.status === 204) {
      console.log("✅ GitHub Actions workflow triggered for Questrade");
      console.log("   The workflow will scrape jobs and ingest them automatically.");
      console.log("   Check GitHub Actions for progress: https://github.com/" + owner + "/" + repo + "/actions");
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed to trigger workflow: ${response.status} ${errorText}`);
    }
  } catch (error) {
    console.error(`❌ Error triggering workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log("🚀 Backfill Missed Jobs Script");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no database changes)" : "LIVE"}`);
  console.log(`Date: ${new Date().toISOString()}\n`);

  const results: BackfillResult[] = [];

  // Backfill Tangerine (API-based, runs locally)
  if (!QUESTRADE_ONLY) {
    const { data: tangerine } = await supabase
      .from("companies")
      .select("id, name, ats_type, ats_identifier, careers_url")
      .eq("slug", "tangerine")
      .single();

    if (tangerine) {
      const result = await backfillCompany(
        tangerine.id,
        tangerine.name,
        tangerine.ats_type,
        tangerine.ats_identifier || "Tangerine",
        tangerine.careers_url
      );
      results.push(result);
    } else {
      console.error("❌ Tangerine not found in database");
    }
  }

  // Trigger Questrade backfill via GitHub Actions
  if (!TANGERINE_ONLY) {
    await triggerQuestradeGitHubActions();
  }

  // Print summary
  console.log(`\n\n${"=".repeat(60)}`);
  console.log("BACKFILL SUMMARY");
  console.log(`${"=".repeat(60)}`);

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN — no changes were made to the database\n");
  }

  for (const r of results) {
    console.log(`\n${r.company}:`);
    console.log(`  Jobs fetched:       ${r.jobsFetched}`);
    console.log(`  New jobs inserted:  ${r.newJobs}`);
    console.log(`  Reactivated:        ${r.reactivatedJobs}`);
    console.log(`  Updated:            ${r.updatedJobs}`);
    console.log(`  Extractions run:    ${r.extractionsRun}`);
    console.log(`  Extractions failed: ${r.extractionsFailed}`);
  }

  if (!TANGERINE_ONLY) {
    console.log("\nQuestrade:");
    console.log("  Backfill triggered via GitHub Actions (runs asynchronously)");
  }

  const totalNew = results.reduce((s, r) => s + r.newJobs, 0);
  const totalReactivated = results.reduce((s, r) => s + r.reactivatedJobs, 0);
  console.log(`\nTotal new jobs: ${totalNew}`);
  console.log(`Total reactivated: ${totalReactivated}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
