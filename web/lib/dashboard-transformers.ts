// Dashboard data transformers
// Note: Most transformation logic has moved into dashboard-queries.ts
// This file is retained for potential shared transform utilities.

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  country: string;
  ats_type: string;
  job_postings?: JobPostingRow[];
}

export interface JobPostingRow {
  id: string;
  is_active: boolean;
  title: string;
  first_seen_date: string | null;
}

export interface DigestCompanyRow {
  id: string;
  company_id: string;
  headline: string;
  body: string;
  new_job_count: number;
  companies?:
    | { id: string; name: string; slug: string }[]
    | { id: string; name: string; slug: string };
}
