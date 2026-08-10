import type { JobData } from "./types";
import { htmlToText, detectLocationType, normalizeCommitment } from "./utils";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

/**
 * Ashby omits the `compensation` block unless the board explicitly asks for
 * it. Without this flag every job comes back with no compensation field at
 * all, which is how Wealthsimple's published ranges ("CA$54K – CA$68K • Offers
 * Equity") were being dropped on every scrape (August 2026): the board renders
 * them from the structured `compensation` object, **not** from
 * `descriptionHtml`, so the Flash description extractor downstream had nothing
 * to find and every Ashby row ingested with a null salary. Koho is on the same
 * board type and benefits identically.
 */
const COMPENSATION_QUERY = "includeCompensation=true";

interface AshbyCompensationComponent {
  compensationType?: string | null;
  interval?: string | null;
  currencyCode?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  summary?: string | null;
}

interface AshbyCompensationTier {
  components?: AshbyCompensationComponent[];
}

interface AshbyCompensation {
  compensationTierSummary?: string | null;
  scrapeableCompensationSalarySummary?: string | null;
  compensationTiers?: AshbyCompensationTier[];
  summaryComponents?: AshbyCompensationComponent[];
}

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  location?: string;
  employmentType?: string;
  isRemote?: boolean;
  descriptionHtml?: string;
  publishedAt?: string;
  applyUrl?: string;
  jobUrl?: string;
  compensation?: AshbyCompensation;
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

export interface ParsedSalary {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
}

/**
 * `job_postings.salary_min/max` are bare INTEGERs with no interval column, so
 * only ANNUAL figures may be stored — dropping an hourly rate into the same
 * column silently corrupts every salary comparison on the platform. Anything
 * that isn't an annual salary (hourly/monthly bands, equity, bonus, commission)
 * is deliberately skipped rather than converted; those postings fall through to
 * the existing AI description extraction, exactly as before this change.
 */
const ANNUAL_INTERVAL = "1 YEAR";

/** Plausibility band for an annual figure. Doubles as a last-ditch guard
 *  against an hourly/monthly rate that slipped past the interval check, and
 *  keeps us inside Postgres `integer` range. */
const MIN_PLAUSIBLE_ANNUAL = 1_000;
const MAX_PLAUSIBLE_ANNUAL = 10_000_000;

function isPlausibleAnnual(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_ANNUAL &&
    value <= MAX_PLAUSIBLE_ANNUAL
  );
}

function normalizeToken(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase() : "";
}

/**
 * Currency markers Ashby renders into its summary strings, most specific
 * first — `CA$` must be tested before the bare `$` or a Canadian range reads
 * as USD, which is the whole point for a Canada-heavy board.
 */
const CURRENCY_MARKERS: Array<[RegExp, string]> = [
  [/\b(?:CAD|CA\$|C\$)/i, "CAD"],
  [/\b(?:AUD|AU\$|A\$)/i, "AUD"],
  [/\b(?:USD|US\$)/i, "USD"],
  [/\bGBP\b|£/i, "GBP"],
  [/\bEUR\b|€/i, "EUR"],
];

/** Non-annual intervals as they appear in Ashby's human-readable summaries. */
const NON_ANNUAL_SUMMARY = /\/\s*(?:hr|hour|mo|month|wk|week|day)|\bper\s+(?:hour|month|week|day)\b|\bhourly\b|\bmonthly\b|\bweekly\b|\bdaily\b/i;

/**
 * Read a currency out of a summary string. Returns null for a bare `$` with no
 * country prefix: guessing USD there would mislabel a Canadian range, and a
 * mislabelled currency is worse than no salary at all.
 */
export function parseSummaryCurrency(summary: string): string | null {
  for (const [pattern, code] of CURRENCY_MARKERS) {
    if (pattern.test(summary)) return code;
  }
  return null;
}

/** Expand Ashby's abbreviated magnitudes: `68K` → 68000, `1.2M` → 1200000. */
function expandMagnitude(raw: string, suffix: string | undefined): number {
  const base = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(base)) return NaN;
  const s = (suffix ?? "").toUpperCase();
  if (s === "K") return base * 1_000;
  if (s === "M") return base * 1_000_000;
  return base;
}

/**
 * Fallback parser for Ashby's `scrapeableCompensationSalarySummary` — the
 * pre-rendered string a posting carries when its tier is authored as text
 * rather than as structured min/max components (e.g. "CA$69.6K – CA$87K").
 * Returns null unless the string is unambiguously an annual salary range in a
 * recognisable currency; ambiguity falls through to AI extraction.
 */
export function parseSalarySummary(summary: unknown): ParsedSalary | null {
  if (typeof summary !== "string") return null;
  const text = summary.trim();
  if (!text) return null;
  // Hourly/monthly/weekly bands can't live in an annual-only column.
  if (NON_ANNUAL_SUMMARY.test(text)) return null;

  const currency = parseSummaryCurrency(text);
  if (!currency) return null;

  const values: number[] = [];
  for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([KkMm])?/g)) {
    const value = expandMagnitude(match[1], match[2]);
    if (isPlausibleAnnual(value)) values.push(Math.round(value));
    if (values.length === 2) break;
  }
  if (values.length === 0) return null;

  const [first, second] = values;
  // A single figure is an exact posted salary, not an open-ended band.
  const min = Math.min(first, second ?? first);
  const max = Math.max(first, second ?? first);
  return { salary_min: min, salary_max: max, salary_currency: currency };
}

function collectComponents(compensation: AshbyCompensation): AshbyCompensationComponent[] {
  // `summaryComponents` is the board-level rollup Ashby renders; fall back to
  // flattening the per-tier components (geo tiers) when it isn't present.
  if (Array.isArray(compensation.summaryComponents) && compensation.summaryComponents.length > 0) {
    return compensation.summaryComponents;
  }
  const tiers = Array.isArray(compensation.compensationTiers) ? compensation.compensationTiers : [];
  return tiers.flatMap((tier) => (Array.isArray(tier.components) ? tier.components : []));
}

/**
 * Turn an Ashby `compensation` block into the flat salary columns. Structured
 * min/max components are preferred; the summary string is a fallback. Returns
 * null when the posting publishes no usable annual salary range, in which case
 * the caller leaves salary untouched and the existing AI extraction path fills
 * it exactly as before.
 */
export function parseAshbyCompensation(compensation: unknown): ParsedSalary | null {
  if (!compensation || typeof compensation !== "object") return null;
  const comp = compensation as AshbyCompensation;

  const salaryComponents = collectComponents(comp).filter(
    (c) =>
      normalizeToken(c.compensationType) === "SALARY" &&
      normalizeToken(c.interval) === ANNUAL_INTERVAL
  );

  // Pin to the first component's currency and merge only components that agree
  // with it — widening a CAD band with USD numbers produces a range that is
  // wrong in both currencies.
  const currency = salaryComponents
    .map((c) => normalizeToken(c.currencyCode))
    .find((code) => /^[A-Z]{3}$/.test(code));

  if (currency) {
    let min: number | null = null;
    let max: number | null = null;
    for (const component of salaryComponents) {
      if (normalizeToken(component.currencyCode) !== currency) continue;
      const componentMin = typeof component.minValue === "number" ? component.minValue : NaN;
      const componentMax = typeof component.maxValue === "number" ? component.maxValue : NaN;
      if (isPlausibleAnnual(componentMin)) {
        min = min === null ? componentMin : Math.min(min, componentMin);
      }
      if (isPlausibleAnnual(componentMax)) {
        max = max === null ? componentMax : Math.max(max, componentMax);
      }
    }
    if (min !== null || max !== null) {
      const low = min ?? max!;
      const high = max ?? min!;
      return {
        salary_min: Math.round(Math.min(low, high)),
        salary_max: Math.round(Math.max(low, high)),
        salary_currency: currency,
      };
    }
  }

  return parseSalarySummary(comp.scrapeableCompensationSalarySummary);
}

export async function fetchAshbyJobs(atsIdentifier: string): Promise<JobData[]> {
  const res = await fetch(`${BASE}/${atsIdentifier}?${COMPENSATION_QUERY}`, {
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Ashby API error: ${res.status}`);
  }

  const data = (await res.json()) as AshbyResponse;
  const list = data.jobs ?? [];

  const jobs: JobData[] = [];

  for (const job of list) {
    const location = job.location ?? "";
    const descriptionHtml = job.descriptionHtml ?? "";

    // Determine location type
    let locationType: string | null = null;
    if (job.isRemote) {
      locationType = "remote";
    } else {
      locationType = detectLocationType(location, descriptionHtml);
    }

    // Parse commitment/employment type
    let commitment = normalizeCommitment(job.employmentType ?? "") ?? "full-time";
    const title = (job.title ?? "").toLowerCase();
    if (/intern/.test(title)) commitment = "internship";
    else if (/contract/.test(title)) commitment = "contract";
    else if (/part-time|part time/.test(title)) commitment = "part-time";

    // Parse posted date
    let postedDate: Date | null = null;
    if (job.publishedAt) {
      try {
        postedDate = new Date(job.publishedAt);
      } catch {
        // Ignore parse errors
      }
    }

    // Structured salary published by the board itself. Tagged with
    // `salary_source: "ats"` so the ingest layer knows it outranks the AI
    // description extraction; postings with no published range stay untagged
    // and keep the old AI-only behaviour.
    const salary = parseAshbyCompensation(job.compensation);

    jobs.push({
      external_id: job.id,
      title: job.title,
      department: job.department ?? null,
      team: job.team ?? null,
      location: location || null,
      location_type: locationType,
      description_html: descriptionHtml || null,
      description_text: htmlToText(descriptionHtml),
      commitment: commitment || null,
      posted_date: postedDate,
      url: job.jobUrl ?? job.applyUrl ?? null,
      ...(salary ? { ...salary, salary_source: "ats" as const } : {}),
    });
  }

  return jobs;
}
