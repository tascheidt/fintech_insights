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

// Rates RECONCILED to the GCP SKU export for 2026-05 (reconciles to ~1%). The
// floating aliases had rotated to the Gemini 3.x generation; the table still
// held 2.x rates, which under-counted telemetry ~2.7x (the cost the AI_HYGIENE
// harness/telemetry is supposed to catch). Re-reconcile when an alias rotates —
// implied rate = SKU $ ÷ SKU token count from a fresh export.
export const GEMINI_PRICING: Record<string, ModelRates> = {
  "gemini-flash-latest": {
    inputPerM: 1.5,
    outputPerM: 9.0,
    notes: "Floating alias → Gemini 3.5 Flash as of 2026-05 ($1.50/$9.00 per the GCP export). Re-reconcile on rotation.",
  },
  "gemini-flash-lite-latest": {
    inputPerM: 0.25,
    outputPerM: 1.5,
    notes: "Floating alias → Gemini 3.1 Flash Lite as of 2026-05 ($0.25/$1.50). Use only where the comparison report confirms ≥95% L1 field agreement.",
  },
  "gemini-pro-latest": {
    inputPerM: 2.0,
    outputPerM: 12.0,
    notes: "Floating alias → Gemini 3 Pro (standard <200k context) as of 2026-05 ($2.00/$12.00). Tiered rates above ~200k-token prompts are not modeled here.",
  },
  "gemini-embedding-001": {
    inputPerM: 0.15,
    outputPerM: 0,
    notes: "Embedding model (no -latest alias published); output tokens N/A. Matches the 2026-05 GCP export ($0.15). Used by Jobs semantic search.",
  },
  // Concrete version strings sometimes surface as `model_served` (e.g. a quota
  // fallback echoes the resolved version). Price them like their alias so those
  // rows don't silently fall through to $0.
  "gemini-3.5-flash": {
    inputPerM: 1.5,
    outputPerM: 9.0,
    notes: "Concrete version behind gemini-flash-latest (2026-05).",
  },
};

/** Grounding (googleSearch) surcharge, USD per request. */
export const GROUNDING_PER_REQUEST_USD = 0.035;

/**
 * Grounding calibration multiplier.
 *
 * The 2026-05 GCP SKU export showed grounding (Google Search) was billed under
 * the FREE tier — SKU "Generate content search query gemini 3 free": 577
 * queries, $0.00. So the flat `GROUNDING_PER_REQUEST_USD` over-counts. Set to 0
 * to match the invoice while grounding stays free-tier; the cost-alarm route's
 * grounded-call COUNT tripwire is the real guard against blowing past the free
 * allotment. Raise toward 1 (or higher) if a future SKU export shows grounding
 * being billed. (The original ~2.7x telemetry gap was NOT grounding — it was
 * stale token rates after the aliases rotated to Gemini 3.x; see the rate table
 * above and docs/AI_HYGIENE.md → "Cost reconciliation".)
 */
export const GROUNDING_CALIBRATION = 0;

/**
 * Provenance for the reconciliation — recorded in code so the numbers aren't
 * tribal memory. The 2026-05 SKU export pinned the gap to stale token rates
 * (aliases → Gemini 3.x), not grounding (which was free-tier). After updating
 * the rate table + zeroing grounding, telemetry reconciles to the invoice ~1%.
 */
export const COST_CALIBRATION_NOTE = {
  reconciledOn: "2026-05-31",
  window: "2026-05-01..2026-05-31",
  gcpUsd: 179.75,
  cause: "stale token rates (aliases rotated to Gemini 3.x); grounding free-tier ($0.00)",
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
