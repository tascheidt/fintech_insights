/**
 * Regression tests for the description_hash gate in the ingestion pipeline.
 *
 * The gate is the Phase 2 cost-saving feature: when a scraped description's
 * SHA-1 matches what we already stored, `extractAndUpdateStructure` (which
 * fires the Gemini Flash extraction call) is skipped. A regression here
 * would cause us to re-extract every job every collection run — silently
 * doubling Gemini cost.
 *
 * Two cases:
 *  1. Hash matches (description unchanged) -> extraction is NOT queued.
 *  2. Hash differs (description changed) -> extraction IS queued.
 *
 * Strategy: mock the admin Supabase client and the Gemini-driven
 * `extractJobStructure` (in `@/lib/analysis/structure`). When the hash
 * gate skips a job, `extractJobStructure` is never called; when the gate
 * fires through, it's called exactly once. Asserting on the inner Gemini
 * call avoids the same-module-spy problem of mocking
 * `extractAndUpdateStructure` directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const DESCRIPTION =
  "We are hiring a senior backend engineer to work on payments infrastructure.";
const STORED_HASH_MATCH = createHash("sha1").update(DESCRIPTION).digest("hex");
const STORED_HASH_DIFFERENT = "deadbeef".repeat(5); // 40 hex chars; not a real sha1 of DESCRIPTION

const extractJobStructureMock = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/analysis/structure", () => ({
  extractJobStructure: extractJobStructureMock,
  normalizeJobTitle: (title: string) => title,
  isValidDepartment: () => true,
  isValidLocation: () => true,
}));

// The index barrel pulls in puppeteer, so it's mocked wholesale — but
// `atsSalaryFields` is real pure logic from ./types (no heavy deps), and the
// ingest path's salary handling is only meaningfully covered if it runs.
vi.mock("@/lib/scrapers", async () => {
  const types = await vi.importActual<typeof import("../scrapers/types")>(
    "@/lib/scrapers/types"
  );
  return {
    fetchJobs: vi.fn().mockResolvedValue([]),
    jobToRow: (job: unknown) => job,
    atsSalaryFields: types.atsSalaryFields,
    isBrowserScraper: () => false,
  };
});

vi.mock("@/lib/github", () => ({
  triggerScrapeWorkflow: vi.fn(),
}));

// Mutated per-test to control the incumbent-tracking flag read by
// `runIngestStage`'s sub-brand-only gate.
let incumbentTrackingEnabledMock = false;
vi.mock("@/lib/settings/incumbent-tracking", () => ({
  getIncumbentTrackingEnabled: vi.fn(() => Promise.resolve(incumbentTrackingEnabledMock)),
}));

vi.mock("@/lib/ai/prompt-config", () => ({
  getActiveJobStructureAiConfig: vi.fn().mockResolvedValue({
    stage: "job-structure",
    model: "gemini-flash-latest",
    promptTemplate: "x".repeat(300),
    temperature: 0.2,
    maxOutputTokens: 4096,
  }),
}));

// Mutated per-test to control what the "select existing job_postings" query
// returns. Defined at module scope so the Supabase mock factory can close
// over it.
let existingRows: Array<{
  id: string;
  external_id: string;
  description_hash: string | null;
  company_id?: string;
}> = [];

// For tests that need to control the companySlugOverride child lookup.
let overrideCompanyRows: Array<{
  id: string;
  slug: string;
  name: string;
  parent_company_id: string;
}> = [];

// Track inserted job_postings rows so override-routing tests can assert
// what landed where.
let insertedRows: Array<Record<string, unknown>> = [];

// Track job_postings UPDATE payloads. Covers three distinct writes — the
// per-job refresh, the post-extraction structure write, and closure — so
// assertions filter by the keys they care about.
let updatedRows: Array<Record<string, unknown>> = [];

function buildSupabaseMock() {
  // Update chain supports: .eq(...), .eq(...).eq(...) (closure path), .in(...)
  // (companies.last_collected_at over parent + sub-brands), and being
  // awaited directly. Implemented as a chainable thenable.
  const makeThenableChain = (
    payload: { count?: number; data?: unknown; error?: unknown } = { count: 0, data: null, error: null }
  ) => {
    const chain: Record<string, unknown> = {};
    chain.eq = vi.fn(() => makeThenableChain(payload));
    chain.in = vi.fn(() => makeThenableChain(payload));
    chain.select = vi.fn(() => chain);
    chain.single = vi.fn(() => Promise.resolve(payload));
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve(payload).then(onFulfilled);
    return chain;
  };
  const buildUpdateChain = () => makeThenableChain();

  const insertChain: Record<string, unknown> = {};
  insertChain.select = vi.fn(() => insertChain);
  insertChain.single = vi.fn(() =>
    Promise.resolve({ data: { id: `new-job-${insertedRows.length}` }, error: null })
  );

  return {
    from: vi.fn((table: string) => {
      if (table === "companies") {
        // companies query: `.select('id, slug, name, parent_company_id').in('slug', [...]).eq('parent_company_id', cid)`
        const eqStep = (data: unknown) => Promise.resolve({ data, error: null });
        const inChain: Record<string, unknown> = {};
        inChain.eq = vi.fn(() => eqStep(overrideCompanyRows));
        const selectChain: Record<string, unknown> = {};
        selectChain.in = vi.fn(() => inChain);
        return {
          select: vi.fn(() => selectChain),
          update: vi.fn(() => buildUpdateChain()),
          insert: vi.fn(() => insertChain),
        };
      }
      // job_postings:
      //   `.select(...).in('company_id', [...]).order('id', {ascending:true}).range(offset, offset+999)`
      // (paginated dedup loader — see runIngestStage in processor.ts)
      const buildPaginatedChain = () => {
        let served = false;
        const rangeChain: Record<string, unknown> = {
          range: vi.fn(() => {
            // First page returns the fixture; subsequent pages return [] so
            // the loop exits.
            if (served) return Promise.resolve({ data: [], error: null });
            served = true;
            return Promise.resolve({ data: existingRows, error: null });
          }),
        };
        return rangeChain;
      };
      const selectChain: Record<string, unknown> = {
        in: vi.fn(() => ({
          order: vi.fn(() => buildPaginatedChain()),
        })),
        eq: vi.fn(() => Promise.resolve({ data: existingRows, error: null })),
      };
      return {
        select: vi.fn(() => selectChain),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatedRows.push(payload);
          return buildUpdateChain();
        }),
        insert: vi.fn((row: Record<string, unknown>) => {
          insertedRows.push(row);
          return insertChain;
        }),
      };
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildSupabaseMock(),
}));

vi.mock("./progress", () => ({
  updateTaskProgress: vi.fn().mockResolvedValue(undefined),
}));

const FIXTURE_COMPANY = {
  id: "co-1",
  slug: "acme",
  name: "Acme Fintech",
  ats_type: "lever",
  ats_identifier: "acme",
  careers_url: null,
  is_active: true,
} as const;

const FIXTURE_JOB = {
  external_id: "ext-1",
  title: "Senior Backend Engineer",
  department: "Engineering",
  team: null,
  location: "Toronto",
  location_type: "remote",
  description_html: `<p>${DESCRIPTION}</p>`,
  description_text: DESCRIPTION,
  commitment: "full-time",
  posted_date: null,
  url: "https://jobs.example.com/ext-1",
};

describe("runIngestStage description_hash gate", () => {
  beforeEach(() => {
    extractJobStructureMock.mockClear();
    existingRows = [];
    overrideCompanyRows = [];
    insertedRows = [];
  });

  it("skips the Gemini extraction call when the stored hash matches the new description", async () => {
    existingRows = [
      {
        id: "existing-job-1",
        external_id: FIXTURE_JOB.external_id,
        description_hash: STORED_HASH_MATCH,
        company_id: FIXTURE_COMPANY.id,
      },
    ];

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-1", FIXTURE_COMPANY as never, [FIXTURE_JOB] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(0);
  });

  it("runs the Gemini extraction call when the stored hash differs from the new description", async () => {
    existingRows = [
      {
        id: "existing-job-1",
        external_id: FIXTURE_JOB.external_id,
        description_hash: STORED_HASH_DIFFERENT,
        company_id: FIXTURE_COMPANY.id,
      },
    ];

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-2", FIXTURE_COMPANY as never, [FIXTURE_JOB] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(1);
  });

  it("skips extraction when only volatile boilerplate (posting date) changed", async () => {
    // Same substance, different posting date — normalizes identically, so the
    // normalized hash matches and the Gemini call is skipped (the thrash fix).
    const { runIngestStage, normalizeDescriptionForHash } = await import("./processor");
    const baseWithDate = `${DESCRIPTION} Posted 3 days ago.`;
    const churnedDate = `${DESCRIPTION} Posted 19 days ago.`;
    expect(normalizeDescriptionForHash(baseWithDate)).toBe(
      normalizeDescriptionForHash(churnedDate)
    );
    const normalizedHash = createHash("sha1")
      .update(normalizeDescriptionForHash(baseWithDate))
      .digest("hex");
    existingRows = [
      {
        id: "existing-job-1",
        external_id: FIXTURE_JOB.external_id,
        description_hash: normalizedHash,
        company_id: FIXTURE_COMPANY.id,
      },
    ];

    const churnedJob = { ...FIXTURE_JOB, description_text: churnedDate };
    await runIngestStage("task-churn", FIXTURE_COMPANY as never, [churnedJob] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(0);
  });

  it("runs extraction when the substance of the description changes", async () => {
    const { runIngestStage, normalizeDescriptionForHash } = await import("./processor");
    const normalizedHash = createHash("sha1")
      .update(normalizeDescriptionForHash(`${DESCRIPTION} Posted 3 days ago.`))
      .digest("hex");
    existingRows = [
      {
        id: "existing-job-1",
        external_id: FIXTURE_JOB.external_id,
        description_hash: normalizedHash,
        company_id: FIXTURE_COMPANY.id,
      },
    ];

    const changedJob = {
      ...FIXTURE_JOB,
      description_text: "We now seek a Staff Data Scientist for fraud modeling. Posted 3 days ago.",
    };
    await runIngestStage("task-substance", FIXTURE_COMPANY as never, [changedJob] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(1);
  });
});

describe("normalizeDescriptionForHash", () => {
  it("collapses whitespace and case so re-rendered text fingerprints identically", async () => {
    const { normalizeDescriptionForHash } = await import("./processor");
    expect(normalizeDescriptionForHash("Hello   World\n\nFoo")).toBe(
      normalizeDescriptionForHash("hello world foo")
    );
  });

  it("ignores churning posting dates", async () => {
    const { normalizeDescriptionForHash } = await import("./processor");
    expect(normalizeDescriptionForHash("Build payments infra. Posted 3 days ago.")).toBe(
      normalizeDescriptionForHash("Build payments infra. Posted 47 days ago.")
    );
  });

  it("ignores churning applicant counts", async () => {
    const { normalizeDescriptionForHash } = await import("./processor");
    expect(normalizeDescriptionForHash("Join the risk team. 5 applicants.")).toBe(
      normalizeDescriptionForHash("Join the risk team. 250 applicants.")
    );
  });

  it("ignores churning requisition IDs", async () => {
    const { normalizeDescriptionForHash } = await import("./processor");
    expect(normalizeDescriptionForHash("Senior role JR-0012345 in Toronto.")).toBe(
      normalizeDescriptionForHash("Senior role JR-0067890 in Toronto.")
    );
  });

  it("still flips when the substance changes", async () => {
    const { normalizeDescriptionForHash } = await import("./processor");
    expect(normalizeDescriptionForHash("Senior Backend Engineer")).not.toBe(
      normalizeDescriptionForHash("Staff Data Scientist")
    );
  });
});

describe("exceedsClosureFloor (mass-closure sanity floor)", () => {
  it("trips when a large corpus would shed more than the default 30%", async () => {
    const { exceedsClosureFloor } = await import("./processor");
    // The May 2026 Workday truncation shape: ~50 of ~1,500 fetched, so the
    // closure loop wants to close ~1,450/1,500.
    expect(exceedsClosureFloor(1500, 1450)).toBe(true);
  });

  it("does not trip on a normal daily churn (a handful of a big corpus)", async () => {
    const { exceedsClosureFloor } = await import("./processor");
    expect(exceedsClosureFloor(1500, 30)).toBe(false);
  });

  it("never trips below the minimum-corpus guard, even at 100% closure", async () => {
    const { exceedsClosureFloor } = await import("./processor");
    // A small board legitimately closing most of its few reqs must not be
    // mistaken for a truncated scrape.
    expect(exceedsClosureFloor(6, 6)).toBe(false);
    expect(exceedsClosureFloor(19, 19)).toBe(false);
  });

  it("does not trip when nothing would close", async () => {
    const { exceedsClosureFloor } = await import("./processor");
    expect(exceedsClosureFloor(1500, 0)).toBe(false);
  });

  it("treats exactly the floor as not-tripped (strictly greater-than)", async () => {
    const { exceedsClosureFloor } = await import("./processor");
    expect(exceedsClosureFloor(100, 30)).toBe(false); // 30% == floor, allowed
    expect(exceedsClosureFloor(100, 31)).toBe(true); // 31% > floor, tripped
  });

  it("honors custom ratio + minimum-corpus overrides", async () => {
    const { exceedsClosureFloor } = await import("./processor");
    expect(exceedsClosureFloor(50, 30, 0.5, 10)).toBe(true); // 60% > 50%
    expect(exceedsClosureFloor(50, 20, 0.5, 10)).toBe(false); // 40% < 50%
    expect(exceedsClosureFloor(8, 8, 0.5, 10)).toBe(false); // below custom min
  });
});

describe("runIngestStage companySlugOverride routing", () => {
  beforeEach(() => {
    extractJobStructureMock.mockClear();
    existingRows = [];
    overrideCompanyRows = [];
    insertedRows = [];
  });

  it("routes a job with companySlugOverride to the matching sub-brand's company_id", async () => {
    // Parent (CIBC analogue) has no existing rows; sub-brand (Simplii) is
    // a known child of the parent.
    overrideCompanyRows = [
      {
        id: "sub-co-1",
        slug: "subbrand",
        name: "Sub Brand",
        parent_company_id: FIXTURE_COMPANY.id,
      },
    ];

    const childJob = {
      ...FIXTURE_JOB,
      external_id: "ext-sub-1",
      title: "Director, Sub Brand",
      companySlugOverride: "subbrand",
    };
    const parentJob = {
      ...FIXTURE_JOB,
      external_id: "ext-parent-1",
      title: "Director, Parent",
    };

    const { runIngestStage } = await import("./processor");
    await runIngestStage(
      "task-override",
      FIXTURE_COMPANY as never,
      [parentJob, childJob] as never
    );

    // Both rows should have been inserted, each under the correct company_id.
    const parentRow = insertedRows.find((r) => r.external_id === "ext-parent-1");
    const childRow = insertedRows.find((r) => r.external_id === "ext-sub-1");
    expect(parentRow?.company_id).toBe(FIXTURE_COMPANY.id);
    expect(childRow?.company_id).toBe("sub-co-1");
  });

  it("falls back to the parent company_id when the override slug is unknown", async () => {
    // No sub-brand rows configured → override lookup returns empty.
    overrideCompanyRows = [];

    const childJob = {
      ...FIXTURE_JOB,
      external_id: "ext-ghost-1",
      title: "Ghost role",
      companySlugOverride: "does-not-exist",
    };

    const { runIngestStage } = await import("./processor");
    await runIngestStage(
      "task-fallback",
      FIXTURE_COMPANY as never,
      [childJob] as never
    );

    // Falls back to parent — the job is inserted under the parent company_id.
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].company_id).toBe(FIXTURE_COMPANY.id);
  });
});

describe("runIngestStage sub-brand-only mode (incumbent tracking off)", () => {
  // Mirrors CIBC: tier='incumbent', but its Workday tenant also carries the
  // Simplii (tier='fintech') sub-brand — see workday-cibc.ts.
  const INCUMBENT_PARENT = {
    id: "cibc-1",
    slug: "cibc",
    name: "CIBC",
    ats_type: "workday-cibc",
    ats_identifier: "cibc",
    careers_url: null,
    is_active: true,
    tier: "incumbent",
  } as const;

  beforeEach(() => {
    extractJobStructureMock.mockClear();
    existingRows = [];
    overrideCompanyRows = [];
    insertedRows = [];
    incumbentTrackingEnabledMock = false;
  });

  it("drops jobs that resolve to the incumbent parent itself when tracking is off", async () => {
    const parentJob = { ...FIXTURE_JOB, external_id: "cibc-job-1" };

    const { runIngestStage } = await import("./processor");
    const result = await runIngestStage(
      "task-subbrand-drop",
      INCUMBENT_PARENT as never,
      [parentJob] as never
    );

    expect(insertedRows).toHaveLength(0);
    expect(result.newJobIds).toHaveLength(0);
  });

  it("keeps jobs the classifier routed to an active fintech sub-brand even when tracking is off", async () => {
    overrideCompanyRows = [
      {
        id: "simplii-1",
        slug: "simplii",
        name: "Simplii Financial",
        parent_company_id: INCUMBENT_PARENT.id,
      },
    ];
    const parentJob = { ...FIXTURE_JOB, external_id: "cibc-job-2" };
    const subBrandJob = {
      ...FIXTURE_JOB,
      external_id: "simplii-job-1",
      companySlugOverride: "simplii",
    };

    const { runIngestStage } = await import("./processor");
    const result = await runIngestStage(
      "task-subbrand-keep",
      INCUMBENT_PARENT as never,
      [parentJob, subBrandJob] as never
    );

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].company_id).toBe("simplii-1");
    expect(result.newJobIds).toHaveLength(1);
  });

  it("ingests the parent's own postings normally once incumbent tracking is re-enabled", async () => {
    incumbentTrackingEnabledMock = true;
    const parentJob = { ...FIXTURE_JOB, external_id: "cibc-job-3" };

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-subbrand-flagon", INCUMBENT_PARENT as never, [parentJob] as never);

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].company_id).toBe(INCUMBENT_PARENT.id);
  });
});

/**
 * ATS-published salary (Ashby). Wealthsimple publishes its ranges in Ashby's
 * structured `compensation` block and nowhere in the description, so the two
 * things that must hold are: the range reaches `job_postings` on every scrape
 * (not just when the description hash moves), and the Flash description
 * extractor — which sees no range and returns null — cannot then erase it.
 */
describe("runIngestStage ATS-published salary", () => {
  const SALARIED_JOB = {
    ...FIXTURE_JOB,
    salary_source: "ats",
    salary_min: 54000,
    salary_max: 68000,
    salary_currency: "CAD",
  };

  const existingJobRow = (hash: string) => [
    {
      id: "existing-job-1",
      external_id: FIXTURE_JOB.external_id,
      description_hash: hash,
      company_id: FIXTURE_COMPANY.id,
    },
  ];

  /** The per-job refresh write — identified by a key only it carries. */
  const refreshWrites = () => updatedRows.filter((row) => "last_seen_date" in row);
  /** The post-extraction structure write. */
  const structureWrites = () => updatedRows.filter((row) => "summary" in row);

  beforeEach(() => {
    extractJobStructureMock.mockClear();
    extractJobStructureMock.mockResolvedValue(null);
    existingRows = [];
    overrideCompanyRows = [];
    insertedRows = [];
    updatedRows = [];
    incumbentTrackingEnabledMock = false;
  });

  it("refreshes the published range even when the description hash is unchanged", async () => {
    // A repriced req whose prose never moved: the hash gate skips extraction,
    // so this write is the only chance to pick up the new range.
    existingRows = existingJobRow(STORED_HASH_MATCH);

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-salary-1", FIXTURE_COMPANY as never, [SALARIED_JOB] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(0);
    expect(refreshWrites()[0]).toMatchObject({
      salary_min: 54000,
      salary_max: 68000,
      salary_currency: "CAD",
    });
  });

  it("leaves salary columns untouched for a board that publishes no range", async () => {
    // Every non-Ashby scraper. Writing salary here would null out the
    // AI-extracted value on every single scrape.
    existingRows = existingJobRow(STORED_HASH_MATCH);

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-salary-2", FIXTURE_COMPANY as never, [FIXTURE_JOB] as never);

    const refresh = refreshWrites()[0];
    expect(refresh).not.toHaveProperty("salary_min");
    expect(refresh).not.toHaveProperty("salary_max");
    expect(refresh).not.toHaveProperty("salary_currency");
  });

  it("does not let the description extractor overwrite an ATS-published range", async () => {
    existingRows = existingJobRow(STORED_HASH_DIFFERENT);
    extractJobStructureMock.mockResolvedValue({
      summary: "Backend role on payments infra.",
      seniority_level: "senior",
      // The range is not in the description, so the extractor finds nothing.
      salary_min: null,
      salary_max: null,
      salary_currency: "USD",
      tech_stack: [],
      keywords: [],
      standardized_department: "Engineering",
      function_category: "other",
      location_structured: null,
    });

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-salary-3", FIXTURE_COMPANY as never, [SALARIED_JOB] as never);

    expect(extractJobStructureMock).toHaveBeenCalledTimes(1);
    const structure = structureWrites()[0];
    expect(structure).toBeDefined();
    expect(structure).not.toHaveProperty("salary_min");
    expect(structure).not.toHaveProperty("salary_currency");
  });

  it("still writes extracted salary when the ATS published none", async () => {
    existingRows = existingJobRow(STORED_HASH_DIFFERENT);
    extractJobStructureMock.mockResolvedValue({
      summary: "Backend role on payments infra.",
      seniority_level: "senior",
      salary_min: 150000,
      salary_max: 190000,
      salary_currency: "USD",
      tech_stack: [],
      keywords: [],
      standardized_department: "Engineering",
      function_category: "other",
      location_structured: null,
    });

    const { runIngestStage } = await import("./processor");
    await runIngestStage("task-salary-4", FIXTURE_COMPANY as never, [FIXTURE_JOB] as never);

    expect(structureWrites()[0]).toMatchObject({
      salary_min: 150000,
      salary_max: 190000,
      salary_currency: "USD",
    });
  });
});
