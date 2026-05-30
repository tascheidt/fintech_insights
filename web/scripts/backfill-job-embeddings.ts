#!/usr/bin/env npx tsx
/**
 * Backfill Job Embeddings
 *
 * Generates pgvector embeddings (`job_postings.embedding`) for jobs that don't
 * have one yet, or whose stored vector was produced by a different model/dims
 * than the current config (so a model rotation re-embeds the corpus).
 *
 * Two ways this runs:
 *   - Manually, once, to seed the initial backfill over the whole corpus.
 *   - Daily via the `embeddings-backfill-cron` GitHub Action, which sweeps up
 *     newly-ingested rows so the ingest hot path never has to embed inline.
 *
 * It is idempotent: rows already embedded with the current model + dims are
 * skipped by the fetch filter, so re-running is safe and cheap.
 *
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/backfill-job-embeddings.ts
 *   # Cap rows processed:
 *   npx tsx --env-file=.env.local web/scripts/backfill-job-embeddings.ts --limit=50
 *   # Embed + log but skip DB writes:
 *   npx tsx --env-file=.env.local web/scripts/backfill-job-embeddings.ts --dry-run --limit=2
 */

import { createAdminClient } from "../lib/supabase/admin";
import { embedText, jobEmbeddingInput } from "../lib/ai/embeddings";
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from "../lib/ai/prompt-config";

interface JobRow {
  id: string;
  title: string | null;
  summary: string | null;
  description_text: string | null;
}

// Supabase/PostgREST caps a single select at 1000 rows; paginate defensively.
const PAGE = 1000;
// Throttle between embed calls to respect Gemini rate limits.
const THROTTLE_MS = 80;
// Guards against an unbounded loop on a misbehaving server.
const HARD_CEILING = 200000;

async function main() {
  const startedAt = Date.now();
  const supabase = createAdminClient();

  // Parse command line arguments
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const dryRun = process.argv.includes("--dry-run");

  console.log("🔄 Backfilling Job Embeddings\n");
  console.log("═".repeat(70));
  console.log(`  Model: ${EMBEDDING_MODEL}  •  Dims: ${EMBEDDING_DIMS}`);
  if (limit) console.log(`  Limit: ${limit}`);
  if (dryRun) console.log("  Mode: DRY RUN (no DB writes)");
  console.log("═".repeat(70) + "\n");

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY environment variable is not set");
    console.log("\nTo set it:");
    console.log("  1. Add GEMINI_API_KEY=your-key to .env.local in the web directory");
    console.log("  2. Or export GEMINI_API_KEY=your-key before running");
    process.exit(1);
  }

  // Fetch rows needing an embedding: a non-empty description, AND either never
  // embedded OR embedded with a stale model/dims (so a model change re-embeds).
  // Paginate with .range() since PostgREST caps a select at 1000 rows.
  const jobs: JobRow[] = [];
  let from = 0;
  while (from < HARD_CEILING) {
    // Respect --limit while paging: don't fetch more than we'll process.
    const remaining = limit !== undefined ? limit - jobs.length : PAGE;
    if (remaining <= 0) break;
    const pageSize = Math.min(PAGE, remaining);

    const { data, error: fetchError } = await supabase
      .from("job_postings")
      .select("id, title, summary, description_text")
      .not("description_text", "is", null)
      .neq("description_text", "")
      .or(
        `embedding.is.null,embedding_model.is.null,embedding_model.neq.${EMBEDDING_MODEL},embedding_dims.is.null,embedding_dims.neq.${EMBEDDING_DIMS}`
      )
      .order("first_seen_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (fetchError) {
      console.error("❌ Error fetching jobs:", fetchError);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) jobs.push(row as JobRow);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (jobs.length === 0) {
    console.log("✅ No jobs need embedding — corpus is up to date!");
    return;
  }

  console.log(`📋 Found ${jobs.length} job(s) that need embedding\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];

  for (const job of jobs) {
    processed++;
    const progress = `[${processed}/${jobs.length}]`;
    const label = job.title || job.id;
    console.log(`${progress} Processing: ${label}`);

    try {
      const input = jobEmbeddingInput(job);
      const res = await embedText(input, { callSite: "backfill-job-embeddings" });

      if (!res) {
        console.log(`  ⚠️  Embedding returned null, skipping...`);
        failed++;
        errors.push({ id: job.id, title: label, error: "embedText returned null" });
        continue;
      }

      if (dryRun) {
        console.log(`  ✅ (dry run) Embedded ${res.dims} dims via ${res.model}`);
        succeeded++;
      } else {
        const { error: updateError } = await supabase
          .from("job_postings")
          .update({
            // pgvector via PostgREST expects a string literal like "[0.1,0.2,...]";
            // JSON.stringify(number[]) produces exactly that.
            embedding: JSON.stringify(res.embedding),
            embedding_model: res.model,
            embedding_dims: res.dims,
            embedding_generated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        if (updateError) {
          console.log(`  ❌ Database update failed: ${updateError.message}`);
          failed++;
          errors.push({ id: job.id, title: label, error: updateError.message });
          continue;
        }

        console.log(`  ✅ Embedded ${res.dims} dims via ${res.model}`);
        succeeded++;
      }

      // Small delay to respect rate limits.
      await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${errorMessage}`);
      failed++;
      errors.push({ id: job.id, title: label, error: errorMessage });
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(70));
  console.log("📊 Backfill Summary:");
  console.log("═".repeat(70));
  console.log(`  Total processed: ${processed}`);
  console.log(`  ✅ Succeeded: ${succeeded}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  ⏱️  Elapsed: ${elapsedSec}s`);

  if (errors.length > 0) {
    console.log("\n⚠️  Errors:");
    errors.slice(0, 10).forEach((err) => {
      console.log(`  - ${err.title}: ${err.error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log(`\n✅ Backfill complete!${dryRun ? " (dry run — nothing written)" : ""}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
