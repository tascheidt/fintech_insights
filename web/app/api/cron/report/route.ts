/**
 * Weekly Report Cron Job
 * 
 * Generates and sends the weekly TLDR-style digest email.
 * Also persists the digest to the database for web UI display.
 * 
 * Runs: Weekly on Monday at 8 AM UTC (configured in vercel.json)
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
import { WeeklyDigestEmail } from "@/lib/email/templates/weekly-digest";

export const maxDuration = 300; // Increased to handle company insights and AI generation

/**
 * Saves the generated digest to the database for web UI display.
 * Creates a weekly_digests row and weekly_digest_companies rows for each company.
 * 
 * @param digest - The generated weekly digest
 * @param emailSent - Whether the email was sent successfully
 * @param recipient - Email recipient (if sent)
 * @returns The created digest ID
 */
async function saveDigestToDatabase(
  digest: WeeklyDigest,
  emailSent: boolean,
  recipient: string | null
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
        email_sent: emailSent,
        email_recipient: recipient,
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
              email_sent: emailSent,
              email_recipient: recipient,
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
    departments: company.departments,
    dominant_tech: company.dominant_tech,
    seniority_breakdown: company.seniority_breakdown,
    job_ids: company.jobs.map((j) => j.id),
  }));

  const { error: summaryError } = await supabase
    .from("weekly_digest_companies")
    .insert(companySummaries);

  if (summaryError) {
    console.error("Error saving company summaries:", summaryError);
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  
  // Create cron log entry
  const { data: cronLog } = await supabase
    .from("cron_logs")
    .insert({
      job_type: "report",
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const cronLogId = cronLog?.id;

  try {
    // First, generate company insights (process one company per week)
    let companyInsightResult = null;
    try {
      const company = await getNextCompanyForInsight();
      if (company) {
        console.log(`Generating insight for ${company.name}...`);
        const insight = await generateCompanyInsight(company.id, company.name, {
          periodDays: 90,
          researchDepth: "deep",
          forceRegenerate: false,
        });
        companyInsightResult = {
          success: true,
          companyId: company.id,
          companyName: company.name,
          insightId: insight.id,
        };
      } else {
        companyInsightResult = {
          success: true,
          message: "All companies have recent insights",
        };
      }
    } catch (error) {
      console.error("Error generating company insight:", error);
      companyInsightResult = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      // Continue with report generation even if insight generation fails
    }

    // Generate the weekly digest with AI commentary
    console.log("Fetching weekly job data...");
    const weeklyData = await getWeeklyData(7);
    console.log(`Found ${weeklyData.size} companies with new jobs`);

    console.log("Generating AI commentary for weekly digest...");
    const digest = await generateWeeklyReport(weeklyData);
    console.log(`Generated digest with ${digest.total_jobs} total jobs`);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fintech-insights.vercel.app";
    const to = process.env.REPORT_EMAIL || process.env.ADMIN_EMAIL;
    const from = process.env.RESEND_FROM || "onboarding@resend.dev";
    const resendKey = process.env.RESEND_API_KEY;

    let emailSent = false;
    if (resendKey && to) {
      try {
        const resend = new Resend(resendKey);
        
        // Send email using React Email template
        await resend.emails.send({
          from,
          to,
          subject: `Fintech Insights TLDR – ${format(new Date(), "MMM d, yyyy")}`,
          react: WeeklyDigestEmail({ digest, appUrl }),
        });
        
        emailSent = true;
        console.log(`Weekly digest email sent to ${to}`);
      } catch (e) {
        console.error("Resend error:", e);
        // Don't fail the whole job if email fails - still save to DB
      }
    } else {
      console.warn("Email not sent: RESEND_API_KEY or REPORT_EMAIL not configured");
    }

    // Save digest to database for web UI display
    console.log("Saving digest to database...");
    const savedDigestId = await saveDigestToDatabase(
      digest, 
      emailSent, 
      emailSent ? (to ?? null) : null
    );

    // Update cron log with success
    if (cronLogId) {
      await supabase
        .from("cron_logs")
        .update({
          status: "success",
          completed_at: new Date().toISOString(),
          insights_generated: digest.total_companies,
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
            recipient: emailSent ? to : null,
            companyInsight: companyInsightResult,
          },
        })
        .eq("id", cronLogId);
    }

    return NextResponse.json({ 
      success: true, 
      sent: emailSent,
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
    // Update cron log with error
    if (cronLogId) {
      await supabase
        .from("cron_logs")
        .update({
          status: "error",
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : "Unknown error",
        })
        .eq("id", cronLogId);
    }
    throw error;
  }
}
