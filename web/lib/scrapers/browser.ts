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
let chromium: any = null;

async function loadBrowserDependencies() {
  if (!puppeteer) {
    puppeteer = await import("puppeteer-core");
  }
  if (!chromium) {
    const chromiumModule = await import("@sparticuz/chromium");
    // Handle both ESM default export and CommonJS module patterns
    chromium = chromiumModule.default || chromiumModule;
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
    
    try {
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
      // Always close the page to prevent memory leaks
      await page.close();
    }
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
  
  let browserInstance: Browser | null = null;
  let shouldCloseBrowser = false;
  
  try {
    if (browser) {
      browserInstance = browser;
    } else {
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
    
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Navigate to job listings page
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for job listings to load
      await page.waitForSelector('a[href*="/jobs/"]', { timeout: 10000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000)); // Extra wait for Dayforce

      // Extract job links from listing page
      const jobLinks = await page.evaluate(() => {
        const jobs: Array<{ id: string; title: string; url: string }> = [];
        const seenIds = new Set<string>();
        
        const jobElements = document.querySelectorAll('a[href*="/jobs/"], [class*="job"], [data-testid*="job"]');
        
        for (const el of jobElements) {
          const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/jobs/"]');
          if (!link) continue;
          
          const href = (link as HTMLAnchorElement).href;
          const idMatch = href.match(/\/jobs\/(\d+)/);
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
          
          // Extract title
          let title = '';
          const titleEl = container.querySelector('h1, h2, h3, h4, strong, [class*="title"], [class*="Title"]');
          if (titleEl) {
            title = titleEl.textContent?.trim() || '';
          } else {
            title = link.textContent?.trim() || '';
          }
          
          if (!title || title.length < 3) continue;
          
          jobs.push({
            id,
            title: title.substring(0, 200),
            url: href,
          });
        }
        
        return jobs;
      });

      console.log(`Found ${jobLinks.length} job links for Dayforce ${atsIdentifier}`);

      // Visit each job link to get full description
      const jobsWithDescriptions: JobData[] = [];
      
      for (const jobLink of jobLinks) {
        let retryCount = 0;
        const maxRetries = 2;
        let jobDetails: any = null;
        let extractionSuccess = false;

        while (retryCount <= maxRetries && !extractionSuccess) {
          try {
            if (retryCount > 0) {
              console.log(`  Retrying extraction (attempt ${retryCount + 1}/${maxRetries + 1})...`);
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
            }

            await page.goto(jobLink.url, {
              waitUntil: "networkidle2",
              timeout: 20000,
            });

          // Wait for job content container to appear first
          await page.waitForSelector(
            '[test-id="job-details-dayforce-jobs"]',
            { timeout: 15000 }
          ).catch(() => {
            // Fallback to generic selectors if test-id doesn't exist
            return page.waitForSelector(
              'main, [role="main"]',
              { timeout: 10000 }
            );
          }).catch(() => {
            // Container might not exist, continue anyway
          });

          // Wait for loading spinner to disappear (both globally and inside container)
          // This is critical - the container appears before content loads
          await page.waitForFunction(
            () => {
              const globalSpinner = document.querySelector('.ant-spin-spinning');
              const container = document.querySelector('[test-id="job-details-dayforce-jobs"]') || document.querySelector('main');
              const containerSpinner = container?.querySelector('.ant-spin-spinning');
              return !globalSpinner && !containerSpinner;
            },
            { timeout: 20000 }
          ).catch(() => {
            // Spinner might not exist or already gone, continue
          });

          // Wait for actual content to appear (not just the container)
          // Check for job description content or JSON data
          await page.waitForFunction(
            () => {
              // Check if JSON data is available
              const nextDataScript = document.querySelector('#__NEXT_DATA__');
              if (nextDataScript) {
                try {
                  const nextData = JSON.parse(nextDataScript.textContent || '{}');
                  const jobData = nextData?.props?.pageProps?.jobData || 
                                 nextData?.props?.pageProps?.dehydratedState?.queries?.find((q: any) => 
                                   q?.queryKey?.[0] === 'jobs' || 
                                   q?.state?.data?.jobData
                                 )?.state?.data?.jobData;
                  if (jobData?.jobPostingContent?.jobDescription) {
                    const desc = jobData.jobPostingContent.jobDescription;
                    if (desc && desc.length > 200) {
                      return true;
                    }
                  }
                } catch (e) {
                  // JSON parsing failed, check DOM instead
                }
              }
              
              // Check DOM for actual content (not just spinner)
              const container = document.querySelector('[test-id="job-details-dayforce-jobs"]') || document.querySelector('main');
              if (container) {
                const spinner = container.querySelector('.ant-spin-spinning');
                if (spinner) return false; // Still loading
                
                // Check for actual text content
                const text = container.textContent || '';
                // Should have substantial text content (more than just UI elements)
                if (text.length > 500) {
                  // Make sure it's not just loading text
                  const lowerText = text.toLowerCase();
                  if (!lowerText.includes('loading') && !lowerText.includes('spinning')) {
                    return true;
                  }
                }
              }
              
              return false;
            },
            { timeout: 30000 }
          ).catch(() => {
            // Content might not load, but continue to try extraction anyway
            console.warn('Timeout waiting for content, proceeding with extraction');
          });

          // Additional wait for React hydration to complete
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Extract full job details (JSON first, then DOM fallback)
          const jobDetails = await page.evaluate((linkTitle, linkId) => {
            // Try JSON extraction first (most reliable for Next.js apps)
            const nextDataScript = document.querySelector('#__NEXT_DATA__');
            if (nextDataScript) {
              try {
                const nextData = JSON.parse(nextDataScript.textContent || '{}');
                
                // Try multiple paths to find jobData (based on actual Questrade structure)
                let jobData = null;
                
                // Path 1: Direct jobData in pageProps
                if (nextData?.props?.pageProps?.jobData) {
                  jobData = nextData.props.pageProps.jobData;
                }
                // Path 2: In dehydratedState queries (most common for Next.js)
                else if (nextData?.props?.pageProps?.dehydratedState?.queries) {
                  const queries = nextData.props.pageProps.dehydratedState.queries;
                  // Search for query with 'jobs' in queryKey or jobData in state.data
                  for (const query of queries) {
                    if (query?.state?.data?.jobData) {
                      jobData = query.state.data.jobData;
                      break;
                    }
                    // Also check queryKey for 'jobs'
                    if (Array.isArray(query?.queryKey) && 
                        (query.queryKey[0] === 'jobs' || query.queryKey.includes('jobs')) &&
                        query?.state?.data?.jobData) {
                      jobData = query.state.data.jobData;
                      break;
                    }
                  }
                  // Fallback: try index 1 (common pattern)
                  if (!jobData && queries[1]?.state?.data?.jobData) {
                    jobData = queries[1].state.data.jobData;
                  }
                }
                
                if (jobData?.jobPostingContent) {
                  const content = jobData.jobPostingContent;
                  const descriptionHtml = [
                    content.jobDescriptionHeader || '',
                    content.jobDescription || '',
                    content.jobDescriptionFooter || ''
                  ].filter(Boolean).join('\n');
                  
                  // Convert HTML to text
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = descriptionHtml;
                  const descriptionText = tempDiv.textContent?.trim() || 
                                         descriptionHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                  
                  // Validate content - ensure we have actual job description
                  if (descriptionHtml.length > 200 && descriptionText.length > 200) {
                    // Check that it's not just loading spinner HTML
                    if (!descriptionHtml.includes('ant-spin-spinning') && 
                        !descriptionHtml.includes('ant-spin-dot')) {
                      
                      // Extract location from postingLocations
                      const locations = jobData.postingLocations || [];
                      const location = locations.length > 0 
                        ? locations.map((loc: any) => 
                            loc.formattedAddress || 
                            [loc.cityName, loc.stateCode, loc.isoCountryCode].filter(Boolean).join(', ')
                          ).join('; ')
                        : '';
                      
                      // Extract department from jobPostingAttributes
                      const jobFunction = jobData.jobPostingAttributes?.find((attr: any) => 
                        attr.name === 'JobFunction' || attr.name === 'JobFamily'
                      );
                      const department = jobFunction?.value || jobData.jobFamily || '';
                      
                      // Extract posted date
                      const postedDate = jobData.postingStartTimestampUTC || 
                                       jobData.createdTimestampUTC || 
                                       '';
                      
                      // Extract employment type
                      const payType = jobData.jobPostingAttributes?.find((attr: any) => 
                        attr.name === 'PayType'
                      );
                      const employmentType = payType?.value || '';
                      
                      return {
                        id: linkId,
                        title: linkTitle,
                        url: window.location.href,
                        descriptionHtml,
                        descriptionText,
                        location,
                        department,
                        postedDate,
                        employmentType,
                      };
                    }
                  }
                }
              } catch (e) {
                // JSON parsing failed, fall through to DOM extraction
                // Note: console.error in page.evaluate won't show in Node.js logs
              }
            }
            
            // Fallback: DOM extraction (improved with validation)
            // First verify container exists and spinner is gone
            const jobContainer = document.querySelector('[test-id="job-details-dayforce-jobs"]') || 
                                document.querySelector('main, [role="main"]');
            
            if (!jobContainer) {
              // No container found, return minimal data
              return {
                id: linkId,
                title: linkTitle,
                url: window.location.href,
                descriptionHtml: '',
                descriptionText: '',
                location: '',
                department: '',
                postedDate: '',
                employmentType: '',
              };
            }

            // Verify spinner is not present before extracting
            const spinner = jobContainer.querySelector('.ant-spin-spinning, .ant-spin-dot');
            if (spinner) {
              // Spinner still present - content hasn't loaded yet
              // Return empty to signal we need to wait longer
              return {
                id: linkId,
                title: linkTitle,
                url: window.location.href,
                descriptionHtml: '',
                descriptionText: '',
                location: '',
                department: '',
                postedDate: '',
                employmentType: '',
                _error: 'Spinner still present in container',
              };
            }

            // Extract description HTML - try multiple selectors within container
            const descSelectors = [
              '[class*="description"]',
              '[class*="Description"]',
              '.jobDescription',
              '#jobDescription',
              '[id*="description"]',
              '[id*="Description"]',
              '[class*="content"]',
              '[class*="Content"]',
            ];

            let descriptionHtml = '';
            let descriptionText = '';

            for (const selector of descSelectors) {
              const descEl = jobContainer.querySelector(selector);
              if (descEl) {
                // Remove spinner elements if present
                const spinner = descEl.querySelector('.ant-spin-spinning, .ant-spin-dot');
                if (spinner) spinner.remove();
                
                descriptionHtml = descEl.innerHTML || '';
                descriptionText = descEl.textContent?.trim() || '';
                
                // Validate content - ensure it's not just loading HTML
                if (descriptionHtml.length > 200 && 
                    descriptionText.length > 200 &&
                    !descriptionHtml.includes('ant-spin-spinning') &&
                    !descriptionHtml.includes('ant-spin-dot')) {
                  break;
                }
              }
            }

            // If no description found, try to get content from container itself
            if (!descriptionHtml || descriptionHtml.length < 200) {
              // Remove navigation, header, footer, and spinner elements
              const toRemove = jobContainer.querySelectorAll(
                'nav, header, footer, [class*="nav"], [class*="Nav"], ' +
                '[class*="header"], [class*="Header"], [class*="footer"], ' +
                '[class*="Footer"], [class*="breadcrumb"], [class*="Breadcrumb"], ' +
                '.ant-spin-spinning, .ant-spin-dot'
              );
              toRemove.forEach(el => el.remove());
              
              // Try to find the job description section
              const descSection = jobContainer.querySelector(
                '[class*="description"], [class*="Description"], ' +
                '[class*="content"], [class*="Content"], ' +
                '[class*="detail"], [class*="Detail"]'
              ) || jobContainer;
              
              descriptionHtml = descSection.innerHTML || '';
              descriptionText = descSection.textContent?.trim() || '';
              
              // Final validation
              if (descriptionHtml.includes('ant-spin-spinning') || 
                  descriptionHtml.includes('ant-spin-dot') ||
                  descriptionText.length < 200) {
                descriptionHtml = '';
                descriptionText = '';
              }
            }

            // Extract location
            const locationSelectors = [
              '[class*="location"]',
              '[class*="Location"]',
              '[data-location]',
              '.jobLocation',
              '[class*="address"]',
            ];
            let location = '';
            for (const selector of locationSelectors) {
              const locEl = jobContainer.querySelector(selector) || document.querySelector(selector);
              if (locEl) {
                location = locEl.textContent?.trim() || '';
                if (location) break;
              }
            }

            // Extract department
            const deptSelectors = [
              '[class*="department"]',
              '[class*="Department"]',
              '[class*="category"]',
              '[class*="Category"]',
            ];
            let department = '';
            for (const selector of deptSelectors) {
              const deptEl = jobContainer.querySelector(selector) || document.querySelector(selector);
              if (deptEl) {
                department = deptEl.textContent?.trim() || '';
                if (department) break;
              }
            }

            // Extract posted date
            const dateSelectors = [
              '[class*="date"]',
              '[class*="Date"]',
              '[class*="posted"]',
              '[class*="Posted"]',
            ];
            let postedDate = '';
            for (const selector of dateSelectors) {
              const dateEl = jobContainer.querySelector(selector) || document.querySelector(selector);
              if (dateEl) {
                postedDate = dateEl.textContent?.trim() || '';
                if (postedDate) break;
              }
            }

            // Extract employment type
            const typeSelectors = [
              '[class*="type"]',
              '[class*="Type"]',
              '[class*="employment"]',
              '[class*="Employment"]',
              '[class*="work"]',
              '[class*="Work"]',
            ];
            let employmentType = '';
            for (const selector of typeSelectors) {
              const typeEl = jobContainer.querySelector(selector) || document.querySelector(selector);
              if (typeEl) {
                employmentType = typeEl.textContent?.trim() || '';
                if (employmentType) break;
              }
            }

            return {
              id: linkId,
              title: linkTitle,
              url: window.location.href,
              descriptionHtml,
              descriptionText,
              location,
              department,
              postedDate,
              employmentType,
            };
          }, jobLink.title, jobLink.id);

          // Check if extraction failed due to spinner or empty content
          if (jobDetails._error === 'Spinner still present in container' || 
              (!jobDetails.descriptionHtml || jobDetails.descriptionHtml.length < 200)) {
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`  ⚠️  Extraction returned empty/spinner content, retrying...`);
              continue; // Retry the loop
            } else {
              console.log(`  ⚠️  Extraction failed after ${maxRetries + 1} attempts`);
            }
          }

          // Validate content - ensure we have actual job description, not loading HTML
          const hasValidDescription = jobDetails.descriptionHtml && 
                                     jobDetails.descriptionHtml.length > 200 &&
                                     jobDetails.descriptionText && 
                                     jobDetails.descriptionText.length > 200 &&
                                     !jobDetails.descriptionHtml.includes('ant-spin-spinning') &&
                                     !jobDetails.descriptionHtml.includes('ant-spin-dot') &&
                                     !jobDetails._error; // No extraction errors

          if (hasValidDescription) {
            jobsWithDescriptions.push({
              external_id: jobDetails.id,
              title: jobDetails.title,
              department: jobDetails.department || null,
              team: null,
              location: jobDetails.location || null,
              location_type: jobDetails.location ? detectLocationType(jobDetails.location, jobDetails.descriptionText) : null,
              description_html: jobDetails.descriptionHtml,
              description_text: jobDetails.descriptionText,
              commitment: normalizeCommitment(jobDetails.employmentType || "") || "full-time",
              posted_date: jobDetails.postedDate ? (() => {
                try {
                  const date = new Date(jobDetails.postedDate);
                  return isNaN(date.getTime()) ? null : date;
                } catch {
                  return null;
                }
              })() : null,
              url: jobDetails.url,
            });
            extractionSuccess = true; // Mark as successful
            break; // Success, exit retry loop
          } else {
            // Check if we should retry
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`  ⚠️  Invalid description extracted, retrying... (HTML: ${jobDetails.descriptionHtml?.length || 0}, Text: ${jobDetails.descriptionText?.length || 0})`);
              continue; // Retry the loop
            }
            
            // Log warning if we couldn't get a valid description after retries
            console.warn(`Could not extract valid description for job ${jobLink.url} after ${maxRetries + 1} attempts. HTML length: ${jobDetails.descriptionHtml?.length || 0}, Text length: ${jobDetails.descriptionText?.length || 0}`);
            
            // Still add the job even without description (better than nothing)
            jobsWithDescriptions.push({
              external_id: jobDetails.id,
              title: jobDetails.title,
              department: jobDetails.department || null,
              team: null,
              location: jobDetails.location || null,
              location_type: jobDetails.location ? detectLocationType(jobDetails.location, jobDetails.descriptionText || "") : null,
              description_html: jobDetails.descriptionHtml || null,
              description_text: jobDetails.descriptionText || null,
              commitment: normalizeCommitment(jobDetails.employmentType || "") || "full-time",
              posted_date: jobDetails.postedDate ? (() => {
                try {
                  const date = new Date(jobDetails.postedDate);
                  return isNaN(date.getTime()) ? null : date;
                } catch {
                  return null;
                }
              })() : null,
              url: jobDetails.url,
            });
            extractionSuccess = true; // Mark as done (even if failed) to exit loop
            break; // Exit retry loop even if failed
          }
        } catch (error) {
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`  ⚠️  Error during extraction, retrying...: ${error instanceof Error ? error.message : String(error)}`);
            continue; // Retry the loop
          }
          console.error(`Error scraping job ${jobLink.url} after ${maxRetries + 1} attempts:`, error);
          extractionSuccess = true; // Mark as done to exit loop
          break; // Exit retry loop
        }
      }
      } // Close for loop

      return jobsWithDescriptions;
    } finally {
      await page.close();
    }
  } finally {
    if (shouldCloseBrowser && browserInstance) {
      await browserInstance.close();
    }
  }
}

/**
 * SuccessFactors-specific browser scraper
 * Handles SAP SuccessFactors job boards with pagination
 * 
 * @param url - SuccessFactors job board URL
 * @param browser - Optional browser instance (for dependency injection)
 */
export async function scrapeSuccessFactors(
  url: string,
  browser?: Browser
): Promise<JobData[]> {
  let browserInstance: Browser | null = null;
  let shouldCloseBrowser = false;
  
  try {
    if (browser) {
      browserInstance = browser;
    } else {
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
    
    try {
      // Set realistic user agent
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      const jobs: JobData[] = [];
      let currentUrl = url;
      let hasNextPage = true;
      let pageNumber = 1;
      const maxPages = 50; // Safety limit

      while (hasNextPage && pageNumber <= maxPages) {
        console.log(`Scraping SuccessFactors page ${pageNumber}: ${currentUrl}`);
        
        // Navigate to the page
        await page.goto(currentUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        // Wait for job listings to load
        await page.waitForSelector(
          '.searchResultsShell, table, .jobTitle, [class*="jobTitle"]',
          { timeout: 15000 }
        ).catch(() => {
          // Try alternative selectors
          return page.waitForSelector(
            'a[href*="/job/"], a[href*="/jobs/"], .job-item, .job-row',
            { timeout: 10000 }
          );
        });

        // Extra wait for dynamic content
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract job links from current page
        const jobLinks = await page.evaluate(() => {
          const links: Array<{ url: string; title: string; id: string }> = [];
          const seenIds = new Set<string>();

          // Try multiple selectors for job links
          const linkSelectors = [
            'a.jobTitle-link',
            'a[class*="jobTitle"]',
            'a[href*="/job/"]',
            'a[href*="/jobs/"]',
            '.jobTitle a',
            '[class*="jobTitle"] a',
            'table a[href*="/job/"]',
          ];

          for (const selector of linkSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const href = (el as HTMLAnchorElement).href;
              if (!href || !href.includes('/job/')) continue;

              // Extract job ID from URL
              const idMatch = href.match(/\/job\/(\d+)/);
              const id = idMatch ? idMatch[1] : href.split('/').pop() || href;

              if (seenIds.has(id)) continue;
              seenIds.add(id);

              // Extract title
              const title = el.textContent?.trim() || 
                           el.querySelector('.jobTitle, [class*="title"]')?.textContent?.trim() ||
                           '';

              if (title && title.length > 3) {
                links.push({ url: href, title, id });
              }
            }
          }

          return links;
        });

        console.log(`Found ${jobLinks.length} job links on page ${pageNumber}`);

        // Visit each job link to get full description
        for (const jobLink of jobLinks) {
          try {
            await page.goto(jobLink.url, {
              waitUntil: "networkidle2",
              timeout: 20000,
            });

            // Wait for job description to load
            await page.waitForSelector(
              '[class*="description"], [class*="Description"], .jobDescription, #jobDescription',
              { timeout: 10000 }
            ).catch(() => {
              // Description might be in different format
            });

            // Extract full job details
            const jobDetails = await page.evaluate((linkTitle, linkId) => {
              // Extract description HTML
              const descSelectors = [
                '[class*="description"]',
                '[class*="Description"]',
                '.jobDescription',
                '#jobDescription',
                '[id*="description"]',
                '[id*="Description"]',
              ];

              let descriptionHtml = '';
              let descriptionText = '';

              for (const selector of descSelectors) {
                const descEl = document.querySelector(selector);
                if (descEl) {
                  descriptionHtml = descEl.innerHTML || '';
                  descriptionText = descEl.textContent?.trim() || '';
                  if (descriptionHtml.length > 100) break;
                }
              }

              // If no description found, try to get body content
              if (!descriptionHtml || descriptionHtml.length < 100) {
                const bodyEl = document.querySelector('body');
                if (bodyEl) {
                  // Remove navigation and footer
                  const nav = bodyEl.querySelector('nav, header, footer');
                  if (nav) nav.remove();
                  descriptionHtml = bodyEl.innerHTML || '';
                  descriptionText = bodyEl.textContent?.trim() || '';
                }
              }

              // Extract location
              const locationSelectors = [
                '[class*="location"]',
                '[class*="Location"]',
                '[data-location]',
                '.jobLocation',
              ];
              let location = '';
              for (const selector of locationSelectors) {
                const locEl = document.querySelector(selector);
                if (locEl) {
                  location = locEl.textContent?.trim() || '';
                  if (location) break;
                }
              }

              // Extract department
              const deptSelectors = [
                '[class*="department"]',
                '[class*="Department"]',
                '[class*="category"]',
                '[class*="Category"]',
              ];
              let department = '';
              for (const selector of deptSelectors) {
                const deptEl = document.querySelector(selector);
                if (deptEl) {
                  department = deptEl.textContent?.trim() || '';
                  if (department) break;
                }
              }

              // Extract posted date
              const dateSelectors = [
                '[class*="date"]',
                '[class*="Date"]',
                '[class*="posted"]',
                '[class*="Posted"]',
              ];
              let postedDate = '';
              for (const selector of dateSelectors) {
                const dateEl = document.querySelector(selector);
                if (dateEl) {
                  postedDate = dateEl.textContent?.trim() || '';
                  if (postedDate) break;
                }
              }

              // Extract employment type
              const typeSelectors = [
                '[class*="type"]',
                '[class*="Type"]',
                '[class*="employment"]',
                '[class*="Employment"]',
              ];
              let employmentType = '';
              for (const selector of typeSelectors) {
                const typeEl = document.querySelector(selector);
                if (typeEl) {
                  employmentType = typeEl.textContent?.trim() || '';
                  if (employmentType) break;
                }
              }

              return {
                id: linkId,
                title: linkTitle,
                url: window.location.href,
                descriptionHtml,
                descriptionText,
                location,
                department,
                postedDate,
                employmentType,
              };
            }, jobLink.title, jobLink.id);

            // Convert to JobData format
            const jobData: JobData = {
              external_id: jobDetails.id,
              title: jobDetails.title,
              department: jobDetails.department || null,
              team: null,
              location: jobDetails.location || null,
              location_type: detectLocationType(jobDetails.location || "", jobDetails.descriptionText || ""),
              description_html: jobDetails.descriptionHtml || null,
              description_text: jobDetails.descriptionText || null,
              commitment: normalizeCommitment(jobDetails.employmentType || "") || "full-time",
              posted_date: jobDetails.postedDate ? new Date(jobDetails.postedDate) : null,
              url: jobDetails.url,
            };

            jobs.push(jobData);
          } catch (error) {
            console.error(`Error scraping job ${jobLink.url}:`, error);
            // Continue with other jobs even if one fails
          }
        }

        // Check for next page
        const nextPageInfo = await page.evaluate(() => {
          // Look for Next button using valid CSS selectors
          const nextSelectors = [
            'a[title="Next Page"]',
            'a[title="Next"]',
            '.pagination-next',
            '[class*="pagination"] a[aria-label*="Next"]',
            'a[href*="page="]',
          ];

          for (const selector of nextSelectors) {
            const nextEl = document.querySelector(selector);
            if (nextEl && !nextEl.classList.contains('disabled')) {
              const href = (nextEl as HTMLAnchorElement).href;
              return { hasNext: true, url: href };
            }
          }

          // Find "Next" button by text content (since :contains() is not valid CSS)
          const nextByText = Array.from(document.querySelectorAll('a')).find(el => {
            const text = el.innerText?.toLowerCase() || '';
            const title = el.title?.toLowerCase() || '';
            return (text.includes('next') || title.includes('next')) && 
                   !el.classList.contains('disabled');
          }) as HTMLAnchorElement | undefined;
          
          if (nextByText?.href) {
            return { hasNext: true, url: nextByText.href };
          }

          // Try to find next page link by checking pagination
          const pagination = document.querySelector('[class*="pagination"]');
          if (pagination) {
            const links = pagination.querySelectorAll('a');
            const currentPage = Array.from(links).findIndex(link => 
              link.classList.contains('active') || link.classList.contains('current')
            );
            if (currentPage >= 0 && currentPage < links.length - 1) {
              const nextLink = links[currentPage + 1];
              if (nextLink && !nextLink.classList.contains('disabled')) {
                return { hasNext: true, url: (nextLink as HTMLAnchorElement).href };
              }
            }
          }

          return { hasNext: false, url: null };
        });

        if (nextPageInfo.hasNext && nextPageInfo.url) {
          currentUrl = nextPageInfo.url;
          pageNumber++;
          // Small delay before next page
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          hasNextPage = false;
        }
      }

      console.log(`Successfully scraped ${jobs.length} jobs from SuccessFactors`);
      return jobs;
    } finally {
      await page.close();
    }
  } finally {
    if (shouldCloseBrowser && browserInstance) {
      await browserInstance.close();
    }
  }
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
