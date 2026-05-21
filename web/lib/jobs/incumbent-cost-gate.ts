/**
 * Incumbent-tier AI cost gate.
 *
 * `analyzeJobAdvanced` is the Pro+grounded call per job — the single most
 * expensive thing in the ingestion hot path. Running it on every big-bank
 * posting would multiply Gemini spend by ~6x for marginal benefit: most bank
 * jobs are operational hiring noise, not strategic signal.
 *
 * For `tier='incumbent'` jobs we keep Flash extraction (cheap, hash-gated)
 * and ONLY run the Pro analyzer when both the role's seniority AND function
 * indicate a high-signal hire — e.g. "RBC posted 2 staff AI researchers"
 * surfaces, but "RBC posted a junior teller" does not.
 *
 * For `tier='fintech'` jobs the gate is a no-op: every fintech job analyzes.
 *
 * Configuration (whitelists) lives here so it can be unit-tested and tuned
 * without touching analyzer.ts. Mirrors the function-category enum in
 * `web/lib/analysis/function-categories.ts`.
 */

import type { RoleCategory } from "@/lib/analysis/function-categories";

export type Seniority =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "lead"
  | "executive";

/**
 * Seniorities that qualify for Pro analysis at incumbent companies.
 *
 * The bar is intentionally high: staff+ at a big bank typically signals
 * strategic capability investment (a Staff ML Engineer hire is meaningful),
 * while senior and below are mostly headcount maintenance.
 */
export const INCUMBENT_ANALYZE_SENIORITY_WHITELIST: readonly Seniority[] = [
  "staff",
  "principal",
  "lead",
  "executive",
];

/**
 * Function categories that qualify for Pro analysis at incumbent companies.
 *
 * Pulled from `function-categories.ts`. The narrow list captures the
 * categories where bank hiring directly informs fintech strategy:
 *   - AI/ML and data work tells us where banks are betting on automation
 *     and decisioning infrastructure.
 *   - Risk/compliance/AML hires signal regulatory posture and gating that
 *     fintechs need to navigate.
 *   - Embedded-finance / payments-product hires reveal where banks are
 *     trying to compete (or partner) in fintech distribution.
 */
export const INCUMBENT_ANALYZE_FUNCTION_WHITELIST: readonly RoleCategory[] = [
  "engineering-ai-ml",
  "data-science",
  "data-analytics-bi",
  "analytics-engineering",
  "risk-management",
  "compliance",
  "aml-financial-crime",
];

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
    INCUMBENT_ANALYZE_SENIORITY_WHITELIST as readonly string[]
  ).includes(input.seniority_level);
  if (!seniorityOk) {
    return {
      shouldAnalyze: false,
      reason: "incumbent_seniority_below_bar",
    };
  }

  const functionOk = (
    INCUMBENT_ANALYZE_FUNCTION_WHITELIST as readonly string[]
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
