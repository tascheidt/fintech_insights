/**
 * Cleanup Duplicate Digests Script
 * 
 * This script consolidates duplicate weekly digests by:
 * 1. Grouping digests by ISO week (year-week format)
 * 2. Keeping only the most recent digest per week
 * 3. Deleting older duplicates and their associated company summaries
 * 
 * Run with: npx tsx --env-file=.env.local scripts/cleanup-duplicate-digests.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Get ISO week number for a date
 */
function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, "0")}`;
}

async function cleanupDuplicateDigests() {
  console.log("Fetching all digests...\n");

  // Fetch all digests
  const { data: digests, error } = await supabase
    .from("weekly_digests")
    .select("id, week_start, week_end, generated_at, total_jobs, total_companies")
    .order("generated_at", { ascending: false });

  if (error) {
    console.error("Error fetching digests:", error);
    process.exit(1);
  }

  if (!digests || digests.length === 0) {
    console.log("No digests found.");
    return;
  }

  console.log(`Found ${digests.length} total digests\n`);

  // Group digests by ISO week
  const weekGroups = new Map<string, typeof digests>();
  
  for (const digest of digests) {
    const weekKey = getISOWeek(new Date(digest.week_start));
    const existing = weekGroups.get(weekKey) || [];
    existing.push(digest);
    weekGroups.set(weekKey, existing);
  }

  console.log(`Grouped into ${weekGroups.size} unique weeks\n`);

  // Find duplicates
  const toDelete: string[] = [];
  const toKeep: string[] = [];

  for (const [weekKey, weekDigests] of weekGroups) {
    if (weekDigests.length > 1) {
      console.log(`Week ${weekKey}: ${weekDigests.length} digests found`);
      
      // Keep the most recent one (first in array since sorted by generated_at desc)
      const keeper = weekDigests[0];
      toKeep.push(keeper.id);
      console.log(`  KEEP: ${keeper.id} (generated ${keeper.generated_at})`);
      
      // Mark others for deletion
      for (let i = 1; i < weekDigests.length; i++) {
        const dup = weekDigests[i];
        toDelete.push(dup.id);
        console.log(`  DELETE: ${dup.id} (generated ${dup.generated_at})`);
      }
      console.log();
    } else {
      toKeep.push(weekDigests[0].id);
    }
  }

  if (toDelete.length === 0) {
    console.log("No duplicates found. Database is clean!");
    return;
  }

  console.log(`\nSummary:`);
  console.log(`  Keeping: ${toKeep.length} digests`);
  console.log(`  Deleting: ${toDelete.length} duplicate digests\n`);

  // Prompt for confirmation
  const readline = await import("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question("Proceed with deletion? (yes/no): ", resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "yes") {
    console.log("Aborted.");
    return;
  }

  // Delete company summaries first (foreign key constraint)
  console.log("\nDeleting associated company summaries...");
  const { error: companiesError } = await supabase
    .from("weekly_digest_companies")
    .delete()
    .in("digest_id", toDelete);

  if (companiesError) {
    console.error("Error deleting company summaries:", companiesError);
    process.exit(1);
  }

  // Delete the duplicate digests
  console.log("Deleting duplicate digests...");
  const { error: digestsError } = await supabase
    .from("weekly_digests")
    .delete()
    .in("id", toDelete);

  if (digestsError) {
    console.error("Error deleting digests:", digestsError);
    process.exit(1);
  }

  console.log(`\nSuccessfully deleted ${toDelete.length} duplicate digests!`);
  console.log(`Remaining: ${toKeep.length} unique weekly digests`);
}

cleanupDuplicateDigests().catch(console.error);
