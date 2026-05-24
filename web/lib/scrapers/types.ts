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
}

export function jobToRow(job: JobData) {
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
  };
}
