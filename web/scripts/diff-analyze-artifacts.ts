/**
 * Phase 3 quality check: diff two `analyze-advanced` artifacts (baseline vs
 * candidate) on structured-field agreement (L1) and voice-validator warnings
 * on free-text fields (L2). Writes a markdown summary and a JSON artifact
 * so the comparison is committable alongside a PR.
 *
 * Does NOT call Gemini. Runs offline against two committed artifacts.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/diff-analyze-artifacts.ts \
 *     --baseline=scripts/artifacts/baseline-analyze-advanced-ce4ff9a.json \
 *     --candidate=scripts/artifacts/baseline-analyze-advanced-no-prefetch-a689dae.json
 *
 * Acceptance criteria (Phase 3 plan):
 *   - cost cut >=30%
 *   - L1 agreement (category / is_new_direction / is_executive_movement) >=90%
 *   - L2 voice score not worse by >2 percentage points
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { execSync } from "child_process";
import { checkVoice } from "@/lib/ai/voice-validator";

interface Output {
  category?: string;
  is_new_direction?: boolean;
  is_executive_movement?: boolean;
  confidence?: string;
  novelty_score?: number;
  headline?: string;
  insight_summary?: string;
  what_it_means?: string;
  web_corroboration?: string | null;
}

interface PerJob {
  jobId: string;
  title: string;
  companySlug: string;
  output: Output | null;
}

interface Artifact {
  scenario: string;
  variant?: string;
  totals: { calls: number; estimatedUsd: number; inputTokens: number; outputTokens: number };
  perJob: PerJob[];
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function pct(num: number, den: number): number {
  return den === 0 ? 0 : Number(((num / den) * 100).toFixed(1));
}

function voiceWarnings(output: Output | null): number {
  if (!output) return 0;
  const res = checkVoice({
    headline: output.headline,
    insight_summary: output.insight_summary,
    what_it_means: output.what_it_means,
  });
  return res.warnings?.length ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const baselineFlag = args.find((a) => a.startsWith("--baseline="));
  const candidateFlag = args.find((a) => a.startsWith("--candidate="));
  if (!baselineFlag || !candidateFlag) {
    console.error("Missing --baseline=<path> and/or --candidate=<path>.");
    process.exit(1);
  }
  const baselinePath = baselineFlag.slice("--baseline=".length);
  const candidatePath = candidateFlag.slice("--candidate=".length);

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Artifact;
  const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as Artifact;

  const baseByJob = new Map<string, PerJob>(baseline.perJob.map((p) => [p.jobId, p]));
  const candByJob = new Map<string, PerJob>(candidate.perJob.map((p) => [p.jobId, p]));

  const commonJobIds = [...baseByJob.keys()].filter((id) => candByJob.has(id));

  const fieldStats = {
    category: { match: 0, total: 0 },
    is_new_direction: { match: 0, total: 0 },
    is_executive_movement: { match: 0, total: 0 },
    confidence: { match: 0, total: 0 },
    novelty_score_within_1: { match: 0, total: 0 },
    web_corroboration_populated: { baselineCount: 0, candidateCount: 0, total: 0 },
  };
  const voiceDeltas: Array<{
    jobId: string;
    title: string;
    baselineWarnings: number;
    candidateWarnings: number;
  }> = [];

  const perJobDiffs: Array<{
    jobId: string;
    title: string;
    companySlug: string;
    baseline: Output | null;
    candidate: Output | null;
    fieldAgree: Record<string, boolean | string>;
  }> = [];

  for (const jobId of commonJobIds) {
    const b = baseByJob.get(jobId)!;
    const c = candByJob.get(jobId)!;
    const bo = b.output;
    const co = c.output;

    const agree: Record<string, boolean | string> = {};

    if (bo && co) {
      if (bo.category !== undefined || co.category !== undefined) {
        fieldStats.category.total++;
        const m = bo.category === co.category;
        if (m) fieldStats.category.match++;
        agree.category = m ? "✓" : `${bo.category} → ${co.category}`;
      }
      if (bo.is_new_direction !== undefined || co.is_new_direction !== undefined) {
        fieldStats.is_new_direction.total++;
        const m = bo.is_new_direction === co.is_new_direction;
        if (m) fieldStats.is_new_direction.match++;
        agree.is_new_direction = m ? "✓" : `${bo.is_new_direction} → ${co.is_new_direction}`;
      }
      if (bo.is_executive_movement !== undefined || co.is_executive_movement !== undefined) {
        fieldStats.is_executive_movement.total++;
        const m = bo.is_executive_movement === co.is_executive_movement;
        if (m) fieldStats.is_executive_movement.match++;
        agree.is_executive_movement = m
          ? "✓"
          : `${bo.is_executive_movement} → ${co.is_executive_movement}`;
      }
      if (bo.confidence !== undefined || co.confidence !== undefined) {
        fieldStats.confidence.total++;
        const m = bo.confidence === co.confidence;
        if (m) fieldStats.confidence.match++;
        agree.confidence = m ? "✓" : `${bo.confidence} → ${co.confidence}`;
      }
      if (typeof bo.novelty_score === "number" && typeof co.novelty_score === "number") {
        fieldStats.novelty_score_within_1.total++;
        const m = Math.abs(bo.novelty_score - co.novelty_score) <= 1;
        if (m) fieldStats.novelty_score_within_1.match++;
        agree.novelty_score = m ? `✓ (Δ${co.novelty_score - bo.novelty_score})` : `${bo.novelty_score} → ${co.novelty_score}`;
      }
      fieldStats.web_corroboration_populated.total++;
      if (bo.web_corroboration && bo.web_corroboration.trim().length > 0) {
        fieldStats.web_corroboration_populated.baselineCount++;
      }
      if (co.web_corroboration && co.web_corroboration.trim().length > 0) {
        fieldStats.web_corroboration_populated.candidateCount++;
      }

      voiceDeltas.push({
        jobId,
        title: b.title,
        baselineWarnings: voiceWarnings(bo),
        candidateWarnings: voiceWarnings(co),
      });
    }

    perJobDiffs.push({
      jobId,
      title: b.title,
      companySlug: b.companySlug,
      baseline: bo,
      candidate: co,
      fieldAgree: agree,
    });
  }

  const voiceAggregate = {
    baselineAvgWarnings:
      voiceDeltas.length > 0
        ? voiceDeltas.reduce((s, d) => s + d.baselineWarnings, 0) / voiceDeltas.length
        : 0,
    candidateAvgWarnings:
      voiceDeltas.length > 0
        ? voiceDeltas.reduce((s, d) => s + d.candidateWarnings, 0) / voiceDeltas.length
        : 0,
    regressedJobs: voiceDeltas.filter((d) => d.candidateWarnings > d.baselineWarnings).length,
    improvedJobs: voiceDeltas.filter((d) => d.candidateWarnings < d.baselineWarnings).length,
  };

  const costDeltaUsd = candidate.totals.estimatedUsd - baseline.totals.estimatedUsd;
  const costPercentChange = baseline.totals.estimatedUsd > 0
    ? (costDeltaUsd / baseline.totals.estimatedUsd) * 100
    : 0;

  const l1Pass =
    fieldStats.category.total > 0 &&
    pct(fieldStats.category.match, fieldStats.category.total) >= 90 &&
    pct(fieldStats.is_new_direction.match, fieldStats.is_new_direction.total) >= 90 &&
    pct(fieldStats.is_executive_movement.match, fieldStats.is_executive_movement.total) >= 90;
  const l2Pass =
    voiceAggregate.candidateAvgWarnings - voiceAggregate.baselineAvgWarnings <= 0.02 * Math.max(1, voiceDeltas.length);
  const costPass = costPercentChange <= -30;

  const report = {
    baseline: { path: baselinePath, scenario: baseline.scenario, variant: baseline.variant ?? "default", totals: baseline.totals },
    candidate: { path: candidatePath, scenario: candidate.scenario, variant: candidate.variant ?? "default", totals: candidate.totals },
    commonJobs: commonJobIds.length,
    fieldStats,
    voice: { deltas: voiceDeltas, aggregate: voiceAggregate },
    cost: {
      deltaUsd: Number(costDeltaUsd.toFixed(6)),
      percentChange: Number(costPercentChange.toFixed(2)),
    },
    acceptance: {
      costCutGte30: costPass,
      l1AgreementGte90: l1Pass,
      l2VoiceNotWorse: l2Pass,
      overall: costPass && l1Pass && l2Pass,
    },
    perJobDiffs,
  };

  const outDir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, `diff-analyze-${gitSha()}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));

  // Markdown
  const lines: string[] = [];
  lines.push(`# analyze-advanced diff: baseline vs candidate`);
  lines.push("");
  lines.push(
    `- baseline: \`${baselinePath.split("/").slice(-2).join("/")}\` (variant: ${baseline.variant ?? "default"})`
  );
  lines.push(
    `- candidate: \`${candidatePath.split("/").slice(-2).join("/")}\` (variant: ${candidate.variant ?? "default"})`
  );
  lines.push(`- common jobs: ${commonJobIds.length}`);
  lines.push("");
  lines.push(`## Cost`);
  lines.push(
    `- baseline: ${baseline.totals.calls} calls, $${baseline.totals.estimatedUsd.toFixed(6)}`
  );
  lines.push(
    `- candidate: ${candidate.totals.calls} calls, $${candidate.totals.estimatedUsd.toFixed(6)}`
  );
  lines.push(
    `- delta: $${costDeltaUsd.toFixed(6)} (**${costPercentChange.toFixed(1)}%**)`
  );
  lines.push(`- acceptance (≤-30%): ${costPass ? "**PASS**" : "FAIL"}`);
  lines.push("");
  lines.push(`## L1 — Structured-field agreement`);
  lines.push("");
  lines.push("| field | match / total | agreement |");
  lines.push("|---|---|---|");
  lines.push(
    `| category | ${fieldStats.category.match} / ${fieldStats.category.total} | **${pct(fieldStats.category.match, fieldStats.category.total)}%** |`
  );
  lines.push(
    `| is_new_direction | ${fieldStats.is_new_direction.match} / ${fieldStats.is_new_direction.total} | **${pct(fieldStats.is_new_direction.match, fieldStats.is_new_direction.total)}%** |`
  );
  lines.push(
    `| is_executive_movement | ${fieldStats.is_executive_movement.match} / ${fieldStats.is_executive_movement.total} | **${pct(fieldStats.is_executive_movement.match, fieldStats.is_executive_movement.total)}%** |`
  );
  lines.push(
    `| confidence | ${fieldStats.confidence.match} / ${fieldStats.confidence.total} | ${pct(fieldStats.confidence.match, fieldStats.confidence.total)}% |`
  );
  lines.push(
    `| novelty_score within ±1 | ${fieldStats.novelty_score_within_1.match} / ${fieldStats.novelty_score_within_1.total} | ${pct(fieldStats.novelty_score_within_1.match, fieldStats.novelty_score_within_1.total)}% |`
  );
  lines.push(
    `| web_corroboration populated | baseline ${fieldStats.web_corroboration_populated.baselineCount}/${fieldStats.web_corroboration_populated.total} → candidate ${fieldStats.web_corroboration_populated.candidateCount}/${fieldStats.web_corroboration_populated.total} | — |`
  );
  lines.push(`- acceptance (L1 critical fields ≥90%): ${l1Pass ? "**PASS**" : "FAIL"}`);
  lines.push("");
  lines.push(`## L2 — Voice-validator delta`);
  lines.push(`- baseline avg warnings/job: ${voiceAggregate.baselineAvgWarnings.toFixed(2)}`);
  lines.push(`- candidate avg warnings/job: ${voiceAggregate.candidateAvgWarnings.toFixed(2)}`);
  lines.push(`- improved jobs: ${voiceAggregate.improvedJobs}  /  regressed jobs: ${voiceAggregate.regressedJobs}`);
  lines.push(`- acceptance (≤2pp regression): ${l2Pass ? "**PASS**" : "FAIL"}`);
  lines.push("");
  lines.push(`## Per-job diffs`);
  lines.push("");
  lines.push("| company / title | category | is_new_direction | is_exec | novelty |");
  lines.push("|---|---|---|---|---|");
  for (const d of perJobDiffs) {
    const cells = [
      `${d.companySlug} / ${d.title}`.slice(0, 70),
      String(d.fieldAgree.category ?? "—"),
      String(d.fieldAgree.is_new_direction ?? "—"),
      String(d.fieldAgree.is_executive_movement ?? "—"),
      String(d.fieldAgree.novelty_score ?? "—"),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("");
  lines.push(`**Overall acceptance: ${report.acceptance.overall ? "**PASS**" : "FAIL"}**`);
  lines.push("");
  lines.push(`artifact: ${outPath}`);

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
