import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchJobs, jobToRow } from "@/lib/scrapers";
import { analyzeJobAdvanced } from "@/lib/analysis";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: companies } = await supabase.from("companies").select("*").eq("is_active", true);
  let totalNew = 0;
  let totalClosed = 0;

  for (const company of companies ?? []) {
    try {
      const jobs = await fetchJobs(company.ats_type, company.ats_identifier);
      const { data: existing } = await supabase
        .from("job_postings")
        .select("id, external_id")
        .eq("company_id", company.id);
      const existingMap = new Map((existing ?? []).map((e) => [e.external_id, e.id]));
      const fetchedIds = new Set(jobs.map((j) => j.external_id));

      for (const job of jobs) {
        const row = {
          ...jobToRow(job),
          company_id: company.id,
          last_seen_date: new Date().toISOString(),
          is_active: true,
        };
        const id = existingMap.get(job.external_id);
        if (id) {
          await supabase
            .from("job_postings")
            .update({
              last_seen_date: row.last_seen_date,
              description_html: row.description_html,
              description_text: row.description_text,
              department: row.department,
              location: row.location,
              location_type: row.location_type,
              commitment: row.commitment,
              url: row.url,
              posted_date: row.posted_date,
            })
            .eq("id", id);
        } else {
          const { data: inserted } = await supabase
            .from("job_postings")
            .insert({
              ...row,
              first_seen_date: row.last_seen_date,
            })
            .select("id")
            .single();
          totalNew++;
          if (inserted?.id && company.track_for_strategy) {
            // Use advanced analysis with Gemini 3 Pro
            const insight = await analyzeJobAdvanced({
              companyId: company.id,
              companyName: company.name,
              job: {
                title: job.title,
                department: job.department,
                location: job.location,
                description_text: job.description_text,
              },
            });
            
            if (insight) {
              // Extract web context for storage
              const webContext = insight.web_corroboration 
                ? [{ snippet: insight.web_corroboration }] 
                : [];

              await supabase.from("strategic_insights").insert({
                job_posting_id: inserted.id,
                category: insight.category,
                insight_summary: insight.insight_summary,
                strategic_signals: insight.strategic_signals,
                is_new_direction: insight.is_new_direction,
                confidence: insight.confidence,
                // Advanced fields
                novelty_score: insight.novelty_score,
                novelty_reasoning: insight.novelty_reasoning,
                is_executive_movement: insight.is_executive_movement,
                executive_context: insight.executive_context,
                strategic_hypothesis: insight.strategic_hypothesis,
                web_context: webContext,
                model_reasoning: insight.model_reasoning,
              });
            }
          }
        }
      }

      for (const [extId, id] of existingMap) {
        if (!fetchedIds.has(extId)) {
          await supabase
            .from("job_postings")
            .update({ is_active: false, closed_date: new Date().toISOString() })
            .eq("id", id);
          totalClosed++;
        }
      }

      await supabase.from("companies").update({ last_collected_at: new Date().toISOString() }).eq("id", company.id);
    } catch (e) {
      console.error(`Collect error for ${company.name}:`, e);
    }
  }

  return NextResponse.json({ success: true, newJobs: totalNew, closedJobs: totalClosed });
}
