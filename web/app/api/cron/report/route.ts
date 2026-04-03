/**
 * Weekly Report Cron Job
 * 
 * Generates and sends the weekly hiring digest email.
 * Also persists the digest to the database for web UI display.
 * 
 * Runs: Weekly on Monday (configured in vercel.json)
 * Trigger: GET /api/cron/report with Authorization: Bearer {CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { format } from "date-fns";
import {
  generateCompanyInsight,
  getNextCompanyForInsight,
} from "@/lib/analysis/company-insights";
import { getWeeklyData, generateWeeklyReport, WeeklyDigest } from "@/lib/analysis/digest";
import { isOptedInToWeeklyDigest } from "@/lib/email/digest-recipients";
import { isLikelyResendBlockedRecipientEmail } from "@/lib/email/resend-recipients";
import { getResendError } from "@/lib/email/resend-result";
import { WeeklyDigestEmail } from "@/lib/email/templates/weekly-digest";
import { getLatestVersion } from "@/lib/releases";
import { requireCronAuth } from "@/lib/cron/auth";

export const maxDuration = 300; // Increased to handle company insights and AI generation

/**
 * Saves the generated digest to the database for web UI display.
 * Creates a weekly_digests row and weekly_digest_companies rows for each company.
 * 
 * @param digest - The generated weekly digest
 * @param emailSent - Whether emails were sent successfully
 * @param recipientCount - Number of recipients (if sent)
 * @returns The created digest ID
 */
async function saveDigestToDatabase(
  digest: WeeklyDigest,
  emailSent: boolean,
  recipientCount: number | null
): Promise<string | null> {
  const supabase = createAdminClient();
  
  try {
    // Insert the main digest record
    const { data: digestRecord, error: digestError } = await supabase
      .from("weekly_digests")
      .insert({
        week_start: digest.week_start,
        week_end: digest.week_end,
        generated_at: digest.generated_at,
        total_jobs: digest.total_jobs,
        total_companies: digest.total_companies,
        global_summary: digest.global_summary,
        industry_trends: digest.industry_trends,
        strategy_signals: digest.strategy_signals,
        notable_movements: digest.notable_movements,
        email_sent: emailSent,
        email_recipient: recipientCount ? `${recipientCount} users` : null,
        email_sent_at: emailSent ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (digestError) {
      // If it's a duplicate, that's okay - fetch existing
      if (digestError.code === "23505") {
        console.log("Digest already exists for this week, updating...");
        const { data: existing } = await supabase
          .from("weekly_digests")
          .select("id")
          .eq("week_start", digest.week_start)
          .eq("week_end", digest.week_end)
          .single();
        
        if (existing) {
          // Update existing digest
          await supabase
            .from("weekly_digests")
            .update({
              generated_at: digest.generated_at,
              total_jobs: digest.total_jobs,
              total_companies: digest.total_companies,
              global_summary: digest.global_summary,
              industry_trends: digest.industry_trends,
              strategy_signals: digest.strategy_signals,
              notable_movements: digest.notable_movements,
              email_sent: emailSent,
              email_recipient: recipientCount ? `${recipientCount} users` : null,
              email_sent_at: emailSent ? new Date().toISOString() : null,
            })
            .eq("id", existing.id);
          
          // Delete old company summaries and re-insert
          await supabase
            .from("weekly_digest_companies")
            .delete()
            .eq("digest_id", existing.id);
          
          // Insert company summaries
          await insertCompanySummaries(existing.id, digest);
          
          return existing.id;
        }
      }
      
      console.error("Error saving digest:", digestError);
      return null;
    }

    const digestId = digestRecord.id;

    // Insert company summaries
    await insertCompanySummaries(digestId, digest);

    console.log(`Saved digest ${digestId} with ${digest.total_companies} company summaries`);
    return digestId;
  } catch (error) {
    console.error("Error saving digest to database:", error);
    return null;
  }
}

/**
 * Inserts company summaries for a digest
 */
async function insertCompanySummaries(digestId: string, digest: WeeklyDigest): Promise<void> {
  const supabase = createAdminClient();
  
  if (digest.companies.length === 0) return;

  const companySummaries = digest.companies.map((company) => ({
    digest_id: digestId,
    company_id: company.company_id,
    headline: company.ai_commentary.headline,
    body: company.ai_commentary.body,
    new_job_count: company.new_job_count,
    current_open_job_count: company.current_open_job_count,
    year_to_date_job_count: company.year_to_date_job_count,
    departments: company.departments,
    dominant_tech: company.dominant_tech,
    seniority_breakdown: company.seniority_breakdown,
    weekly_role_themes: company.hiring_pattern.weekly_role_themes,
    open_role_themes: company.hiring_pattern.open_role_themes,
    year_to_date_role_themes: company.hiring_pattern.year_to_date_role_themes,
    continuity: company.hiring_pattern.continuity,
    continuing_themes: company.hiring_pattern.continuing_themes,
    new_themes: company.hiring_pattern.new_themes,
    job_ids: company.jobs.map((j) => j.id),
  }));

  const { error: summaryError } = await supabase
    .from("weekly_digest_companies")
    .insert(companySummaries);

  if (summaryError) {
    console.error("Error saving company summaries:", summaryError);
  }
}

/**
 * Chunks an array into smaller arrays of specified size
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Tracks email delivery status in the database
 */
async function trackDeliveries(
  digestId: string,
  deliveries: Array<{ user_id: string; email: string; status: "sent" | "failed"; error_message?: string }>
): Promise<void> {
  const supabase = createAdminClient();
  
  if (deliveries.length === 0) return;

  const deliveryRecords = deliveries.map((delivery) => ({
    digest_id: digestId,
    user_id: delivery.user_id,
    email: delivery.email,
    status: delivery.status,
    error_message: delivery.error_message || null,
  }));

  const { error } = await supabase
    .from("weekly_digest_deliveries")
    .upsert(deliveryRecords, { onConflict: "digest_id,user_id" });

  if (error) {
    console.error("Error tracking deliveries:", error);
  }
}

export async function GET(req: NextRequest) {
  // Validate cron authentication
  const authError = requireCronAuth(req);
  if (authError) {
    return authError;
  }

  console.log("Cron job started: report", {
    timestamp: new Date().toISOString(),
    path: req.nextUrl.pathname,
  });

  const supabase = createAdminClient();
  
  // Create job_runs entry for tracking (unified job tracking system)
  const { data: jobRun } = await supabase
    .from("job_runs")
    .insert({
      job_type: "report",
      trigger_type: "cron",
      scope: "all",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const jobRunId = jobRun?.id;

  try {
    // Generate the weekly digest with AI commentary first (critical path; company
    // insight runs after so a timeout during insight does not block digest/emails)
    console.log("Fetching weekly job data...");
    const weeklyData = await getWeeklyData(7);
    console.log(`Found ${weeklyData.size} companies with new jobs`);

    console.log("Generating AI commentary for weekly digest...");
    const digest = await generateWeeklyReport(weeklyData);
    console.log(`Generated digest with ${digest.total_jobs} total jobs`);

    // Save digest to database first (before sending emails)
    console.log("Saving digest to database...");
    const savedDigestId = await saveDigestToDatabase(
      digest, 
      false, // Will update after emails are sent
      null
    );

    if (!savedDigestId) {
      throw new Error("Failed to save digest to database");
    }

    // Fetch users who have opted in to weekly digest emails
    // Default is opt-out model: weekly_digest is true by default (null = enabled)
    console.log("Fetching users with weekly digest enabled...");
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, email, email_preferences");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    const optedInUsers = (users || [])
      .filter((u) => isOptedInToWeeklyDigest(u))
      .map((u) => ({ id: u.id, email: u.email! }));

    console.log(
      `Found ${optedInUsers.length} users opted in to weekly digest (${(users || []).length} profiles total)`
    );

    // Send emails using Resend Batch API
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fintech-talent-brief.vercel.app";
    const from = process.env.RESEND_FROM || "onboarding@resend.dev";
    const resendKey = process.env.RESEND_API_KEY;
    /** When set (e.g. local dev), every digest is addressed to this inbox instead of profile emails — avoids Resend rejecting @example.com test users. */
    const digestRedirectTo = process.env.WEEKLY_DIGEST_REDIRECT_TO?.trim() || null;
    const subject = `The Fintech Talent Brief – ${format(new Date(), "MMM d, yyyy")}`;

    if (digestRedirectTo) {
      console.warn(
        `WEEKLY_DIGEST_REDIRECT_TO=${digestRedirectTo}: all digest deliveries use this address (not profile emails).`
      );
    } else if (optedInUsers.some((u) => isLikelyResendBlockedRecipientEmail(u.email))) {
      console.warn(
        "One or more recipients use a domain Resend blocks (e.g. @example.com). " +
          "Set WEEKLY_DIGEST_REDIRECT_TO to a real inbox in .env.local, or update profiles.email in Supabase."
      );
    }

    let emailSent = false;
    let successCount = 0;
    let failureCount = 0;
    let emailSkipReason: string | null = null;
    let lastResendError: string | null = null;
    const deliveryTracking: Array<{ user_id: string; email: string; status: "sent" | "failed"; error_message?: string }> = [];

    if (resendKey && optedInUsers.length > 0) {
      try {
        const resend = new Resend(resendKey);
        
        // Chunk users into batches of 100 (Resend batch limit)
        const userChunks = chunk(optedInUsers, 100);
        console.log(`Sending emails in ${userChunks.length} batch(es) of up to 100 users each`);

        // Process each chunk
        for (let chunkIndex = 0; chunkIndex < userChunks.length; chunkIndex++) {
          const chunk = userChunks[chunkIndex];
          console.log(`Processing batch ${chunkIndex + 1}/${userChunks.length} (${chunk.length} users)...`);

          try {
            // Prepare batch email payload
            const batchEmails = chunk.map((user) => ({
              from,
              to: digestRedirectTo ?? user.email,
              subject: digestRedirectTo
                ? `[dev → ${user.email}] ${subject}`
                : subject,
              react: WeeklyDigestEmail({ digest, digestId: savedDigestId, appUrl, version: getLatestVersion() }),
            }));

            const sendResult = await resend.batch.send(batchEmails);
            const batchErr = getResendError(sendResult);
            if (batchErr) {
              throw new Error(batchErr);
            }

            // Track successful deliveries
            chunk.forEach((user) => {
              deliveryTracking.push({
                user_id: user.id,
                email: user.email,
                status: "sent",
              });
              successCount++;
            });

            console.log(`Batch ${chunkIndex + 1} sent successfully (${chunk.length} emails)`);
          } catch (chunkError) {
            console.error(`Error sending batch ${chunkIndex + 1}:`, chunkError);
            const errorMessage =
              chunkError instanceof Error ? chunkError.message : "Unknown error";
            lastResendError = errorMessage;
            chunk.forEach((user) => {
              deliveryTracking.push({
                user_id: user.id,
                email: user.email,
                status: "failed",
                error_message: errorMessage,
              });
              failureCount++;
            });
          }
        }

        emailSent = successCount > 0;
        console.log(`Email sending completed: ${successCount} sent, ${failureCount} failed`);

        // Track all deliveries in database
        if (deliveryTracking.length > 0) {
          await trackDeliveries(savedDigestId, deliveryTracking);
        }

        // Update digest record with email status
        await supabase
          .from("weekly_digests")
          .update({
            email_sent: emailSent,
            email_recipient: emailSent ? `${successCount} users` : null,
            email_sent_at: emailSent ? new Date().toISOString() : null,
          })
          .eq("id", savedDigestId);

      } catch (e) {
        console.error("Resend batch error:", e);
        lastResendError =
          e instanceof Error ? e.message : "Resend batch error";
        // Don't fail the whole job if email fails - digest is already saved
      }
    } else {
      if (!resendKey) {
        emailSkipReason = "missing_resend_api_key";
        console.warn("Email not sent: RESEND_API_KEY not configured");
      } else if (optedInUsers.length === 0) {
        emailSkipReason = "no_recipients_no_email_or_all_opted_out";
        console.warn(
          "Email not sent: no recipients (profiles missing email or all opted out of weekly digest)"
        );
      }
    }

    // Generate one company insight per week (after digest/emails so timeout does not block delivery)
    let companyInsightResult: { success: boolean; companyId?: string; companyName?: string; insightId?: string; message?: string; error?: string } | null = null;
    try {
      const company = await getNextCompanyForInsight();
      if (company) {
        console.log(`Generating insight for ${company.name}...`);
        const insight = await generateCompanyInsight(company.id, company.name, {
          periodDays: 90,
          researchDepth: "deep",
          forceRegenerate: false,
        });
        companyInsightResult = { success: true, companyId: company.id, companyName: company.name, insightId: insight.id };
      } else {
        companyInsightResult = { success: true, message: "All companies have recent insights" };
      }
    } catch (error) {
      console.error("Error generating company insight:", error);
      companyInsightResult = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }

    // Update job_runs with success (unified job tracking)
    if (jobRunId) {
      await supabase
        .from("job_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_companies: digest.total_companies,
          total_insights: digest.total_companies,
          details: { 
            totalJobs: digest.total_jobs,
            totalCompanies: digest.total_companies,
            digestId: savedDigestId,
            companySummaries: digest.companies.map(c => ({
              name: c.company_name,
              jobCount: c.new_job_count,
              headline: c.ai_commentary.headline,
            })),
            emailSent,
            recipients: emailSent ? successCount : 0,
            failures: failureCount,
            emailSkipReason,
            resendError: lastResendError,
            companyInsight: companyInsightResult,
          },
        })
        .eq("id", jobRunId);
    }

    return NextResponse.json({ 
      success: true, 
      sent: emailSent,
      emailsSent: successCount,
      emailsFailed: failureCount,
      totalRecipients: optedInUsers.length,
      emailSkipReason,
      resendError: lastResendError,
      digestId: savedDigestId,
      digest: {
        totalJobs: digest.total_jobs,
        totalCompanies: digest.total_companies,
        companies: digest.companies.map(c => ({
          name: c.company_name,
          jobCount: c.new_job_count,
          headline: c.ai_commentary.headline,
        })),
      },
      companyInsight: companyInsightResult,
    });
  } catch (error) {
    console.error("Report cron error:", error);
    // Update job_runs with error (unified job tracking)
    if (jobRunId) {
      await supabase
        .from("job_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", jobRunId);
    }
    throw error;
  }
}
