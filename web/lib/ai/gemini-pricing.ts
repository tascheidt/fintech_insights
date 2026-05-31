/**
 * Gemini model pricing table (USD per 1M tokens) + grounding surcharge.
 *
 * Source: Google's published Gemini API pricing. Numbers below are the
 * commonly-quoted rates for the Flash / Flash-Lite / Pro tiers as of
 * 2026-Q2 and are intended for internal cost estimation only — not for
 * billing or SLA purposes. Google publishes exact tiered rates that
 * depend on prompt size bands for the Pro tier, which this module does
 * NOT model (over-simplification is intentional; the goal is a stable
 * number for PR-to-PR comparisons, not parity with the final invoice).
 *
 * Update this file periodically (quarterly, or after any visible drift
 * between `estimatedUsd` totals and Google Cloud billing).
 */

export interface ModelRates {
  /** USD per 1,000,000 input tokens. */
  inputPerM: number;
  /** USD per 1,000,000 output tokens. */
  outputPerM: number;
  /** Optional note on the tier or caveats. */
  notes?: string;
}

export const GEMINI_PRICING: Record<string, ModelRates> = {
  "gemini-flash-latest": {
    inputPerM: 0.3,
    outputPerM: 2.5,
    notes: "Floating alias — active version rolls with Google's releases.",
  },
  "gemini-flash-lite-latest": {
    inputPerM: 0.1,
    outputPerM: 0.4,
    notes: "Cheapest tier; use only where comparison report confirms quality.",
  },
  "gemini-pro-latest": {
    inputPerM: 1.25,
    outputPerM: 10.0,
    notes: "Floating alias — tiered rates above ~200k-token prompts are not modeled here.",
  },
  "gemini-embedding-001": {
    inputPerM: 0.15,
    outputPerM: 0,
    notes: "Embedding model (no -latest alias published); output tokens N/A. Used by Jobs semantic search.",
  },
};

/** Grounding (googleSearch) surcharge, USD per request. */
export const GROUNDING_PER_REQUEST_USD = 0.035;

/**
 * Grounding calibration multiplier.
 *
 * `GROUNDING_PER_REQUEST_USD` models grounding as a flat per-request surcharge,
 * but Google bills grounding-search fan-out (one grounded request can issue
 * several search queries) plus search-injected context tokens that our
 * `input_tokens` under-reports. A 2026-05 reconciliation found telemetry
 * (`SUM(estimated_usd)`) under-counted the GCP invoice ~2.7x, concentrated on
 * the grounded Pro path (`analyzeJobAdvanced`, `performDeepResearch`).
 *
 * This defaults to 1 (no-op — keeps `estimateUsd` totals and existing tests
 * unchanged). Set it from a clean GCP SKU export:
 *   GROUNDING_CALIBRATION ≈ (invoice grounding $) / (telemetry grounding $)
 * over the same window. The cost-alarm route also tripwires on grounded-call
 * COUNT independently of this estimate, so a fan-out spike pages even at 1.
 *
 * See docs/AI_HYGIENE.md → "Cost reconciliation".
 */
export const GROUNDING_CALIBRATION = 1;

/**
 * Provenance for the calibration above — the audit that motivated it, recorded
 * in code so the number isn't tribal memory. The active multiplier stays 1
 * until a SKU-level export isolates the grounding component of the gap.
 */
export const COST_CALIBRATION_NOTE = {
  observedOn: "2026-05-30",
  window: "2026-05-01..2026-05-30",
  gcpUsd: 178.75,
  telemetryUsd: 66.09,
  ratio: 2.71,
} as const;

/**
 * Rough USD estimate for a single Gemini call. Returns 0 for unknown models
 * (callers should detect this via `isPricedModel`).
 *
 * `thoughtsTokens` (Gemini 2.5 reasoning/thinking tokens) are billed at the
 * output rate per Google's documented pricing. Older callers that don't
 * pass it default to 0; the meter infers it from `totalTokenCount` residual
 * when the SDK omits the named field. Until 2026-05 our formula skipped
 * thinking tokens entirely, undercounting Flash extraction spend by ~3x.
 */
export function estimateUsd(
  model: string,
  opts: {
    inputTokens: number;
    outputTokens: number;
    thoughtsTokens?: number;
    groundingEnabled: boolean;
  }
): number {
  const rates = GEMINI_PRICING[model];
  if (!rates) return 0;
  const inputCost = (opts.inputTokens / 1_000_000) * rates.inputPerM;
  const outputCost = (opts.outputTokens / 1_000_000) * rates.outputPerM;
  const thoughtsCost = ((opts.thoughtsTokens ?? 0) / 1_000_000) * rates.outputPerM;
  const groundingCost = opts.groundingEnabled
    ? GROUNDING_PER_REQUEST_USD * GROUNDING_CALIBRATION
    : 0;
  return inputCost + outputCost + thoughtsCost + groundingCost;
}

export function isPricedModel(model: string): boolean {
  return model in GEMINI_PRICING;
}
