/**
 * Phase 2 cost projection: given the Phase 1 `extract-structure` baseline
 * and the current fixture, compute the maximum Gemini savings the new
 * description-hash gate can deliver — i.e. the cost that the gate would
 * strip from a second scrape pass against the same jobs, assuming stored
 * hashes match the current description text.
 *
 * Does NOT call Gemini. Runs offline against the committed baseline
 * artifact; writes its own projection artifact under scripts/artifacts/.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/project-hash-gate-savings.ts \
 *     --baseline=scripts/artifacts/baseline-extract-structure-ce4ff9a.json
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

interface BaselineCall {
  estimatedUsd?: number;
}

interface BaselinePerJob {
  jobId: string;
  title: string;
  companySlug: string;
  calls?: BaselineCall[];
}

interface BaselineArtifact {
  perJob: BaselinePerJob[];
  totals: { calls: number; estimatedUsd: number };
}

interface FixtureJob {
  id: string;
  title: string;
  company_slug: string;
  description_text: string;
}

interface FixtureFile {
  jobs: FixtureJob[];
}

async function main() {
  const args = process.argv.slice(2);
  const baselineFlag = args.find((a) => a.startsWith("--baseline="));
  if (!baselineFlag) {
    console.error("Missing --baseline=<path>.");
    process.exit(1);
  }
  const baselinePath = baselineFlag.slice("--baseline=".length);

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as BaselineArtifact;
  const fixturePath = resolve(process.cwd(), "scripts/fixtures/gemini-sample-jobs.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as FixtureFile;
  const fixtureById = new Map<string, FixtureJob>(fixture.jobs.map((j) => [j.id, j]));

  const perJob = baseline.perJob.map((row) => {
    const fjob = fixtureById.get(row.jobId);
    const hash = fjob ? sha1(fjob.description_text) : null;
    const baselineCalls = row.calls?.length ?? 0;
    const baselineUsd = (row.calls ?? []).reduce(
      (s, c) => s + (c.estimatedUsd ?? 0),
      0
    );
    return {
      jobId: row.jobId,
      title: row.title,
      companySlug: row.companySlug,
      descriptionHash: hash,
      wouldSkipIfStoredHashMatches: hash !== null,
      baselineCalls,
      baselineUsd,
    };
  });

  const totalBaselineCalls = baseline.totals.calls;
  const totalBaselineUsd = baseline.totals.estimatedUsd;
  const skipCandidates = perJob.filter((p) => p.wouldSkipIfStoredHashMatches);
  const maxSavedUsd = skipCandidates.reduce((s, p) => s + p.baselineUsd, 0);
  const maxSavedCalls = skipCandidates.reduce((s, p) => s + p.baselineCalls, 0);

  const projection = {
    scenario: "extract-hash-gate-projection",
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    baselineArtifact: baselinePath,
    baselineTotals: { calls: totalBaselineCalls, estimatedUsd: totalBaselineUsd },
    fixtureCount: fixture.jobs.length,
    perJob,
    maxSavings: {
      ifAllStoredHashesMatch: {
        skippedCalls: maxSavedCalls,
        estimatedUsdSaved: Number(maxSavedUsd.toFixed(6)),
        percentOfBaseline:
          totalBaselineUsd > 0 ? Number(((maxSavedUsd / totalBaselineUsd) * 100).toFixed(2)) : 0,
      },
      skipCandidateJobs: skipCandidates.length,
    },
  };

  const outDir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `projection-extract-hash-gate-${gitSha()}.json`);
  await writeFile(outPath, JSON.stringify(projection, null, 2));

  const percent = projection.maxSavings.ifAllStoredHashesMatch.percentOfBaseline;
  const lines: string[] = [];
  lines.push(`# gemini-compare: extract-hash-gate (projection)`);
  lines.push("");
  lines.push(`- git sha: \`${projection.gitSha}\``);
  lines.push(`- baseline: \`${baselinePath.split("/").slice(-2).join("/")}\``);
  lines.push(`- fixture: ${fixture.jobs.length} jobs`);
  lines.push("");
  lines.push(`## Maximum savings`);
  lines.push("");
  lines.push(
    `If every fixture job's stored \`description_hash\` matches the current description text (the normal case right after the Phase-2 backfill runs), the next scrape against this fixture would:`
  );
  lines.push("");
  lines.push(
    `- skip **${maxSavedCalls}** extraction calls (baseline: ${totalBaselineCalls})`
  );
  lines.push(
    `- save **$${maxSavedUsd.toFixed(6)}** (baseline: $${totalBaselineUsd.toFixed(6)}, **${percent.toFixed(1)}%** reduction)`
  );
  lines.push("");
  lines.push(
    `Production savings depend on the daily change rate of job descriptions. Descriptions are typically stable for days to weeks, so after the first scrape post-deploy the gate should skip ≥90% of re-extractions.`
  );
  lines.push("");
  lines.push(`artifact: ${outPath}`);

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
