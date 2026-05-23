/**
 * Cost-gate calibration: read-only audit of the Phase-3 incumbent ramp.
 *
 * After the incumbent ramp we have ~7,500 tier='incumbent' job_postings.
 * The production gate (web/lib/jobs/incumbent-cost-gate.ts + the shared
 * web/lib/analysis/incumbent-signal.ts) only sends staff+ in AI/ML / Data /
 * Risk-AI through the Pro+grounded analyzer. Early RBC numbers showed
 * ~1/50 = 2% pass rate — likely tighter than ideal because the structured
 * extraction enum has no "director"/"vp" literal so those titles get
 * bucketed to other seniority values.
 *
 * This script answers, against live data:
 *   - What fraction of active incumbent rows passes the CURRENT whitelist?
 *   - How does the pass rate move under reasonable alternative whitelists
 *     (e.g. +senior, +product-management at staff+, −aml-financial-crime)?
 *   - Which "near-miss" titles are senior in a whitelisted function — the
 *     borderline staff-vs-senior calls worth a human review?
 *   - How does pass rate vary per bank, so a single weak ATS doesn't pull
 *     the global number down?
 *
 * Read-only. No DB writes, no Gemini calls. Outputs a Markdown report to
 * stdout AND a JSON artifact under `web/scripts/artifacts/`.
 *
 * Usage:
 *   cd web
 *   npx tsx --env-file=.env.local scripts/calibrate-incumbent-gate.ts
 */

import { execSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  INCUMBENT_SIGNAL_FUNCTION_CATEGORIES,
  INCUMBENT_SIGNAL_SENIORITY,
} from "@/lib/analysis/incumbent-signal";

// ---------------------------------------------------------------------------
// Pure helpers — extracted so they can be unit-tested without a live DB.
// ---------------------------------------------------------------------------

export interface JobRow {
  id: string;
  title: string | null;
  seniority_level: string | null;
  function_category: string | null;
  company_id: string;
}

export interface Whitelist {
  name: string;
  description: string;
  seniorities: readonly string[];
  functions: readonly string[];
}

/** Does this job pass the given whitelist (both seniority and function)? */
export function passesWhitelist(job: JobRow, list: Whitelist): boolean {
  if (!job.seniority_level || !job.function_category) return false;
  return (
    list.seniorities.includes(job.seniority_level) &&
    list.functions.includes(job.function_category)
  );
}

/** Distribution: { value -> count, percent } over `rows`, including nulls. */
export function distribute<T, K extends keyof T>(
  rows: T[],
  key: K
): Array<{ value: string; count: number; percent: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[key];
    const v = raw === null || raw === undefined ? "(null)" : String(raw);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      count,
      percent: Number(((count / total) * 100).toFixed(2)),
    }));
}

/** Per-key pass-rate breakdown across a whitelist. */
export function passRateByKey<T extends JobRow>(
  rows: T[],
  list: Whitelist,
  keyFn: (row: T) => string
): Array<{ key: string; total: number; passed: number; rate: number }> {
  const buckets = new Map<string, { total: number; passed: number }>();
  for (const row of rows) {
    const k = keyFn(row);
    const b = buckets.get(k) ?? { total: 0, passed: 0 };
    b.total += 1;
    if (passesWhitelist(row, list)) b.passed += 1;
    buckets.set(k, b);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, v]) => ({
      key,
      total: v.total,
      passed: v.passed,
      rate: Number(((v.passed / Math.max(v.total, 1)) * 100).toFixed(2)),
    }));
}

/**
 * Define the candidate whitelists we want to compare. The first entry IS
 * the production gate (mirrors `incumbent-signal.ts`). Subsequent entries
 * are calibration probes.
 */
export function buildCandidateWhitelists(): Whitelist[] {
  const baseSen = [...INCUMBENT_SIGNAL_SENIORITY];
  const baseFn = [...INCUMBENT_SIGNAL_FUNCTION_CATEGORIES];

  return [
    {
      name: "current (production)",
      description:
        "staff+ seniority in AI/ML / Data / Risk-AI — the live cost gate",
      seniorities: baseSen,
      functions: baseFn,
    },
    {
      name: "+senior",
      description:
        "include `senior` seniority; captures titles that the structured-extraction enum buckets just below staff",
      seniorities: [...baseSen, "senior"],
      functions: baseFn,
    },
    {
      name: "-aml-financial-crime",
      description:
        "drop the AML/financial-crime function in case it's noisy in incumbents",
      seniorities: baseSen,
      functions: baseFn.filter((f) => f !== "aml-financial-crime"),
    },
    {
      name: "+product-management at staff+",
      description:
        "add product-management at the current staff+ bar; captures product hires that drive capability roadmaps",
      seniorities: baseSen,
      functions: [...baseFn, "product-management"],
    },
    {
      name: "+senior +product-management",
      description: "combined widening: senior+ AND product-management added",
      seniorities: [...baseSen, "senior"],
      functions: [...baseFn, "product-management"],
    },
    {
      name: "+engineering-platform-sre-devops at staff+",
      description:
        "include platform/SRE/DevOps staff+ — high-leverage infrastructure hires at incumbents",
      seniorities: baseSen,
      functions: [...baseFn, "engineering-platform-sre-devops"],
    },
  ];
}

// ---------------------------------------------------------------------------
// I/O + report — only the main entrypoint touches DB/file system.
// ---------------------------------------------------------------------------

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
}

async function main() {
  const supabase = createAdminClient();

  // 1. Fetch incumbent companies (live + paused — we want the full universe
  //    so the per-company breakdown shows zero-volume banks too).
  const { data: companies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("tier", "incumbent");

  if (companiesError) {
    console.error("Failed to fetch companies:", companiesError.message);
    process.exit(1);
  }

  const companyMap = new Map<string, CompanyRow>(
    (companies ?? []).map((c) => [c.id, c as CompanyRow])
  );

  // 2. Fetch active incumbent job postings. ~7,500 rows at steady state —
  //    well within a single round-trip (Supabase default page size is 1000,
  //    so we paginate defensively).
  const all: JobRow[] = [];
  const PAGE = 1000;
  let from = 0;
  // Hard ceiling guards against an unbounded loop on a misbehaving server.
  const HARD_CEILING = 50000;
  while (from < HARD_CEILING) {
    const { data, error } = await supabase
      .from("job_postings")
      .select(
        "id, title, seniority_level, function_category, company_id, companies!inner(tier)"
      )
      .eq("companies.tier", "incumbent")
      .eq("is_active", true)
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("Failed to fetch job_postings:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      all.push({
        id: row.id,
        title: row.title ?? null,
        seniority_level: row.seniority_level ?? null,
        function_category: row.function_category ?? null,
        company_id: row.company_id,
      });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // 3. Distributions.
  const seniorityDist = distribute(all, "seniority_level");
  const functionDistAll = distribute(all, "function_category");

  const staffPlus = (INCUMBENT_SIGNAL_SENIORITY as readonly string[]);
  const staffPlusRows = all.filter(
    (r) => r.seniority_level && staffPlus.includes(r.seniority_level)
  );
  const functionDistStaffPlus = distribute(staffPlusRows, "function_category");

  // 4. Per-company corpus counts.
  const perCompanyCounts = passRateByKey(
    all,
    buildCandidateWhitelists()[0],
    (r) => companyMap.get(r.company_id)?.name ?? "(unknown)"
  );

  // 5. Pass-rate simulations.
  const whitelists = buildCandidateWhitelists();
  const simulations = whitelists.map((wl) => {
    const passed = all.filter((r) => passesWhitelist(r, wl)).length;
    return {
      name: wl.name,
      description: wl.description,
      seniorities: [...wl.seniorities],
      functions: [...wl.functions],
      total: all.length,
      passed,
      rate: Number(((passed / Math.max(all.length, 1)) * 100).toFixed(2)),
    };
  });

  // 6. Per-bank pass rate under the CURRENT whitelist (the production gate).
  const perBank = passRateByKey(
    all,
    whitelists[0],
    (r) => companyMap.get(r.company_id)?.name ?? "(unknown)"
  );

  // 7. Near-miss titles: senior in a whitelisted function (would pass under
  //    "+senior"). These are the borderline staff-vs-senior calls.
  const whitelistedFns = new Set<string>(
    INCUMBENT_SIGNAL_FUNCTION_CATEGORIES as readonly string[]
  );
  const nearMisses = all
    .filter(
      (r) =>
        r.seniority_level === "senior" &&
        r.function_category != null &&
        whitelistedFns.has(r.function_category)
    )
    .slice() // copy before sort
    .sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""))
    .slice(0, 20)
    .map((r) => ({
      title: r.title,
      company: companyMap.get(r.company_id)?.name ?? "(unknown)",
      seniority: r.seniority_level,
      function_category: r.function_category,
    }));

  // 8. Emit JSON artifact.
  const sha = gitSha();
  const artifact = {
    scenario: "calibrate-incumbent-gate",
    generatedAt: new Date().toISOString(),
    gitSha: sha,
    totals: {
      incumbentCompanies: companyMap.size,
      activeIncumbentJobs: all.length,
    },
    perCompanyCounts,
    seniorityDistribution: seniorityDist,
    functionDistributionAll: functionDistAll,
    functionDistributionStaffPlus: functionDistStaffPlus,
    simulations,
    perBank,
    nearMisses,
  };

  const outDir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `calibrate-incumbent-gate-${sha}.json`);
  await writeFile(outPath, JSON.stringify(artifact, null, 2));

  // 9. Markdown to stdout.
  const lines: string[] = [];
  lines.push(`# calibrate-incumbent-gate`);
  lines.push("");
  lines.push(`- git sha: \`${sha}\``);
  lines.push(`- generated at: ${artifact.generatedAt}`);
  lines.push(`- incumbent companies (any state): ${companyMap.size}`);
  lines.push(`- active incumbent job_postings: ${all.length}`);
  lines.push("");

  lines.push(`## Per-company active counts`);
  lines.push("");
  lines.push(`| Company | Active jobs | Passing (current gate) | Pass rate |`);
  lines.push(`|---|---:|---:|---:|`);
  for (const row of perCompanyCounts) {
    lines.push(
      `| ${row.key} | ${row.total} | ${row.passed} | ${row.rate.toFixed(2)}% |`
    );
  }
  lines.push("");

  lines.push(`## Seniority distribution (active incumbents)`);
  lines.push("");
  lines.push(`| Seniority | Count | % |`);
  lines.push(`|---|---:|---:|`);
  for (const row of seniorityDist) {
    lines.push(
      `| \`${row.value}\` | ${row.count} | ${row.percent.toFixed(2)}% |`
    );
  }
  lines.push("");

  lines.push(`## Function-category distribution`);
  lines.push("");
  lines.push(`### Across the full corpus`);
  lines.push("");
  lines.push(`| Function | Count | % |`);
  lines.push(`|---|---:|---:|`);
  for (const row of functionDistAll) {
    lines.push(
      `| \`${row.value}\` | ${row.count} | ${row.percent.toFixed(2)}% |`
    );
  }
  lines.push("");
  lines.push(`### Restricted to staff+ seniority`);
  lines.push("");
  lines.push(
    `Of ${staffPlusRows.length} staff+ incumbent postings (${(
      (staffPlusRows.length / Math.max(all.length, 1)) *
      100
    ).toFixed(2)}% of corpus):`
  );
  lines.push("");
  lines.push(`| Function | Count | % of staff+ |`);
  lines.push(`|---|---:|---:|`);
  for (const row of functionDistStaffPlus) {
    lines.push(
      `| \`${row.value}\` | ${row.count} | ${row.percent.toFixed(2)}% |`
    );
  }
  lines.push("");

  lines.push(`## Simulated pass rates`);
  lines.push("");
  lines.push(
    `Pass rate = fraction of ${all.length} active incumbent rows that the candidate whitelist would route to \`analyzeJobAdvanced\` (the Pro+grounded call).`
  );
  lines.push("");
  lines.push(`| Whitelist | Description | Passing | Rate |`);
  lines.push(`|---|---|---:|---:|`);
  for (const sim of simulations) {
    lines.push(
      `| **${sim.name}** | ${sim.description} | ${sim.passed} | ${sim.rate.toFixed(2)}% |`
    );
  }
  lines.push("");

  lines.push(`## Per-bank pass rate (current whitelist)`);
  lines.push("");
  lines.push(`| Bank | Active jobs | Passing | Rate |`);
  lines.push(`|---|---:|---:|---:|`);
  for (const row of perBank) {
    lines.push(
      `| ${row.key} | ${row.total} | ${row.passed} | ${row.rate.toFixed(2)}% |`
    );
  }
  lines.push("");

  lines.push(`## Near-miss titles (senior + whitelisted function)`);
  lines.push("");
  lines.push(
    `Up to 20 jobs where the function IS whitelisted but the seniority is \`senior\` (one notch below the production bar). These are the borderline staff-vs-senior calls — a quick visual scan tells us whether the structured-extraction enum is mis-bucketing director/VP/principal titles.`
  );
  lines.push("");
  lines.push(`| Title | Company | Seniority | Function |`);
  lines.push(`|---|---|---|---|`);
  for (const row of nearMisses) {
    lines.push(
      `| ${row.title ?? "(no title)"} | ${row.company} | \`${row.seniority}\` | \`${row.function_category}\` |`
    );
  }
  if (nearMisses.length === 0) {
    lines.push(`| _(no senior + whitelisted-function rows)_ | | | |`);
  }
  lines.push("");

  lines.push(`---`);
  lines.push(`artifact: ${outPath}`);

  console.log(lines.join("\n"));
}

// Only run when invoked directly via `npx tsx scripts/calibrate-incumbent-gate.ts`.
// The guard exists so tests can import the pure helpers without spinning
// up a Supabase client at module-load time.
const isDirectInvocation =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith("calibrate-incumbent-gate.ts");

if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
