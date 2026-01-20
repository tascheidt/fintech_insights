import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { format } from "date-fns";
import {
  generateCompanyInsight,
  getNextCompanyForInsight,
} from "@/lib/analysis/company-insights";
import { getWeeklyData, generateWeeklyReport } from "@/lib/analysis/digest";
import { WeeklyDigestEmail } from "@/lib/email/templates/weekly-digest";

export const maxDuration = 300; // Increased to handle company insights and AI generation

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
        // Update cron log with error
        if (cronLogId) {
          await supabase
            .from("cron_logs")
            .update({
              status: "error",
              completed_at: new Date().toISOString(),
              error_message: e instanceof Error ? e.message : "Failed to send email",
              details: { 
                totalJobs: digest.total_jobs, 
                totalCompanies: digest.total_companies,
                companyInsight: companyInsightResult,
              },
            })
            .eq("id", cronLogId);
        }
        return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
      }
    } else {
      console.warn("Email not sent: RESEND_API_KEY or REPORT_EMAIL not configured");
    }

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
