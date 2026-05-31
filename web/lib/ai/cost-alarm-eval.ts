/**
 * Pure evaluation for the daily Gemini cost alarm (`/api/admin/cost-alarm`).
 *
 * Kept I/O-free and separate from the route so the tripwire logic is unit-
 * testable without mocking Supabase / Sentry / the cron guard. The route does
 * the query + Sentry side effects; this module does the math.
 */

export interface GeminiUsageRow {
  estimated_usd: number | string | null;
  call_site: string;
  model_served: string;
  grounding_enabled: boolean | null;
  total_tokens: number | null;
}

export interface GeminiUsageThresholds {
  usd: number;
  grounded: number;
  tokens: number;
}

export interface GeminiUsageEvaluation {
  metrics: {
    totalUsd: number;
    calibratedUsd: number;
    groundedCalls: number;
    totalTokens: number;
    eventCount: number;
  };
  breakdown: {
    byCallSite: Record<string, number>;
    byModel: Record<string, number>;
  };
  /** Human-readable descriptions of every tripwire that exceeded its threshold. */
  tripped: string[];
}

/**
 * Compute the three independent cost signals over a 24h `gemini_usage_events`
 * row set and report which tripwires (if any) exceeded their threshold:
 *
 *   1. Calibrated USD — `SUM(estimated_usd)` (already calibrated at write time).
 *   2. Grounded calls — count of `grounding_enabled` rows.
 *   3. Token volume   — `SUM(total_tokens)`.
 *
 * Signals 2 and 3 come from un-priced SDK fields, so they page even when the
 * dollar estimate under-reports (the failure mode that hid the May 2026 spike).
 */
export function evaluateGeminiUsage(
  rows: GeminiUsageRow[],
  thresholds: GeminiUsageThresholds
): GeminiUsageEvaluation {
  let totalUsd = 0; // raw, as recorded
  // `estimated_usd` is already calibrated at write time (estimateUsd applies the
  // reconciled token rates + GROUNDING_CALIBRATION), so the alarm just sums it.
  // Kept as a distinct field for response stability; currently == totalUsd.
  let calibratedUsd = 0;
  let groundedCalls = 0;
  let totalTokens = 0;
  const byCallSite = new Map<string, number>();
  const byModel = new Map<string, number>();

  for (const row of rows) {
    const usd = typeof row.estimated_usd === "string"
      ? parseFloat(row.estimated_usd)
      : (row.estimated_usd ?? 0);
    if (Number.isFinite(usd)) {
      totalUsd += usd;
      calibratedUsd += usd;
      byCallSite.set(row.call_site, (byCallSite.get(row.call_site) ?? 0) + usd);
      byModel.set(row.model_served, (byModel.get(row.model_served) ?? 0) + usd);
    }
    if (row.grounding_enabled) groundedCalls += 1;
    if (typeof row.total_tokens === "number" && Number.isFinite(row.total_tokens)) {
      totalTokens += row.total_tokens;
    }
  }

  const tripped: string[] = [];
  if (calibratedUsd > thresholds.usd) {
    tripped.push(`usd ($${calibratedUsd.toFixed(2)} > $${thresholds.usd.toFixed(2)})`);
  }
  if (groundedCalls > thresholds.grounded) {
    tripped.push(`grounded-calls (${groundedCalls} > ${thresholds.grounded})`);
  }
  if (totalTokens > thresholds.tokens) {
    tripped.push(`tokens (${totalTokens.toLocaleString()} > ${thresholds.tokens.toLocaleString()})`);
  }

  return {
    metrics: { totalUsd, calibratedUsd, groundedCalls, totalTokens, eventCount: rows.length },
    breakdown: {
      byCallSite: Object.fromEntries(byCallSite),
      byModel: Object.fromEntries(byModel),
    },
    tripped,
  };
}
