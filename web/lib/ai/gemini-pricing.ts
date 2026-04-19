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
};

/** Grounding (googleSearch) surcharge, USD per request. */
export const GROUNDING_PER_REQUEST_USD = 0.035;

/**
 * Rough USD estimate for a single Gemini call. Returns 0 for unknown models
 * (callers should detect this via `isPricedModel`).
 */
export function estimateUsd(
  model: string,
  opts: { inputTokens: number; outputTokens: number; groundingEnabled: boolean }
): number {
  const rates = GEMINI_PRICING[model];
  if (!rates) return 0;
  const inputCost = (opts.inputTokens / 1_000_000) * rates.inputPerM;
  const outputCost = (opts.outputTokens / 1_000_000) * rates.outputPerM;
  const groundingCost = opts.groundingEnabled ? GROUNDING_PER_REQUEST_USD : 0;
  return inputCost + outputCost + groundingCost;
}

export function isPricedModel(model: string): boolean {
  return model in GEMINI_PRICING;
}
