/**
 * Tests for the pure compensation parsing behind the Ashby scraper.
 *
 * The canonical fixture is Wealthsimple's board (August 2026): every posting
 * renders a range like "CA$54K – CA$68K • Offers Equity", but the range lives
 * only in the API's structured `compensation` block — never in
 * `descriptionHtml` — so it was invisible to the description-based AI
 * extractor and every Ashby row ingested with a null salary.
 */

import { describe, expect, it } from "vitest";
import {
  parseAshbyCompensation,
  parseSalarySummary,
  parseSummaryCurrency,
} from "./ashby";
import { atsSalaryFields, jobToRow, type JobData } from "./types";

const salaryComponent = (over: Record<string, unknown> = {}) => ({
  summary: "CA$54K - CA$68K",
  compensationType: "Salary",
  interval: "1 YEAR",
  currencyCode: "CAD",
  minValue: 54000,
  maxValue: 68000,
  ...over,
});

describe("parseAshbyCompensation — structured components", () => {
  it("reads an annual salary band from summaryComponents", () => {
    expect(
      parseAshbyCompensation({
        compensationTierSummary: "CA$54K – CA$68K • Offers Equity",
        summaryComponents: [salaryComponent()],
      })
    ).toEqual({ salary_min: 54000, salary_max: 68000, salary_currency: "CAD" });
  });

  it("falls back to flattening compensationTiers when there is no rollup", () => {
    expect(
      parseAshbyCompensation({
        compensationTiers: [
          { components: [salaryComponent({ minValue: 124000, maxValue: 155000 })] },
        ],
      })
    ).toEqual({ salary_min: 124000, salary_max: 155000, salary_currency: "CAD" });
  });

  it("widens across geo tiers that share a currency", () => {
    expect(
      parseAshbyCompensation({
        compensationTiers: [
          { components: [salaryComponent({ minValue: 124000, maxValue: 155000 })] },
          { components: [salaryComponent({ minValue: 110000, maxValue: 170000 })] },
        ],
      })
    ).toEqual({ salary_min: 110000, salary_max: 170000, salary_currency: "CAD" });
  });

  it("ignores tiers in a different currency rather than mixing the numbers", () => {
    // A CAD band widened with USD figures is wrong in both currencies.
    expect(
      parseAshbyCompensation({
        summaryComponents: [
          salaryComponent({ minValue: 124000, maxValue: 155000 }),
          salaryComponent({ currencyCode: "USD", minValue: 90000, maxValue: 210000 }),
        ],
      })
    ).toEqual({ salary_min: 124000, salary_max: 155000, salary_currency: "CAD" });
  });

  it("skips equity and bonus components", () => {
    expect(
      parseAshbyCompensation({
        summaryComponents: [
          { summary: "Offers Equity", compensationType: "EquityPercentage", interval: "NONE" },
          { summary: "10% bonus", compensationType: "Bonus", interval: "1 YEAR", currencyCode: "CAD" },
          salaryComponent(),
        ],
      })
    ).toEqual({ salary_min: 54000, salary_max: 68000, salary_currency: "CAD" });
  });

  it("returns null for an equity-only posting", () => {
    expect(
      parseAshbyCompensation({
        compensationTierSummary: "Offers Equity",
        summaryComponents: [
          { summary: "Offers Equity", compensationType: "EquityPercentage", interval: "NONE" },
        ],
      })
    ).toBeNull();
  });

  it("drops hourly bands — the column is annual-only, with no interval to store", () => {
    expect(
      parseAshbyCompensation({
        summaryComponents: [
          salaryComponent({ interval: "1 HOUR", minValue: 35, maxValue: 45, summary: "CA$35 - CA$45/hr" }),
        ],
      })
    ).toBeNull();
  });

  it("collapses a one-sided band to a single posted figure", () => {
    expect(
      parseAshbyCompensation({
        summaryComponents: [salaryComponent({ minValue: 87000, maxValue: null })],
      })
    ).toEqual({ salary_min: 87000, salary_max: 87000, salary_currency: "CAD" });
  });

  it("orders an inverted band rather than storing min > max", () => {
    expect(
      parseAshbyCompensation({
        summaryComponents: [salaryComponent({ minValue: 68000, maxValue: 54000 })],
      })
    ).toEqual({ salary_min: 54000, salary_max: 68000, salary_currency: "CAD" });
  });

  it("rejects implausible annual figures", () => {
    expect(
      parseAshbyCompensation({
        summaryComponents: [salaryComponent({ minValue: 42, maxValue: 55 })],
      })
    ).toBeNull();
  });

  it("returns null for missing / malformed compensation blocks", () => {
    expect(parseAshbyCompensation(undefined)).toBeNull();
    expect(parseAshbyCompensation(null)).toBeNull();
    expect(parseAshbyCompensation("CA$54K")).toBeNull();
    expect(parseAshbyCompensation({})).toBeNull();
    expect(parseAshbyCompensation({ summaryComponents: [] })).toBeNull();
  });
});

describe("parseSalarySummary — text fallback", () => {
  it("parses Ashby's scrapeable summary, including decimal magnitudes", () => {
    // "Growth Engagement Specialist" on the live board.
    expect(parseSalarySummary("CA$69.6K – CA$87K")).toEqual({
      salary_min: 69600,
      salary_max: 87000,
      salary_currency: "CAD",
    });
  });

  it("parses fully written-out ranges", () => {
    expect(parseSalarySummary("CAD 124,000 - 155,000")).toEqual({
      salary_min: 124000,
      salary_max: 155000,
      salary_currency: "CAD",
    });
  });

  it("is used when a tier carries a summary but no structured min/max", () => {
    expect(
      parseAshbyCompensation({
        scrapeableCompensationSalarySummary: "CA$54K - CA$68K",
        summaryComponents: [
          { summary: "CA$54K - CA$68K", compensationType: "Salary", interval: "1 YEAR", currencyCode: "CAD" },
        ],
      })
    ).toEqual({ salary_min: 54000, salary_max: 68000, salary_currency: "CAD" });
  });

  it("refuses a bare $ — guessing USD would mislabel a Canadian range", () => {
    expect(parseSalarySummary("$54K - $68K")).toBeNull();
  });

  it("refuses non-annual summaries", () => {
    expect(parseSalarySummary("CA$35 - CA$45/hr")).toBeNull();
    expect(parseSalarySummary("CA$8K per month")).toBeNull();
  });

  it("returns null on empty / non-string input", () => {
    expect(parseSalarySummary("")).toBeNull();
    expect(parseSalarySummary(null)).toBeNull();
    expect(parseSalarySummary(undefined)).toBeNull();
    expect(parseSalarySummary("Competitive salary in CAD")).toBeNull();
  });
});

describe("parseSummaryCurrency", () => {
  it("prefers the country-prefixed marker over the bare symbol", () => {
    expect(parseSummaryCurrency("CA$54K – CA$68K")).toBe("CAD");
    expect(parseSummaryCurrency("US$120K – US$150K")).toBe("USD");
    expect(parseSummaryCurrency("£60K – £80K")).toBe("GBP");
    expect(parseSummaryCurrency("€60K – €80K")).toBe("EUR");
    expect(parseSummaryCurrency("$60K – $80K")).toBeNull();
  });
});

describe("atsSalaryFields / jobToRow", () => {
  const base: JobData = { external_id: "abc", title: "Associate, Securities Lending Operations" };

  it("is null for scrapers that publish no structured compensation", () => {
    expect(atsSalaryFields(base)).toBeNull();
    // Salary keys must stay OFF the row, or the insert would override the
    // salary_currency column default for every non-Ashby board.
    expect(jobToRow(base)).not.toHaveProperty("salary_currency");
  });

  it("is null when the marker is present but no range was parsed", () => {
    expect(
      atsSalaryFields({ ...base, salary_source: "ats", salary_min: null, salary_max: null })
    ).toBeNull();
  });

  it("carries the parsed range onto the row", () => {
    const job: JobData = {
      ...base,
      salary_source: "ats",
      salary_min: 54000,
      salary_max: 68000,
      salary_currency: "CAD",
    };
    expect(atsSalaryFields(job)).toEqual({
      salary_min: 54000,
      salary_max: 68000,
      salary_currency: "CAD",
    });
    expect(jobToRow(job)).toMatchObject({
      external_id: "abc",
      salary_min: 54000,
      salary_max: 68000,
      salary_currency: "CAD",
    });
  });

  it("never leaks salary_source into the DB row", () => {
    const row = jobToRow({ ...base, salary_source: "ats", salary_min: 54000, salary_max: 68000 });
    expect(row).not.toHaveProperty("salary_source");
  });
});
