/**
 * Tests for the pure-logic pieces of the Revolut scraper.
 *
 * The Puppeteer driver (Cloudflare clearance, `waitForSelector`) needs a real
 * browser and runs only on the `scrape-heavy.yml` runner. Everything here is
 * HTML-string-in → data-out: anchor parsing, the page-counter scrape, the
 * health verdict, external-id slicing, and the JobData mapper.
 *
 * The fixtures mirror the LIVE Revolut Canada markup captured June 2026 via
 * the runner diagnostic — most importantly the LOCALE-PREFIXED job hrefs
 * (`/en-US/careers/position/…`) that made the original `^=` selector match
 * nothing and silently return 0 jobs for weeks.
 */

import { describe, expect, it } from "vitest";
import {
  assessListing,
  extractExternalId,
  isCanadianLocation,
  mapRevolutJob,
  parseListingCounts,
  parseListingPage,
  type ListingCounts,
} from "./revolut";

/** One job card, shaped like the live markup (h2 title + location span). */
function card(slug: string, uuid: string, title: string, location: string): string {
  return (
    `<a href="/en-US/careers/position/${slug}-${uuid}/" class="Box-rui sc-x">` +
    `<span class="VStack"><h2 class="Text">${title}</h2>` +
    `<span class="Flex"><span class="loc">${location}</span></span></span></a>`
  );
}

const CANADA_HTML =
  `<!DOCTYPE html><html><head><title>Careers | Revolut United States</title></head><body>` +
  `<header><p>We have 678 open positions</p></header>` +
  `<main><p>Search from 3 open positions</p><section aria-label="Featured roles">` +
  card("head-of-finance", "fa547715-cfb9-42de-81ac-4b5bb8870de7", "Head of Finance", "Remote: Canada") +
  card(
    "money-laundering-reporting-officer-mlro",
    "02c7ef63-4c68-4c42-8645-5b3dce2801c8",
    "Money Laundering Reporting Officer (MLRO)",
    "Remote: Canada"
  ) +
  card("head-of-risk", "257ab149-12e7-4a84-bda0-1ab1a1d36760", "Head of Risk", "Remote: Canada") +
  `</section></main></body></html>`;

describe("extractExternalId", () => {
  it("reads the trailing UUID from a locale-prefixed href", () => {
    expect(
      extractExternalId(
        "/en-US/careers/position/head-of-risk-257ab149-12e7-4a84-bda0-1ab1a1d36760/"
      )
    ).toBe("257ab149-12e7-4a84-bda0-1ab1a1d36760");
  });

  it("still works on a non-locale href (back-compat)", () => {
    expect(
      extractExternalId("/careers/position/head-of-risk-257ab149-12e7-4a84-bda0-1ab1a1d36760/")
    ).toBe("257ab149-12e7-4a84-bda0-1ab1a1d36760");
  });

  it("tolerates a missing trailing slash and lowercases", () => {
    expect(
      extractExternalId("/en-US/careers/position/x-FA547715-CFB9-42DE-81AC-4B5BB8870DE7")
    ).toBe("fa547715-cfb9-42de-81ac-4b5bb8870de7");
  });

  it("returns empty string when no UUID is present", () => {
    expect(extractExternalId("/en-US/careers/team/engineering/")).toBe("");
    expect(extractExternalId("")).toBe("");
  });
});

describe("parseListingPage", () => {
  it("extracts all 3 Canada jobs from locale-prefixed anchors (the regression)", () => {
    const jobs = parseListingPage(CANADA_HTML);
    expect(jobs.length).toBe(3);
    expect(jobs.map((j) => j.title)).toEqual([
      "Head of Finance",
      "Money Laundering Reporting Officer (MLRO)",
      "Head of Risk",
    ]);
  });

  it("builds absolute, locale-prefixed job URLs and reads the location", () => {
    const jobs = parseListingPage(CANADA_HTML);
    const first = jobs[0];
    expect(first.externalId).toBe("fa547715-cfb9-42de-81ac-4b5bb8870de7");
    expect(first.url).toBe(
      "https://www.revolut.com/en-US/careers/position/head-of-finance-fa547715-cfb9-42de-81ac-4b5bb8870de7/"
    );
    expect(first.location).toBe("Remote: Canada");
  });

  it("dedupes anchors that repeat the same UUID", () => {
    const dup =
      `<body>` +
      card("head-of-risk", "257ab149-12e7-4a84-bda0-1ab1a1d36760", "Head of Risk", "Remote: Canada") +
      card("head-of-risk", "257ab149-12e7-4a84-bda0-1ab1a1d36760", "Head of Risk", "Remote: Canada") +
      `</body>`;
    expect(parseListingPage(dup).length).toBe(1);
  });

  it("returns [] when there are no position anchors", () => {
    expect(parseListingPage("<body><p>nothing here</p></body>")).toEqual([]);
  });
});

describe("parseListingCounts", () => {
  it("reads both the global and the filtered counters", () => {
    expect(parseListingCounts(CANADA_HTML)).toEqual({ filtered: 3, global: 678 });
  });

  it("strips thousands separators", () => {
    const html = `<body>We have 1,437 open positions Search from 1,234 open positions</body>`;
    expect(parseListingCounts(html)).toEqual({ filtered: 1234, global: 1437 });
  });

  it("returns nulls when the counters are absent (e.g. a challenge page)", () => {
    expect(parseListingCounts("<body>Just a moment...</body>")).toEqual({
      filtered: null,
      global: null,
    });
  });
});

describe("assessListing", () => {
  const counts = (filtered: number | null, global: number | null): ListingCounts => ({
    filtered,
    global,
  });

  it("is healthy when any jobs were parsed", () => {
    expect(assessListing(3, counts(3, 678))).toMatchObject({ ok: true, reason: "parsed" });
  });

  it("flags an unrendered page (0 jobs, no counters at all)", () => {
    expect(assessListing(0, counts(null, null))).toMatchObject({
      ok: false,
      reason: "unrendered",
    });
  });

  it("flags selector drift (0 jobs while the filter reports N>0)", () => {
    expect(assessListing(0, counts(3, 678))).toMatchObject({
      ok: false,
      reason: "selector-drift",
    });
  });

  it("treats a rendered-but-empty filter as legitimate (0 jobs, filtered 0)", () => {
    expect(assessListing(0, counts(0, 678))).toMatchObject({
      ok: true,
      reason: "genuinely-empty",
    });
  });

  it("treats global-present + filtered-absent as legitimately empty, not a failure", () => {
    expect(assessListing(0, counts(null, 678))).toMatchObject({
      ok: true,
      reason: "genuinely-empty",
    });
  });
});

describe("isCanadianLocation", () => {
  it("accepts country-level Canada tags (how Revolut labels its CA roles)", () => {
    expect(isCanadianLocation("Remote: Canada")).toBe(true);
    expect(isCanadianLocation("Canada")).toBe(true);
    expect(isCanadianLocation("Toronto, Canada")).toBe(true);
    // A multi-location role that includes Canada is still available in Canada.
    expect(isCanadianLocation("Office: Toronto · London Remote: Canada · UK")).toBe(true);
  });

  it("accepts unambiguous Canadian cities and provinces without the country word", () => {
    expect(isCanadianLocation("Toronto, Ontario")).toBe(true);
    expect(isCanadianLocation("Vancouver, British Columbia")).toBe(true);
    expect(isCanadianLocation("Montréal")).toBe(true);
    expect(isCanadianLocation("Calgary")).toBe(true);
  });

  it("rejects the exact non-Canadian locations from the June 8 2026 incident", () => {
    // These six are Revolut's global "Featured roles" that ingested under
    // Revolut Canada when ?city=Canada was silently ignored.
    expect(isCanadianLocation("London, England, United Kingdom")).toBe(false);
    expect(
      isCanadianLocation(
        "Office: Dubai · Lisbon · London · MadridRemote: Porto · Portugal · Spain · Spain · UAE · UK"
      )
    ).toBe(false);
    expect(isCanadianLocation("Netherlands")).toBe(false);
    expect(isCanadianLocation("UAE")).toBe(false);
    expect(isCanadianLocation("Krakow, Poland")).toBe(false);
    expect(isCanadianLocation("Office: TokyoRemote: Japan")).toBe(false);
  });

  it("does not mistake ambiguous non-Canadian tokens for Canada", () => {
    // London is Revolut's HQ (UK), not London, Ontario.
    expect(isCanadianLocation("London, United Kingdom")).toBe(false);
    expect(isCanadianLocation("Remote: Europe")).toBe(false);
  });

  it("rejects null / empty locations (not clearly Canadian)", () => {
    expect(isCanadianLocation(null)).toBe(false);
    expect(isCanadianLocation(undefined)).toBe(false);
    expect(isCanadianLocation("")).toBe(false);
  });
});

describe("mapRevolutJob", () => {
  it("maps a Canada remote role to JobData with location_type=remote", () => {
    const [first] = parseListingPage(CANADA_HTML);
    const job = mapRevolutJob(first);
    expect(job).toMatchObject({
      external_id: "fa547715-cfb9-42de-81ac-4b5bb8870de7",
      title: "Head of Finance",
      location: "Remote: Canada",
      location_type: "remote",
      commitment: "full-time",
      description_text: null,
    });
    expect(job.url).toContain("/en-US/careers/position/head-of-finance-");
  });
});
