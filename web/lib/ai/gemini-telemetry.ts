/**
 * Production telemetry sink for Gemini usage records.
 *
 * `writeUsageEvent` is fire-and-forget: it runs asynchronously, swallows any
 * errors (so a flaky Supabase write never breaks the user-facing call), and
 * returns `void` synchronously. The intent is that every production Gemini
 * call-site calls it alongside an optional `onUsage` callback, so scripts
 * can still observe the same record without the callback being the
 * only source of truth.
 *
 * Schema: see `web/supabase/migrations/20260419170000_gemini_usage_events.sql`.
 *
 * Usage inside a production call-site:
 *   const record = recordUsage({ ... });
 *   writeUsageEvent(record);       // fire-and-forget DB write
 *   onUsage?.(record);             // script-facing observer, optional
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { UsageRecord } from "./gemini-meter";
import { log } from "@/lib/log";

export interface WriteUsageEventOptions {
  /** Optional link to the job_run that triggered this call. Null for chat / on-demand. */
  jobRunId?: string | null;
}

/**
 * Fire-and-forget write to `gemini_usage_events`. Always returns immediately;
 * the actual insert happens in the background. Errors are logged and swallowed.
 */
/**
 * Process-local observers. Empty in production. The model eval suite
 * registers one so it can cost every surface uniformly — most surface
 * functions have no `onUsage` parameter, but every one of them already calls
 * `writeUsageEvent`, so this is the single chokepoint.
 */
const usageObservers = new Set<(record: UsageRecord) => void>();

/** Register an in-process observer; returns an unsubscribe function. */
export function addUsageObserver(fn: (record: UsageRecord) => void): () => void {
  usageObservers.add(fn);
  return () => {
    usageObservers.delete(fn);
  };
}

export function writeUsageEvent(
  record: UsageRecord,
  opts?: WriteUsageEventOptions
): void {
  for (const fn of usageObservers) {
    try {
      fn(record);
    } catch {
      // An observer must never break the call site.
    }
  }

  // Skip when the env flag explicitly disables telemetry (used by dev scripts
  // that don't want to pollute the production events table with fixture runs).
  if (process.env.GEMINI_TELEMETRY_DISABLED === "1") return;

  // Fire and forget. We do NOT await — keeps the user-facing request off the
  // critical path of the DB insert.
  void (async () => {
    try {
      const supabase = createAdminClient();
      const { error } = await supabase.from("gemini_usage_events").insert({
        call_site: record.callSite,
        model_requested: record.modelRequested,
        model_served: record.modelServed,
        grounding_enabled: record.groundingEnabled,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        cached_tokens: record.cachedTokens,
        total_tokens: record.totalTokens,
        estimated_usd: record.estimatedUsd,
        latency_ms: record.latencyMs,
        status: record.status,
        error_message: record.errorMessage ?? null,
        job_run_id: opts?.jobRunId ?? null,
        extra: record.extra ?? null,
      });
      if (error) {
        log.error({ err: error.message }, "[gemini-telemetry] insert failed:");
      }
    } catch (err) {
      log.error({ err: err }, "[gemini-telemetry] unexpected error:");
    }
  })();
}
