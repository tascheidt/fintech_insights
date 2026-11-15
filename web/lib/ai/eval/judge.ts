/**
 * Pairwise LLM judge for the model eval suite (`web/scripts/model-eval.ts`).
 *
 * Narrative surfaces (digest, insight, editorial, chat, …) have no single
 * correct answer, so they are scored by a judge model comparing a candidate
 * model's output against the current production model's output for the SAME
 * input. Design choices, each a known LLM-as-judge failure mode:
 *
 * - **Pairwise, not absolute.** "Which is better and why" is far more stable
 *   than a 1–10 score.
 * - **Position-swapped.** Every pair is judged twice (A/B then B/A). A model
 *   only "wins" when both orders agree; a split verdict is a tie. This cancels
 *   the judge's first-position bias instead of hiding it.
 * - **Source-grounded.** The judge sees the (truncated) input, so it can
 *   penalize invented facts — the failure that matters most on a product
 *   whose whole value is "evidence-backed".
 * - **Self-preference is reported, not ignored.** When the judge model is
 *   also a candidate, the report says so; run a second judge (`--judges=a,b`)
 *   and read the agreement.
 *
 * The prompt/parse/combine functions are pure and unit-tested; `runJudge`
 * is the only I/O and writes telemetry like every other call site.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { recordUsage, type OnUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";

export type Side = "A" | "B" | "tie";

export interface JudgeCriteria {
  /** Every claim is supported by the source input; nothing invented. */
  faithfulness: Side;
  /** Concrete, specific, decision-useful rather than generic. */
  specificity: Side;
  /** Follows the surface's format/length/field instructions. */
  instruction_following: Side;
  /** Plain, hype-free editorial voice (user-facing surfaces only). */
  voice: Side;
}

export interface JudgeVerdict {
  criteria: JudgeCriteria;
  overall: Side;
  /** Problems a reader would notice, per output. */
  issues_A: string[];
  issues_B: string[];
  /** Subset of issues that are disqualifying (fabrication, truncation, wrong format). */
  major_issues_A: number;
  major_issues_B: number;
  rationale: string;
}

/** Verdict re-expressed from the candidate's point of view. */
export interface CandidateVerdict {
  outcome: "win" | "loss" | "tie";
  criteria: Record<keyof JudgeCriteria, "win" | "loss" | "tie">;
  candidateMajorIssues: number;
  baselineMajorIssues: number;
  candidateIssues: string[];
  baselineIssues: string[];
  rationales: string[];
  /** True when the two orders disagreed on the overall winner. */
  positionSensitive: boolean;
}

export interface JudgeRequest {
  surfaceLabel: string;
  /** What a good output looks like for this surface, in two or three sentences. */
  rubric: string;
  userFacing: boolean;
  /** The input the models saw (already truncated by the caller). */
  sourceInput: string;
  outputA: string;
  outputB: string;
}

const MAX_SOURCE_CHARS = 14_000;
const MAX_OUTPUT_CHARS = 9_000;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated for judging]`;
}

export function buildJudgePrompt(req: JudgeRequest): string {
  return `You are a meticulous evaluator comparing two AI outputs for the "${req.surfaceLabel}" feature of a fintech hiring-intelligence product. Both outputs were produced from the SAME input below. Judge which output better serves the product's reader.

## What a good output looks like
${req.rubric}

## Criteria (judge each independently)
- faithfulness: every factual claim is supported by the SOURCE INPUT. Invented numbers, companies, products, dates, or strategy claims are serious defects. Hedged inference is fine; unsupported certainty is not.
- specificity: concrete and decision-useful (named roles, counts, systems) rather than generic filler that could describe any company.
- instruction_following: honors the required structure, fields, length limits, and format; not truncated.
- voice: ${req.userFacing ? "plain, precise editorial prose; no hype, no marketing language, no emojis, no exclamation marks." : 'not applicable for this internal surface — answer "tie".'}

Length is not quality. Prefer the shorter output when the two are otherwise equal. Do not let the order of presentation influence you.

## SOURCE INPUT
${clip(req.sourceInput, MAX_SOURCE_CHARS)}

## OUTPUT A
${clip(req.outputA, MAX_OUTPUT_CHARS)}

## OUTPUT B
${clip(req.outputB, MAX_OUTPUT_CHARS)}

Respond with ONLY this JSON:
{
  "criteria": {"faithfulness": "A|B|tie", "specificity": "A|B|tie", "instruction_following": "A|B|tie", "voice": "A|B|tie"},
  "overall": "A|B|tie",
  "issues_A": ["short description of each problem in A"],
  "issues_B": ["short description of each problem in B"],
  "major_issues_A": 0,
  "major_issues_B": 0,
  "rationale": "two sentences max"
}`;
}

function toSide(v: unknown): Side {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "A") return "A";
  if (s === "B") return "B";
  return "tie";
}

function toStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 8) : [];
}

function toCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Tolerant parse (fenced JSON, stray prose). Returns null when unusable. */
export function parseJudgeVerdict(text: string): JudgeVerdict | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  const c = (obj.criteria ?? {}) as Record<string, unknown>;
  if (!("overall" in obj)) return null;
  return {
    criteria: {
      faithfulness: toSide(c.faithfulness),
      specificity: toSide(c.specificity),
      instruction_following: toSide(c.instruction_following),
      voice: toSide(c.voice),
    },
    overall: toSide(obj.overall),
    issues_A: toStrings(obj.issues_A),
    issues_B: toStrings(obj.issues_B),
    major_issues_A: toCount(obj.major_issues_A),
    major_issues_B: toCount(obj.major_issues_B),
    rationale: String(obj.rationale ?? "").slice(0, 600),
  };
}

function sideFor(side: Side, candidateIs: "A" | "B"): "win" | "loss" | "tie" {
  if (side === "tie") return "tie";
  return side === candidateIs ? "win" : "loss";
}

function agree(x: "win" | "loss" | "tie", y: "win" | "loss" | "tie"): "win" | "loss" | "tie" {
  return x === y ? x : "tie";
}

/**
 * Combine the two position-swapped verdicts. `first` had the candidate as A,
 * `second` had the candidate as B. A result only counts when both agree.
 */
export function combineSwapped(first: JudgeVerdict, second: JudgeVerdict): CandidateVerdict {
  const o1 = sideFor(first.overall, "A");
  const o2 = sideFor(second.overall, "B");
  const keys: Array<keyof JudgeCriteria> = ["faithfulness", "specificity", "instruction_following", "voice"];
  const criteria = Object.fromEntries(
    keys.map((k) => [k, agree(sideFor(first.criteria[k], "A"), sideFor(second.criteria[k], "B"))])
  ) as CandidateVerdict["criteria"];
  return {
    outcome: agree(o1, o2),
    criteria,
    // Average the two readings so one noisy pass can't dominate.
    candidateMajorIssues: (first.major_issues_A + second.major_issues_B) / 2,
    baselineMajorIssues: (first.major_issues_B + second.major_issues_A) / 2,
    candidateIssues: [...new Set([...first.issues_A, ...second.issues_B])],
    baselineIssues: [...new Set([...first.issues_B, ...second.issues_A])],
    rationales: [first.rationale, second.rationale].filter(Boolean),
    positionSensitive: o1 !== o2,
  };
}

/** Win rate with ties as half a win — the headline judged number. */
export function winRate(verdicts: CandidateVerdict[]): number {
  if (verdicts.length === 0) return 0;
  const pts = verdicts.reduce((a, v) => a + (v.outcome === "win" ? 1 : v.outcome === "tie" ? 0.5 : 0), 0);
  return pts / verdicts.length;
}

async function judgeOnce(prompt: string, judgeModel: string, onUsage?: OnUsage): Promise<JudgeVerdict | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: judgeModel,
    generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json" },
  });
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const result = await model.generateContent(prompt);
      const usage = recordUsage({
        callSite: "modelEval.judge",
        modelRequested: judgeModel,
        groundingEnabled: false,
        usageMetadata: result.response.usageMetadata,
        latencyMs: Date.now() - started,
        status: "ok",
      });
      writeUsageEvent(usage);
      onUsage?.(usage);
      const parsed = parseJudgeVerdict(result.response.text());
      if (parsed) return parsed;
    } catch (err) {
      const usage = recordUsage({
        callSite: "modelEval.judge",
        modelRequested: judgeModel,
        groundingEnabled: false,
        latencyMs: Date.now() - started,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      writeUsageEvent(usage);
      onUsage?.(usage);
    }
  }
  return null;
}

/**
 * Judge candidate vs baseline in both orders. Returns null when the judge
 * could not produce a parseable verdict in either order.
 */
export async function runJudge(
  req: Omit<JudgeRequest, "outputA" | "outputB"> & { candidate: string; baseline: string },
  judgeModel: string,
  onUsage?: OnUsage
): Promise<CandidateVerdict | null> {
  const base = { ...req };
  const [first, second] = await Promise.all([
    judgeOnce(buildJudgePrompt({ ...base, outputA: req.candidate, outputB: req.baseline }), judgeModel, onUsage),
    judgeOnce(buildJudgePrompt({ ...base, outputA: req.baseline, outputB: req.candidate }), judgeModel, onUsage),
  ]);
  if (!first || !second) return null;
  return combineSwapped(first, second);
}
