/**
 * Analyze Function Categories vs Standardized Department
 * 
 * Compares title-based function categorization with AI-extracted standardized_department
 * to determine if they overlap significantly or serve different purposes.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/analyze-function-vs-department.ts
 *   npx tsx --env-file=.env.local web/scripts/analyze-function-vs-department.ts --limit=1000
 *   npx tsx --env-file=.env.local web/scripts/analyze-function-vs-department.ts --sample=50
 */

import { createAdminClient } from "../lib/supabase/admin";
import { quickCategorize, getCategoryLabel, getCategoryGroup, type RoleCategory } from "../lib/analysis/function-categories";

async function main() {
  console.log("🔍 Analyzing Function Categories vs Standardized Department\n");

  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith("--limit="));
  const sampleArg = args.find(arg => arg.startsWith("--sample="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;
  const sampleSize = sampleArg ? parseInt(sampleArg.split("=")[1]) : undefined;

  const supabase = createAdminClient();

  // Fetch jobs with both title and standardized_department
  let query = supabase
    .from("job_postings")
    .select("id, title, standardized_department")
    .not("standardized_department", "is", null)
    .neq("standardized_department", "");

  if (limit) {
    query = query.limit(limit);
  }

  const { data: jobs, error } = await query;

  if (error) {
    console.error("❌ Error fetching jobs:", error);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log("⚠️  No jobs found with standardized_department");
    process.exit(0);
  }

  // Sample if requested
  const jobsToAnalyze = sampleSize 
    ? jobs.sort(() => Math.random() - 0.5).slice(0, sampleSize)
    : jobs;

  console.log(`📊 Analyzing ${jobsToAnalyze.length} job(s)\n`);

  // Categorize each job by function
  const analyzed = jobsToAnalyze.map(job => {
    const functionCategory = quickCategorize(job.title);
    const functionLabel = getCategoryLabel(functionCategory);
    const functionGroup = getCategoryGroup(functionCategory);
    
    return {
      id: job.id,
      title: job.title,
      standardized_department: job.standardized_department,
      functionCategory,
      functionLabel,
      functionGroup,
    };
  });

  // 1. Count distribution of standardized_department values
  console.log("=".repeat(80));
  console.log("1. STANDARDIZED_DEPARTMENT DISTRIBUTION");
  console.log("=".repeat(80));
  const deptCounts = new Map<string, number>();
  for (const job of analyzed) {
    const dept = job.standardized_department || "null";
    deptCounts.set(dept, (deptCounts.get(dept) || 0) + 1);
  }
  const sortedDepts = Array.from(deptCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log(`\nTop ${sortedDepts.length} standardized_department values:\n`);
  for (const [dept, count] of sortedDepts) {
    const percentage = ((count / analyzed.length) * 100).toFixed(1);
    console.log(`  ${dept.padEnd(30)} ${count.toString().padStart(5)} (${percentage}%)`);
  }

  // 2. Count distribution of function groups
  console.log("\n" + "=".repeat(80));
  console.log("2. FUNCTION GROUP DISTRIBUTION");
  console.log("=".repeat(80));
  const groupCounts = new Map<string, number>();
  for (const job of analyzed) {
    const group = job.functionGroup;
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }
  const sortedGroups = Array.from(groupCounts.entries())
    .sort((a, b) => b[1] - a[1]);
  console.log(`\nFunction groups:\n`);
  for (const [group, count] of sortedGroups) {
    const percentage = ((count / analyzed.length) * 100).toFixed(1);
    console.log(`  ${group.padEnd(30)} ${count.toString().padStart(5)} (${percentage}%)`);
  }

  // 3. Cross-tabulation: standardized_department vs function group
  console.log("\n" + "=".repeat(80));
  console.log("3. CROSS-TABULATION: STANDARDIZED_DEPARTMENT vs FUNCTION GROUP");
  console.log("=".repeat(80));
  
  const crossTab = new Map<string, Map<string, number>>();
  for (const job of analyzed) {
    const dept = job.standardized_department || "null";
    const group = job.functionGroup;
    
    if (!crossTab.has(dept)) {
      crossTab.set(dept, new Map());
    }
    const groupMap = crossTab.get(dept)!;
    groupMap.set(group, (groupMap.get(group) || 0) + 1);
  }

  // Show top departments and their function group breakdown
  const topDepts = Array.from(crossTab.entries())
    .sort((a, b) => {
      const aTotal = Array.from(a[1].values()).reduce((sum, count) => sum + count, 0);
      const bTotal = Array.from(b[1].values()).reduce((sum, count) => sum + count, 0);
      return bTotal - aTotal;
    })
    .slice(0, 10);

  console.log("\nTop departments and their function group breakdown:\n");
  for (const [dept, groupMap] of topDepts) {
    const total = Array.from(groupMap.values()).reduce((sum, count) => sum + count, 0);
    const sortedGroups = Array.from(groupMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    console.log(`  ${dept} (${total} jobs):`);
    for (const [group, count] of sortedGroups) {
      const percentage = ((count / total) * 100).toFixed(1);
      console.log(`    ${group.padEnd(25)} ${count.toString().padStart(4)} (${percentage}%)`);
    }
    console.log();
  }

  // 4. Analyze mismatches: cases where department and function group don't align
  console.log("=".repeat(80));
  console.log("4. MISMATCH ANALYSIS");
  console.log("=".repeat(80));
  
  // Expected mappings (department -> expected function groups)
  const expectedMappings: Record<string, string[]> = {
    "Engineering": ["Engineering"],
    "Product": ["Product"],
    "Marketing": ["Marketing"],
    "Sales": ["Go-to-Market"],
    "Customer Success": ["Go-to-Market"],
    "Customer Support": ["Go-to-Market"],
    "Support": ["Go-to-Market"],
    "Operations": ["Operations"],
    "Finance": ["Operations"],
    "Legal": ["Operations"],
    "HR": ["Operations"],
    "People": ["Operations"],
    "Human Resources": ["Operations"],
    "Data": ["Operations", "Engineering"],
    "Analytics": ["Operations", "Engineering"],
    "Risk": ["Operations"],
    "Compliance": ["Operations"],
    "Leadership": ["Leadership"],
    "Executive": ["Leadership"],
  };

  const mismatches: Array<{
    title: string;
    department: string;
    functionGroup: string;
    expectedGroups: string[];
  }> = [];

  for (const job of analyzed) {
    const dept = job.standardized_department || "";
    const expectedGroups = expectedMappings[dept] || [];
    
    if (expectedGroups.length > 0 && !expectedGroups.includes(job.functionGroup)) {
      mismatches.push({
        title: job.title,
        department: dept,
        functionGroup: job.functionGroup,
        expectedGroups,
      });
    }
  }

  console.log(`\nFound ${mismatches.length} potential mismatches (${((mismatches.length / analyzed.length) * 100).toFixed(1)}%)\n`);
  
  if (mismatches.length > 0) {
    // Group mismatches by department
    const mismatchesByDept = new Map<string, typeof mismatches>();
    for (const mismatch of mismatches) {
      if (!mismatchesByDept.has(mismatch.department)) {
        mismatchesByDept.set(mismatch.department, []);
      }
      mismatchesByDept.get(mismatch.department)!.push(mismatch);
    }

    const topMismatchDepts = Array.from(mismatchesByDept.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 10);

    console.log("Top departments with mismatches:\n");
    for (const [dept, deptMismatches] of topMismatchDepts) {
      console.log(`  ${dept} (${deptMismatches.length} mismatches):`);
      
      // Show function groups that appear in mismatches
      const mismatchGroups = new Map<string, number>();
      for (const m of deptMismatches) {
        mismatchGroups.set(m.functionGroup, (mismatchGroups.get(m.functionGroup) || 0) + 1);
      }
      
      const sortedMismatchGroups = Array.from(mismatchGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      for (const [group, count] of sortedMismatchGroups) {
        console.log(`    → ${group}: ${count} job(s)`);
      }
      
      // Show sample titles
      console.log(`    Sample titles:`);
      for (const m of deptMismatches.slice(0, 3)) {
        console.log(`      - ${m.title}`);
      }
      console.log();
    }
  }

  // 5. Coverage analysis: how many jobs have both vs one vs neither
  console.log("=".repeat(80));
  console.log("5. COVERAGE ANALYSIS");
  console.log("=".repeat(80));
  
  const hasBoth = analyzed.filter(j => j.standardized_department && j.functionCategory !== "other").length;
  const hasDeptOnly = analyzed.filter(j => j.standardized_department && j.functionCategory === "other").length;
  const hasFunctionOnly = analyzed.filter(j => !j.standardized_department && j.functionCategory !== "other").length;
  const hasNeither = analyzed.filter(j => !j.standardized_department && j.functionCategory === "other").length;

  console.log(`\nCoverage breakdown:\n`);
  console.log(`  Both department and function:     ${hasBoth.toString().padStart(5)} (${((hasBoth / analyzed.length) * 100).toFixed(1)}%)`);
  console.log(`  Department only:                 ${hasDeptOnly.toString().padStart(5)} (${((hasDeptOnly / analyzed.length) * 100).toFixed(1)}%)`);
  console.log(`  Function only:                    ${hasFunctionOnly.toString().padStart(5)} (${((hasFunctionOnly / analyzed.length) * 100).toFixed(1)}%)`);
  console.log(`  Neither:                          ${hasNeither.toString().padStart(5)} (${((hasNeither / analyzed.length) * 100).toFixed(1)}%)`);
  console.log(`  Total:                            ${analyzed.length.toString().padStart(5)} (100.0%)`);

  // 6. Recommendations
  console.log("\n" + "=".repeat(80));
  console.log("6. RECOMMENDATIONS");
  console.log("=".repeat(80));
  
  const mismatchRate = (mismatches.length / analyzed.length) * 100;
  const alignmentRate = 100 - mismatchRate;
  
  console.log(`\nAlignment Rate: ${alignmentRate.toFixed(1)}%`);
  console.log(`Mismatch Rate: ${mismatchRate.toFixed(1)}%\n`);

  if (alignmentRate > 80) {
    console.log("✅ HIGH ALIGNMENT: Department and Function are well-aligned.");
    console.log("   Recommendation: Consider collapsing to a single field (standardized_department)");
    console.log("   OR use function categories as a more granular breakdown within departments.\n");
  } else if (alignmentRate > 60) {
    console.log("⚠️  MODERATE ALIGNMENT: Some overlap but also meaningful differences.");
    console.log("   Recommendation: Keep both fields but clarify their purposes:");
    console.log("   - standardized_department: Organizational unit (Engineering, Sales, etc.)");
    console.log("   - Function: Specific role type (backend engineering, product management, etc.)\n");
  } else {
    console.log("❌ LOW ALIGNMENT: Department and Function serve different purposes.");
    console.log("   Recommendation: Keep both fields as they capture different dimensions:\n");
    console.log("   - standardized_department: Organizational structure");
    console.log("   - Function: Role specialization and skills\n");
  }

  // Show specific examples
  if (mismatches.length > 0) {
    console.log("Sample mismatches to review:\n");
    for (const mismatch of mismatches.slice(0, 10)) {
      console.log(`  Title: ${mismatch.title}`);
      console.log(`    Department: ${mismatch.department}`);
      console.log(`    Function Group: ${mismatch.functionGroup}`);
      console.log(`    Expected Groups: ${mismatch.expectedGroups.join(", ")}`);
      console.log();
    }
  }
}

main().catch(console.error);
