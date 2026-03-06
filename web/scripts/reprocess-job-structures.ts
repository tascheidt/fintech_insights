#!/usr/bin/env npx tsx
/**
 * Reprocess all existing job descriptions with the active Stage 1 prompt.
 *
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/reprocess-job-structures.ts
 *   npx tsx --env-file=.env.local web/scripts/reprocess-job-structures.ts --company=<uuid>
 *   npx tsx --env-file=.env.local web/scripts/reprocess-job-structures.ts --limit=250
 *   npx tsx --env-file=.env.local web/scripts/reprocess-job-structures.ts --include-inactive
 */

import {
  createJobStructureReprocessRun,
  executeJobStructureReprocessRun,
} from "../lib/labs/prompt-forge";

function getArg(name: string) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : undefined;
}

async function main() {
  const companyId = getArg("company");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const activeOnly = !process.argv.includes("--include-inactive");

  console.log("Prompt Forge Stage 1 Reprocess");
  console.log("═".repeat(60));

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const job = await createJobStructureReprocessRun({
    companyId,
    activeOnly,
    limit,
  });

  console.log(`Job run created: ${job.jobRunId}`);
  console.log(`Jobs queued: ${job.totalJobs}`);

  const result = await executeJobStructureReprocessRun(job.jobRunId, {
    companyId,
    activeOnly,
    limit,
  });

  console.log("═".repeat(60));
  console.log(`Processed: ${result.processedJobs}/${result.totalJobs}`);
  console.log(`Failed: ${result.failedJobs}`);
  console.log(`Job run: ${result.jobRunId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
