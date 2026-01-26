#!/usr/bin/env npx tsx
/**
 * Inspect Questrade Job Descriptions
 * 
 * Shows the actual content of description_html to see what was captured.
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const companyId = "4a99a35d-9794-4eaf-a3df-c37162fdceef";

  console.log("🔍 Inspecting Questrade Job Descriptions\n");
  console.log("═".repeat(70));

  // Get a few jobs
  const { data: jobs, error } = await supabase
    .from("job_postings")
    .select("id, title, description_html, description_text")
    .eq("company_id", companyId)
    .order("last_seen_date", { ascending: false })
    .limit(3);

  if (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("⚠️  No jobs found");
    return;
  }

  for (const job of jobs) {
    console.log(`\n📋 ${job.title}`);
    console.log("─".repeat(70));
    console.log(`Description HTML Length: ${job.description_html?.length || 0}`);
    console.log(`Description Text Length: ${job.description_text?.length || 0}`);
    
    if (job.description_html) {
      const html = job.description_html;
      const hasSpinner = html.includes('ant-spin-spinning') || html.includes('ant-spin-dot');
      console.log(`Contains Spinner: ${hasSpinner ? "❌ YES" : "✅ NO"}`);
      
      // Show first 500 chars
      console.log(`\nFirst 500 chars of HTML:`);
      console.log(html.substring(0, 500));
      console.log("...");
      
      // Try to extract text
      const textFromHtml = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`\nExtracted Text (${textFromHtml.length} chars):`);
      console.log(textFromHtml.substring(0, 300));
    } else {
      console.log("⚠️  No description_html");
    }
    
    if (job.description_text) {
      console.log(`\nDescription Text (${job.description_text.length} chars):`);
      console.log(job.description_text.substring(0, 300));
    } else {
      console.log("\n⚠️  No description_text");
    }
  }
}

main().catch(console.error);
