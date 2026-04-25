import type { JobData } from "./types";
import { htmlToText, detectLocationType, normalizeCommitment } from "./utils";

interface DayforceJob {
  jobPostingId?: number;
  jobId?: number;
  id?: number;
  requisitionId?: string;
  title?: string;
  jobTitle?: string;
  jobFamily?: string;
  department?: string;
  location?: string;
  locationName?: string;
  city?: string;
  state?: string;
  country?: string;
  postingDate?: string;
  postedDate?: string;
  employmentType?: string;
  workType?: string;
  workplaceType?: string;
  description?: string;
  shortDescription?: string;
  urlSlug?: string;
}

interface DayforceSearchResponse {
  jobs?: DayforceJob[];
  jobPostings?: DayforceJob[];
  data?: DayforceJob[];
  results?: DayforceJob[];
  Items?: DayforceJob[];
  totalCount?: number;
  total?: number;
}

import type { Browser } from "puppeteer-core";
import { log } from "@/lib/log";

export async function fetchDayforceJobs(
  atsIdentifier: string,
  browser?: Browser
): Promise<JobData[]> {
  // First, try API endpoints (faster if they work)
  const apiJobs = await tryDayforceApis(atsIdentifier);
  if (apiJobs !== null) {
    return apiJobs;
  }

  // Fall back to headless browser scraping
  try {
    const { scrapeDayforceWithBrowser } = await import("./browser");
    const browserJobs = await scrapeDayforceWithBrowser(atsIdentifier, browser);
    if (browserJobs.length > 0) {
      return browserJobs;
    }
  } catch (e) {
    // Browser scraping failed, try one more HTML approach
    log.error({ err: e }, "Browser scraping failed:");
  }

  // Last resort: try basic HTML fetch
  try {
    const htmlJobs = await fetchDayforceJobsFromHtml(atsIdentifier);
    if (htmlJobs.length > 0) {
      return htmlJobs;
    }
  } catch {
    // Ignore
  }

  // Return empty array if nothing works - at least don't error out
  return [];
}

async function tryDayforceApis(atsIdentifier: string): Promise<JobData[] | null> {
  const searchEndpoints = [
    // V2 search API (POST)
    {
      url: `https://jobs.dayforcehcm.com/api/v2/${atsIdentifier}/jobs/search`,
      method: "POST",
      body: JSON.stringify({ 
        Keywords: "",
        Location: "",
        Radius: 0,
        Page: 1,
        PageSize: 1000
      }),
    },
    // Alternative search endpoint
    {
      url: `https://jobs.dayforcehcm.com/api/${atsIdentifier}/jobsearch`,
      method: "POST", 
      body: JSON.stringify({
        searchText: "",
        location: "",
        page: 1,
        pageSize: 1000
      }),
    },
    // Direct jobs endpoint (GET)
    {
      url: `https://jobs.dayforcehcm.com/api/v1/${atsIdentifier}/jobs`,
      method: "GET",
      body: undefined,
    },
  ];

  for (const endpoint of searchEndpoints) {
    try {
      const res = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: endpoint.body,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = (await res.json()) as DayforceSearchResponse;
        const jobData = data.jobs ?? data.jobPostings ?? data.data ?? data.results ?? data.Items ?? [];
        
        if (Array.isArray(jobData) && jobData.length > 0) {
          return jobData.map((job) => mapDayforceJob(job, atsIdentifier));
        }
      }
    } catch {
      continue;
    }
  }

  return null; // Signal to try browser scraping
}

function mapDayforceJob(job: DayforceJob, atsIdentifier: string): JobData {
  const jobId = job.jobPostingId ?? job.jobId ?? job.id;
  const title = job.title ?? job.jobTitle ?? "";
  const location = job.location ?? job.locationName ?? [job.city, job.state, job.country].filter(Boolean).join(", ");
  const description = job.description ?? job.shortDescription ?? "";
  const postedDate = job.postingDate ?? job.postedDate;
  const workType = job.workType ?? job.workplaceType ?? "";

  let locationType: string | null = null;
  if (workType) {
    const wt = workType.toLowerCase();
    if (/remote/.test(wt)) locationType = "remote";
    else if (/hybrid/.test(wt)) locationType = "hybrid";
    else if (/on-?site|office/.test(wt)) locationType = "onsite";
  }
  if (!locationType && location) {
    locationType = detectLocationType(location, description);
  }

  let commitment = normalizeCommitment(job.employmentType ?? "") ?? "full-time";
  const titleLower = title.toLowerCase();
  if (/intern/.test(titleLower)) commitment = "internship";
  else if (/contract/.test(titleLower)) commitment = "contract";
  else if (/part-time|part time/.test(titleLower)) commitment = "part-time";

  let parsedDate: Date | null = null;
  if (postedDate) {
    try {
      parsedDate = new Date(postedDate);
      if (isNaN(parsedDate.getTime())) parsedDate = null;
    } catch {
      // Ignore
    }
  }

  const jobUrl = job.urlSlug
    ? `https://jobs.dayforcehcm.com/en-US/${atsIdentifier}/CANDIDATEPORTAL/jobs/${job.urlSlug}`
    : `https://jobs.dayforcehcm.com/en-US/${atsIdentifier}/CANDIDATEPORTAL/jobs/${jobId}`;

  return {
    external_id: String(jobId ?? job.requisitionId ?? ""),
    title,
    department: job.department ?? job.jobFamily ?? null,
    team: null,
    location: location || null,
    location_type: locationType,
    description_html: description || null,
    description_text: htmlToText(description),
    commitment,
    posted_date: parsedDate,
    url: jobUrl,
  };
}

async function fetchDayforceJobsFromHtml(atsIdentifier: string): Promise<JobData[]> {
  const pageUrl = `https://jobs.dayforcehcm.com/en-US/${atsIdentifier}/CANDIDATEPORTAL`;
  
  const res = await fetch(pageUrl, {
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Dayforce page error: ${res.status}`);
  }

  const html = await res.text();
  const jobs: JobData[] = [];
  const seenIds = new Set<string>();

  // Extract job IDs and titles from any embedded data or links
  const patterns = [
    /\/jobs\/(\d+)"[^>]*>([^<]+)/gi,
    /data-job-id="(\d+)"[\s\S]*?title[^>]*>([^<]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const [, jobId, title] = match;
      if (jobId && title && !seenIds.has(jobId)) {
        const cleanTitle = title.replace(/\s+/g, " ").trim();
        if (cleanTitle.length > 2 && cleanTitle.length < 200) {
          seenIds.add(jobId);
          jobs.push({
            external_id: jobId,
            title: cleanTitle,
            department: null,
            team: null,
            location: null,
            location_type: null,
            description_html: null,
            description_text: null,
            commitment: "full-time",
            posted_date: null,
            url: `https://jobs.dayforcehcm.com/en-US/${atsIdentifier}/CANDIDATEPORTAL/jobs/${jobId}`,
          });
        }
      }
    }
  }

  return jobs;
}
