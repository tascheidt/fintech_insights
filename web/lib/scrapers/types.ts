export interface JobData {
  external_id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  location?: string | null;
  location_type?: string | null;
  description_html?: string | null;
  description_text?: string | null;
  commitment?: string | null;
  posted_date?: Date | null;
  url?: string | null;
  /**
   * Routing hint: when set, the processor inserts this job under the
   * named company slug instead of the parent company being scraped.
   * Used for sub-brands that share an ATS tenant (e.g. Simplii on
   * CIBC's Workday). The target company must exist with
   * `parent_company_id` pointing at the parent. Not persisted to the
   * `job_postings` row.
   */
  companySlugOverride?: string;
  /**
   * ANNUAL salary range published as structured data by the ATS itself —
   * currently only Ashby (`parseAshbyCompensation`), whose boards render the
   * range from a `compensation` object that never appears in the description
   * text. Set only alongside `salary_source: "ats"`; scrapers whose ATS
   * exposes no structured compensation leave all four fields undefined and
   * salary continues to come from AI description extraction.
   *
   * Hourly / monthly / equity components are NOT mapped here — `job_postings`
   * stores a bare integer with no interval column, so only annual figures may
   * land in it.
   */
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  /**
   * Provenance marker for the `salary_*` fields above. Present only when the
   * scraper parsed a usable range out of the ATS's own structured compensation
   * data, which the ingest layer treats as authoritative over the Flash
   * description extractor (`extractAndUpdateStructure`).
   */
  salary_source?: "ats";
}

/** Flat salary columns on `job_postings`, as sourced from an ATS. */
export interface AtsSalaryFields {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
}

export type JobRow = {
  external_id: string;
  title: string;
  department: string | null;
  team: string | null;
  location: string | null;
  location_type: string | null;
  description_html: string | null;
  description_text: string | null;
  commitment: string | null;
  posted_date: string | null;
  url: string | null;
} & Partial<AtsSalaryFields>;

/**
 * Salary columns to write for a job, or null when the scraper published none.
 *
 * Null is the "don't touch salary" signal, not "clear it": the columns are
 * shared with the AI description extractor, so unconditionally writing them
 * would wipe every AI-extracted salary on every scrape of every non-Ashby
 * board.
 */
export function atsSalaryFields(job: JobData): AtsSalaryFields | null {
  if (job.salary_source !== "ats") return null;
  if (job.salary_min == null && job.salary_max == null) return null;
  return {
    salary_min: job.salary_min ?? null,
    salary_max: job.salary_max ?? null,
    salary_currency: job.salary_currency ?? null,
  };
}

export function jobToRow(job: JobData): JobRow {
  const salary = atsSalaryFields(job);
  return {
    external_id: job.external_id,
    title: job.title,
    department: job.department ?? null,
    team: job.team ?? null,
    location: job.location ?? null,
    location_type: job.location_type ?? null,
    description_html: job.description_html ?? null,
    description_text: job.description_text ?? null,
    commitment: job.commitment ?? null,
    posted_date: job.posted_date?.toISOString() ?? null,
    url: job.url ?? null,
    // Spread conditionally: an explicit `salary_currency: null` on insert would
    // override the column's 'USD' default for every board that publishes no
    // structured compensation.
    ...(salary ?? {}),
  };
}
