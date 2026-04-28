/**
 * Company editorial engine.
 *
 * Generates the v2 editorial fields stored on the `companies` row:
 *   - thesis (1–2 sentence working thesis)
 *   - thesis_sub (one-line provenance/elaboration)
 *   - interpretation (2–4 sentence read on recent hiring)
 *   - last_change + last_change_at (most recent meaningful event)
 *   - bets (3–6 strategic bets with claim, evidence, forward signal)
 *
 * Inputs are derived deterministically from job_postings + the latest
 * company_insights row (re-using its already-grounded research). The
 * Gemini call itself is ungrounded — we save a grounded request because
 * `performDeepResearch` already paid that cost.
 *
 * User-facing output → voice directive applies (`narrative` surface).
 * Telemetry: writes one row per call to `gemini_usage_events` via
 * `writeUsageEvent`. No database write happens automatically; callers must
 * pass the result to `applyEditorialToCompany` to persist.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { subDays } from "date-fns";
import { getVoiceDirective } from "@/lib/ai/voice";
import { checkVoice } from "@/lib/ai/voice-validator";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyCompanyPivot,
  getCompanyHiringSparkline,
  getCompanyHiringDelta,
  getCompanyLastChange,
  type PivotKind,
  type PivotSignal,
} from "@/lib/dashboard-queries";
import { getCategoryGroup, type RoleCategory } from "./function-categories";
import { log } from "@/lib/log";

// ---------------------------------------------------------------------------
// Versioning + model selection
// ---------------------------------------------------------------------------

export const EDITORIAL_PROMPT_VERSION = "company-editorial-v2";
export const EDITORIAL_MODEL = "gemini-pro-latest" as const;

const EDITORIAL_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// Output schema (Zod) — matches `bets` column shape + editorial fields.
// ---------------------------------------------------------------------------

const PivotEnum = z.enum(["new", "accel", "cont", "quiet"]);

const EvidenceItemSchema = z.object({
  when: z.string().min(1).max(80),
  text: z.string().min(1).max(400),
  type: z.enum(["internal", "external"]),
});

const BetSchema = z.object({
  id: z.string().max(80).optional(),
  title: z.string().min(1).max(160),
  claim: z.string().min(1).max(800),
  pivot: PivotEnum,
  confidence: z.number().int().min(1).max(5),
  evidence: z.array(EvidenceItemSchema).min(1).max(6),
  forward_signal: z.string().min(1).max(400),
  job_filter: z
    .object({
      function: z.string().max(120).optional(),
      theme: z.string().max(120).optional(),
    })
    .optional(),
});

export const EditorialOutputSchema = z.object({
  thesis: z.string().min(1).max(200),
  thesis_sub: z.string().max(280).default(""),
  interpretation: z.string().min(1).max(600),
  last_change: z.string().min(1).max(200),
  last_change_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bets: z.array(BetSchema).min(1).max(6),
});

export type EditorialOutput = z.infer<typeof EditorialOutputSchema>;
export type EditorialBet = z.infer<typeof BetSchema>;

// ---------------------------------------------------------------------------
// Context builder (deterministic, no AI)
// ---------------------------------------------------------------------------

interface EditorialContext {
  companyId: string;
  companyName: string;
  country: string | null;
  ats: string | null;

  /** ISO date (YYYY-MM-DD) — Pro doesn't know today's date, so we tell it. */
  todayIso: string;
  /** ISO date of the most recent posting in window, or null if no postings. */
  mostRecentPostingDate: string | null;

  activeJobs: number;
  totalJobs90d: number;
  sparkline: number[];
  delta30d: number;
  pivot: { kind: PivotKind; signals: PivotSignal[] };

  functionDist: Array<{ group: string; count: number }>;
  topKeywords: Array<{ keyword: string; count: number }>;
  sampleTitles: string[];
  recentJobLocations: string[];
  lastChangeFallback: { text: string; when: string } | null;

  // Optional grounded research from company_insights (most recent row)
  research: {
    statedStrategy: string | null;
    executiveSummary: string | null;
    strategicHypothesis: string | null;
    headline: string | null;
    keySignal: string | null;
    isPublic: boolean | null;
  } | null;
}

async function buildEditorialContext(
  companyId: string,
  companyName: string
): Promise<EditorialContext> {
  const supabase = createAdminClient();
  const ninetyDaysAgo = subDays(new Date(), 90).toISOString();

  // Company metadata
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, slug, country, ats_type")
    .eq("id", companyId)
    .maybeSingle();

  // Recent jobs (titles, function, keywords, location, recency)
  const { data: jobs } = await supabase
    .from("job_postings")
    .select(
      "title, function_category, location, first_seen_date, keywords, is_active"
    )
    .eq("company_id", companyId)
    .gte("first_seen_date", ninetyDaysAgo)
    .order("first_seen_date", { ascending: false })
    .limit(120);

  const allJobs = jobs ?? [];

  // Function distribution (by 7-group taxonomy)
  const functionMap = new Map<string, number>();
  for (const j of allJobs) {
    if (!j.function_category) continue;
    const g = getCategoryGroup(j.function_category as RoleCategory);
    functionMap.set(g, (functionMap.get(g) || 0) + 1);
  }
  const functionDist = Array.from(functionMap.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count);

  // Top keywords across recent jobs
  const kwMap = new Map<string, number>();
  for (const j of allJobs) {
    const kws = (j.keywords ?? []) as string[] | null;
    if (!kws) continue;
    for (const k of kws) {
      const trimmed = k?.trim().toLowerCase();
      if (!trimmed) continue;
      kwMap.set(trimmed, (kwMap.get(trimmed) || 0) + 1);
    }
  }
  const topKeywords = Array.from(kwMap.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // Trajectory + pivot — pass the admin client so these run outside a request
  // scope (the regenerate script + cron call into here).
  const [sparkline, delta30d, pivot] = await Promise.all([
    getCompanyHiringSparkline(companyId, 8, supabase),
    getCompanyHiringDelta(companyId, 30, supabase),
    classifyCompanyPivot(companyId, supabase),
  ]);

  const lastChangeFallback = await getCompanyLastChange(companyId, supabase);

  // Re-use grounded research from the latest company_insights row.
  let research: EditorialContext["research"] = null;
  const { data: latestInsight } = await supabase
    .from("company_insights")
    .select(
      "stated_strategy, executive_summary, strategic_hypothesis, headline, key_signal, is_public_company"
    )
    .eq("company_id", companyId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestInsight) {
    research = {
      statedStrategy: latestInsight.stated_strategy ?? null,
      executiveSummary: latestInsight.executive_summary ?? null,
      strategicHypothesis: latestInsight.strategic_hypothesis ?? null,
      headline: latestInsight.headline ?? null,
      keySignal: latestInsight.key_signal ?? null,
      isPublic: latestInsight.is_public_company ?? null,
    };
  }

  // Anchor the LLM to real dates: today + the most recent posting (the latter
  // doubles as a sane upper bound for last_change_at).
  const todayIso = new Date().toISOString().slice(0, 10);
  const mostRecentPostingDate = allJobs.reduce<string | null>((acc, j) => {
    const d = j.first_seen_date as string | null;
    if (!d) return acc;
    const iso = d.slice(0, 10);
    return acc === null || iso > acc ? iso : acc;
  }, null);

  return {
    companyId,
    companyName,
    country: (company?.country as string | null) ?? null,
    ats: (company?.ats_type as string | null) ?? null,
    todayIso,
    mostRecentPostingDate,
    activeJobs: allJobs.filter((j) => j.is_active).length,
    totalJobs90d: allJobs.length,
    sparkline,
    delta30d,
    pivot,
    functionDist,
    topKeywords,
    sampleTitles: allJobs.slice(0, 30).map((j) => j.title as string),
    recentJobLocations: dedupe(
      allJobs
        .map((j) => (j.location as string | null) ?? null)
        .filter((s): s is string => Boolean(s && s.trim()))
    ).slice(0, 12),
    lastChangeFallback,
    research,
  };
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function formatContextBlock(ctx: EditorialContext): string {
  const lines: string[] = [];

  lines.push(`## Today`);
  lines.push(`Today's date is ${ctx.todayIso}. Use this as the upper bound for any date you emit.`);
  if (ctx.mostRecentPostingDate) {
    lines.push(`Most recent posting in window: ${ctx.mostRecentPostingDate}`);
  }

  lines.push(`\n## Company`);
  lines.push(`Name: ${ctx.companyName}`);
  if (ctx.country) lines.push(`Country: ${ctx.country}`);
  if (ctx.ats) lines.push(`ATS: ${ctx.ats}`);

  lines.push(`\n## Hiring trajectory`);
  lines.push(`Active jobs (currently open): ${ctx.activeJobs}`);
  lines.push(`Postings seen in last 90d: ${ctx.totalJobs90d}`);
  lines.push(
    `Weekly counts last 8 weeks (oldest → newest): [${ctx.sparkline.join(", ")}]`
  );
  lines.push(
    `Net delta in last 30 days: ${ctx.delta30d >= 0 ? "+" : ""}${ctx.delta30d}`
  );

  lines.push(`\n## Rule-based pivot classification`);
  lines.push(`Kind: ${ctx.pivot.kind}`);
  if (ctx.pivot.signals.length) {
    for (const s of ctx.pivot.signals) {
      lines.push(`- ${s.kind}: ${s.label}`);
    }
  } else {
    lines.push(`- (no rule signals fired)`);
  }

  lines.push(`\n## Function distribution (last 90 days, by group)`);
  if (ctx.functionDist.length) {
    for (const { group, count } of ctx.functionDist) {
      lines.push(`- ${group}: ${count}`);
    }
  } else {
    lines.push(`- (none)`);
  }

  lines.push(`\n## Top keyword signals (last 90 days)`);
  if (ctx.topKeywords.length) {
    lines.push(
      ctx.topKeywords.map((k) => `${k.keyword} (${k.count})`).join(", ")
    );
  } else {
    lines.push(`(none)`);
  }

  lines.push(`\n## Sample role titles (most recent first)`);
  if (ctx.sampleTitles.length) {
    for (const t of ctx.sampleTitles) lines.push(`- ${t}`);
  } else {
    lines.push(`(no recent titles)`);
  }

  if (ctx.recentJobLocations.length) {
    lines.push(`\n## Recent posting locations`);
    lines.push(ctx.recentJobLocations.join(", "));
  }

  if (ctx.lastChangeFallback) {
    lines.push(`\n## Most recent posting (fallback for last_change)`);
    lines.push(
      `Text: "${ctx.lastChangeFallback.text}" (when: ${ctx.lastChangeFallback.when})`
    );
  }

  if (ctx.research) {
    lines.push(`\n## External research (from latest company_insights row)`);
    if (ctx.research.headline) lines.push(`Headline: ${ctx.research.headline}`);
    if (ctx.research.keySignal) lines.push(`Key signal: ${ctx.research.keySignal}`);
    if (ctx.research.statedStrategy) {
      lines.push(`Stated strategy: ${ctx.research.statedStrategy}`);
    }
    if (ctx.research.executiveSummary) {
      lines.push(`Executive summary: ${ctx.research.executiveSummary}`);
    }
    if (ctx.research.strategicHypothesis) {
      lines.push(`Prior hypothesis: ${ctx.research.strategicHypothesis}`);
    }
  } else {
    lines.push(
      `\n## External research\n(No company_insights row available — rely on hiring evidence only and mark uncertainty.)`
    );
  }

  return lines.join("\n");
}

const EDITORIAL_PROMPT = `{voice_block}

You are writing the working editorial for a fintech company tracked on a hiring-intelligence dashboard. The audience is fintech operators and analysts: they want a concise, evidence-anchored read on what this company is doing strategically. Obey the VOICE rules above for every user-visible string.

The dashboard renders three editorial surfaces from your output:
1. **Working thesis card** — large editorial quote on the company drill-down. Uses \`thesis\` and \`thesis_sub\`.
2. **Companies index row** — short thesis + last_change + signal chips. Uses \`thesis\`, \`last_change\`, \`last_change_at\`, and your \`bets[].pivot\` values.
3. **Strategic bet cards** — one card per bet on the drill-down. Uses every field of each \`bets\` entry.

## Inputs

{context_block}

## What "bets" mean

A bet is a coherent strategic move a company is making, evidenced by hiring patterns and (where available) external research. Examples:
- "Real-time payments rails" — multiple infra + payments roles, public partnership noises.
- "In-house card issuing" — issuing engineer hires + risk/compliance net-new + product roles named "Cards".
- "Bilingual Quebec build-out" — bilingual French-required roles concentrated in Montreal.

Bets are NOT generic department descriptions ("Engineering hiring", "Sales growth"). A good bet ties hiring to a *direction* — a product, geography, customer segment, or capability shift.

## Pivot kinds

Each bet has a \`pivot\` value. Use the rule-based pivot classification above as a STRONG hint. Override only when the rule misclassifies (e.g. you have evidence of a cold start the rules missed).

- \`new\` — fresh strategic direction (cold start, first roles in a new area).
- \`accel\` — established direction visibly accelerating (volume spike).
- \`quiet\` — previously sustained area going dark.
- \`cont\` — continuity / steady-state.

## Job filters

For each bet, set \`job_filter.function\` to a function-group name from the input distribution if the bet maps cleanly to one (Engineering / Product · Design / Data · Science / Operations · Strategy / Compliance / Sales / Other). Use \`job_filter.theme\` for keyword-based bets (e.g. "card issuing", "bilingual"). Either field is optional but at least one helps the drawer scope jobs to the bet.

## Evidence rules

- Each \`bets[i].evidence\` item must reference real data points present in the inputs above. Internal evidence cites hiring patterns ("4 backend infra hires in last 30d", "First Mexico City posting in 8mo"). External evidence cites public research present in the External research block ("Stated strategy mentions Engine by Starling migration").
- Do not invent evidence that is not derivable from the inputs.
- Preserve exact named systems, products, vendors, and geographies when they appear. Do not generalize "Engine by Starling" to "core banking platform".
- If evidence is thin, say so in the bet's claim and lower its \`confidence\` to 1 or 2 rather than padding with generic statements.

## Editorial fields

- \`thesis\` (≤200 chars): The single sentence that captures what this company is doing right now. May include *italics* via single asterisks for one or two emphasized phrases. Avoid hype.
- \`thesis_sub\` (≤280 chars, optional): One-line provenance ("Inferred from 6 months of hiring data, observed product launches, and stated strategy"). Empty string is acceptable.
- \`interpretation\` (≤600 chars): 2–4 sentences interpreting the recent hiring pattern. This is your editorial paragraph — confident on what's evidenced, explicit about what's uncertain.
- \`last_change\` (≤200 chars): Short factual sentence describing the most recent meaningful event. Examples: "USD spending account launched", "First SMB credit-risk hire in 18 months", "Spun up Mexico City build-out". If \`last_change_fallback\` is the strongest signal, use a clean editorial restatement of it (e.g. "New senior backend posting" rather than "New posting").
- \`last_change_at\` (YYYY-MM-DD): The date of \`last_change\`. Must be **today's date or earlier**, and never more than 90 days before today (the inputs only carry the last 90 days). When in doubt, use the "Most recent posting in window" date from the inputs above. Never invent a date from outside that window.
- \`bets\` (3–6 entries): The strategic bets, each with title / claim / pivot / confidence / evidence / forward_signal / optional job_filter.

## Output

Respond with a single JSON object matching this exact shape. No prose before or after the JSON.

{
  "thesis": "string",
  "thesis_sub": "string",
  "interpretation": "string",
  "last_change": "string",
  "last_change_at": "YYYY-MM-DD",
  "bets": [
    {
      "title": "string",
      "claim": "string",
      "pivot": "new" | "accel" | "cont" | "quiet",
      "confidence": 1-5,
      "evidence": [
        { "when": "string", "text": "string", "type": "internal" | "external" }
      ],
      "forward_signal": "string",
      "job_filter": { "function": "string", "theme": "string" }
    }
  ]
}`;

// ---------------------------------------------------------------------------
// LLM call + parse
// ---------------------------------------------------------------------------

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) return fenced[1];
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj?.[0]) return obj[0];
  return text;
}

export async function generateCompanyEditorial(
  companyId: string,
  companyName: string
): Promise<EditorialOutput> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const ctx = await buildEditorialContext(companyId, companyName);

  const prompt = EDITORIAL_PROMPT.replace(
    "{voice_block}",
    getVoiceDirective("narrative")
  ).replace("{context_block}", formatContextBlock(ctx));

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: EDITORIAL_MODEL,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 6000,
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
      EDITORIAL_TIMEOUT_MS,
      `Editorial generation for "${companyName}"`
    );
  } catch (err) {
    writeUsageEvent(
      recordUsage({
        callSite: "generateCompanyEditorial",
        modelRequested: EDITORIAL_MODEL,
        groundingEnabled: false,
        latencyMs: Date.now() - startMs,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        extra: { companyId, companyName, promptVersion: EDITORIAL_PROMPT_VERSION },
      })
    );
    throw err;
  }

  writeUsageEvent(
    recordUsage({
      callSite: "generateCompanyEditorial",
      modelRequested: EDITORIAL_MODEL,
      groundingEnabled: false,
      usageMetadata: response.response.usageMetadata,
      latencyMs: Date.now() - startMs,
      status: "ok",
      extra: { companyId, companyName, promptVersion: EDITORIAL_PROMPT_VERSION },
    })
  );

  const text = response.response.text()?.trim() ?? "";
  if (!text) {
    throw new Error(`Empty response from Gemini for editorial "${companyName}"`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const candidate = extractJson(text).replace(/,(\s*[}\]])/g, "$1");
    try {
      parsed = JSON.parse(candidate);
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : String(err) },
        `[editorial] JSON parse failed for ${companyName}; preview: ${text.slice(0, 200)}`
      );
      throw new Error(
        `Failed to parse editorial JSON for "${companyName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const result = EditorialOutputSchema.safeParse(parsed);
  if (!result.success) {
    log.error(
      { err: result.error.issues },
      `[editorial] schema validation failed for ${companyName}`
    );
    throw new Error(
      `Editorial schema validation failed for "${companyName}": ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  // Voice check (warnings only — never block). The thesis is a sentence
  // rather than a headline, so it slots into `body`; `last_change` is the
  // closest field to a one-line summary.
  const voice = checkVoice({
    body: result.data.thesis,
    insight_summary: result.data.last_change,
    executive_summary: result.data.interpretation,
  });
  if (!voice.passed) {
    log.warn(
      { warnings: voice.warnings.join("; ") },
      `[voice] editorial warnings for ${companyName}`
    );
  }

  // Stamp synthetic IDs onto bets so the DB row stays stable across renders.
  const stampedBets = result.data.bets.map((b, i) => ({
    ...b,
    id: b.id ?? `bet-${i + 1}`,
  }));

  // Server-side guard against the LLM hallucinating dates outside the 90-day
  // window. We clamp `last_change_at` to [today - 90d, today]; if the model
  // emitted something outside that band, replace it with the most recent
  // posting date (or today as a last resort).
  const todayIso = ctx.todayIso;
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const minIso = ninetyDaysAgo.toISOString().slice(0, 10);
  let lastChangeAt = result.data.last_change_at;
  if (lastChangeAt > todayIso || lastChangeAt < minIso) {
    log.warn(
      {
        emitted: lastChangeAt,
        clampedTo: ctx.mostRecentPostingDate ?? todayIso,
      },
      `[editorial] last_change_at out of range for ${companyName}; clamping`
    );
    lastChangeAt = ctx.mostRecentPostingDate ?? todayIso;
  }

  return {
    ...result.data,
    last_change_at: lastChangeAt,
    bets: stampedBets,
  };
}

// ---------------------------------------------------------------------------
// DB writer
// ---------------------------------------------------------------------------

export async function applyEditorialToCompany(
  companyId: string,
  editorial: EditorialOutput
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("companies")
    .update({
      thesis: editorial.thesis,
      thesis_sub: editorial.thesis_sub || null,
      interpretation: editorial.interpretation,
      last_change: editorial.last_change,
      last_change_at: editorial.last_change_at,
      bets: editorial.bets,
      editorial_generated_at: new Date().toISOString(),
      editorial_prompt_version: EDITORIAL_PROMPT_VERSION,
      editorial_model: EDITORIAL_MODEL,
    })
    .eq("id", companyId);

  if (error) {
    throw new Error(
      `Failed to persist editorial for company ${companyId}: ${error.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Selection helpers — for the regenerate script + cron
// ---------------------------------------------------------------------------

export interface CompaniesNeedingEditorialOptions {
  /** Treat companies generated more than this many days ago as stale. */
  maxAgeDays?: number;
  /** Limit how many we return (cron has a runtime budget). */
  limit?: number;
}

/**
 * Companies whose editorial fields are missing or older than `maxAgeDays`
 * (default 7). Sorted oldest-first so a cron always picks the most stale.
 */
export async function getCompaniesNeedingEditorial(
  options: CompaniesNeedingEditorialOptions = {}
): Promise<Array<{ id: string; name: string; slug: string }>> {
  const { maxAgeDays = 7, limit = 1000 } = options;
  const supabase = createAdminClient();
  const cutoff = subDays(new Date(), maxAgeDays).toISOString();

  const { data } = await supabase
    .from("companies")
    .select("id, name, slug, editorial_generated_at, is_active")
    .eq("is_active", true);

  if (!data) return [];

  const stale = data
    .filter((c) => {
      const stamp = c.editorial_generated_at as string | null;
      if (!stamp) return true; // missing
      return stamp < cutoff;
    })
    .sort((a, b) => {
      const aT = (a.editorial_generated_at as string | null) ?? "";
      const bT = (b.editorial_generated_at as string | null) ?? "";
      return aT.localeCompare(bT);
    })
    .slice(0, limit)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug as string }));

  return stale;
}
