import { describe, expect, it } from "vitest";
import {
  DayforceListingError,
  parseDayforcePaginationSummary,
  validateDayforcePageCount,
  validateDayforceListingPages,
  type DayforceListingLink,
} from "./dayforce-listing";

const links = (start: number, count: number): DayforceListingLink[] =>
  Array.from({ length: count }, (_, offset) => {
    const id = String(start + offset);
    return { id, title: `Job ${id}`, url: `https://example.test/jobs/${id}` };
  });

describe("Dayforce listing pagination", () => {
  it("parses localized result counts and plans every page", () => {
    expect(parseDayforcePaginationSummary("Page 1 of 3")).toEqual({
      currentPage: 1,
      totalPages: 3,
    });
    expect(validateDayforcePageCount(3)).toBe(3);
  });

  it("collects and deduplicates a complete multi-page listing", () => {
    const jobs = validateDayforceListingPages([
      { page: 1, totalPages: 3, links: links(1, 25) },
      { page: 2, totalPages: 3, links: links(26, 25) },
      { page: 3, totalPages: 3, links: links(51, 20) },
    ]);

    expect(jobs).toHaveLength(70);
    expect(new Set(jobs.map((job) => job.id)).size).toBe(70);
  });

  it("fails closed when a later page is missing or incomplete", () => {
    expect(() => validateDayforceListingPages([
      { page: 1, totalPages: 3, links: links(1, 25) },
      { page: 2, totalPages: 3, links: links(26, 25) },
    ])).toThrowError(DayforceListingError);

    expect(() => validateDayforceListingPages([
      { page: 1, totalPages: 3, links: links(1, 25) },
      { page: 2, totalPages: 3, links: links(26, 24) },
      { page: 3, totalPages: 3, links: links(51, 20) },
    ])).toThrow(/page 2 returned 24 unique jobs; expected 25/);
  });

  it("fails closed on repeated pages or a changing result count", () => {
    expect(() => validateDayforceListingPages([
      { page: 1, totalPages: 2, links: links(1, 25) },
      { page: 2, totalPages: 2, links: links(1, 25) },
    ])).toThrow(/appeared on more than one listing page/);

    expect(() => validateDayforceListingPages([
      { page: 1, totalPages: 2, links: links(1, 25) },
      { page: 2, totalPages: 3, links: links(26, 25) },
    ])).toThrow(/page count changed/);
  });

  it("rejects an empty final page and an implausibly large page plan", () => {
    expect(() => validateDayforceListingPages([
      { page: 1, totalPages: 1, links: [] },
    ])).toThrow(/expected 1-25/);
    expect(() => validateDayforcePageCount(201, 200)).toThrow(/above the safety cap/);
  });
});
