import type { JobData } from "./types";
import { fetchLeverJobs } from "./lever";
import { fetchGreenhouseJobs } from "./greenhouse";
import { fetchWorkableJobs } from "./workable";

export type { JobData } from "./types";
export { jobToRow } from "./types";

export async function fetchJobs(
  atsType: string,
  atsIdentifier: string
): Promise<JobData[]> {
  switch (atsType.toLowerCase()) {
    case "lever":
      return fetchLeverJobs(atsIdentifier);
    case "greenhouse":
      return fetchGreenhouseJobs(atsIdentifier);
    case "workable":
      return fetchWorkableJobs(atsIdentifier);
    case "workday":
    case "custom":
      throw new Error(`${atsType} scraper not implemented`);
    default:
      throw new Error(`Unknown ATS type: ${atsType}`);
  }
}
