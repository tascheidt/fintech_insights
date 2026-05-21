import type { JobData } from "./types";
import type { Browser } from "puppeteer-core";
import { fetchLeverJobs } from "./lever";
import { fetchGreenhouseJobs } from "./greenhouse";
import { fetchWorkableJobs } from "./workable";
import { fetchAshbyJobs } from "./ashby";
import { fetchDayforceJobs } from "./dayforce";
import { fetchScotiabankJobs } from "./scotiabank";
import { fetchPhenomRbcJobs } from "./phenom-rbc";

export type { JobData } from "./types";
export { jobToRow } from "./types";
export { detectATSFromUrl, SUPPORTED_ATS, type ATSType, type ATSDetectionResult } from "./detect-ats";
export { scrapeJobsWithBrowser, scrapeGenericJobBoard, scrapeSuccessFactors } from "./browser";

/**
 * Fetch jobs from a company's ATS
 * @param atsType - The ATS platform type
 * @param atsIdentifier - The company's identifier on the ATS
 * @param careersUrl - Optional careers URL for browser-based scraping fallback
 * @param browser - Optional browser instance (for dependency injection in GitHub Actions)
 */
export async function fetchJobs(
  atsType: string,
  atsIdentifier: string,
  careersUrl?: string,
  browser?: Browser
): Promise<JobData[]> {
  switch (atsType.toLowerCase()) {
    case "lever":
      return fetchLeverJobs(atsIdentifier);
    case "greenhouse":
      return fetchGreenhouseJobs(atsIdentifier);
    case "workable":
      return fetchWorkableJobs(atsIdentifier);
    case "ashby":
      return fetchAshbyJobs(atsIdentifier);
    case "dayforce":
      return fetchDayforceJobs(atsIdentifier, browser);
    case "scotiabank":
      return fetchScotiabankJobs(atsIdentifier);

    case "phenom": {
      // Phenom CareerConnect is white-labelled to each bank's own domain
      // (jobs.rbc.com, jobs.bmo.com, etc.). Dispatch by tenant since the
      // listing-page URL and per-tenant quirks differ. The pure-logic
      // pieces (eagerLoadRefineSearch parsing, JSON-LD enrichment) are
      // exported from phenom-rbc.ts and can be reused by future
      // phenom-bmo.ts etc. — extract a shared helper once 2+ tenants ship.
      const tenant = atsIdentifier.toLowerCase();
      if (tenant === "rbc") {
        return fetchPhenomRbcJobs(atsIdentifier, browser);
      }
      throw new Error(
        `No Phenom scraper for tenant '${atsIdentifier}'. Add a tenant-specific scraper modeled on phenom-rbc.ts.`
      );
    }

    case "successfactors": {
      if (!careersUrl) {
        throw new Error(`${atsType} requires a careers URL for browser-based scraping`);
      }
      const { scrapeSuccessFactors } = await import("./browser");
      return scrapeSuccessFactors(careersUrl, browser);
    }

    // Browser-based scraping for platforms without APIs / without a
    // tenant-specific scraper. Falls back to the generic Puppeteer
    // extractor — works on enough sites to be useful but trades reliability
    // for breadth.
    case "workday":
    case "smartrecruiters":
    case "bamboohr":
    case "jazzhr":
    case "recruitee":
    case "custom": {
      if (!careersUrl) {
        throw new Error(`${atsType} requires a careers URL for browser-based scraping`);
      }
      const { scrapeGenericJobBoard } = await import("./browser");
      return scrapeGenericJobBoard(careersUrl, atsIdentifier, browser);
    }
    
    default:
      throw new Error(`Unknown ATS type: ${atsType}`);
  }
}

/**
 * Check if browser scraping is available
 * (Puppeteer may not work in all environments)
 */
export async function isBrowserScrapingAvailable(): Promise<boolean> {
  try {
    await import("puppeteer-core");
    await import("@sparticuz/chromium");
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an ATS type requires browser-based scraping
 * Browser scrapers should be offloaded to GitHub Actions to avoid Vercel timeouts
 * 
 * @param atsType - The ATS platform type
 * @returns true if the ATS requires browser scraping, false if it uses API
 */
export function isBrowserScraper(atsType: string): boolean {
  const normalized = atsType.toLowerCase();
  
  // Browser-based scrapers (no API available or unreliable)
  // These will be offloaded to GitHub Actions
  const browserScrapers = [
    'workday',
    'bamboohr',
    'smartrecruiters',
    'dayforce',
    'successfactors',
    'phenom',
    'taleo',
    'icims',
  ];
  
  return browserScrapers.includes(normalized);
}
