#!/usr/bin/env npx tsx
/**
 * Regenerate company editorial (thesis + bets) for stale or all companies.
 *
 * Usage:
 *   # Stale only (older than 7 days, default)
 *   npx tsx --env-file=.env.local scripts/regenerate-editorial.ts
 *
 *   # All active companies (force):
 *   npx tsx --env-file=.env.local scripts/regenerate-editorial.ts --all
 *
 *   # Single company by slug:
 *   npx tsx --env-file=.env.local scripts/regenerate-editorial.ts --slug wealthsimple
 *
 *   # Refresh cross-company theme labels too:
 *   npx tsx --env-file=.env.local scripts/regenerate-editorial.ts --themes
 *
 * Output: prints per-company progress + a summary. Errors are caught per
 * company so one bad apple doesn't stop the run.
 */

import { createAdminClient } from "../lib/supabase/admin";
import { getIncumbentTrackingEnabled } from "../lib/settings/incumbent-tracking";
import {
  generateCompanyEditorial,
  applyEditorialToCompany,
  getCompaniesNeedingEditorial,
} from "../lib/analysis/company-editorial";
import { refreshAllThemeLabels } from "../lib/analysis/cross-company-themes";

interface Args {
  all: boolean;
  slug: string | null;
  themes: boolean;
  maxAgeDays: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let all = false;
  let slug: string | null = null;
  let themes = false;
  let maxAgeDays = 7;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") all = true;
    else if (a === "--themes") themes = true;
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a === "--max-age-days") {
      const n = Number(argv[++i]);
      if (!Number.isNaN(n) && n > 0) maxAgeDays = n;
    }
  }
  return { all, slug, themes, maxAgeDays };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set");
    process.exit(1);
  }
  const args = parseArgs();
  const supabase = createAdminClient();

  let companies: Array<{ id: string; name: string; slug: string }>;

  if (args.slug) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("slug", args.slug)
      .maybeSingle();
    if (error || !data) {
      console.error(`Company with slug "${args.slug}" not found`);
      process.exit(1);
    }
    companies = [{ id: data.id, name: data.name, slug: data.slug as string }];
  } else if (args.all) {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");
    if (error || !data) {
      console.error("Failed to load companies:", error?.message);
      process.exit(1);
    }
    companies = data.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug as string,
    }));
  } else {
    companies = await getCompaniesNeedingEditorial({ maxAgeDays: args.maxAgeDays });
  }

  // Incumbent gate: when tracking is off, drop tier='incumbent' companies from
  // every mode (all / slug / stale) so the editorial cron doesn't spend Gemini
  // budget on hidden banks. Re-enable from Admin > Settings to include them.
  if (companies.length > 0 && !(await getIncumbentTrackingEnabled(supabase))) {
    const { data: incRows } = await supabase
      .from("companies")
      .select("id")
      .eq("tier", "incumbent");
    const incumbentIds = new Set((incRows ?? []).map((r) => r.id));
    const before = companies.length;
    companies = companies.filter((c) => !incumbentIds.has(c.id));
    const dropped = before - companies.length;
    if (dropped > 0) {
      console.log(
        `Incumbent tracking disabled — skipped ${dropped} incumbent compan${
          dropped === 1 ? "y" : "ies"
        }.`
      );
    }
  }

  console.log(
    `Regenerating editorial for ${companies.length} compan${
      companies.length === 1 ? "y" : "ies"
    } (mode: ${args.slug ? "slug" : args.all ? "all" : `stale > ${args.maxAgeDays}d`})`
  );
  console.log("=".repeat(70));

  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ name: string; error: string }> = [];

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const tag = `[${i + 1}/${companies.length}]`;
    console.log(`${tag} ${c.name} (${c.slug})...`);
    const start = Date.now();
    try {
      const editorial = await generateCompanyEditorial(c.id, c.name);
      await applyEditorialToCompany(c.id, editorial);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `  ok in ${elapsed}s — thesis: "${editorial.thesis.slice(0, 90)}${
          editorial.thesis.length > 90 ? "…" : ""
        }" (${editorial.bets.length} bets)`
      );
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  failed after ${elapsed}s: ${message}`);
      failed++;
      errors.push({ name: c.name, error: message });
    }
  }

  if (args.themes) {
    console.log("\nRefreshing cross-company theme labels...");
    try {
      const labels = await refreshAllThemeLabels();
      console.log(`  ok — ${labels.length} themes labeled`);
    } catch (err) {
      console.log(
        `  failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(`Summary: ${succeeded} succeeded, ${failed} failed`);
  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) console.log(`  - ${e.name}: ${e.error}`);
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
