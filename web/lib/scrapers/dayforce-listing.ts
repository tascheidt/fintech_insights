export const DAYFORCE_PAGE_SIZE = 25;
export const DAYFORCE_MAX_PAGES = 200;

export interface DayforceListingLink {
  id: string;
  title: string;
  url: string;
}

export interface DayforceListingPage {
  page: number;
  totalPages: number;
  links: DayforceListingLink[];
}

export class DayforceListingError extends Error {
  constructor(
    public readonly code:
      | "invalid-pagination"
      | "unrendered"
      | "page-cap"
      | "missing-page"
      | "count-changed"
      | "page-incomplete"
      | "duplicate-job",
    message: string
  ) {
    super(message);
    this.name = "DayforceListingError";
  }
}

export function parseDayforcePaginationSummary(text: string | null | undefined): {
  currentPage: number;
  totalPages: number;
} | null {
  if (!text) return null;
  const match = text.match(/page\s+(\d+)\s+of\s+(\d+)/i);
  if (!match) return null;
  const currentPage = Number(match[1]);
  const totalPages = Number(match[2]);
  return Number.isSafeInteger(currentPage) && Number.isSafeInteger(totalPages)
    ? { currentPage, totalPages }
    : null;
}

export function validateDayforcePageCount(totalPages: number, maxPages = DAYFORCE_MAX_PAGES): number {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1) {
    throw new DayforceListingError(
      "invalid-pagination",
      `Invalid Dayforce page count: ${totalPages}`
    );
  }
  if (totalPages > maxPages) {
    throw new DayforceListingError(
      "page-cap",
      `Dayforce listing requires ${totalPages} pages, above the safety cap of ${maxPages}`
    );
  }
  return totalPages;
}

export function validateDayforceListingPages(
  pages: DayforceListingPage[],
  maxPages = DAYFORCE_MAX_PAGES
): DayforceListingLink[] {
  if (pages.length === 0) {
    throw new DayforceListingError("missing-page", "Dayforce listing returned no readable pages");
  }

  const pageCount = validateDayforcePageCount(pages[0].totalPages, maxPages);

  if (pages.length !== pageCount) {
    throw new DayforceListingError(
      "missing-page",
      `Dayforce listing returned ${pages.length} page(s), expected ${pageCount}`
    );
  }

  const jobs = new Map<string, DayforceListingLink>();
  for (let index = 0; index < pages.length; index += 1) {
    const listingPage = pages[index];
    const expectedPage = index + 1;
    if (listingPage.page !== expectedPage) {
      throw new DayforceListingError(
        "missing-page",
        `Dayforce listing returned page ${listingPage.page} where page ${expectedPage} was expected`
      );
    }
    if (listingPage.totalPages !== pageCount) {
      throw new DayforceListingError(
        "count-changed",
        `Dayforce page count changed from ${pageCount} to ${listingPage.totalPages} on page ${expectedPage}`
      );
    }

    const isFinalPage = expectedPage === pageCount;
    const isCompletePage = isFinalPage
      ? listingPage.links.length >= 1 && listingPage.links.length <= DAYFORCE_PAGE_SIZE
      : listingPage.links.length === DAYFORCE_PAGE_SIZE;
    if (!isCompletePage) {
      throw new DayforceListingError(
        "page-incomplete",
        `Dayforce page ${expectedPage} returned ${listingPage.links.length} unique jobs; ` +
          (isFinalPage ? `expected 1-${DAYFORCE_PAGE_SIZE}` : `expected ${DAYFORCE_PAGE_SIZE}`)
      );
    }

    for (const job of listingPage.links) {
      if (jobs.has(job.id)) {
        throw new DayforceListingError(
          "duplicate-job",
          `Dayforce job ${job.id} appeared on more than one listing page`
        );
      }
      jobs.set(job.id, job);
    }
  }

  return [...jobs.values()];
}
