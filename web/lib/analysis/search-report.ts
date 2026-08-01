/**
 * Search-report synthesis.
 *
 * When a user generates a shareable report from a /jobs search, this module
 * writes the block at the top of it: a headline, a short read on what the
 * result set actually contains, the role clusters inside it, and the
 * requirements that recur across the postings.
 *
 * The input is the *responsibilities* of the matched postings — the
 * description body plus the extracted structure (seniority, tech stack,
 * keywords). The output characterizes the set; it never editorializes about
 * individual companies (that's the company-insight surface's job).
 *
 * One Gemini call per report (Flash, ungrounded — the postings are the
 * evidence, so search grounding would add cost and a hallucination surface
 * for nothing). User-facing → the voice directive applies. Telemetry: writes
 * to `gemini_usage_events` on both the ok and error paths.
 *
 * Failure is non-fatal by contract: `generateSearchReportSynthesis` returns
 * `null` rather than throwing, and the report renders as a table-only artifact.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { AI_MODEL_OPTIONS } from "@/lib/ai/prompt-config";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import {
  MAX_SYNTHESIS_DESCRIPTION_CHARS,
  sampleJobsForSynthesis,
  describeSearchContext,
  type ReportJobRow,
  type ReportSearchContext,
  type ReportSynthesis,
} from "@/lib/reports/types";

export const SEARCH_REPORT_PROMPT_VERSION = "search-report-synthesis-v1";
/** Flash — the default tier (see CLAUDE.md §5). Index 0 of the single source
 *  of truth, same resolution the /api/ai/generate-posting route uses. */
export const SEARCH_REPORT_MODEL = AI_MODEL_OPTIONS[0].value;

const SYNTHESIS_TIMEOUT_MS = 45_000;
const SYNTHESIS_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SynthesisSchema = z.object({
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(900),
  roleGroups: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        count: z.number().int().min(0).max(10_000),
        detail: z.string().min(1).max(280),
      })
    )
    .max(6)
    .default([]),
  commonRequirements: z.array(z.string().min(1).max(80)).max(8).default([]),
});

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYNTHESIS_PROMPT = `{voice_block}

You are writing the opening block of a hiring-intelligence report. A user searched our database of fintech job postings and is sending the results to a colleague. Your job is to tell that colleague what this set of roles actually *is* — what kind of work these postings describe, how they cluster, and what keeps showing up in the requirements.

The search that produced this set:
{search_line}

The set contains {total_count} roles across {company_count} companies. Below is a sample of {sample_count} of them.

Rules:
- Characterize the SET, not individual postings. The reader can see the table; they need the pattern.
- Ground every claim in the postings below. If the set is thin or incoherent, say so plainly — "these nine roles don't share much beyond the title" is a useful sentence. Never pad.
- Cluster by what the work IS (from responsibilities), not by job title string. "Deploying models into lending decisions" is a cluster; "Senior Engineer" is not. 2-5 clusters is typical; fewer if the set is genuinely narrow. Use at most 6.
- \`count\` on each cluster is your estimate of how many of the {total_count} roles fall into it. The counts should roughly sum to {total_count} — don't double-count a role across clusters.
- \`commonRequirements\` are short noun phrases that recur across the postings' requirements — concrete skills, tools, domains, credentials. 3-8 of them, each under 6 words. Skip generic filler ("strong communication skills", "team player").
- The headline is one line, under 90 characters, no colon-subtitle pattern, no hype.
- The summary is 2-4 sentences. Lead with the most specific true thing about the set.
- Do not name a salary, a hiring plan, or a company strategy that isn't stated in the postings.

Postings:

{jobs_block}

Respond with a single JSON object:

{
  "headline": "<one line>",
  "summary": "<2-4 sentences>",
  "roleGroups": [
    { "label": "<2-5 word cluster>", "count": <integer>, "detail": "<one sentence>" }
  ],
  "commonRequirements": ["<short phrase>"]
}`;

/** A posting as the prompt sees it. */
export interface SynthesisJobInput {
  id: string;
  title: string;
  companyName: string;
  companySlug: string;
  functionGroup: string | null;
  seniority: string | null;
  techStack: string[];
  keywords: string[];
  /** Description body or summary — the responsibilities source. */
  description: string;
}

function formatJobsBlock(jobs: SynthesisJobInput[]): string {
  return jobs
    .map((job, i) => {
      const lines = [
        `### Posting ${i + 1}`,
        `title: ${job.title}`,
        `company: ${job.companyName}`,
      ];
      if (job.functionGroup) lines.push(`function: ${job.functionGroup}`);
      if (job.seniority) lines.push(`seniority: ${job.seniority}`);
      if (job.techStack.length)
        lines.push(`tech: ${job.techStack.slice(0, 15).join(", ")}`);
      if (job.keywords.length)
        lines.push(`keywords: ${job.keywords.slice(0, 15).join(", ")}`);
      if (job.description) {
        lines.push("description:");
        lines.push(job.description.slice(0, MAX_SYNTHESIS_DESCRIPTION_CHARS));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Input loading
// ---------------------------------------------------------------------------

interface RawJobRow {
  id: string;
  title: string;
  description_text: string | null;
  summary: string | null;
  seniority_level: string | null;
  tech_stack: unknown;
  keywords: unknown;
}

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * Load the description-level detail for a snapshot. The snapshot rows carry
 * only what the table renders; the synthesis needs the responsibilities.
 *
 * Read through `active_job_postings` (CLAUDE.md §7) — a company deactivated
 * between the search and the report generation must not feed the synthesis.
 */
export async function loadSynthesisInputs(
  rows: ReportJobRow[]
): Promise<SynthesisJobInput[]> {
  if (rows.length === 0) return [];
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("active_job_postings")
    .select("id, title, description_text, summary, seniority_level, tech_stack, keywords")
    .in(
      "id",
      rows.map((r) => r.id)
    );

  if (error) {
    log.warn({ err: error.message }, "[search-report] failed to load synthesis inputs");
    return [];
  }

  const detailById = new Map<string, RawJobRow>(
    ((data ?? []) as RawJobRow[]).map((row) => [row.id, row])
  );

  return rows
    .map((row) => {
      const detail = detailById.get(row.id);
      if (!detail) return null;
      return {
        id: row.id,
        title: row.title,
        companyName: row.companyName,
        companySlug: row.companySlug,
        functionGroup: row.functionGroup,
        seniority: detail.seniority_level,
        techStack: asStringArray(detail.tech_stack),
        keywords: asStringArray(detail.keywords),
        description: (detail.description_text || detail.summary || "").trim(),
      } satisfies SynthesisJobInput;
    })
    .filter((v): v is SynthesisJobInput => v !== null);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/** Fence-aware JSON salvage — same ladder as the other narrative call sites. */
function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) return fenced[1];
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj?.[0]) return obj[0];
  return null;
}

export interface SynthesisRequest {
  jobs: SynthesisJobInput[];
  searchContext: ReportSearchContext;
  /** Rows the search matched (may exceed the snapshot / sample size). */
  totalCount: number;
}

/**
 * Generate the synthesis block. Returns `null` on any failure — a report
 * without a synthesis is still a useful artifact, and a shared link that
 * 500s because Flash hiccuped is not.
 */
export async function generateSearchReportSynthesis(
  request: SynthesisRequest
): Promise<ReportSynthesis | null> {
  if (request.jobs.length === 0) return null;

  for (let attempt = 1; attempt <= SYNTHESIS_MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptSynthesis(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt < SYNTHESIS_MAX_ATTEMPTS) {
        log.warn(
          `[search-report] attempt ${attempt}/${SYNTHESIS_MAX_ATTEMPTS} failed (${message}); retrying`
        );
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      } else {
        log.error(
          { err: message },
          "[search-report] synthesis failed; returning table-only report"
        );
      }
    }
  }
  return null;
}

async function attemptSynthesis(
  request: SynthesisRequest
): Promise<ReportSynthesis> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const sample = sampleJobsForSynthesis(request.jobs);
  const companyCount = new Set(request.jobs.map((j) => j.companySlug)).size;

  const prompt = SYNTHESIS_PROMPT.replace(
    "{voice_block}",
    getVoiceDirective("narrative")
  )
    .replaceAll("{total_count}", String(request.totalCount))
    .replace("{company_count}", String(companyCount))
    .replace("{sample_count}", String(sample.length))
    .replace("{search_line}", describeSearchContext(request.searchContext))
    .replace("{jobs_block}", formatJobsBlock(sample));

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: SEARCH_REPORT_MODEL,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const startMs = Date.now();
  let response;
  try {
    response = await withTimeout(
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      SYNTHESIS_TIMEOUT_MS,
      "Search report synthesis"
    );
  } catch (err) {
    writeUsageEvent(
      recordUsage({
        callSite: "generateSearchReportSynthesis",
        modelRequested: SEARCH_REPORT_MODEL,
        groundingEnabled: false,
        latencyMs: Date.now() - startMs,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        extra: {
          sampleCount: sample.length,
          totalCount: request.totalCount,
          promptVersion: SEARCH_REPORT_PROMPT_VERSION,
        },
      })
    );
    throw err;
  }

  writeUsageEvent(
    recordUsage({
      callSite: "generateSearchReportSynthesis",
      modelRequested: SEARCH_REPORT_MODEL,
      groundingEnabled: false,
      usageMetadata: response.response.usageMetadata,
      latencyMs: Date.now() - startMs,
      status: "ok",
      extra: {
        sampleCount: sample.length,
        totalCount: request.totalCount,
        promptVersion: SEARCH_REPORT_PROMPT_VERSION,
      },
    })
  );

  const text = response.response.text()?.trim() ?? "";
  if (!text) throw new Error("Empty response from search-report synthesis");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const candidate = extractJson(text);
    if (!candidate) throw new Error("No JSON found in search-report response");
    parsed = JSON.parse(candidate.replace(/,(\s*[}\]])/g, "$1"));
  }

  const result = SynthesisSchema.safeParse(parsed);
  if (!result.success) {
    log.warn(
      { err: result.error.issues.slice(0, 3) },
      "[search-report] schema validation failed"
    );
    throw new Error(
      `Search-report schema validation failed: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  return result.data;
}
