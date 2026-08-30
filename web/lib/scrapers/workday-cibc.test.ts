/**
 * Tests for the CIBC Workday scraper.
 *
 * Pure-fixture coverage plus the Simplii classifier. Per Farhan's spec,
 * **no `fetch` allowed inside tests**.
 *
 * The Simplii classifier (isSimpliiPosting) uses the new post-enrichment
 * rule: a job is Simplii iff its title matches /\bsimplii\b/i OR its
 * description contains >=2 occurrences of /\bsimplii\b/i.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkdayUrls,
  parseWorkdayListingRow,
  parseWorkdayJobDetail,
  type WorkdayListingResponse,
  type WorkdayJobDetailResponse,
} from "./workday-utils";
import { buildCibcListingRequest, isSimpliiPosting } from "./workday-cibc";

const LISTING_FIXTURE: WorkdayListingResponse = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/workday-cibc-listing.json"),
    "utf8"
  )
);
const DETAIL_FIXTURE: WorkdayJobDetailResponse = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/workday-cibc-detail.json"),
    "utf8"
  )
);

const CIBC_URLS = buildWorkdayUrls("cibc", "wd3", "search");

describe("workday-cibc URL builders", () => {
  it("targets the cibc tenant on wd3 with the search site", () => {
    expect(CIBC_URLS.listingPostUrl).toBe(
      "https://cibc.wd3.myworkdayjobs.com/wday/cxs/cibc/search/jobs"
    );
  });

  it("builds a public apply URL under /search/...", () => {
    expect(
      CIBC_URLS.jobPublicUrl("/job/Toronto-ON/Manager_2521234")
    ).toBe(
      "https://cibc.wd3.myworkdayjobs.com/search/job/Toronto-ON/Manager_2521234"
    );
  });
});

describe("workday-cibc listing scope", () => {
  it("uses the full Workday corpus by default", () => {
    expect(buildCibcListingRequest(40)).toEqual({
      limit: 20,
      offset: 40,
      searchText: "",
      appliedFacets: {},
    });
  });

  it("narrows Workday to Simplii candidates in sub-brand-only mode", () => {
    expect(buildCibcListingRequest(0, { simpliiOnly: true })).toEqual({
      limit: 20,
      offset: 0,
      searchText: "Simplii",
      appliedFacets: {},
    });
  });
});

describe("workday-cibc listing fixture", () => {
  it("contains four reference jobs (CIBC, Simplii-title, Simplii-bu, look-alike)", () => {
    expect(LISTING_FIXTURE.jobPostings).toHaveLength(4);
  });

  it("maps the Manager row to a complete JobData", () => {
    const row = LISTING_FIXTURE.jobPostings![0];
    const job = parseWorkdayListingRow(row, CIBC_URLS.jobPublicUrl);
    expect(job).not.toBeNull();
    expect(job!.title).toBe("Manager, Capital Markets Technology");
    expect(job!.external_id).toBe("Manager--Capital-Markets-Technology_2521234");
    expect(job!.location).toBe("Toronto, ON");
    expect(job!.url).toBe(
      "https://cibc.wd3.myworkdayjobs.com/search/job/Toronto-ON/Manager--Capital-Markets-Technology_2521234"
    );
  });
});

describe("workday-cibc detail fixture", () => {
  it("decodes the description HTML and produces text", () => {
    const parsed = parseWorkdayJobDetail(DETAIL_FIXTURE);
    expect(parsed.description_html).toContain("capital markets technology");
    expect(parsed.description_text).toContain("capital markets technology");
  });

  it("surfaces location from the detail response", () => {
    const parsed = parseWorkdayJobDetail(DETAIL_FIXTURE);
    expect(parsed.location).toBe("Toronto, ON, Canada");
  });
});

describe("isSimpliiPosting (title-or-2+-description-mentions rule)", () => {
  it("matches when the title contains 'Simplii'", () => {
    const result = isSimpliiPosting({ title: "Banking Advisor, Simplii Financial" });
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("title");
  });

  it("matches the title 'Sr. Mobile Engineer, Simplii Technology'", () => {
    const result = isSimpliiPosting({ title: "Sr. Mobile Engineer, Simplii Technology" });
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("title");
  });

  it("matches when the description has 2+ 'Simplii' mentions and title is plain", () => {
    const description =
      "Join our team at Simplii Financial where you will help build " +
      "the next generation of Simplii products for Canadian consumers.";
    const result = isSimpliiPosting({ title: "Senior Software Engineer", description });
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("description");
  });

  it("does NOT match when description has exactly ONE 'Simplii' mention (CIBC infra role)", () => {
    // Real-world case: CIBC Consultant role that supports "Simplii & CBFAT" systems once.
    const description =
      "As a consultant you will support CIBC's application operations " +
      "Simplii & CBFAT team, ensuring platform reliability across CIBC systems.";
    const result = isSimpliiPosting({
      title: "Manager, Capital Markets Technology",
      description,
    });
    expect(result.isMatch).toBe(false);
    expect(result.marker).toBeUndefined();
  });

  it("does NOT match a CIBC-only title with no description", () => {
    const result = isSimpliiPosting({ title: "Manager, Capital Markets Technology" });
    expect(result.isMatch).toBe(false);
  });

  it("does NOT match the look-alike title 'Simply Excellent Service Representative'", () => {
    const lookalike = LISTING_FIXTURE.jobPostings!.find((r) =>
      r.title?.includes("Simply")
    );
    expect(lookalike).toBeDefined();
    expect(isSimpliiPosting({ title: lookalike!.title }).isMatch).toBe(false);
  });

  it("does NOT match the substring 'simplistic'", () => {
    const result = isSimpliiPosting({
      title: "Build simplistic dashboards",
      description: "We seek a simplistic approach and want a simplistic methodology.",
    });
    expect(result.isMatch).toBe(false);
  });

  it("is case-insensitive: title 'Banking Advisor — SIMPLII Financial' matches", () => {
    expect(
      isSimpliiPosting({ title: "Banking Advisor — SIMPLII Financial" }).isMatch
    ).toBe(true);
  });

  it("is case-insensitive: description with 'SIMPLII' and 'simplii' (2 mixed-case) matches", () => {
    const description =
      "Work within the SIMPLII brand and contribute to simplii product initiatives.";
    const result = isSimpliiPosting({ title: "Product Manager", description });
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("description");
  });

  it("returns isMatch:false with no marker for empty input {}", () => {
    const result = isSimpliiPosting({});
    expect(result.isMatch).toBe(false);
    expect(result.marker).toBeUndefined();
  });
});
