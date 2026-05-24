/**
 * Tests for the pure-logic pieces of the Scotiabank SuccessFactors scraper.
 *
 * The driver function (`fetchScotiabankJobs`) does live HTTP fetches and is
 * exercised by the smoke script. The tests here cover the parts that don't
 * need a network: total-count parsing, row parsing for both brand-path
 * shapes (Tangerine includes `/Tangerine/` in hrefs, Scotia parent omits
 * it), and detail-page description extraction.
 *
 * Fixtures (`__fixtures__/scotiabank-listing.html`,
 * `__fixtures__/scotiabank-detail.html`) are checked-in snapshots of live
 * pages from `jobs.scotiabank.com/Scotiabank/` captured when Scotia parent
 * was added as the 5th Big-6 incumbent.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractScotiabankDescriptionHtml,
  extractTotalJobsFromHtml,
  parseJobsFromHtml,
  resolveMaxPages,
} from "./scotiabank";

const LISTING_HTML = readFileSync(
  resolve(__dirname, "__fixtures__/scotiabank-listing.html"),
  "utf8"
);
const DETAIL_HTML = readFileSync(
  resolve(__dirname, "__fixtures__/scotiabank-detail.html"),
  "utf8"
);

describe("extractTotalJobsFromHtml", () => {
  it("parses the count off the real Scotia parent fixture", () => {
    // Scotia parent renders the count wrapped in <b> tags:
    // "Results <b>1 – 25</b> of <b>1902</b>". Stripping inline markup before
    // matching is the fix that distinguishes this scraper from the original
    // Tangerine-only version.
    const got = extractTotalJobsFromHtml(LISTING_HTML);
    expect(got).not.toBeNull();
    expect(got).toBeGreaterThan(100);
  });

  it("handles a plain (un-bolded) count header", () => {
    expect(
      extractTotalJobsFromHtml(
        `<div class="paginationLabel">Results 1 – 25 of 391</div>`
      )
    ).toBe(391);
  });

  it("handles the bolded shape that Scotia parent uses", () => {
    expect(
      extractTotalJobsFromHtml(
        `<span class="paginationLabel">Results <b>1 – 25</b> of <b>1902</b></span>`
      )
    ).toBe(1902);
  });

  it("returns null when no count is rendered", () => {
    expect(extractTotalJobsFromHtml(`<div>no pagination here</div>`)).toBeNull();
  });
});

describe("parseJobsFromHtml", () => {
  it("parses every data-row in the real Scotia fixture", () => {
    const jobs = parseJobsFromHtml(LISTING_HTML, "Scotiabank", new Set());
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.length).toBeLessThanOrEqual(25); // page size
  });

  it("yields well-formed JobData entries from the fixture", () => {
    const jobs = parseJobsFromHtml(LISTING_HTML, "Scotiabank", new Set());
    const job = jobs[0];
    expect(job.external_id).toMatch(/^\d+$/);
    expect(job.title.length).toBeGreaterThan(2);
    expect(job.url).toMatch(/^https:\/\/jobs\.scotiabank\.com\/job\//);
    expect(job.commitment).toBe("full-time");
  });

  it("matches hrefs that omit the brand-path prefix (Scotia parent shape)", () => {
    const synthetic = `<tr class="data-row">
      <td><span class="jobTitle"><a href="/job/Toronto-Senior-Dev-ON-M5H1H1/599281217/" class="jobTitle-link">Senior Developer</a></span></td>
      <td><span class="jobLocation">Toronto, ON, CA, M5H1H1</span></td>
      <td><span class="jobDate">May 23, 2026</span></td>
    </tr>`;
    const jobs = parseJobsFromHtml(synthetic, "Scotiabank", new Set());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].external_id).toBe("599281217");
    expect(jobs[0].title).toBe("Senior Developer");
  });

  it("matches hrefs that include the brand-path prefix (Tangerine shape)", () => {
    // Regression coverage: the optional-prefix regex must still match the
    // original Tangerine layout, otherwise we'd silently break Tangerine
    // when wiring Scotia.
    const synthetic = `<tr class="data-row">
      <td><span class="jobTitle hidden-phone"><a href="/Tangerine/job/Toronto-Mobile-Architect-ON-M2H0A1/598714517/" title="Mobile Architect">Mobile Architect</a></span></td>
      <td><span class="jobLocation">Toronto, ON, CA, M2H0A1</span></td>
      <td><span class="jobDate">Feb 7, 2026</span></td>
    </tr>`;
    const jobs = parseJobsFromHtml(synthetic, "Tangerine", new Set());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].external_id).toBe("598714517");
    expect(jobs[0].title).toBe("Mobile Architect");
    expect(jobs[0].url).toBe(
      "https://jobs.scotiabank.com/Tangerine/job/Toronto-Mobile-Architect-ON-M2H0A1/598714517/"
    );
  });

  it("strips trailing postal codes from locations", () => {
    const synthetic = `<tr class="data-row">
      <td><a href="/job/role/1/">Senior Analyst</a></td>
      <td><span class="jobLocation">Toronto, ON, CA, M5H1H1</span></td>
      <td><span class="jobDate">May 23, 2026</span></td>
    </tr>`;
    const jobs = parseJobsFromHtml(synthetic, "Scotiabank", new Set());
    expect(jobs[0].location).toBe("Toronto, ON, CA");
  });

  it("de-duplicates by external_id when seen across pages", () => {
    const synthetic = `<tr class="data-row">
      <td><a href="/job/role/12345/">Senior Analyst</a></td>
    </tr>`;
    const seen = new Set<string>(["12345"]);
    const jobs = parseJobsFromHtml(synthetic, "Scotiabank", seen);
    expect(jobs).toHaveLength(0);
  });

  it("decodes HTML entities in titles", () => {
    const synthetic = `<tr class="data-row">
      <td><a href="/job/role/1/">Risk &amp; Compliance Officer</a></td>
    </tr>`;
    const jobs = parseJobsFromHtml(synthetic, "Scotiabank", new Set());
    expect(jobs[0].title).toBe("Risk & Compliance Officer");
  });
});

describe("resolveMaxPages", () => {
  it("defaults to 200 when env var is unset", () => {
    expect(resolveMaxPages(undefined)).toBe(200);
    expect(resolveMaxPages("")).toBe(200);
  });

  it("parses positive integers from env", () => {
    expect(resolveMaxPages("2")).toBe(2);
    expect(resolveMaxPages("100")).toBe(100);
  });

  it("falls back to default for non-numeric, zero, or negative values", () => {
    expect(resolveMaxPages("abc")).toBe(200);
    expect(resolveMaxPages("0")).toBe(200);
    expect(resolveMaxPages("-5")).toBe(200);
  });
});

describe("extractScotiabankDescriptionHtml", () => {
  it("extracts the description block from the real Scotia detail fixture", () => {
    const desc = extractScotiabankDescriptionHtml(DETAIL_HTML);
    expect(desc).not.toBeNull();
    expect(desc!.length).toBeGreaterThan(100);
  });

  it("matches the itemprop='description' span", () => {
    const html = `<div><span itemprop="description"><p>hello <b>world</b></p></span></div>`;
    expect(extractScotiabankDescriptionHtml(html)).toBe(`<p>hello <b>world</b></p>`);
  });

  it("falls back to the jobdescription class selector", () => {
    const html = `<div><span class="jobdescription"><p>body</p></span></div>`;
    expect(extractScotiabankDescriptionHtml(html)).toBe(`<p>body</p>`);
  });

  it("returns null when neither selector is present", () => {
    expect(extractScotiabankDescriptionHtml(`<div>nothing here</div>`)).toBeNull();
  });

  it("strips inline <img> tags from the extracted block", () => {
    const html = `<div><span itemprop="description"><p>text</p><img src="x.png"><p>more</p></span></div>`;
    const got = extractScotiabankDescriptionHtml(html);
    expect(got).not.toContain("<img");
    expect(got).toContain("text");
    expect(got).toContain("more");
  });
});
