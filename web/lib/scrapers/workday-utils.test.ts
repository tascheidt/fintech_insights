/**
 * Tests for the shared Workday helpers.
 *
 * Pure-function coverage only — no `fetch` allowed. The HTTP-driven
 * pieces live in workday-td.ts / workday-cibc.ts and aren't exercised
 * here.
 */

import { describe, expect, it } from "vitest";
import {
  buildWorkdayUrls,
  parseWorkdayListingRow,
  parseWorkdayJobDetail,
  resolveWorkdayJobCap,
  type WorkdayListingRow,
} from "./workday-utils";

describe("buildWorkdayUrls", () => {
  it("interpolates tenant, instance, and site into the listing POST URL", () => {
    const urls = buildWorkdayUrls("td", "wd3", "TD_Bank_Careers");
    expect(urls.listingPostUrl).toBe(
      "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"
    );
  });

  it("produces a detail URL by appending externalPath after the `/job` segment", () => {
    const urls = buildWorkdayUrls("cibc", "wd3", "search");
    expect(urls.jobGetUrl("/job/Toronto/Senior-Engineer_R-1")).toBe(
      "https://cibc.wd3.myworkdayjobs.com/wday/cxs/cibc/search/job/job/Toronto/Senior-Engineer_R-1"
    );
  });

  it("produces a public-facing apply URL via jobPublicUrl", () => {
    const urls = buildWorkdayUrls("td", "wd3", "TD_Bank_Careers");
    expect(urls.jobPublicUrl("/job/Toronto/X_R-1")).toBe(
      "https://td.wd3.myworkdayjobs.com/TD_Bank_Careers/job/Toronto/X_R-1"
    );
  });

  it("varies by instance (wd1 vs wd3 vs wd5)", () => {
    expect(buildWorkdayUrls("acme", "wd5", "careers").listingPostUrl).toBe(
      "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/jobs"
    );
  });
});

describe("parseWorkdayListingRow", () => {
  const stubUrl = (p: string) => `https://example.com/site${p}`;

  it("maps a complete row to JobData with title, location, posted_date and URL", () => {
    const raw: WorkdayListingRow = {
      title: "Senior Engineer",
      externalPath: "/job/Toronto/Senior-Engineer_R-123",
      locationsText: "Toronto, Ontario, Canada",
      postedOn: "2026-05-12",
      bulletFields: ["R-123", "Regular"],
    };
    const job = parseWorkdayListingRow(raw, stubUrl);
    expect(job).not.toBeNull();
    expect(job!.title).toBe("Senior Engineer");
    expect(job!.external_id).toBe("Senior-Engineer_R-123");
    expect(job!.location).toBe("Toronto, Ontario, Canada");
    expect(job!.url).toBe(
      "https://example.com/site/job/Toronto/Senior-Engineer_R-123"
    );
    expect(job!.posted_date?.toISOString()).toBe("2026-05-12T00:00:00.000Z");
    expect(job!.description_html).toBeNull();
    expect(job!.description_text).toBeNull();
  });

  it("synthesizes a URL only when externalPath is present", () => {
    const job = parseWorkdayListingRow(
      { title: "X", externalPath: "/job/X_R-1" },
      stubUrl
    );
    expect(job!.url).toBe("https://example.com/site/job/X_R-1");

    const jobNoPath = parseWorkdayListingRow({ title: "Y" }, stubUrl);
    expect(jobNoPath!.url).toBeNull();
  });

  it("derives external_id from the last path segment of externalPath", () => {
    const job = parseWorkdayListingRow(
      { title: "X", externalPath: "/job/Toronto/Some-Title_R-9999" },
      stubUrl
    );
    expect(job!.external_id).toBe("Some-Title_R-9999");
  });

  it("returns null when both title and externalPath are missing", () => {
    expect(parseWorkdayListingRow({}, stubUrl)).toBeNull();
    expect(parseWorkdayListingRow({ locationsText: "X" }, stubUrl)).toBeNull();
  });

  it("drops a non-parseable posted_date (e.g. 'Posted Yesterday')", () => {
    const job = parseWorkdayListingRow(
      {
        title: "X",
        externalPath: "/job/X_R-1",
        postedOn: "Posted Yesterday",
      },
      stubUrl
    );
    expect(job!.posted_date).toBeNull();
  });

  it("infers commitment from title keywords", () => {
    expect(
      parseWorkdayListingRow(
        { title: "Software Intern", externalPath: "/job/X_R-1" },
        stubUrl
      )!.commitment
    ).toBe("internship");
    expect(
      parseWorkdayListingRow(
        { title: "Contract Recruiter", externalPath: "/job/X_R-1" },
        stubUrl
      )!.commitment
    ).toBe("contract");
    expect(
      parseWorkdayListingRow(
        { title: "Part-Time Teller", externalPath: "/job/X_R-1" },
        stubUrl
      )!.commitment
    ).toBe("part-time");
  });

  it("defaults commitment to full-time when no signal is present", () => {
    const job = parseWorkdayListingRow(
      { title: "Senior Engineer", externalPath: "/job/X_R-1" },
      stubUrl
    );
    expect(job!.commitment).toBe("full-time");
  });

  it("sets location_type from the location string", () => {
    const remote = parseWorkdayListingRow(
      { title: "X", externalPath: "/job/X_R-1", locationsText: "Remote, Canada" },
      stubUrl
    );
    expect(remote!.location_type).toBe("remote");

    const onsite = parseWorkdayListingRow(
      { title: "X", externalPath: "/job/X_R-1", locationsText: "Toronto, ON" },
      stubUrl
    );
    expect(onsite!.location_type).toBe("onsite");
  });
});

describe("parseWorkdayJobDetail", () => {
  it("populates description_html from jobDescription and description_text via htmlToText", () => {
    const out = parseWorkdayJobDetail({
      jobPostingInfo: {
        jobDescription: "<div><p>Hello <strong>world</strong></p></div>",
      },
    });
    expect(out.description_html).toBe("<div><p>Hello <strong>world</strong></p></div>");
    expect(out.description_text).toMatch(/Hello world/);
  });

  it("returns empty strings when jobDescription is missing", () => {
    const out = parseWorkdayJobDetail({ jobPostingInfo: {} });
    expect(out.description_html).toBe("");
    expect(out.description_text).toBe("");
  });

  it("returns empty strings when jobPostingInfo is missing", () => {
    const out = parseWorkdayJobDetail({});
    expect(out.description_html).toBe("");
    expect(out.description_text).toBe("");
  });

  it("surfaces location when present", () => {
    const out = parseWorkdayJobDetail({
      jobPostingInfo: {
        jobDescription: "<p>x</p>",
        location: "Toronto, Ontario, Canada",
      },
    });
    expect(out.location).toBe("Toronto, Ontario, Canada");
  });

  it("parses postedOn into a Date when valid", () => {
    const out = parseWorkdayJobDetail({
      jobPostingInfo: { jobDescription: "<p>x</p>", postedOn: "2026-05-12" },
    });
    expect(out.posted_date?.toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });
});

describe("resolveWorkdayJobCap", () => {
  it("returns null when unset", () => {
    expect(resolveWorkdayJobCap(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(resolveWorkdayJobCap("")).toBeNull();
  });

  it("returns null for non-numeric values", () => {
    expect(resolveWorkdayJobCap("all")).toBeNull();
    expect(resolveWorkdayJobCap("100x")).toBeNull();
  });

  it("parses a positive integer", () => {
    expect(resolveWorkdayJobCap("25")).toBe(25);
    expect(resolveWorkdayJobCap("1000")).toBe(1000);
  });

  it("clamps zero up to 1", () => {
    expect(resolveWorkdayJobCap("0")).toBe(1);
  });
});
