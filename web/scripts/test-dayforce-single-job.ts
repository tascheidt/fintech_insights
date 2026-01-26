#!/usr/bin/env npx tsx
/**
 * Test Dayforce Single Job Scraping
 * 
 * Tests scraping a single Questrade job to verify description extraction works.
 * This helps debug the scraper before running a full scrape.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/test-dayforce-single-job.ts [job-url]
 */

import { scrapeDayforceWithBrowser } from "../lib/scrapers/browser";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

async function main() {
  const jobUrl = process.argv[2] || "https://jobs.dayforcehcm.com/en-US/qfg/CANDIDATEPORTAL/jobs/14566";
  
  console.log("🧪 Testing Dayforce Single Job Scraping\n");
  console.log("═".repeat(70));
  console.log(`📋 Testing URL: ${jobUrl}\n`);

  try {
    // Launch browser
    console.log("🚀 Launching browser...");
    const executablePath = await chromium.executablePath();
    
    const browser = await puppeteer.launch({
      args: chromium.args,
      // @ts-expect-error - defaultViewport exists at runtime but types may be outdated
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
    });

    console.log("✅ Browser launched\n");

    try {
      // Create a page and navigate directly to the job
      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      console.log("🔄 Navigating to job page...");
      await page.goto(jobUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for container
      console.log("⏳ Waiting for job container...");
      await page.waitForSelector(
        '[test-id="job-details-dayforce-jobs"]',
        { timeout: 15000 }
      ).catch(() => {
        console.log("⚠️  Container not found, trying main...");
        return page.waitForSelector('main', { timeout: 10000 });
      });

      // Wait for spinner to disappear
      console.log("⏳ Waiting for spinner to disappear...");
      await page.waitForFunction(
        () => {
          const globalSpinner = document.querySelector('.ant-spin-spinning');
          const container = document.querySelector('[test-id="job-details-dayforce-jobs"]') || document.querySelector('main');
          const containerSpinner = container?.querySelector('.ant-spin-spinning');
          return !globalSpinner && !containerSpinner;
        },
        { timeout: 20000 }
      ).catch(() => {
        console.log("⚠️  Spinner wait timeout, continuing...");
      });

      // Wait for content
      console.log("⏳ Waiting for content to load...");
      await page.waitForFunction(
        () => {
          const nextDataScript = document.querySelector('#__NEXT_DATA__');
          if (nextDataScript) {
            try {
              const nextData = JSON.parse(nextDataScript.textContent || '{}');
              const queries = nextData?.props?.pageProps?.dehydratedState?.queries;
              if (queries) {
                for (const query of queries) {
                  if (query?.state?.data?.jobData?.jobPostingContent?.jobDescription) {
                    const desc = query.state.data.jobData.jobPostingContent.jobDescription;
                    if (desc && desc.length > 200) {
                      return true;
                    }
                  }
                }
              }
            } catch (e) {
              // Continue to DOM check
            }
          }
          
          const container = document.querySelector('[test-id="job-details-dayforce-jobs"]') || document.querySelector('main');
          if (container) {
            const spinner = container.querySelector('.ant-spin-spinning');
            if (spinner) return false;
            const text = container.textContent || '';
            if (text.length > 500) {
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
        console.log("⚠️  Content wait timeout, proceeding anyway...");
      });

      // Additional wait
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log("✅ Page loaded, extracting data...\n");

      // Extract job details using the same logic as the scraper
      const jobDetails = await page.evaluate(() => {
        // Try JSON extraction first
        const nextDataScript = document.querySelector('#__NEXT_DATA__');
        if (nextDataScript) {
          try {
            const nextData = JSON.parse(nextDataScript.textContent || '{}');
            
            let jobData = null;
            
            if (nextData?.props?.pageProps?.jobData) {
              jobData = nextData.props.pageProps.jobData;
            } else if (nextData?.props?.pageProps?.dehydratedState?.queries) {
              const queries = nextData.props.pageProps.dehydratedState.queries;
              for (const query of queries) {
                if (query?.state?.data?.jobData) {
                  jobData = query.state.data.jobData;
                  break;
                }
                if (Array.isArray(query?.queryKey) && 
                    (query.queryKey[0] === 'jobs' || query.queryKey.includes('jobs')) &&
                    query?.state?.data?.jobData) {
                  jobData = query.state.data.jobData;
                  break;
                }
              }
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
              
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = descriptionHtml;
              const descriptionText = tempDiv.textContent?.trim() || 
                                     descriptionHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
              
              if (descriptionHtml.length > 200 && descriptionText.length > 200) {
                if (!descriptionHtml.includes('ant-spin-spinning') && 
                    !descriptionHtml.includes('ant-spin-dot')) {
                  
                  const locations = jobData.postingLocations || [];
                  const location = locations.length > 0 
                    ? locations.map((loc: any) => 
                        loc.formattedAddress || 
                        [loc.cityName, loc.stateCode, loc.isoCountryCode].filter(Boolean).join(', ')
                      ).join('; ')
                    : '';
                  
                  const jobFunction = jobData.jobPostingAttributes?.find((attr: any) => 
                    attr.name === 'JobFunction' || attr.name === 'JobFamily'
                  );
                  const department = jobFunction?.value || jobData.jobFamily || '';
                  
                  return {
                    source: 'JSON',
                    title: jobData.jobTitle || '',
                    descriptionHtml,
                    descriptionText,
                    htmlLength: descriptionHtml.length,
                    textLength: descriptionText.length,
                    location,
                    department,
                    hasSpinner: false,
                  };
                }
              }
            }
          } catch (e) {
            return { error: `JSON parsing failed: ${e}` };
          }
        }
        
        // Fallback: DOM extraction
        const container = document.querySelector('[test-id="job-details-dayforce-jobs"]') || document.querySelector('main');
        if (!container) {
          return { error: 'Container not found' };
        }
        
        const spinner = container.querySelector('.ant-spin-spinning');
        if (spinner) {
          return { error: 'Spinner still present in container' };
        }
        
        const descSelectors = [
          '[class*="description"]',
          '[class*="Description"]',
          '.jobDescription',
          '#jobDescription',
        ];
        
        let descriptionHtml = '';
        let descriptionText = '';
        
        for (const selector of descSelectors) {
          const descEl = container.querySelector(selector);
          if (descEl) {
            const spinnerEl = descEl.querySelector('.ant-spin-spinning, .ant-spin-dot');
            if (spinnerEl) spinnerEl.remove();
            
            descriptionHtml = descEl.innerHTML || '';
            descriptionText = descEl.textContent?.trim() || '';
            
            if (descriptionHtml.length > 200 && 
                descriptionText.length > 200 &&
                !descriptionHtml.includes('ant-spin-spinning') &&
                !descriptionHtml.includes('ant-spin-dot')) {
              break;
            }
          }
        }
        
        return {
          source: 'DOM',
          descriptionHtml,
          descriptionText,
          htmlLength: descriptionHtml.length,
          textLength: descriptionText.length,
          hasSpinner: descriptionHtml.includes('ant-spin-spinning') || descriptionHtml.includes('ant-spin-dot'),
        };
      });

      console.log("📊 Extraction Results:\n");
      console.log("═".repeat(70));
      console.log(JSON.stringify(jobDetails, null, 2));
      
      if ('error' in jobDetails && jobDetails.error) {
        console.log(`\n❌ Error: ${jobDetails.error}`);
      } else if ('hasSpinner' in jobDetails && jobDetails.hasSpinner) {
        console.log(`\n⚠️  WARNING: Extracted HTML contains loading spinner!`);
      } else if ('htmlLength' in jobDetails && 'textLength' in jobDetails && 
                 typeof jobDetails.htmlLength === 'number' && typeof jobDetails.textLength === 'number') {
        const htmlLength = jobDetails.htmlLength;
        const textLength = jobDetails.textLength;
        if (htmlLength > 200 && textLength > 200) {
          console.log(`\n✅ SUCCESS: Extracted valid description!`);
          console.log(`   Source: ${jobDetails.source}`);
          console.log(`   HTML Length: ${htmlLength}`);
          console.log(`   Text Length: ${textLength}`);
          if ('title' in jobDetails && jobDetails.title) {
            console.log(`   Title: ${jobDetails.title}`);
          }
          if ('location' in jobDetails && jobDetails.location) {
            console.log(`   Location: ${jobDetails.location}`);
          }
        } else {
          console.log(`\n⚠️  WARNING: Description too short or empty`);
          console.log(`   HTML Length: ${htmlLength}`);
          console.log(`   Text Length: ${textLength}`);
        }
      } else {
        console.log(`\n⚠️  WARNING: Unable to extract description details`);
      }

      await page.close();
    } finally {
      await browser.close();
      console.log("\n✅ Browser closed");
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Error:", errorMessage);
    
    if (errorMessage.includes("spawn") || errorMessage.includes("Unknown system error")) {
      console.error("\n⚠️  Browser scraping requires Chrome/Chromium.");
      console.error("   This script works best in GitHub Actions or production environments.");
    }
    
    process.exit(1);
  }
}

main().catch(console.error);
