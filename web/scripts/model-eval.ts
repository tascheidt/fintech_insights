/**
 * model-eval — run every AI output surface through candidate models and the
 * current production model, score them, and write a decision-ready report.
 *
 * This is the recurring "a new model came out — should we switch?" tool. It
 * drives the REAL production functions (same prompts, parsing, retries) via
 * the eval-only `setEvalModelOverride` seam, with fixture inputs derived from
 * committed data (scripts/model-eval/fixtures.ts). Nothing touches the DB.
 *
 * Per surface it reports: success rate, deterministic scores (golden labels,
 * curated benchmarks, accuracy, schema completeness), agreement with the
 * production model, voice-rule warnings, a position-swapped pairwise LLM
 * judge (narrative surfaces), tokens incl. thinking, $/case, and latency —
 * plus the concrete model each alias actually served (`modelVersion`).
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/model-eval.ts \
 *     --models=<candidate>,<candidate> --judges=<model>[,<model>]
 *
 * Flags:
 *   --models=a,b          Candidate models (required). The production model
 *                         for each surface (SURFACE_MODELS) is always the baseline.
 *   --judges=a,b          Judge model(s) for narrative surfaces. Omit to skip
 *                         judging. Two judges expose self-preference bias.
 *   --surfaces=a,b|all    Surfaces to run (default: all). See MODEL_SURFACES.
 *   --skip=a,b            Surfaces to leave out (e.g. the grounded ones).
 *   --limit=N             Cap cases per surface (smoke runs).
 *   --concurrency=N       Parallel cases per (surface, model). Default 4.
 *   --tag=name            Suffix for the artifact filename.
 *   --dry-run             Print the plan (surfaces × models × cases) and exit.
 *
 * Telemetry: rows are NOT written to gemini_usage_events (the eval sets
 * GEMINI_TELEMETRY_DISABLED=1 unless you pass --telemetry); usage is captured
 * in-process via addUsageObserver instead.
 */

import { AsyncLocalStorage } from "async_hooks";
import { execSync } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

import {
  MODEL_SURFACES,
  SURFACE_MODELS,
  setEvalModelOverride,
  type ModelSurface,
} from "@/lib/ai/prompt-config";
import { addUsageObserver } from "@/lib/ai/gemini-telemetry";
import { isPricedModel } from "@/lib/ai/gemini-pricing";
import type { UsageRecord } from "@/lib/ai/gemini-meter";
import { probeModelVersion } from "@/lib/ai/model-catalog";
import { runJudge, winRate, type CandidateVerdict } from "@/lib/ai/eval/judge";
import { SURFACES, type EvalCase, type Metrics, type SurfaceSpec } from "./model-eval/surfaces";

/** The single metric a surface's deterministic verdict reads. */
const PRIMARY: Partial<Record<ModelSurface, string>> = {
  "job-structure": "golden_l1",
  "job-analysis": "completeness",
  "weekly-digest": "benchmark_fit",
  "tech-stack": "benchmark_fit",
  "company-insight": "completeness",
  "company-editorial": "bets_with_evidence",
  "theme-labels": "group_coverage",
  "search-report": "has_groups",
  "posting-generator": "has_sections",
  "strategy-lab": "has_initiatives",
  "company-research": "type_accuracy",
  "company-news": "news_items",
  "feedback-triage": "drafted_issue",
  categorize: "golden_category",
};

interface Flags {
  models: string[];
  judges: string[];
  surfaces: ModelSurface[];
  limit: number | null;
  concurrency: number;
  tag: string | null;
  dryRun: boolean;
}

function parseFlags(argv: string[]): Flags {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const csv = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  const models = csv(get("models"));
  const wanted = get("surfaces");
  const skip = new Set(csv(get("skip")));
  let surfaces = (!wanted || wanted === "all" ? [...MODEL_SURFACES] : csv(wanted)) as ModelSurface[];
  for (const s of surfaces) if (!MODEL_SURFACES.includes(s)) throw new Error(`Unknown surface: ${s}`);
  surfaces = surfaces.filter((s) => !skip.has(s) && SURFACES.some((x) => x.surface === s));
  if (models.length === 0 && !argv.includes("--dry-run")) throw new Error("--models=<csv> is required");
  if (!argv.includes("--telemetry")) process.env.GEMINI_TELEMETRY_DISABLED = "1";
  return {
    models,
    judges: csv(get("judges")),
    surfaces,
    limit: get("limit") ? Math.max(1, parseInt(get("limit")!, 10)) : null,
    concurrency: Math.max(1, parseInt(get("concurrency") ?? "4", 10) || 4),
    tag: get("tag") ?? null,
    dryRun: argv.includes("--dry-run"),
  };
}

// --------------------------------------------------------------------------
// Usage attribution
// --------------------------------------------------------------------------

interface Tag {
  bucket: string; // `${surface}|${model}|${caseId}` or `judge|...`
}
const als = new AsyncLocalStorage<Tag>();
const usageByBucket = new Map<string, UsageRecord[]>();
addUsageObserver((r) => {
  const bucket = als.getStore()?.bucket ?? "unattributed";
  usageByBucket.set(bucket, [...(usageByBucket.get(bucket) ?? []), r]);
});

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

// --------------------------------------------------------------------------
// Run
// --------------------------------------------------------------------------

interface CaseResult {
  caseId: string;
  ok: boolean;
  error?: string;
  output: unknown;
  latencyMs: number;
  calls: UsageRecord[];
  metrics: Metrics;
  agreement: Metrics;
  voiceWarnings: string[];
  verdicts: Record<string, CandidateVerdict | null>; // judge model → verdict
}

interface ModelRun {
  surface: ModelSurface;
  model: string;
  isBaseline: boolean;
  cases: CaseResult[];
}

async function runSurfaceModel(spec: SurfaceSpec, cases: EvalCase[], model: string, isBaseline: boolean, flags: Flags): Promise<ModelRun> {
  setEvalModelOverride(spec.surface, model);
  try {
    const results = await pool(cases, flags.concurrency, async (c) => {
      const bucket = `${spec.surface}|${model}|${c.id}`;
      const started = Date.now();
      let output: unknown = null;
      let error: string | undefined;
      await als.run({ bucket }, async () => {
        try {
          output = await spec.run(c, model);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      });
      const calls = usageByBucket.get(bucket) ?? [];
      // A function that swallowed every API failure and returned a fallback
      // still failed: require at least one successful call.
      const anyOk = calls.some((u) => u.status === "ok");
      if (!error && output !== null && output !== undefined && calls.length > 0 && !anyOk) {
        error = `all ${calls.length} API calls failed (fallback returned): ${calls[0].errorMessage ?? ""}`.slice(0, 300);
      }
      if (!error && (output === null || output === undefined)) error = "no output";
      const ok = !error;
      process.stderr.write(`  ${ok ? "✓" : "✗"} ${spec.surface} ${model} ${c.id}${ok ? "" : ` — ${error?.slice(0, 120)}`}\n`);
      return {
        caseId: c.id,
        ok,
        error,
        output: ok ? output : null,
        latencyMs: Date.now() - started,
        calls,
        metrics: ok && spec.score ? spec.score(c, output) : {},
        agreement: {},
        voiceWarnings: ok && spec.voice ? spec.voice(output) : [],
        verdicts: {},
      } satisfies CaseResult;
    });
    return { surface: spec.surface, model, isBaseline, cases: results };
  } finally {
    setEvalModelOverride(spec.surface, null);
  }
}

// --------------------------------------------------------------------------
// Aggregation + report
// --------------------------------------------------------------------------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : "–");
const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

interface Summary {
  surface: ModelSurface;
  model: string;
  servedAs: string | null;
  isBaseline: boolean;
  cases: number;
  okRate: number;
  metrics: Record<string, number>;
  agreement: Record<string, number>;
  voicePerCase: number;
  judge: Record<string, { winRate: number; n: number; wins: number; ties: number; losses: number; positionSensitive: number; candMajor: number; baseMajor: number }>;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgThoughtTokens: number;
  usdPerCase: number;
  unpriced: boolean;
  p50LatencyMs: number;
  p95LatencyMs: number;
  errorCalls: number;
  verdict?: string;
}

function summarize(run: ModelRun, servedAs: string | null, judges: string[]): Summary {
  const ok = run.cases.filter((c) => c.ok);
  const metricKeys = [...new Set(ok.flatMap((c) => Object.keys(c.metrics)))];
  const agreeKeys = [...new Set(ok.flatMap((c) => Object.keys(c.agreement)))];
  const calls = run.cases.flatMap((c) => c.calls);
  const judge: Summary["judge"] = {};
  for (const j of judges) {
    const vs = ok.map((c) => c.verdicts[j]).filter((v): v is CandidateVerdict => Boolean(v));
    if (!vs.length) continue;
    judge[j] = {
      winRate: winRate(vs),
      n: vs.length,
      wins: vs.filter((v) => v.outcome === "win").length,
      ties: vs.filter((v) => v.outcome === "tie").length,
      losses: vs.filter((v) => v.outcome === "loss").length,
      positionSensitive: vs.filter((v) => v.positionSensitive).length,
      candMajor: mean(vs.map((v) => v.candidateMajorIssues)),
      baseMajor: mean(vs.map((v) => v.baselineMajorIssues)),
    };
  }
  const n = run.cases.length || 1;
  return {
    surface: run.surface,
    model: run.model,
    servedAs,
    isBaseline: run.isBaseline,
    cases: run.cases.length,
    okRate: ok.length / n,
    metrics: Object.fromEntries(metricKeys.map((k) => [k, mean(ok.map((c) => c.metrics[k]).filter((v): v is number => typeof v === "number"))])),
    agreement: Object.fromEntries(agreeKeys.map((k) => [k, mean(ok.map((c) => c.agreement[k]).filter((v): v is number => typeof v === "number"))])),
    voicePerCase: ok.length ? ok.reduce((a, c) => a + c.voiceWarnings.length, 0) / ok.length : NaN,
    judge,
    avgInputTokens: calls.reduce((a, u) => a + u.inputTokens, 0) / n,
    avgOutputTokens: calls.reduce((a, u) => a + u.outputTokens, 0) / n,
    avgThoughtTokens: calls.reduce((a, u) => a + u.thoughtsTokens, 0) / n,
    usdPerCase: calls.reduce((a, u) => a + u.estimatedUsd, 0) / n,
    unpriced: calls.some((u) => u.status === "ok" && !isPricedModel(u.modelServed)),
    p50LatencyMs: quantile(ok.map((c) => c.latencyMs), 0.5),
    p95LatencyMs: quantile(ok.map((c) => c.latencyMs), 0.95),
    errorCalls: calls.filter((u) => u.status === "error").length,
  };
}

/**
 * Mechanical verdict vs the baseline. A starting point for the human
 * decision, not the decision: it cannot see cost trade-offs you'd accept.
 */
function verdictFor(s: Summary, base: Summary, primary?: string): string {
  const reasons: string[] = [];
  let worse = false;
  let better = false;
  if (s.okRate < base.okRate - 0.001) {
    worse = true;
    reasons.push(`reliability ${pct(s.okRate)} vs ${pct(base.okRate)}`);
  }
  if (primary && Number.isFinite(s.metrics[primary]) && Number.isFinite(base.metrics[primary])) {
    const d = s.metrics[primary] - base.metrics[primary];
    if (d < -0.03) {
      worse = true;
      reasons.push(`${primary} ${num(d, 3)}`);
    } else if (d > 0.03) {
      better = true;
      reasons.push(`${primary} +${num(d, 3)}`);
    }
  }
  const wrs = Object.values(s.judge).map((j) => j.winRate);
  if (wrs.length) {
    const wr = mean(wrs);
    if (wr < 0.4) {
      worse = true;
      reasons.push(`judged win ${pct(wr)}`);
    } else if (wr > 0.6) {
      better = true;
      reasons.push(`judged win ${pct(wr)}`);
    }
  }
  if (Number.isFinite(s.voicePerCase) && Number.isFinite(base.voicePerCase) && s.voicePerCase > base.voicePerCase + 0.5) {
    worse = true;
    reasons.push(`voice warnings ${num(s.voicePerCase, 1)}/case vs ${num(base.voicePerCase, 1)}`);
  }
  const cost = base.usdPerCase > 0 && !s.unpriced ? s.usdPerCase / base.usdPerCase - 1 : NaN;
  const costNote = Number.isFinite(cost) ? `cost ${cost >= 0 ? "+" : ""}${(cost * 100).toFixed(0)}%` : s.unpriced ? "cost unpriced" : "";
  const label = worse && better ? "MIXED" : worse ? "WORSE" : better ? "BETTER" : "PARITY";
  return [label, ...reasons, costNote].filter(Boolean).join(" · ");
}

function renderReport(meta: Record<string, unknown>, summaries: Summary[], specs: SurfaceSpec[], judges: string[]): string {
  const L: string[] = [];
  L.push(`# Model eval — ${meta.date}`);
  L.push("");
  L.push(`- git sha: \`${meta.gitSha}\` · candidates: ${(meta.models as string[]).map((m) => `\`${m}\``).join(", ")} · judges: ${judges.length ? judges.map((j) => `\`${j}\``).join(", ") : "none"}`);
  L.push(`- baseline per surface = production \`SURFACE_MODELS\`. Fixtures: \`scripts/model-eval/fixtures.ts\`.`);
  L.push("");
  L.push("## What each model id actually served");
  L.push("");
  L.push("| requested | served (`modelVersion`) |");
  L.push("|---|---|");
  for (const [m, v] of Object.entries(meta.servedAs as Record<string, string | null>)) L.push(`| \`${m}\` | ${v ? `\`${v}\`` : "probe failed"} |`);
  L.push("");
  L.push("## Verdicts (candidate vs production, per surface)");
  L.push("");
  L.push("| surface | traffic | production | " + (meta.models as string[]).map((m) => `\`${m}\``).join(" | ") + " |");
  L.push("|---|---|---|" + (meta.models as string[]).map(() => "---").join("|") + "|");
  for (const spec of specs) {
    const base = summaries.find((s) => s.surface === spec.surface && s.isBaseline);
    if (!base) continue;
    const cells = (meta.models as string[]).map((m) => {
      if (m === base.model) return "(is production)";
      return summaries.find((s) => s.surface === spec.surface && s.model === m)?.verdict ?? "–";
    });
    L.push(`| ${spec.label} | ${spec.traffic} | \`${base.model}\` | ${cells.join(" | ")} |`);
  }
  L.push("");
  L.push("Verdict rule: WORSE if reliability drops, the primary metric drops >0.03, judged win-rate <40%, or voice warnings rise >0.5/case; BETTER if the primary metric rises >0.03 or judged win-rate >60% with no regression. Ties in the judge count as half a win.");
  L.push("");
  for (const spec of specs) {
    const rows = summaries.filter((s) => s.surface === spec.surface);
    if (!rows.length) continue;
    L.push(`## ${spec.label} (\`${spec.surface}\`)`);
    L.push("");
    L.push(`${spec.traffic}${spec.grounded ? " · grounded" : ""}${spec.userFacing ? " · user-facing" : " · internal"} · ${rows[0].cases} cases${PRIMARY[spec.surface] ? ` · primary metric \`${PRIMARY[spec.surface]}\`` : ""}`);
    L.push("");
    const metricKeys = [...new Set(rows.flatMap((r) => Object.keys(r.metrics)))];
    const agreeKeys = [...new Set(rows.flatMap((r) => Object.keys(r.agreement)))];
    const judgeCols = judges.filter((j) => rows.some((r) => r.judge[j]));
    const head = ["model", "ok", ...metricKeys, ...agreeKeys.map((k) => `${k}`), "voice warn/case", ...judgeCols.map((j) => `judge ${j} win (W/T/L)`), "major issues cand/base", "in tok", "out+think tok", "$/case", "p50 / p95 s", "err calls"];
    L.push(`| ${head.join(" | ")} |`);
    L.push(`|${head.map(() => "---").join("|")}|`);
    for (const r of rows) {
      const jm = Object.values(r.judge);
      L.push(
        "| " +
          [
            `\`${r.model}\`${r.isBaseline ? " (prod)" : ""}`,
            pct(r.okRate),
            ...metricKeys.map((k) => num(r.metrics[k], 3)),
            ...agreeKeys.map((k) => pct(r.agreement[k])),
            num(r.voicePerCase, 1),
            ...judgeCols.map((j) => (r.judge[j] ? `${pct(r.judge[j].winRate)} (${r.judge[j].wins}/${r.judge[j].ties}/${r.judge[j].losses})` : r.isBaseline ? "—" : "–")),
            jm.length ? `${num(mean(jm.map((x) => x.candMajor)), 1)} / ${num(mean(jm.map((x) => x.baseMajor)), 1)}` : "–",
            Math.round(r.avgInputTokens).toLocaleString(),
            `${Math.round(r.avgOutputTokens).toLocaleString()} + ${Math.round(r.avgThoughtTokens).toLocaleString()}`,
            r.unpriced ? "unpriced" : `$${r.usdPerCase.toFixed(5)}`,
            `${num(r.p50LatencyMs / 1000, 1)} / ${num(r.p95LatencyMs / 1000, 1)}`,
            String(r.errorCalls),
          ].join(" | ") +
          " |"
      );
    }
    L.push("");
  }
  return L.join("\n");
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const specsById = new Map(SURFACES.map((s) => [s.surface, s]));
  // Topological order: a surface runs after the surfaces it depends on.
  const ordered: SurfaceSpec[] = [];
  const visit = (id: ModelSurface) => {
    const s = specsById.get(id);
    if (!s || ordered.includes(s)) return;
    for (const d of s.dependsOn ?? []) visit(d);
    ordered.push(s);
  };
  flags.surfaces.forEach(visit);
  const requested = new Set(flags.surfaces);

  const baselineOutputs = new Map<string, unknown>();
  const ctx = { baselineOutput: (s: ModelSurface, id: string) => baselineOutputs.get(`${s}|${id}`) };

  if (flags.dryRun) {
    for (const spec of ordered) {
      const n = spec.dependsOn ? "(depends on earlier output)" : String(Math.min(spec.cases(ctx).length, flags.limit ?? Infinity));
      console.log(`${spec.surface.padEnd(20)} baseline=${SURFACE_MODELS[spec.surface].padEnd(26)} cases=${n} judged=${Boolean(spec.rubric)} grounded=${spec.grounded}`);
    }
    return;
  }
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");

  const allModels = [...new Set([...flags.surfaces.map((s) => SURFACE_MODELS[s]), ...flags.models, ...flags.judges])];
  process.stderr.write(`Probing ${allModels.length} model ids for modelVersion…\n`);
  const servedAs: Record<string, string | null> = {};
  for (const r of await Promise.all(allModels.map((m) => probeModelVersion(m)))) servedAs[r.model] = r.modelVersion;

  const runs: ModelRun[] = [];
  for (const spec of ordered) {
    const baselineModel = SURFACE_MODELS[spec.surface];
    const cases = spec.cases(ctx).slice(0, flags.limit ?? undefined);
    if (!cases.length) {
      process.stderr.write(`\n[${spec.surface}] no cases (dependency produced nothing) — skipped\n`);
      continue;
    }
    process.stderr.write(`\n[${spec.surface}] ${cases.length} cases\n`);
    const base = await runSurfaceModel(spec, cases, baselineModel, true, flags);
    for (const c of base.cases) if (c.ok) baselineOutputs.set(`${spec.surface}|${c.caseId}`, c.output);
    if (requested.has(spec.surface)) runs.push(base);
    else continue; // ran only to feed a dependent surface

    for (const model of flags.models.filter((m) => m !== baselineModel)) {
      const run = await runSurfaceModel(spec, cases, model, false, flags);
      for (const c of run.cases) {
        const b = base.cases.find((x) => x.caseId === c.caseId);
        if (c.ok && b?.ok && spec.agreement) c.agreement = spec.agreement(cases.find((x) => x.id === c.caseId)!, c.output, b.output);
      }
      if (spec.rubric && flags.judges.length) {
        const pairs = run.cases.filter((c) => c.ok && base.cases.find((b) => b.caseId === c.caseId)?.ok);
        await pool(pairs, flags.concurrency, async (c) => {
          const ec = cases.find((x) => x.id === c.caseId)!;
          const b = base.cases.find((x) => x.caseId === c.caseId)!;
          for (const j of flags.judges) {
            await als.run({ bucket: `judge|${spec.surface}|${model}|${c.caseId}|${j}` }, async () => {
              c.verdicts[j] = await runJudge(
                {
                  surfaceLabel: spec.label,
                  rubric: spec.rubric!,
                  userFacing: spec.userFacing,
                  sourceInput: ec.source,
                  candidate: spec.render(c.output),
                  baseline: spec.render(b.output),
                },
                j
              );
            });
          }
        });
      }
      runs.push(run);
    }
  }

  const summaries = runs.map((r) => summarize(r, servedAs[r.model] ?? null, flags.judges));
  for (const s of summaries) {
    const base = summaries.find((b) => b.surface === s.surface && b.isBaseline);
    if (base && !s.isBaseline) s.verdict = verdictFor(s, base, PRIMARY[s.surface]);
  }
  const judgeUsage = [...usageByBucket.entries()].filter(([k]) => k.startsWith("judge|")).flatMap(([, v]) => v);
  const evalUsd = [...usageByBucket.values()].flat().reduce((a, u) => a + u.estimatedUsd, 0);

  const date = new Date().toISOString().slice(0, 10);
  const meta = {
    date,
    gitSha: gitSha(),
    generatedAt: new Date().toISOString(),
    models: flags.models,
    judges: flags.judges,
    surfaces: flags.surfaces,
    servedAs,
    judgeCalls: judgeUsage.length,
    estimatedEvalUsd: Number(evalUsd.toFixed(4)),
    unattributedCalls: usageByBucket.get("unattributed")?.length ?? 0,
  };
  const report = renderReport(meta, summaries, ordered.filter((s) => requested.has(s.surface)), flags.judges);

  const dir = resolve(process.cwd(), "scripts/artifacts");
  await mkdir(dir, { recursive: true });
  const stem = `model-eval-${date}-${meta.gitSha}${flags.tag ? `-${flags.tag}` : ""}`;
  await writeFile(resolve(dir, `${stem}.json`), JSON.stringify({ meta, summaries, runs }, null, 2));
  await writeFile(resolve(dir, `${stem}.md`), report);
  process.stderr.write(`\nartifacts: scripts/artifacts/${stem}.{json,md} · eval spend ≈ $${meta.estimatedEvalUsd} (priced models only)\n`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
