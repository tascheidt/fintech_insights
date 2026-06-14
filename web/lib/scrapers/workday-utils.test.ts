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
  parseWorkdayApplyUrl,
  parseWorkdayListingRow,
  parseWorkdayJobDetail,
  parseWorkdayJson,
  isAkamaiHtmlBlock,
  WorkdayBlockedError,
  resolveWorkdayJobCap,
  type WorkdayListingRow,
} from "./workday-utils";

describe("parseWorkdayApplyUrl", () => {
  it("maps a Phenom applyUrl (with trailing /apply) to CXS endpoints + tenant coords", () => {
    const t = parseWorkdayApplyUrl(
      "https://bmo.wd3.myworkdayjobs.com/External/job/Toronto-Ontario-Canada/Senior-Machine-Learning-Engineer_R-2400512/apply"
    );
    expect(t).toEqual({
      detailUrl:
        "https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/job/Toronto-Ontario-Canada/Senior-Machine-Learning-Engineer_R-2400512",
      listingUrl: "https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/jobs",
      tenant: "bmo",
      instance: "wd3",
      site: "External",
    });
  });

  it("handles an applyUrl with no trailing /apply", () => {
    const t = parseWorkdayApplyUrl(
      "https://rbc.wd3.myworkdayjobs.com/RBC_External/job/Toronto/Principal-Product-Manager_R-0000174965"
    );
    expect(t?.detailUrl).toBe(
      "https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBC_External/job/Toronto/Principal-Product-Manager_R-0000174965"
    );
    expect(t?.listingUrl).toBe(
      "https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBC_External/jobs"
    );
    expect(t).toMatchObject({ tenant: "rbc", instance: "wd3", site: "RBC_External" });
  });

  it("reads tenant + instance from the host (not hardcoded)", () => {
    const t = parseWorkdayApplyUrl(
      "https://acme.wd5.myworkdayjobs.com/Careers/job/NYC/Analyst_R-9/apply"
    );
    expect(t).toMatchObject({ tenant: "acme", instance: "wd5", site: "Careers" });
  });

  it("returns null for empty, non-Workday, or unparseable input", () => {
    expect(parseWorkdayApplyUrl(undefined)).toBeNull();
    expect(parseWorkdayApplyUrl(null)).toBeNull();
    expect(parseWorkdayApplyUrl("")).toBeNull();
    expect(parseWorkdayApplyUrl("https://jobs.rbc.com/ca/en/job/R-1/Title")).toBeNull();
    expect(parseWorkdayApplyUrl("not a url")).toBeNull();
    // Workday host but a non-/job path → null rather than a bad URL.
    expect(
      parseWorkdayApplyUrl("https://bmo.wd3.myworkdayjobs.com/External")
    ).toBeNull();
  });
});

describe("buildWorkdayUrls", () => {
  it("interpolates tenant, instance, and site into the listing POST URL", () => {
    const urls = buildWorkdayUrls("td", "wd3", "TD_Bank_Careers");
    expect(urls.listingPostUrl).toBe(
      "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"
    );
  });

  it("produces a detail URL by appending externalPath verbatim (Workday's externalPath already starts with `/job/...`)", () => {
    const urls = buildWorkdayUrls("cibc", "wd3", "search");
    expect(urls.jobGetUrl("/job/Toronto/Senior-Engineer_R-1")).toBe(
      "https://cibc.wd3.myworkdayjobs.com/wday/cxs/cibc/search/job/Toronto/Senior-Engineer_R-1"
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

describe("isAkamaiHtmlBlock (200-with-HTML detection)", () => {
  it("flags a DOCTYPE block page", () => {
    expect(isAkamaiHtmlBlock('<!DOCTYPE html><html><body>blocked</body></html>')).toBe(true);
  });

  it("flags a bare <html> body and tolerates leading whitespace/newlines", () => {
    expect(isAkamaiHtmlBlock("<html>")).toBe(true);
    expect(isAkamaiHtmlBlock("\n\n  <!doctype html>")).toBe(true);
  });

  it("does NOT flag genuine JSON (object or array), even with leading whitespace", () => {
    expect(isAkamaiHtmlBlock('{"total":511,"jobPostings":[]}')).toBe(false);
    expect(isAkamaiHtmlBlock("  [1,2,3]")).toBe(false);
    expect(isAkamaiHtmlBlock('\n{"jobPostingInfo":{}}')).toBe(false);
  });

  it("does NOT flag an empty body (that is a different failure, not a block)", () => {
    expect(isAkamaiHtmlBlock("")).toBe(false);
  });
});

describe("parseWorkdayJson", () => {
  it("parses a valid JSON response into the typed shape", async () => {
    const res = new Response('{"total":2,"jobPostings":[{"title":"X"}]}');
    const data = await parseWorkdayJson<{ total: number; jobPostings: unknown[] }>(
      res,
      "td"
    );
    expect(data.total).toBe(2);
    expect(data.jobPostings).toHaveLength(1);
  });

  it("throws a typed WorkdayBlockedError on a 200-with-HTML Akamai block", async () => {
    const res = new Response("<!DOCTYPE html><html><head><title>Blocked</title>");
    await expect(parseWorkdayJson(res, "cibc")).rejects.toBeInstanceOf(
      WorkdayBlockedError
    );
  });

  it("carries the tenant and a body snippet on the block error (legible task-row message)", async () => {
    const res = new Response("<!DOCTYPE html><html>go away</html>");
    const err = await parseWorkdayJson(res, "cibc").catch((e) => e);
    expect(err).toBeInstanceOf(WorkdayBlockedError);
    expect((err as WorkdayBlockedError).tenant).toBe("cibc");
    expect((err as WorkdayBlockedError).message).toContain("Akamai");
    expect((err as WorkdayBlockedError).message).toContain("cibc");
    expect((err as WorkdayBlockedError).bodySnippet).toContain("<!DOCTYPE");
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
