import type { JobData } from "./types";
import { htmlToText, detectLocationType, normalizeCommitment } from "./utils";

const BASE = "https://api.ashbyhq.com/posting-api/job-board";

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
}

interface AshbyResponse {
  jobs?: AshbyJob[];
}

export async function fetchAshbyJobs(atsIdentifier: string): Promise<JobData[]> {
  const res = await fetch(`${BASE}/${atsIdentifier}`, {
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
    });
  }

  return jobs;
}
