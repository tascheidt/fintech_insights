/**
 * Output-agreement scorers for the open-model evaluation harness.
 *
 * Pure functions (no I/O) so they're unit-testable and reusable from the
 * bake-off script. They score a candidate model's output against a reference
 * output — either the current Gemini output (similarity) or a human-labeled
 * golden record (correctness). See docs/OPEN_MODEL_EVALUATION.md.
 *
 * This finally implements the "L1 field agreement" metric the docs assume
 * exists (CLAUDE.md / prompt-config.ts reference a "≥95% L1" gate that was
 * never actually computed in the harness).
 */

import type { JobStructureForDB } from "@/lib/analysis/structure";
import type { JobCategoryResult } from "@/lib/analysis/categorizer";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function normSet(arr: string[] | null | undefined): Set<string> {
  return new Set((arr ?? []).map((x) => norm(x)).filter(Boolean));
}

/** Jaccard similarity of two string arrays (set overlap). Both-empty => 1. */
export function jaccard(a: string[] | null | undefined, b: string[] | null | undefined): number {
  const sa = normSet(a);
  const sb = normSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Dice coefficient over word tokens — a forgiving similarity for free text. */
export function diceCoefficient(a: string | null | undefined, b: string | null | undefined): number {
  const ta = norm(a).split(/\s+/).filter(Boolean);
  const tb = norm(b).split(/\s+/).filter(Boolean);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  const sb = new Set(tb);
  let overlap = 0;
  const seen = new Set<string>();
  for (const t of ta) {
    if (sb.has(t) && !seen.has(t)) {
      overlap += 1;
      seen.add(t);
    }
  }
  return (2 * overlap) / (new Set(ta).size + sb.size);
}

function exactMatch(a: string | null | undefined, b: string | null | undefined): number {
  return norm(a) === norm(b) ? 1 : 0;
}

function nullableNumberMatch(a: number | null, b: number | null): number {
  if (a === null && b === null) return 1;
  if (a === null || b === null) return 0;
  return a === b ? 1 : 0;
}

function salaryMatch(c: JobStructureForDB, r: JobStructureForDB): number {
  const min = nullableNumberMatch(c.salary_min, r.salary_min);
  const max = nullableNumberMatch(c.salary_max, r.salary_max);
  // Currency only matters when a salary is actually present in either output.
  const hasSalary = c.salary_min != null || c.salary_max != null || r.salary_min != null || r.salary_max != null;
  const cur = hasSalary ? exactMatch(c.salary_currency, r.salary_currency) : 1;
  return (min + max + cur) / 3;
}

function locationMatch(c: JobStructureForDB, r: JobStructureForDB): number {
  const cl = c.location_structured;
  const rl = r.location_structured;
  if (!cl && !rl) return 1;
  if (!cl || !rl) return 0;
  return (exactMatch(cl.city, rl.city) + exactMatch(cl.country, rl.country)) / 2;
}

export interface FieldAgreement {
  field: string;
  score: number;
  /** Whether this field counts toward the L1 gate (categorical/structured). */
  l1: boolean;
}

export interface ExtractionAgreement {
  fields: FieldAgreement[];
  /** Weighted mean over the L1 (categorical/structured) fields. */
  l1Agreement: number;
  /** Free-text summary similarity (reported, not part of the L1 gate). */
  summarySimilarity: number;
}

/**
 * Score an extraction output against a reference. L1 fields are the
 * categorical/structured signals that gate a migration decision; the free-text
 * summary is reported separately (it's stylistic, not a correctness signal).
 */
export function scoreExtraction(
  candidate: JobStructureForDB,
  reference: JobStructureForDB
): ExtractionAgreement {
  const fields: FieldAgreement[] = [
    { field: "seniority_level", score: exactMatch(candidate.seniority_level, reference.seniority_level), l1: true },
    { field: "standardized_department", score: exactMatch(candidate.standardized_department, reference.standardized_department), l1: true },
    { field: "function_category", score: exactMatch(candidate.function_category, reference.function_category), l1: true },
    { field: "salary", score: salaryMatch(candidate, reference), l1: true },
    { field: "location", score: locationMatch(candidate, reference), l1: true },
    { field: "tech_stack", score: jaccard(candidate.tech_stack, reference.tech_stack), l1: true },
    { field: "keywords", score: jaccard(candidate.keywords, reference.keywords), l1: true },
  ];
  const l1 = fields.filter((f) => f.l1);
  const l1Agreement = l1.length ? l1.reduce((acc, f) => acc + f.score, 0) / l1.length : 0;
  return {
    fields,
    l1Agreement,
    summarySimilarity: diceCoefficient(candidate.summary, reference.summary),
  };
}

export interface CategorizationAgreement {
  roleCategoryMatch: number;
  /** Fraction of the four list-sections where presence (empty/non-empty) agrees. */
  sectionsScore: number;
  /** 1 - |Δquality| / 4, clamped to [0,1]. */
  qualityAgreement: number;
  /** Headline agreement = role-category match (the decision-driving field). */
  overall: number;
}

export function scoreCategorization(
  candidate: JobCategoryResult,
  reference: JobCategoryResult
): CategorizationAgreement {
  const roleCategoryMatch = exactMatch(candidate.role_category, reference.role_category);

  const sectionKeys = ["responsibilities", "requirements", "nice_to_have", "benefits"] as const;
  let sectionHits = 0;
  for (const k of sectionKeys) {
    const cHas = (candidate.extracted_sections?.[k]?.length ?? 0) > 0;
    const rHas = (reference.extracted_sections?.[k]?.length ?? 0) > 0;
    if (cHas === rHas) sectionHits += 1;
  }
  const sectionsScore = sectionHits / sectionKeys.length;

  const qDelta = Math.abs((candidate.quality_score ?? 3) - (reference.quality_score ?? 3));
  const qualityAgreement = Math.max(0, 1 - qDelta / 4);

  return {
    roleCategoryMatch,
    sectionsScore,
    qualityAgreement,
    overall: roleCategoryMatch,
  };
}

// ---------------------------------------------------------------------------
// Golden-set (correctness) scoring
// ---------------------------------------------------------------------------

/** A golden salary band. `max` may be null for a single published rate. */
export interface GoldenSalary {
  min: number | null;
  max: number | null;
  currency: string;
}

/** One hand-labeled record from scripts/fixtures/golden-extraction.json. */
export interface GoldenExtractionRecord {
  jobId: string;
  title?: string;
  expected: {
    seniority_level: string;
    standardized_department: string;
    function_category: string;
    salary: GoldenSalary | null;
    /** Only what the prompt can see (title + description), never the ATS field. */
    location: GoldenLocation | null;
    /** Must appear. An array entry is a synonym group — any one satisfies it. */
    tech_required: Array<string | string[]>;
    /** Borderline items that are neither required nor penalized. */
    tech_allowed: string[];
  };
  /** Defensible alternatives for genuinely ambiguous fields. */
  acceptable?: {
    seniority_level?: string[];
    standardized_department?: string[];
    function_category?: string[];
    salary?: GoldenSalary[];
    /** `null` entries mean "no location" is also acceptable. */
    location?: Array<GoldenLocation | null>;
  };
}

export interface GoldenLocation {
  city: string | null;
  country: string | null;
}

export interface GoldenScore {
  fields: FieldAgreement[];
  /** Mean over the six correctness fields. This is the number the gate reads. */
  l1Correctness: number;
  /** tech_stack detail: required items found / required items. */
  techRecall: number;
  /** tech_stack detail: candidate items that are required-or-allowed / candidate items. */
  techPrecision: number;
  /** Candidate tech items that are neither required nor allowed (for the report). */
  techUnexpected: string[];
}

function normLoose(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTRY_ALIASES: Record<string, string> = {
  "united states of america": "united states",
  usa: "united states",
  us: "united states",
  "u s": "united states",
  ca: "canada",
  can: "canada",
  uk: "united kingdom",
  "great britain": "united kingdom",
};

function normCountry(s: string | null | undefined): string {
  const n = normLoose(s);
  return COUNTRY_ALIASES[n] ?? n;
}

/** Tech names match on normalized equality or whole-word containment (≥3 chars). */
export function techMatches(a: string, b: string): boolean {
  const x = normLoose(a);
  const y = normLoose(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 3) return false;
  return ` ${long} `.includes(` ${short} `);
}

function oneOf(value: string | null | undefined, expected: string, alternatives?: string[]): number {
  const v = normLoose(value);
  if (v === normLoose(expected)) return 1;
  return (alternatives ?? []).some((a) => normLoose(a) === v) ? 1 : 0;
}

function numEq(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.01);
}

function goldenSalaryScore(c: JobStructureForDB, g: GoldenExtractionRecord): number {
  const options = [g.expected.salary, ...(g.acceptable?.salary ?? [])];
  const candHasSalary = c.salary_min != null || c.salary_max != null;
  let best = 0;
  for (const opt of options) {
    if (opt === null) {
      if (!candHasSalary) return 1;
      continue;
    }
    if (!candHasSalary) continue;
    const s =
      ((numEq(c.salary_min, opt.min) ? 1 : 0) +
        (numEq(c.salary_max, opt.max) ? 1 : 0) +
        (normLoose(c.salary_currency) === normLoose(opt.currency) ? 1 : 0)) /
      3;
    best = Math.max(best, s);
  }
  return best;
}

function goldenLocationScore(c: JobStructureForDB, g: GoldenExtractionRecord): number {
  const loc = c.location_structured;
  const candEmpty = !loc || (!normLoose(loc.city) && !normLoose(loc.country));
  let best = 0;
  for (const opt of [g.expected.location, ...(g.acceptable?.location ?? [])]) {
    if (opt === null) {
      if (candEmpty) return 1;
      continue;
    }
    if (candEmpty) continue;
    const country = normCountry(loc!.country) === normCountry(opt.country) ? 1 : 0;
    const city = normLoose(loc!.city) === normLoose(opt.city) ? 1 : 0;
    best = Math.max(best, (country + city) / 2);
  }
  return best;
}

/**
 * Score one extraction against a hand-labeled golden record. Unlike
 * `scoreExtraction` (similarity to another model's output), this measures
 * correctness, so it does not reward copying the incumbent model's mistakes.
 */
export function scoreAgainstGolden(
  candidate: JobStructureForDB,
  golden: GoldenExtractionRecord
): GoldenScore {
  const required = golden.expected.tech_required.map((r) => (Array.isArray(r) ? r : [r]));
  const permitted = [...required.flat(), ...golden.expected.tech_allowed];
  const cand = (candidate.tech_stack ?? []).filter((t) => normLoose(t));

  const found = required.filter((group) => group.some((syn) => cand.some((t) => techMatches(t, syn))));
  const techRecall = required.length === 0 ? 1 : found.length / required.length;
  const techUnexpected = cand.filter((t) => !permitted.some((p) => techMatches(t, p)));
  const techPrecision = cand.length === 0 ? 1 : (cand.length - techUnexpected.length) / cand.length;
  const techScore =
    techRecall + techPrecision === 0 ? 0 : (2 * techRecall * techPrecision) / (techRecall + techPrecision);

  const fields: FieldAgreement[] = [
    { field: "seniority_level", score: oneOf(candidate.seniority_level, golden.expected.seniority_level, golden.acceptable?.seniority_level), l1: true },
    { field: "standardized_department", score: oneOf(candidate.standardized_department, golden.expected.standardized_department, golden.acceptable?.standardized_department), l1: true },
    { field: "function_category", score: oneOf(candidate.function_category, golden.expected.function_category, golden.acceptable?.function_category), l1: true },
    { field: "salary", score: goldenSalaryScore(candidate, golden), l1: true },
    { field: "location", score: goldenLocationScore(candidate, golden), l1: true },
    { field: "tech_stack", score: techScore, l1: true },
  ];
  return {
    fields,
    l1Correctness: fields.reduce((a, f) => a + f.score, 0) / fields.length,
    techRecall,
    techPrecision,
    techUnexpected,
  };
}
