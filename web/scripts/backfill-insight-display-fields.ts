#!/usr/bin/env npx tsx
/**
 * Backfill Insight Display Fields
 * 
 * Generates headline, significance_score, and key_signal for existing
 * company_insights that don't have them yet. Uses Gemini 3 Flash for generation.
 * 
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/backfill-insight-display-fields.ts
 *   # Or with limit:
 *   npx tsx --env-file=.env.local web/scripts/backfill-insight-display-fields.ts --limit=10
 *   # Or mark all as neutral (no AI):
 *   npx tsx --env-file=.env.local web/scripts/backfill-insight-display-fields.ts --neutral
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createAdminClient } from "../lib/supabase/admin";

// ============================================================================
// Types
// ============================================================================

interface InsightRow {
  id: string;
  company_id: string;
  executive_summary: string;
  strategic_hypothesis: string;
  confidence: string;
  new_directions: string[];
  companies: { name: string } | { name: string }[];
}

interface DisplayFields {
  headline: string;
  significance_score: number;
  key_signal: string;
}

// ============================================================================
// AI Generation
// ============================================================================

const BACKFILL_PROMPT = `You are analyzing an existing company strategic insight to generate display fields for a dashboard.

## Company: {company_name}

## Executive Summary:
{executive_summary}

## Strategic Hypothesis:
{strategic_hypothesis}

## New Directions Detected:
{new_directions}

## Your Task:
Generate dashboard display fields for this insight.

**Output a JSON object with exactly these fields:**
{
  "headline": "A punchy 5-8 word headline with ONE emoji at the start (e.g., '🎯 Koho doubles down on SMB')",
  "key_signal": "One sentence explaining the strategic signal",
  "significance_score": 5
}

**Significance Score Guide (1-10):**
- 8-10: Major strategic shift, leadership changes, new market entry
- 5-7: Notable hiring patterns, technology bets, team expansion
- 1-4: Routine hiring, maintenance activities

Be specific and insightful. Avoid generic phrases like "Company is hiring".

Respond with ONLY valid JSON.`;

async function generateDisplayFields(
  companyName: string,
  executiveSummary: string,
  strategicHypothesis: string,
  newDirections: string[]
): Promise<DisplayFields> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 256,
      responseMimeType: "application/json",
    },
  });

  const prompt = BACKFILL_PROMPT
    .replace("{company_name}", companyName)
    .replace("{executive_summary}", executiveSummary.slice(0, 1000))
    .replace("{strategic_hypothesis}", strategicHypothesis.slice(0, 500))
    .replace("{new_directions}", newDirections.slice(0, 5).join(", ") || "None detected");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = result.response.text()?.trim() || "{}";
  
  // Extract JSON from response (handles cases where model adds prose)
  const parsed = extractJSON(text, companyName);

  return {
    headline: String(parsed.headline || `📊 ${companyName} strategic update`).slice(0, 100),
    significance_score: Math.min(10, Math.max(1, parseInt(String(parsed.significance_score), 10) || 5)),
    key_signal: String(parsed.key_signal || "").slice(0, 200),
  };
}

/**
 * Extract JSON from text that may contain prose around it
 */
function extractJSON(text: string, companyName: string): DisplayFields {
  // Try parsing directly first
  try {
    return JSON.parse(text);
  } catch {
    // Look for JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*?"headline"[\s\S]*?"key_signal"[\s\S]*?"significance_score"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through to regex extraction
      }
    }
    
    // Try to extract fields individually using regex
    const headlineMatch = text.match(/"headline"\s*:\s*"([^"]+)"/);
    const keySignalMatch = text.match(/"key_signal"\s*:\s*"([^"]+)"/);
    const scoreMatch = text.match(/"significance_score"\s*:\s*(\d+)/);
    
    return {
      headline: headlineMatch?.[1] || `📊 ${companyName} strategic update`,
      key_signal: keySignalMatch?.[1] || "",
      significance_score: scoreMatch ? parseInt(scoreMatch[1], 10) : 5,
    };
  }
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  const supabase = createAdminClient();

  // Parse command line arguments
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;
  const neutralMode = process.argv.includes("--neutral");

  console.log("🔄 Backfilling Insight Display Fields\n");
  console.log("═".repeat(70));

  if (neutralMode) {
    console.log("Mode: NEUTRAL (setting significance_score=5, no AI generation)\n");
  } else {
    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY environment variable is not set");
      console.log("\nTo set it:");
      console.log("  1. Add GEMINI_API_KEY=your-key to .env.local in the web directory");
      console.log("  2. Or export GEMINI_API_KEY=your-key before running");
      console.log("\nOr use --neutral flag to skip AI generation");
      process.exit(1);
    }
    console.log("Mode: AI-powered headline generation\n");
  }

  // Find insights that need display fields
  let query = supabase
    .from("company_insights")
    .select(`
      id,
      company_id,
      executive_summary,
      strategic_hypothesis,
      confidence,
      new_directions,
      companies!inner(name)
    `)
    .is("headline", null)
    .order("generated_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data: insights, error: fetchError } = await query;

  if (fetchError) {
    console.error("❌ Error fetching insights:", fetchError);
    process.exit(1);
  }

  if (!insights || insights.length === 0) {
    console.log("✅ No insights need backfilling - all insights already have display fields!");
    return;
  }

  console.log(`📋 Found ${insights.length} insight(s) that need display fields\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ id: string; company: string; error: string }> = [];

  // Process each insight
  for (const insight of insights as InsightRow[]) {
    processed++;
    const progress = `[${processed}/${insights.length}]`;
    const company = Array.isArray(insight.companies) 
      ? insight.companies[0] 
      : insight.companies;
    const companyName = company?.name ?? "Unknown";

    console.log(`${progress} Processing: ${companyName}`);

    try {
      let displayFields: DisplayFields;

      if (neutralMode) {
        // Neutral mode: set defaults without AI
        displayFields = {
          headline: `📊 ${companyName} strategic update`,
          significance_score: 5,
          key_signal: insight.strategic_hypothesis?.slice(0, 100) || "",
        };
      } else {
        // AI mode: generate using Gemini
        displayFields = await generateDisplayFields(
          companyName,
          insight.executive_summary,
          insight.strategic_hypothesis,
          insight.new_directions || []
        );
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Update the insight
      const { error: updateError } = await supabase
        .from("company_insights")
        .update({
          headline: displayFields.headline,
          significance_score: displayFields.significance_score,
          key_signal: displayFields.key_signal,
        })
        .eq("id", insight.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      console.log(`  ✅ Headline: ${displayFields.headline}`);
      console.log(`     Score: ${displayFields.significance_score}/10`);
      succeeded++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ Error: ${errorMessage}`);
      errors.push({ id: insight.id, company: companyName, error: errorMessage });
      failed++;
    }
  }

  // Summary
  console.log("\n" + "═".repeat(70));
  console.log("📊 Backfill Complete\n");
  console.log(`Total processed: ${processed}`);
  console.log(`  ✅ Succeeded: ${succeeded}`);
  console.log(`  ❌ Failed: ${failed}`);

  if (errors.length > 0) {
    console.log("\n❌ Errors:");
    for (const err of errors) {
      console.log(`  - ${err.company}: ${err.error}`);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
