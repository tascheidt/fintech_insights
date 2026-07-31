/**
 * Feedback triage engine.
 *
 * Classifies an incoming `feedback_submissions` row and drafts the GitHub issue
 * markdown an admin can ship from. Replaces the `triage-feedback` Supabase Edge
 * Function, which lived outside the repo entirely — unversioned, untested,
 * invisible to CI, pinned to `gemini-3-pro-preview`, writing no telemetry, and
 * publicly invocable (`verify_jwt: false`).
 *
 * Design notes that are load-bearing, not incidental:
 *
 * 1. **Two rubrics, not one.** A bug report and a feature request are different
 *    questions. "Does this map to a roadmap priority?" is a reasonable gate on a
 *    feature and a nonsensical one on "the Revolut scraper is broken". Bugs are
 *    routed to a defect rubric that asks about specificity and blast radius, and
 *    `DEFECT_TYPES` can never be declined for lack of product priority.
 *
 * 2. **Duplicates are links, never verdicts.** The old prompt handed the model a
 *    list numbered `#1..#50` by array index and asked it to "classify as NO with
 *    reason duplicate". Those ordinals referenced nothing — every populated
 *    `triage_duplicate_of` in production is the string "#2" — and on 2026-05-25
 *    it auto-declined two genuine Revolut scraper bug reports at confidence 9
 *    and 10 against that phantom. Now: candidates carry real UUIDs, a returned
 *    id is dropped unless it appears in the candidate set (`sanitizeDuplicate`),
 *    and a duplicate link never by itself produces a `no`.
 *
 * 3. **No voice directive.** This is internal classification; the output is read
 *    by admins, not users. Per CLAUDE.md §5 the voice directive is forbidden
 *    here. `triage_reasoning` is admin-facing only — the user-facing history
 *    surface must not render it (that was how raw Gemini error strings reached
 *    submitters).
 *
 * Telemetry: one `gemini_usage_events` row per attempt via recordUsage +
 * writeUsageEvent, so this call is finally visible to the daily cost alarm.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { PRO_MODEL } from "@/lib/ai/prompt-config";
import { recordUsage, type OnUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { log } from "@/lib/log";

export const TRIAGE_PROMPT_VERSION = "feedback-triage-v2";
export const TRIAGE_MODEL = PRO_MODEL;

const TRIAGE_TIMEOUT_MS = 90_000;
const TRIAGE_MAX_ATTEMPTS = 3;

/** Max duplicate candidates handed to the model. Ordered by lexical similarity. */
export const MAX_DUPLICATE_CANDIDATES = 25;

/**
 * Submission types judged as defects rather than product proposals. These are
 * never declined for "not a current priority" — see `enforceTriagePolicy`.
 */
export const DEFECT_TYPES = new Set(["bug"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriageSubmission {
  id: string;
  type: string;
  title: string;
  description: string;
  page_url: string | null;
}

/** A prior submission offered to the model as a possible duplicate. */
export interface DuplicateCandidate {
  id: string;
  title: string;
  /** Prior verdict, so the model can see that an idea was already rejected. */
  triage_decision: string | null;
  status: string;
  github_issue_number: number | null;
}

export interface TriageResult {
  decision: "yes" | "maybe" | "no";
  confidence: number;
  reasoning: string;
  mapped_priority: string | null;
  duplicate_of: string | null;
  suggested_title: string;
  suggested_labels: string[];
  issue_markdown: string | null;
  /** Set when policy overrode the model's raw output. Recorded for auditing. */
  policy_notes: string[];
}

// ---------------------------------------------------------------------------
// Model output schema
// ---------------------------------------------------------------------------

const TriageOutputSchema = z.object({
  decision: z.enum(["yes", "maybe", "no"]),
  confidence: z.number(),
  reasoning: z.string().max(2000),
  mapped_priority: z.string().max(200).nullable().optional(),
  duplicate_of: z.string().max(100).nullable().optional(),
  suggested_title: z.string().max(200),
  suggested_labels: z.array(z.string().max(50)).max(8).optional(),
  issue_markdown: z.string().max(20000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const PRODUCT_CONTEXT = `
The Fintech Talent Brief is a hiring-intelligence platform tracking job postings
from Canadian and international fintech companies. It provides:
- Dashboard with hiring trends, company overviews, strategic highlights
- AI strategic analysis of individual postings and company-level insights
- Weekly digest emails with industry-wide intelligence
- Company management with automatic ATS platform detection

Target users: fintech analysts, investors, recruiters, and strategy teams.
Core value: turn raw job-posting data into competitive intelligence.

CURRENT PRODUCT PRIORITIES:
1. Deeper company-level hiring analytics and strategic insights
2. Improved weekly digest quality and analyst-grade tone
3. Better job categorization, function taxonomy, and trend detection
4. Admin tooling for managing companies and scraping pipelines
5. Personalization (per-user digest filtering, watchlists)
6. Expand ATS platform coverage (Ashby, Workday, etc.)
7. Maintain the Notion-style aesthetic throughout
`.trim();

/** Rubric for defects. Deliberately says nothing about roadmap priority. */
const DEFECT_RUBRIC = `
This submission is a BUG REPORT. Judge it as a defect, not as a product proposal.
Roadmap priority is IRRELEVANT here — a bug does not need to map to a priority to
be worth fixing, and you must never decline one on those grounds.

- **yes**: the report names a specific surface, company, page, or number that is
  observably wrong, and an engineer could begin investigating from what is written.
  Data that looks stale, absent, or implausible counts — a scraper silently
  breaking is one of this product's most damaging failure modes and reports of it
  are high-value even when terse.
- **maybe**: something is plainly wrong but the report lacks the detail to act on
  (no surface named, no reproduction path), or it may be correct behaviour that
  the user misread. Say what detail is missing.
- **no**: reserved for reports that are unintelligible, or describe behaviour that
  is definitively correct and intended. "We already know about this" is NOT a
  decline — link the duplicate instead and classify on the merits.
`.trim();

/** Rubric for feature/improvement/general. The original PM prioritization frame. */
const PRODUCT_RUBRIC = `
This submission is a PRODUCT REQUEST. Judge whether it is worth building.

- **yes**: maps directly to a current product priority, OR describes a clear
  usability problem multiple users would hit, OR surfaces data the platform
  already collects but does not expose. Must be implementable in the current
  stack (Next.js, Supabase, Gemini).
- **maybe**: plausible and in-domain, but targets an unprioritized area, or the
  problem is real while the proposed solution is unclear, or it needs significant
  new infrastructure, or it needs more user validation.
- **no**: clearly out of scope for fintech hiring intelligence, contradicts a
  deliberate product decision, or is too vague to act on even read generously.

When torn between yes and maybe, choose maybe. A "yes" should be an obvious win.
`.trim();

export function buildTriagePrompt(
  submission: TriageSubmission,
  candidates: DuplicateCandidate[]
): string {
  const isDefect = DEFECT_TYPES.has(submission.type);
  const rubric = isDefect ? DEFECT_RUBRIC : PRODUCT_RUBRIC;

  const candidateBlock =
    candidates.length === 0
      ? "No prior submissions to compare against."
      : [
          "Each candidate below is a REAL prior submission. Use the exact `id`",
          "value if you find a genuine duplicate — never invent an identifier,",
          "never use a positional number.",
          "",
          ...candidates.map(
            (c) =>
              `- id: ${c.id}\n  title: ${c.title}\n  prior_verdict: ${
                c.triage_decision ?? "none"
              } (status: ${c.status})${
                c.github_issue_number ? `\n  github_issue: #${c.github_issue_number}` : ""
              }`
          ),
        ].join("\n");

  return `You are a senior product manager for The Fintech Talent Brief.

${PRODUCT_CONTEXT}

## Submission

**Type:** ${submission.type}
**Title:** ${submission.title}
**Description:** ${submission.description}
**Page:** ${submission.page_url || "Not specified"}

## Rubric

${rubric}

## Possible duplicates

${candidateBlock}

A duplicate link is a CROSS-REFERENCE, not a verdict. Set \`duplicate_of\` when
this submission describes substantially the same thing as a candidate, and still
classify the submission on its own merits. Two people independently reporting the
same broken scraper is corroboration that it is real — that is a reason to take it
more seriously, not less. If nothing genuinely matches, set \`duplicate_of\` to null;
a wrong link is worse than none.

## Method

Think step by step before answering:
1. Restate what the user is actually reporting or asking for, in one sentence.
2. Does any candidate describe the same thing? If so, which id, and how sure are you?
3. Apply the rubric above.
4. Choose a confidence from 1-10 reflecting how sure you are of the classification.

Respond with JSON only:
{
  "decision": "yes" | "maybe" | "no",
  "confidence": <integer 1-10>,
  "reasoning": "2-3 sentences for the admin reviewing this. Plain and specific.",
  "mapped_priority": "which product priority this maps to, or null",
  "duplicate_of": "<exact id from the candidate list> or null",
  "suggested_title": "concise issue title",
  "suggested_labels": ["label1", "label2"],
  "issue_markdown": "<full issue markdown, or null when decision is no>"
}

For issue_markdown use EXACTLY this structure:
# {Title}
**Type:** {Type} | **Priority:** {Priority} | **Effort:** {Effort}

## TL;DR
One-sentence summary

## Current State
What exists now

## Expected Outcome
What should change

## Relevant Files
- file paths (infer from the product context, or "To be determined")

## Implementation Plan
Step-by-step plan

## Risks / Notes
Pitfalls and considerations`;
}

// ---------------------------------------------------------------------------
// Post-processing policy — pure, and the part worth testing hardest
// ---------------------------------------------------------------------------

/** Clamp to the DB's `triage_confidence` CHECK (integer 1..10). */
export function clampConfidence(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

/**
 * Accept the model's duplicate id only if it is one we actually offered.
 * The old engine stored whatever came back — in production, always "#2".
 */
export function sanitizeDuplicate(
  raw: unknown,
  candidates: DuplicateCandidate[]
): { duplicateOf: string | null; note: string | null } {
  if (typeof raw !== "string") return { duplicateOf: null, note: null };
  const value = raw.trim();
  if (!value || value.toLowerCase() === "null") return { duplicateOf: null, note: null };

  const match = candidates.find((c) => c.id === value);
  if (match) return { duplicateOf: match.id, note: null };

  return {
    duplicateOf: null,
    note: `dropped duplicate_of=${JSON.stringify(value.slice(0, 60))} — not in the candidate set`,
  };
}

/**
 * Apply the guardrails that sit between the model and the database.
 *
 * Pure so the Revolut regression can be asserted directly: a bug report the
 * model wants to decline as a duplicate must survive as `maybe` with the link
 * intact.
 */
export function enforceTriagePolicy(input: {
  type: string;
  decision: "yes" | "maybe" | "no";
  confidence: number;
  mappedPriority: string | null;
  duplicateOf: string | null;
  reasoning: string;
}): { decision: "yes" | "maybe" | "no"; policyNotes: string[] } {
  let decision = input.decision;
  const policyNotes: string[] = [];
  const isDefect = DEFECT_TYPES.has(input.type);

  // A duplicate link is never itself a reason to reject. The model is told this,
  // but the rule is enforced rather than trusted: this is the exact path that
  // discarded two real Revolut scraper reports.
  if (decision === "no" && input.duplicateOf) {
    decision = "maybe";
    policyNotes.push(
      "decision no→maybe: declined while linking a duplicate; a cross-reference is not a verdict"
    );
  }

  // Defects are not subject to the roadmap-priority gate in either direction.
  if (isDefect) {
    if (decision === "no" && /priorit|roadmap|scope|not planned/i.test(input.reasoning)) {
      decision = "maybe";
      policyNotes.push(
        "decision no→maybe: bug report declined on priority/scope grounds, which the defect rubric forbids"
      );
    }
  } else {
    // Product requests: an unmapped "yes" is a weak yes.
    if (decision === "yes" && !input.mappedPriority) {
      decision = "maybe";
      policyNotes.push("decision yes→maybe: no mapped product priority");
    }
  }

  // Low-confidence approvals get a human look regardless of type.
  if (decision === "yes" && input.confidence < 7) {
    decision = "maybe";
    policyNotes.push(`decision yes→maybe: confidence ${input.confidence} < 7`);
  }

  return { decision, policyNotes };
}

/** Tolerant JSON extraction — Gemini occasionally wraps or trails commas. */
export function parseTriageJson(text: string): unknown | null {
  const attempts: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1].trim());

  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) {
    attempts.push(braced[0]);
    attempts.push(braced[0].replace(/,(\s*[}\]])/g, "$1"));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface TriageOptions {
  onUsage?: OnUsage;
  /** Injection seam for tests and the dry-run script. */
  generate?: (prompt: string) => Promise<{ text: string; usageMetadata?: unknown }>;
}

async function callGemini(
  prompt: string,
  submissionId: string,
  opts: TriageOptions
): Promise<string> {
  if (opts.generate) {
    const { text } = await opts.generate(prompt);
    return text;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: TRIAGE_MODEL,
    generationConfig: {
      temperature: 0.3,
      // The old edge function allowed 64000 output tokens for what is a few
      // hundred tokens of JSON plus an issue body. Sized to the actual output.
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
    },
  });

  const startMs = Date.now();
  try {
    const response = await withTimeout(
      model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      TRIAGE_TIMEOUT_MS,
      `Feedback triage for ${submissionId}`
    );

    const record = recordUsage({
      callSite: "triageFeedback",
      modelRequested: TRIAGE_MODEL,
      groundingEnabled: false,
      usageMetadata: response.response.usageMetadata,
      latencyMs: Date.now() - startMs,
      status: "ok",
      extra: { submissionId, promptVersion: TRIAGE_PROMPT_VERSION },
    });
    writeUsageEvent(record);
    opts.onUsage?.(record);

    return response.response.text()?.trim() ?? "";
  } catch (err) {
    const record = recordUsage({
      callSite: "triageFeedback",
      modelRequested: TRIAGE_MODEL,
      groundingEnabled: false,
      latencyMs: Date.now() - startMs,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      extra: { submissionId, promptVersion: TRIAGE_PROMPT_VERSION },
    });
    writeUsageEvent(record);
    opts.onUsage?.(record);
    throw err;
  }
}

/**
 * Run triage for one submission. Pure with respect to the database — the caller
 * loads candidates and persists the result.
 */
export async function triageFeedback(
  submission: TriageSubmission,
  candidates: DuplicateCandidate[],
  opts: TriageOptions = {}
): Promise<TriageResult> {
  const prompt = buildTriagePrompt(submission, candidates);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= TRIAGE_MAX_ATTEMPTS; attempt++) {
    try {
      const text = await callGemini(prompt, submission.id, opts);
      if (!text) throw new Error("Empty response from Gemini");

      const json = parseTriageJson(text);
      if (json === null) {
        throw new Error(`Unparseable JSON; preview: ${text.slice(0, 200)}`);
      }

      const parsed = TriageOutputSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(
          `Schema validation failed: ${parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")}`
        );
      }

      return finalizeTriage(submission, candidates, parsed.data);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(
        { submissionId: submission.id, attempt, err: lastError.message },
        "[feedback-triage] attempt failed"
      );
      if (attempt < TRIAGE_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError ?? new Error("Triage failed");
}

/** Model output → persisted shape, with every guardrail applied. Pure. */
export function finalizeTriage(
  submission: TriageSubmission,
  candidates: DuplicateCandidate[],
  raw: z.infer<typeof TriageOutputSchema>
): TriageResult {
  const confidence = clampConfidence(raw.confidence);
  const { duplicateOf, note: dupNote } = sanitizeDuplicate(raw.duplicate_of, candidates);
  const mappedPriority = raw.mapped_priority?.trim() || null;

  const { decision, policyNotes } = enforceTriagePolicy({
    type: submission.type,
    decision: raw.decision,
    confidence,
    mappedPriority,
    duplicateOf,
    reasoning: raw.reasoning,
  });

  if (dupNote) policyNotes.unshift(dupNote);

  // An issue body is required to ship anything to GitHub, so keep it whenever
  // the submission survives — including when policy rescued it from a `no`.
  const issueMarkdown = decision === "no" ? null : raw.issue_markdown?.trim() || null;

  return {
    decision,
    confidence,
    reasoning: raw.reasoning,
    mapped_priority: mappedPriority,
    duplicate_of: duplicateOf,
    suggested_title: raw.suggested_title?.trim() || submission.title,
    suggested_labels: (raw.suggested_labels ?? []).filter(
      (l) => typeof l === "string" && l.trim().length > 0
    ),
    issue_markdown: issueMarkdown,
    policy_notes: policyNotes,
  };
}
