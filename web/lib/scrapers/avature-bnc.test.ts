/**
 * Tests for the pure-logic pieces of the Avature-BNC scraper.
 *
 * The Puppeteer driver (pagination loop, description enrichment with
 * concurrency=4) requires a real browser. The tests here cover the parts
 * that don't need one: listing-row extraction, detail-page description
 * extraction, external-ID slicing, and the env-var cap resolver.
 *
 * Fixtures (`__fixtures__/avature-bnc-listing.html`,
 * `__fixtures__/avature-bnc-detail.html`) are checked-in snapshots of live
 * pages from `emplois.bnc.ca` captured at the time of the rewrite.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractExternalId,
  extractTotalHits,
  mapAvatureJob,
  parseDetailPage,
  parseListingPage,
  resolveJobCap,
  type AvatureRawJob,
} from "./avature-bnc";

const LISTING_HTML = readFileSync(
  resolve(__dirname, "__fixtures__/avature-bnc-listing.html"),
  "utf8"
);
const DETAIL_HTML = readFileSync(
  resolve(__dirname, "__fixtures__/avature-bnc-detail.html"),
  "utf8"
);

describe("extractExternalId", () => {
  it("returns the trailing numeric ID from a canonical JobDetail href", () => {
    expect(
      extractExternalId(
        "https://emplois.bnc.ca/en_CA/careers/JobDetail/P3V32-BANQUIER-PRIVE-RELATIONNEL/30170"
      )
    ).toBe("30170");
  });

  it("tolerates query strings and fragments", () => {
    expect(
      extractExternalId(
        "https://emplois.bnc.ca/en_CA/careers/JobDetail/foo/12345?ref=x#section"
      )
    ).toBe("12345");
  });

  it("returns empty string for non-JobDetail hrefs", () => {
    expect(extractExternalId("https://emplois.bnc.ca/en_CA/careers/Login")).toBe(
      ""
    );
    expect(extractExternalId("")).toBe("");
  });
});

describe("extractTotalHits", () => {
  it("prefers the aria-label form when present", () => {
    expect(
      extractTotalHits(`<div aria-label="391 result(s)" tabindex="0">1-20 of 391</div>`)
    ).toBe(391);
  });

  it("falls back to the 'of N' visible text form", () => {
    expect(extractTotalHits(`<span>showing 1-20 of 42 jobs</span>`)).toBe(42);
  });

  it("returns null when no count is rendered", () => {
    expect(extractTotalHits(`<div>nothing here</div>`)).toBeNull();
  });

  it("pulls the corpus size off the real fixture", () => {
    // Fixture captured at ~391 jobs. Test asserts a non-null integer
    // rather than a specific number to survive the corpus drifting in
    // future re-captures.
    const got = extractTotalHits(LISTING_HTML);
    expect(got).not.toBeNull();
    expect(got).toBeGreaterThan(100);
  });
});

describe("parseListingPage", () => {
  it("extracts 20 rows from a single listing page (Avature's hard cap)", () => {
    const { jobs } = parseListingPage(LISTING_HTML);
    expect(jobs.length).toBe(20);
  });

  it("reports total hits alongside the rows", () => {
    const { totalHits } = parseListingPage(LISTING_HTML);
    expect(totalHits).not.toBeNull();
    expect(totalHits).toBeGreaterThan(100);
  });

  it("pulls title, url, location, attendance for the first row", () => {
    const { jobs } = parseListingPage(LISTING_HTML);
    const first = jobs[0];
    expect(first.externalId).toBe("30170");
    expect(first.title).toBe("Relational Private Banker");
    expect(first.url).toBe(
      "https://emplois.bnc.ca/en_CA/careers/JobDetail/P3V32-BANQUIER-PRIVE-RELATIONNEL/30170"
    );
    expect(first.location).toBe("Montreal, Quebec");
    expect(first.attendance).toBe("Hybrid");
  });

  it("handles a multi-location row ('N possible locations')", () => {
    const { jobs } = parseListingPage(LISTING_HTML);
    const multi = jobs.find((j) => j.externalId === "28822");
    expect(multi).toBeDefined();
    expect(multi!.title).toBe("Residential Mortgage Specialist-Western Canada");
    expect(multi!.location).toBe("11 possible locations");
    expect(multi!.attendance).toBe("Hybrid");
  });

  it("captures an On-Site row distinct from Hybrid", () => {
    const { jobs } = parseListingPage(LISTING_HTML);
    const onsite = jobs.find((j) => j.externalId === "29748");
    expect(onsite).toBeDefined();
    expect(onsite!.attendance).toBe("On-Site");
  });

  it("returns empty rows on HTML with no JobDetail anchors", () => {
    const { jobs } = parseListingPage(
      "<html><body><p>no jobs here</p></body></html>"
    );
    expect(jobs).toEqual([]);
  });

  it("filters out anchors whose href doesn't yield an external_id", () => {
    const html = `
      <table><tbody>
        <tr><th><a data-map="job-detail-link" href="/some/random/path" title="Bogus">Bogus</a></th><td>X</td><td>Y</td></tr>
      </tbody></table>`;
    const { jobs } = parseListingPage(html);
    expect(jobs).toEqual([]);
  });
});

describe("mapAvatureJob", () => {
  it("maps a Hybrid row into a JobData with hybrid location_type", () => {
    const raw: AvatureRawJob = {
      externalId: "30170",
      title: "Relational Private Banker",
      url: "https://emplois.bnc.ca/en_CA/careers/JobDetail/P3V32-BANQUIER-PRIVE-RELATIONNEL/30170",
      location: "Montreal, Quebec",
      attendance: "Hybrid",
    };
    const job = mapAvatureJob(raw);
    expect(job.external_id).toBe("30170");
    expect(job.title).toBe("Relational Private Banker");
    expect(job.location).toBe("Montreal, Quebec");
    expect(job.location_type).toBe("hybrid");
    expect(job.commitment).toBe("full-time");
    expect(job.description_html).toBeNull();
    expect(job.description_text).toBeNull();
    expect(job.posted_date).toBeNull();
    expect(job.department).toBeNull();
    expect(job.team).toBeNull();
  });

  it("maps an On-Site row into a JobData with onsite location_type", () => {
    const job = mapAvatureJob({
      externalId: "1",
      title: "X",
      url: "/x",
      location: "Toronto",
      attendance: "On-Site",
    });
    expect(job.location_type).toBe("onsite");
  });

  it("falls back to text heuristics when Attendance is empty", () => {
    // No attendance, no location → null.
    expect(
      mapAvatureJob({
        externalId: "1",
        title: "X",
        url: "/x",
        location: null,
        attendance: null,
      }).location_type
    ).toBeNull();

    // Location present, no attendance → onsite (the utils default).
    expect(
      mapAvatureJob({
        externalId: "1",
        title: "X",
        url: "/x",
        location: "Quebec City",
        attendance: null,
      }).location_type
    ).toBe("onsite");
  });

  it("defaults commitment to full-time (Avature doesn't expose it on listings)", () => {
    expect(
      mapAvatureJob({
        externalId: "1",
        title: "X",
        url: "/x",
        location: null,
        attendance: null,
      }).commitment
    ).toBe("full-time");
  });
});

describe("parseDetailPage", () => {
  it("extracts a substantive description HTML block from a real detail page", () => {
    const { descriptionHtml } = parseDetailPage(DETAIL_HTML);
    expect(descriptionHtml).not.toBeNull();
    // Real fixture is ~10kB after concatenation — anything in the
    // low-hundreds means we picked up the metadata-only block, not the
    // body.
    expect(descriptionHtml!.length).toBeGreaterThan(2000);
  });

  it("includes the job-body prose (the 'Private Relationship Banker' summary)", () => {
    const { descriptionHtml } = parseDetailPage(DETAIL_HTML);
    expect(descriptionHtml!).toMatch(/Private Relationship Banker/);
    expect(descriptionHtml!).toMatch(/Wealth management/i);
  });

  it("excludes the metadata-only first article (no 'Job number 30170' label leakage)", () => {
    const { descriptionHtml } = parseDetailPage(DETAIL_HTML);
    // The label "Job number" should not appear in the description body —
    // it belongs to the metadata-only block we explicitly drop.
    expect(descriptionHtml!).not.toMatch(/>Job number</);
    expect(descriptionHtml!).not.toMatch(/>Posting date</);
  });

  it("returns null when no article--details blocks exist and no fallback fields are present", () => {
    const { descriptionHtml } = parseDetailPage(
      "<html><body><main><p>nothing here</p></main></body></html>"
    );
    expect(descriptionHtml).toBeNull();
  });

  it("falls back to article__content__view__field__value when articles are missing", () => {
    const html = `
      <html><body><div class="main-panel">
        <div class="article__content__view__field__value"><p>body text one</p></div>
        <div class="article__content__view__field__value"><p>body text two</p></div>
      </div></body></html>`;
    const { descriptionHtml } = parseDetailPage(html);
    expect(descriptionHtml).not.toBeNull();
    expect(descriptionHtml!).toMatch(/body text one/);
    expect(descriptionHtml!).toMatch(/body text two/);
  });
});

describe("resolveJobCap", () => {
  it("returns null when unset — production default is the FULL corpus", () => {
    expect(resolveJobCap(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(resolveJobCap("")).toBeNull();
  });

  it("returns null for a non-numeric value rather than throwing", () => {
    expect(resolveJobCap("all")).toBeNull();
    expect(resolveJobCap("50x")).toBeNull();
  });

  it("parses a positive integer cap (smoke tests / cost ceilings)", () => {
    expect(resolveJobCap("5")).toBe(5);
    expect(resolveJobCap("391")).toBe(391);
  });

  it("clamps a zero cap up to 1 — a cap of 0 would be a useless run", () => {
    expect(resolveJobCap("0")).toBe(1);
  });
});
