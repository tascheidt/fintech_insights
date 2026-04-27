/**
 * Cross-company theme labeler.
 *
 * The Jobs page right rail shows function-group rollups across companies.
 * The default rollup names ("engineering", "operations-strategy") are
 * mechanical. This module turns a group + its representative keyword bag
 * into an editorial label — "Real-time payments rails", "In-house card
 * issuing" — and a one-line explainer.
 *
 * Output is cached in the `cross_company_themes` table keyed by
 * `category_group`. The cache is invalidated when the keyword bag's hash
 * changes; otherwise stale labels survive across runs.
 *
 * One Gemini call per refresh (Flash, ungrounded — labels don't need search
 * grounding to be useful). Telemetry: writes to `gemini_usage_events`.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getVoiceDirective } from "@/lib/ai/voice";
import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryGroup, type RoleCategory } from "./function-categories";
import { log } from "@/lib/log";

export const THEME_LABELER_PROMPT_VERSION = "cross-company-themes-v1";
export const THEME_LABELER_MODEL = "gemini-flash-latest" as const;
const THEME_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThemeInputBundle {
  /** Function-group key (e.g. "engineering"). Stable identifier. */
  group: string;
  /** Number of companies hiring into this group (active jobs). */
  cos: number;
  /** Total role count across all companies in window. */
  roles: number;
  /** Top keywords (lowercased, count-weighted) representative of the group. */
  keywords: Array<{ keyword: string; count: number }>;
  /** Sample role titles to ground the LLM. */
  sampleTitles: string[];
}

export interface ThemeLabelOutput {
  group: string;
  label: string;
  description: string;
}

const ThemeOutputSchema = z.object({
  themes: z
    .array(
      z.object({
        group: z.string().min(1).max(80),
        label: z.string().min(1).max(80),
        description: z.string().min(1).max(220),
      })
    )
    .min(1),
});

// ---------------------------------------------------------------------------
// Cache lookup + hash
// ---------------------------------------------------------------------------

function bundleHash(bundle: ThemeInputBundle): string {
  const stable = {
    group: bundle.group,
    keywords: bundle.keywords
      .slice()
      .sort((a, b) => a.keyword.localeCompare(b.keyword))
      .map((k) => `${k.keyword}:${k.count}`),
  };
  return createHash("sha256")
    .update(JSON.stringify(stable))
    .digest("hex")
    .slice(0, 16);
}

interface CachedThemeRow {
  category_group: string;
  label: string;
  description: string | null;
  keywords_hash: string | null;
  generated_at: string;
}

/**
 * Reads the cache and returns labels for groups whose hash still matches.
 */
export async function getCachedThemeLabels(
  bundles: ThemeInputBundle[]
): Promise<Map<string, ThemeLabelOutput>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("cross_company_themes")
    .select("category_group, label, description, keywords_hash, generated_at")
    .in(
      "category_group",
      bundles.map((b) => b.group)
    );

  const out = new Map<string, ThemeLabelOutput>();
  if (!data) return out;

  const wantedHash = new Map<string, string>(
    bundles.map((b) => [b.group, bundleHash(b)])
  );

  for (const row of data as CachedThemeRow[]) {
    if (row.keywords_hash && row.keywords_hash !== wantedHash.get(row.category_group)) {
      continue; // bag changed — let the LLM rewrite it
    }
    out.set(row.category_group, {
      group: row.category_group,
      label: row.label,
      description: row.description ?? "",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

const THEME_PROMPT = `{voice_block}

You are giving editorial labels to function-category rollups that span multiple fintech companies. Each rollup is a group of related job postings — your job is to give it a short, evidence-anchored label and a one-sentence description that an industry analyst would recognise.

Rules:
- Labels are 2–5 words, plain English, no hype, no emoji, no exclamation. Examples that work: "Real-time payments rails", "In-house card issuing", "Bilingual Quebec build-out", "Compliance modernisation". Examples that DON'T work: "Engineering excellence", "Building the future", "Innovation at scale".
- The label should describe the *cross-company pattern*, not the function name. Don't just title-case the group.
- The description is one sentence (≤220 chars). Anchor it in evidence: "Multiple fintechs hiring infra + payments roles, signalling investment in real-time payments infrastructure."
- If the keyword bag is too generic to support an editorial label, fall back to a clean restatement of the function group ("Engineering hiring", "Compliance hiring") and a short factual description. Don't invent a theme that isn't supported by keywords.

Inputs (one per group):

{groups_block}

Respond with a single JSON object containing every group exactly once:

{
  "themes": [
    { "group": "<group key from input>", "label": "<2–5 word label>", "description": "<1 sentence>" }
  ]
}`;

function formatGroupsBlock(bundles: ThemeInputBundle[]): string {
  return bundles
    .map((b, i) => {
      const lines: string[] = [];
      lines.push(`### Group ${i + 1}`);
      lines.push(`group: ${b.group}`);
      lines.push(`companies: ${b.cos}`);
      lines.push(`active roles: ${b.roles}`);
      lines.push(
        `top keywords: ${b.keywords
          .slice(0, 20)
          .map((k) => `${k.keyword} (${k.count})`)
          .join(", ") || "(none)"}`
      );
      if (b.sampleTitles.length) {
        lines.push(`sample titles:`);
        for (const t of b.sampleTitles.slice(0, 8)) lines.push(`- ${t}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Generate editorial labels for the given group bundles. One LLM call total.
 */
export async function generateThemeLabels(
  bundles: ThemeInputBundle[]
): Promise<ThemeLabelOutput[]> {
  if (bundles.length === 0) return [];
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");

  const prompt = THEME_PROMPT.replace(
    "{voice_block}",
    getVoiceDirective("narrative")
  ).replace("{groups_block}", formatGroupsBlock(bundles));

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: THEME_LABELER_MODEL,
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 2048,
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
      THEME_TIMEOUT_MS,
      "Theme labeler"
    );
  } catch (err) {
    writeUsageEvent(
      recordUsage({
        callSite: "generateThemeLabels",
        modelRequested: THEME_LABELER_MODEL,
        groundingEnabled: false,
        latencyMs: Date.now() - startMs,
        status: "error",
        errorMessage: err instanceof Error ? err.message : String(err),
        extra: {
          groupCount: bundles.length,
          promptVersion: THEME_LABELER_PROMPT_VERSION,
        },
      })
    );
    throw err;
  }

  writeUsageEvent(
    recordUsage({
      callSite: "generateThemeLabels",
      modelRequested: THEME_LABELER_MODEL,
      groundingEnabled: false,
      usageMetadata: response.response.usageMetadata,
      latencyMs: Date.now() - startMs,
      status: "ok",
      extra: {
        groupCount: bundles.length,
        promptVersion: THEME_LABELER_PROMPT_VERSION,
      },
    })
  );

  const text = response.response.text()?.trim() ?? "";
  if (!text) throw new Error("Empty response from theme labeler");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No JSON found in theme labeler response");
    parsed = JSON.parse(m[0].replace(/,(\s*[}\]])/g, "$1"));
  }

  const result = ThemeOutputSchema.safeParse(parsed);
  if (!result.success) {
    log.error(
      { err: result.error.issues },
      "[theme-labeler] schema validation failed"
    );
    throw new Error(
      `Theme labeler schema validation failed: ${result.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`
    );
  }

  // Filter to groups we actually requested
  const wanted = new Set(bundles.map((b) => b.group));
  return result.data.themes.filter((t) => wanted.has(t.group));
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

export async function persistThemeLabels(
  labels: ThemeLabelOutput[],
  bundlesByGroup: Map<string, ThemeInputBundle>
): Promise<void> {
  if (labels.length === 0) return;
  const supabase = createAdminClient();
  const rows = labels.map((l) => {
    const bundle = bundlesByGroup.get(l.group);
    return {
      category_group: l.group,
      label: l.label,
      description: l.description || null,
      keywords_hash: bundle ? bundleHash(bundle) : null,
      generated_at: new Date().toISOString(),
      prompt_version: THEME_LABELER_PROMPT_VERSION,
      model: THEME_LABELER_MODEL,
    };
  });

  const { error } = await supabase
    .from("cross_company_themes")
    .upsert(rows, { onConflict: "category_group" });

  if (error) {
    throw new Error(`Failed to persist theme labels: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// End-to-end refresh helper
// ---------------------------------------------------------------------------

/**
 * Build input bundles directly from job_postings for the top function groups,
 * call the labeler for any that are missing or stale, and persist results.
 * Returns the cached + fresh labels for downstream UI use.
 */
export async function refreshAllThemeLabels(): Promise<ThemeLabelOutput[]> {
  const supabase = createAdminClient();

  const { data: jobs } = await supabase
    .from("job_postings")
    .select("function_category, keywords, title, company_id, is_active")
    .eq("is_active", true)
    .not("function_category", "is", null);

  if (!jobs?.length) return [];

  const groups = new Map<string, {
    cos: Set<string>;
    roles: number;
    kwCounts: Map<string, number>;
    sampleTitles: string[];
  }>();

  for (const job of jobs) {
    if (!job.function_category) continue;
    const group = getCategoryGroup(job.function_category as RoleCategory);
    if (!groups.has(group)) {
      groups.set(group, {
        cos: new Set(),
        roles: 0,
        kwCounts: new Map(),
        sampleTitles: [],
      });
    }
    const entry = groups.get(group)!;
    entry.cos.add(job.company_id as string);
    entry.roles += 1;

    const kws = (job.keywords ?? []) as string[] | null;
    if (kws) {
      for (const k of kws) {
        const trimmed = k?.trim().toLowerCase();
        if (!trimmed) continue;
        entry.kwCounts.set(trimmed, (entry.kwCounts.get(trimmed) || 0) + 1);
      }
    }
    if (entry.sampleTitles.length < 12 && typeof job.title === "string") {
      entry.sampleTitles.push(job.title);
    }
  }

  const bundles: ThemeInputBundle[] = Array.from(groups.entries())
    .filter(([, entry]) => entry.cos.size >= 2) // cross-company by definition
    .map(([group, entry]) => ({
      group,
      cos: entry.cos.size,
      roles: entry.roles,
      keywords: Array.from(entry.kwCounts.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      sampleTitles: entry.sampleTitles,
    }))
    .sort((a, b) => b.cos - a.cos);

  if (bundles.length === 0) return [];

  const cached = await getCachedThemeLabels(bundles);
  const stale = bundles.filter((b) => !cached.has(b.group));
  const freshLabels = stale.length ? await generateThemeLabels(stale) : [];

  if (freshLabels.length) {
    const map = new Map(bundles.map((b) => [b.group, b]));
    await persistThemeLabels(freshLabels, map);
  }

  // Merge cached + fresh
  const merged: ThemeLabelOutput[] = [];
  for (const b of bundles) {
    const fresh = freshLabels.find((l) => l.group === b.group);
    const cachedHit = cached.get(b.group);
    const chosen = fresh ?? cachedHit ?? null;
    if (chosen) merged.push(chosen);
  }
  return merged;
}
