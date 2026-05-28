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

vi.mock("@/lib/scrapers", () => ({
  fetchJobs: vi.fn().mockResolvedValue([]),
  jobToRow: (job: unknown) => job,
  isBrowserScraper: () => false,
}));

vi.mock("@/lib/github", () => ({
  triggerScrapeWorkflow: vi.fn(),
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
        update: vi.fn(() => buildUpdateChain()),
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
