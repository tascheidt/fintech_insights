/**
 * Tests for the TD Bank Workday scraper.
 *
 * Pure-fixture coverage. The HTTP-driven driver (`fetchWorkdayTdJobs`)
 * isn't exercised here — its behavior is the same listing/detail
 * orchestration covered by the workday-utils tests against the fixtures.
 * Per Farhan's spec, **no `fetch` allowed inside tests** — we test the
 * pure mappers against the fixture data.
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

const LISTING_FIXTURE: WorkdayListingResponse = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/workday-td-listing.json"),
    "utf8"
  )
);
const DETAIL_FIXTURE: WorkdayJobDetailResponse = JSON.parse(
  readFileSync(
    resolve(__dirname, "__fixtures__/workday-td-detail.json"),
    "utf8"
  )
);

const TD_URLS = buildWorkdayUrls("td", "wd3", "TD_Bank_Careers");

describe("workday-td URL builders", () => {
  it("targets the TD tenant on wd3 with the TD_Bank_Careers site", () => {
    expect(TD_URLS.listingPostUrl).toBe(
      "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"
    );
  });

  it("builds a public apply URL containing the canonical TD_Bank_Careers segment", () => {
    expect(
      TD_URLS.jobPublicUrl("/job/Toronto-Ontario/Senior-Software-Engineer_R-0000123456")
    ).toBe(
      "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/Toronto-Ontario/Senior-Software-Engineer_R-0000123456"
    );
  });
});

describe("workday-td listing fixture", () => {
  it("contains the three reference jobs", () => {
    expect(LISTING_FIXTURE.jobPostings).toHaveLength(3);
    expect(LISTING_FIXTURE.total).toBe(3);
  });

  it("maps the Senior Software Engineer row to a complete JobData", () => {
    const row = LISTING_FIXTURE.jobPostings![0];
    const job = parseWorkdayListingRow(row, TD_URLS.jobPublicUrl);
    expect(job).not.toBeNull();
    expect(job!.title).toBe("Senior Software Engineer");
    expect(job!.external_id).toBe("Senior-Software-Engineer_R-0000123456");
    expect(job!.location).toBe("Toronto, Ontario, Canada");
    expect(job!.location_type).toBe("onsite");
    expect(job!.posted_date?.toISOString()).toBe("2026-05-12T00:00:00.000Z");
    expect(job!.url).toBe(
      "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/Toronto-Ontario/Senior-Software-Engineer_R-0000123456"
    );
    expect(job!.commitment).toBe("full-time");
  });

  it("infers internship commitment from 'Data Analytics Intern'", () => {
    const intern = LISTING_FIXTURE.jobPostings![1];
    const job = parseWorkdayListingRow(intern, TD_URLS.jobPublicUrl);
    expect(job!.commitment).toBe("internship");
  });

  it("drops the 'Posted Yesterday' relative date — only ISO/Date-parseable values survive", () => {
    const intern = LISTING_FIXTURE.jobPostings![1];
    const job = parseWorkdayListingRow(intern, TD_URLS.jobPublicUrl);
    expect(job!.posted_date).toBeNull();
  });

  it("parses an ISO timestamp with time component", () => {
    const director = LISTING_FIXTURE.jobPostings![2];
    const job = parseWorkdayListingRow(director, TD_URLS.jobPublicUrl);
    expect(job!.posted_date?.toISOString()).toBe("2026-05-08T00:00:00.000Z");
  });

  it("handles a row with no externalPath gracefully (null URL, no external_id)", () => {
    const partial = parseWorkdayListingRow(
      { title: "Floating Role", locationsText: "Vancouver, BC" },
      TD_URLS.jobPublicUrl
    );
    expect(partial).not.toBeNull();
    expect(partial!.url).toBeNull();
    expect(partial!.external_id).toBe("");
  });
});

describe("workday-td detail fixture", () => {
  it("extracts description_html from jobDescription", () => {
    const parsed = parseWorkdayJobDetail(DETAIL_FIXTURE);
    expect(parsed.description_html).toContain("<h2>About this opportunity</h2>");
    expect(parsed.description_html).toContain("Senior Software Engineer");
  });

  it("produces a readable description_text via htmlToText", () => {
    const parsed = parseWorkdayJobDetail(DETAIL_FIXTURE);
    // html-to-text uppercases h2 headings — match case-insensitively.
    expect(parsed.description_text.toLowerCase()).toContain("about this opportunity");
    expect(parsed.description_text).toContain("scalable backend systems");
    // htmlToText should strip the tags.
    expect(parsed.description_text).not.toContain("<h2>");
  });

  it("surfaces location and posted_date from the detail response", () => {
    const parsed = parseWorkdayJobDetail(DETAIL_FIXTURE);
    expect(parsed.location).toBe("Toronto, Ontario, Canada");
    expect(parsed.posted_date?.toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });
});
