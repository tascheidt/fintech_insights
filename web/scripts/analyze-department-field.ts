#!/usr/bin/env npx tsx
/**
 * Analyze Department Field Data
 * 
 * Reviews department field values in job_postings to identify:
 * - Empty/null values
 * - Invalid values (e.g., cookie-related text)
 * - Distribution of values
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/analyze-department-field.ts
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("🔍 Analyzing Department Field Data\n");
  console.log("═".repeat(70));

  const supabase = createAdminClient();

  try {
    // Get all jobs with department values
    const { data: allJobs, error: allError } = await supabase
      .from("job_postings")
      .select("id, title, department, company_id, first_seen_date, companies(name, slug)")
      .order("first_seen_date", { ascending: false });

    if (allError) {
      console.error("❌ Error fetching jobs:", allError);
      process.exit(1);
    }

    if (!allJobs || allJobs.length === 0) {
      console.log("⚠️  No jobs found in database.");
      return;
    }

    const totalJobs = allJobs.length;
    const jobsWithDept = allJobs.filter((j) => j.department && j.department.trim() !== "");
    const jobsWithoutDept = totalJobs - jobsWithDept.length;

    console.log(`\n📊 Summary:`);
    console.log(`   Total jobs: ${totalJobs}`);
    console.log(`   Jobs with department: ${jobsWithDept.length} (${((jobsWithDept.length / totalJobs) * 100).toFixed(1)}%)`);
    console.log(`   Jobs without department: ${jobsWithoutDept} (${((jobsWithoutDept / totalJobs) * 100).toFixed(1)}%)`);

    // Analyze department values
    const deptValues = new Map<string, number>();
    const suspiciousValues: Array<{ title: string; department: string; company: string; firstSeen: string }> = [];

    // Keywords that indicate bad data
    const badKeywords = [
      "cookie",
      "cookies",
      "accept",
      "privacy",
      "policy",
      "gdpr",
      "consent",
      "preferences",
      "settings",
      "manage",
      "necessary",
      "analytics",
      "marketing",
      "functional",
    ];

    jobsWithDept.forEach((job) => {
      const dept = job.department.toLowerCase().trim();
      deptValues.set(job.department, (deptValues.get(job.department) || 0) + 1);

      // Check for suspicious values
      const hasBadKeyword = badKeywords.some((keyword) => dept.includes(keyword));
      if (hasBadKeyword || dept.length < 3 || dept.length > 100) {
        suspiciousValues.push({
          title: job.title,
          department: job.department,
          company: (job.companies as any)?.name || "Unknown",
          firstSeen: new Date(job.first_seen_date).toISOString().split("T")[0],
        });
      }
    });

    console.log(`\n📈 Department Value Distribution:`);
    console.log(`   Unique department values: ${deptValues.size}`);

    // Show top 20 most common department values
    const sortedDepts = Array.from(deptValues.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    console.log(`\n   Top 20 department values:`);
    sortedDepts.forEach(([dept, count], index) => {
      console.log(`   ${(index + 1).toString().padStart(2)}. ${dept.padEnd(40)} (${count} jobs)`);
    });

    // Show suspicious values
    if (suspiciousValues.length > 0) {
      console.log(`\n⚠️  Suspicious Department Values (${suspiciousValues.length} found):`);
      console.log("   " + "─".repeat(68));
      suspiciousValues.slice(0, 50).forEach((job, index) => {
        console.log(`\n   ${index + 1}. Company: ${job.company}`);
        console.log(`      Title: ${job.title.substring(0, 60)}${job.title.length > 60 ? "..." : ""}`);
        console.log(`      Department: "${job.department}"`);
        console.log(`      First Seen: ${job.firstSeen}`);
      });

      if (suspiciousValues.length > 50) {
        console.log(`\n   ... and ${suspiciousValues.length - 50} more suspicious entries`);
      }
    } else {
      console.log(`\n✅ No suspicious department values found`);
    }

    // Group by company to see which companies have issues
    const companyIssues = new Map<string, number>();
    suspiciousValues.forEach((job) => {
      companyIssues.set(job.company, (companyIssues.get(job.company) || 0) + 1);
    });

    if (companyIssues.size > 0) {
      console.log(`\n🏢 Companies with Suspicious Department Values:`);
      Array.from(companyIssues.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([company, count]) => {
          console.log(`   - ${company}: ${count} jobs`);
        });
    }

    // Check which ATS types are affected
    const { data: companiesData, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, slug, ats_type");

    if (!companiesError && companiesData) {
      const companyMap = new Map(
        companiesData.map((c) => [c.id, { name: c.name, atsType: c.ats_type }])
      );

      const atsTypeIssues = new Map<string, number>();
      suspiciousValues.forEach((job) => {
        const companyInfo = companyMap.get(job.company);
        if (companyInfo) {
          atsTypeIssues.set(
            companyInfo.atsType,
            (atsTypeIssues.get(companyInfo.atsType) || 0) + 1
          );
        }
      });

      if (atsTypeIssues.size > 0) {
        console.log(`\n🔧 ATS Types with Suspicious Department Values:`);
        Array.from(atsTypeIssues.entries())
          .sort((a, b) => b[1] - a[1])
          .forEach(([atsType, count]) => {
            console.log(`   - ${atsType}: ${count} jobs`);
          });
      }
    }

    console.log("\n" + "═".repeat(70));
    console.log("\n💡 Recommendations:");
    
    if (suspiciousValues.length > 0) {
      console.log("   1. Review browser-based scrapers - they may be picking up cookie banners");
      console.log("   2. Add filtering logic to exclude cookie/privacy-related text");
      console.log("   3. Consider re-scraping affected companies if scrapers have been fixed");
      console.log("   4. Add validation to reject department values with suspicious keywords");
    } else {
      console.log("   ✅ Department field data looks clean!");
    }

    console.log();
  } catch (error) {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

main();
