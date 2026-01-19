/**
 * Headless Browser Scraper
 * Uses Puppeteer with @sparticuz/chromium for serverless compatibility
 * This is a fallback for JavaScript-rendered job boards
 * 
 * Supports dependency injection of browser instance for GitHub Actions
 * (full puppeteer) while maintaining Vercel compatibility (@sparticuz/chromium)
 */

import type { JobData } from "./types";
import type { Browser } from "puppeteer-core";
import { htmlToText, detectLocationType, normalizeCommitment } from "./utils";

let puppeteer: typeof import("puppeteer-core") | null = null;
let chromium: typeof import("@sparticuz/chromium") | null = null;

async function loadBrowserDependencies() {
  if (!puppeteer) {
    puppeteer = await import("puppeteer-core");
  }
  if (!chromium) {
    chromium = await import("@sparticuz/chromium");
  }
  return { puppeteer, chromium };
}

interface BrowserJobData {
  id: string;
  title: string;
  url: string;
  department?: string;
  location?: string;
  locationType?: string;
  postedDate?: string;
  employmentType?: string;
}

interface ScraperConfig {
  /** URL to navigate to */
  url: string;
  /** Wait for this selector before scraping */
  waitSelector?: string;
  /** Additional wait time in ms after page load */
  extraWaitMs?: number;
  /** Custom extraction script to run in page context */
  extractScript?: string;
}

/**
 * Generic browser-based job scraper
 * Can scrape any JavaScript-rendered job board
 * 
 * @param config - Scraper configuration
 * @param browser - Optional browser instance (for dependency injection).
 *                  If provided, uses it and does not close it.
 *                  If not provided, launches puppeteer-core with @sparticuz/chromium and closes it.
 */
export async function scrapeJobsWithBrowser(
  config: ScraperConfig,
  browser?: Browser
): Promise<BrowserJobData[]> {
  let browserInstance: Browser | null = null;
  let shouldCloseBrowser = false;
  
  try {
    if (browser) {
      // Use provided browser instance (caller owns it)
      browserInstance = browser;
    } else {
      // Launch browser using serverless-compatible setup
      const { puppeteer, chromium } = await loadBrowserDependencies();
      const executablePath = await chromium.executablePath();
      
      browserInstance = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath,
        headless: true,
      });
      shouldCloseBrowser = true;
    }

    const page = await browserInstance.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Navigate to the page
    await page.goto(config.url, { 
      waitUntil: "networkidle2",
      timeout: 30000 
    });

    // Wait for job listings to load
    if (config.waitSelector) {
      try {
        await page.waitForSelector(config.waitSelector, { timeout: 10000 });
      } catch {
        // Selector might not exist, continue anyway
      }
    }

    // Extra wait if needed for dynamic content
    if (config.extraWaitMs) {
      await new Promise(resolve => setTimeout(resolve, config.extraWaitMs));
    }

    // Extract jobs using custom script or generic extraction
    const jobs = await page.evaluate((customScript) => {
      if (customScript) {
        // Execute custom extraction script
        return eval(customScript);
      }

      // Generic job extraction - looks for common patterns
      const results: Array<{
        id: string;
        title: string;
        url: string;
        department?: string;
        location?: string;
      }> = [];
      const seenIds = new Set<string>();

      // Common selectors for job listings
      const jobSelectors = [
        '[data-job-id]',
        '[data-posting-id]',
        '.job-card',
        '.job-listing',
        '.job-item',
        '.job-row',
        '.posting-card',
        'a[href*="/jobs/"]',
        'a[href*="/job/"]',
        'a[href*="/careers/"]',
        '[role="listitem"]',
      ];

      for (const selector of jobSelectors) {
        const elements = document.querySelectorAll(selector);
        
        for (const el of elements) {
          // Try to extract job ID
          let id = (el as HTMLElement).dataset?.jobId || 
                   (el as HTMLElement).dataset?.postingId ||
                   (el as HTMLElement).dataset?.id;
          
          // Try to get ID from href
          if (!id) {
            const link = el.tagName === 'A' ? el : el.querySelector('a');
            if (link) {
              const href = (link as HTMLAnchorElement).href;
              const match = href.match(/\/(?:jobs?|posting)\/(\d+)/i);
              if (match) id = match[1];
            }
          }

          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);

          // Extract title
          const titleEl = el.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]');
          const title = titleEl?.textContent?.trim() || el.textContent?.trim()?.split('\n')[0] || '';
          
          if (!title || title.length < 3) continue;

          // Extract URL
          const linkEl = el.tagName === 'A' ? el : el.querySelector('a');
          const url = (linkEl as HTMLAnchorElement)?.href || '';

          // Extract location
          const locationEl = el.querySelector('[class*="location"], [class*="Location"], [data-location]');
          const location = locationEl?.textContent?.trim();

          // Extract department
          const deptEl = el.querySelector('[class*="department"], [class*="Department"], [class*="team"], [class*="Team"]');
          const department = deptEl?.textContent?.trim();

          results.push({
            id,
            title: title.substring(0, 200),
            url,
            location,
            department,
          });
        }
      }

      return results;
    }, config.extractScript);

    return jobs;
  } finally {
    // Only close browser if we created it (not if it was injected)
    if (shouldCloseBrowser && browserInstance) {
      await browserInstance.close();
    }
  }
}

/**
 * Dayforce-specific browser scraper
 * 
 * @param atsIdentifier - Dayforce company identifier
 * @param browser - Optional browser instance (for dependency injection)
 */
export async function scrapeDayforceWithBrowser(
  atsIdentifier: string,
  browser?: Browser
): Promise<JobData[]> {
  const url = `https://jobs.dayforcehcm.com/en-US/${atsIdentifier}/CANDIDATEPORTAL`;
  
  // Dayforce-specific extraction script
  const extractScript = `
    (function() {
      const jobs = [];
      const seenIds = new Set();
      
      // Look for job cards/links
      const jobElements = document.querySelectorAll('a[href*="/jobs/"], [class*="job"], [data-testid*="job"]');
      
      for (const el of jobElements) {
        // Get the link
        const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/jobs/"]');
        if (!link) continue;
        
        const href = link.href;
        const idMatch = href.match(/\\/jobs\\/(\\d+)/);
        if (!idMatch) continue;
        
        const id = idMatch[1];
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        
        // Find the job card container
        let container = el;
        while (container.parentElement && !container.className.includes('card') && !container.className.includes('item')) {
          container = container.parentElement;
          if (container.tagName === 'BODY') {
            container = el;
            break;
          }
        }
        
        // Extract title - look for heading or strong text
        let title = '';
        const titleEl = container.querySelector('h1, h2, h3, h4, strong, [class*="title"], [class*="Title"]');
        if (titleEl) {
          title = titleEl.textContent.trim();
        } else {
          title = link.textContent.trim();
        }
        
        if (!title || title.length < 3) continue;
        
        // Extract location
        let location = '';
        const locationEl = container.querySelector('[class*="location"], [class*="Location"], svg + span, [data-testid*="location"]');
        if (locationEl) {
          location = locationEl.textContent.trim();
        }
        
        // Extract department
        let department = '';
        const deptEl = container.querySelector('[class*="department"], [class*="Department"], [class*="category"]');
        if (deptEl) {
          department = deptEl.textContent.trim();
        }
        
        jobs.push({
          id,
          title: title.substring(0, 200),
          url: href,
          location,
          department,
        });
      }
      
      return jobs;
    })()
  `;

  const browserJobs = await scrapeJobsWithBrowser(
    {
      url,
      waitSelector: 'a[href*="/jobs/"]',
      extraWaitMs: 2000, // Dayforce needs extra time to load
      extractScript,
    },
    browser
  );

  // Convert to JobData format
  return browserJobs.map((job): JobData => ({
    external_id: job.id,
    title: job.title,
    department: job.department || null,
    team: null,
    location: job.location || null,
    location_type: job.locationType ? detectLocationType(job.location || "", "") : null,
    description_html: null,
    description_text: null,
    commitment: normalizeCommitment(job.employmentType || "") || "full-time",
    posted_date: job.postedDate ? new Date(job.postedDate) : null,
    url: job.url || `https://jobs.dayforcehcm.com/en-US/${atsIdentifier}/CANDIDATEPORTAL/jobs/${job.id}`,
  }));
}

/**
 * Generic browser scraper for any job board URL
 * Use this for custom/unknown ATS platforms
 * 
 * @param url - Job board URL to scrape
 * @param baseIdentifier - Base identifier for the company
 * @param browser - Optional browser instance (for dependency injection)
 */
export async function scrapeGenericJobBoard(
  url: string,
  baseIdentifier: string,
  browser?: Browser
): Promise<JobData[]> {
  const browserJobs = await scrapeJobsWithBrowser(
    {
      url,
      extraWaitMs: 3000,
    },
    browser
  );

  return browserJobs.map((job): JobData => ({
    external_id: job.id,
    title: job.title,
    department: job.department || null,
    team: null,
    location: job.location || null,
    location_type: detectLocationType(job.location || "", ""),
    description_html: null,
    description_text: null,
    commitment: "full-time",
    posted_date: null,
    url: job.url,
  }));
}
