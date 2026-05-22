/**
 * The single definition of an "incumbent signal job" — a Big-6 bank
 * posting worth surfacing to a fintech operator.
 *
 * Big banks post ~80 roles/week; the overwhelming majority is operational
 * headcount that would only add noise. A posting is *signal* when it is
 * both senior AND in a function where bank capability-building informs
 * fintech strategy (AI/ML, data, risk/compliance).
 *
 * This module is the source of truth for that gate. It is consumed by:
 *   - `incumbent-cost-gate.ts` — decides whether to spend a Pro+grounded
 *     `analyzeJobAdvanced` call on an incumbent job.
 *   - the "Incumbent Bets" dashboard rail + the per-company "Senior hiring
 *     signal" panel — which roles to display.
 *   - the "Incumbent Watch" weekly-digest block — which roles to narrate.
 *
 * Keeping the whitelists here means the gate, the rail, and the digest can
 * never drift apart.
 */

import type { RoleCategory } from "./function-categories";

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
 * Seniorities that qualify an incumbent role as signal.
 *
 * The bar is intentionally high: staff+ at a big bank typically marks a
 * deliberate capability investment, while senior and below are mostly
 * headcount maintenance. Note the structured-extraction enum has no
 * literal "director"/"vp" — those titles surface as `lead`/`executive`.
 */
export const INCUMBENT_SIGNAL_SENIORITY: readonly Seniority[] = [
  "staff",
  "principal",
  "lead",
  "executive",
];

/**
 * Function categories that qualify an incumbent role as signal — the
 * categories where bank hiring directly informs fintech strategy:
 * AI/ML and data (where banks bet on automation + decisioning) and
 * risk / compliance / AML (regulatory posture fintechs must navigate).
 * Values mirror the `RoleCategory` enum in `function-categories.ts`.
 */
export const INCUMBENT_SIGNAL_FUNCTION_CATEGORIES: readonly RoleCategory[] = [
  "engineering-ai-ml",
  "data-science",
  "data-analytics-bi",
  "analytics-engineering",
  "risk-management",
  "compliance",
  "aml-financial-crime",
];

export interface IncumbentSignalInput {
  seniority_level: string | null | undefined;
  function_category: string | null | undefined;
}

/**
 * True if an incumbent job is high-signal: staff+ seniority AND a
 * whitelisted function. Jobs whose structured fields haven't been
 * extracted yet (null seniority/function) are NOT signal — we never
 * surface or analyze unclassified bank roles.
 */
export function isIncumbentSignalJob(job: IncumbentSignalInput): boolean {
  if (!job.seniority_level || !job.function_category) return false;
  return (
    (INCUMBENT_SIGNAL_SENIORITY as readonly string[]).includes(
      job.seniority_level,
    ) &&
    (INCUMBENT_SIGNAL_FUNCTION_CATEGORIES as readonly string[]).includes(
      job.function_category,
    )
  );
}
