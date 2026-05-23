/**
 * Tests for the CIBC Workday scraper.
 *
 * Pure-fixture coverage plus the Simplii classifier. Per Farhan's spec,
 * **no `fetch` allowed inside tests**.
 *
 * The Simplii classifier is the load-bearing piece — it's log-only for
 * Phase 3 but the data shape must be confirmed before Phase 3.5 ships
 * the actual override mechanism.
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
import { isSimpliiPosting } from "./workday-cibc";

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

describe("isSimpliiPosting (log-only classifier)", () => {
  it("matches when the title contains 'Simplii'", () => {
    const row = LISTING_FIXTURE.jobPostings!.find((r) =>
      r.title?.includes("Simplii")
    );
    expect(row).toBeDefined();
    const result = isSimpliiPosting(row!);
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("title");
  });

  it("matches when bulletFields contains the Simplii brand string", () => {
    const result = isSimpliiPosting({
      title: "Some role",
      bulletFields: ["2521456", "Simplii Financial", "Full time"],
    });
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("bulletFields");
  });

  it("matches when an arbitrary brand/business-unit field contains Simplii", () => {
    const row = LISTING_FIXTURE.jobPostings![2];
    // Title="Senior Data Engineer", bulletFields all say CIBC,
    // businessUnit="Simplii Financial Direct Bank" — classifier must
    // still flag it.
    const result = isSimpliiPosting(row);
    expect(result.isMatch).toBe(true);
    expect(result.marker).toBe("businessUnit");
  });

  it("does NOT match a CIBC-only row with no Simplii signal", () => {
    const result = isSimpliiPosting({
      title: "Manager, Capital Markets Technology",
      bulletFields: ["2521234", "CIBC", "Regular"],
    });
    expect(result.isMatch).toBe(false);
  });

  it("does NOT match a title with the look-alike word 'Simply'", () => {
    // "Simply Excellent Service Representative" must not trigger.
    const lookalike = LISTING_FIXTURE.jobPostings!.find((r) =>
      r.title?.includes("Simply")
    );
    expect(lookalike).toBeDefined();
    expect(isSimpliiPosting(lookalike!).isMatch).toBe(false);
  });

  it("does NOT match the substring 'simplistic'", () => {
    const result = isSimpliiPosting({
      title: "Build simplistic dashboards",
      bulletFields: ["just CIBC"],
    });
    expect(result.isMatch).toBe(false);
  });

  it("is case-insensitive ('SIMPLII', 'simplii', 'Simplii' all match)", () => {
    expect(
      isSimpliiPosting({ title: "Banking Advisor — SIMPLII Financial" }).isMatch
    ).toBe(true);
    expect(isSimpliiPosting({ title: "simplii role" }).isMatch).toBe(true);
  });

  it("returns isMatch:false (no marker) when nothing matches", () => {
    const result = isSimpliiPosting({ title: "X", bulletFields: ["Y", "Z"] });
    expect(result.isMatch).toBe(false);
    expect(result.marker).toBeUndefined();
  });

  it("handles a row with neither title nor bulletFields", () => {
    expect(isSimpliiPosting({}).isMatch).toBe(false);
  });
});
