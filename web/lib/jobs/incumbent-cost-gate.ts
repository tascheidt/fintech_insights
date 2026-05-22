/**
 * Incumbent-tier AI cost gate.
 *
 * `analyzeJobAdvanced` is the Pro+grounded call per job — the single most
 * expensive thing in the ingestion hot path. Running it on every big-bank
 * posting would multiply Gemini spend by ~6x for marginal benefit: most bank
 * jobs are operational hiring noise, not strategic signal.
 *
 * For `tier='incumbent'` jobs we keep Flash extraction (cheap, hash-gated)
 * and ONLY run the Pro analyzer for high-signal hires — staff+ seniority in
 * an AI/ML / Data / Risk-AI function. That "high-signal" definition lives in
 * `web/lib/analysis/incumbent-signal.ts` and is shared with the Incumbent
 * Bets rail and the Incumbent Watch digest, so the gate and the surfaces
 * never drift. This module adds the tier short-circuit and the granular,
 * telemetry-friendly skip reasons on top of that shared definition.
 *
 * For `tier='fintech'` jobs the gate is a no-op: every fintech job analyzes.
 */

import {
  INCUMBENT_SIGNAL_SENIORITY,
  INCUMBENT_SIGNAL_FUNCTION_CATEGORIES,
} from "@/lib/analysis/incumbent-signal";

export interface IncumbentGateInput {
  tier: "fintech" | "incumbent" | null | undefined;
  seniority_level: string | null | undefined;
  function_category: string | null | undefined;
}

export interface IncumbentGateDecision {
  /** True if the analyzer should run for this job. */
  shouldAnalyze: boolean;
  /** Short, telemetry-friendly reason for the decision. */
  reason:
    | "fintech_tier_always_analyzes"
    | "incumbent_high_signal_role"
    | "incumbent_missing_structure"
    | "incumbent_seniority_below_bar"
    | "incumbent_function_not_whitelisted";
}

/**
 * Decide whether to run `analyzeJobAdvanced` for a given job.
 *
 * The gate sees the *structured* fields populated by `extractJobStructure`
 * (Flash). If structure extraction has not run yet — e.g. the description
 * is missing on a fresh incumbent scrape — `seniority_level` and
 * `function_category` will both be null. In that case we intentionally
 * SKIP the analyzer rather than running it on unclassified data: skipping
 * is cheap, mis-analyzing is not, and we'll get another shot once the
 * description hash gate triggers extraction on the next run.
 */
export function decideIncumbentGate(
  input: IncumbentGateInput
): IncumbentGateDecision {
  if (input.tier !== "incumbent") {
    return {
      shouldAnalyze: true,
      reason: "fintech_tier_always_analyzes",
    };
  }

  if (!input.seniority_level || !input.function_category) {
    return {
      shouldAnalyze: false,
      reason: "incumbent_missing_structure",
    };
  }

  const seniorityOk = (
    INCUMBENT_SIGNAL_SENIORITY as readonly string[]
  ).includes(input.seniority_level);
  if (!seniorityOk) {
    return {
      shouldAnalyze: false,
      reason: "incumbent_seniority_below_bar",
    };
  }

  const functionOk = (
    INCUMBENT_SIGNAL_FUNCTION_CATEGORIES as readonly string[]
  ).includes(input.function_category);
  if (!functionOk) {
    return {
      shouldAnalyze: false,
      reason: "incumbent_function_not_whitelisted",
    };
  }

  return {
    shouldAnalyze: true,
    reason: "incumbent_high_signal_role",
  };
}
