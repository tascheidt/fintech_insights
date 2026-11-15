/**
 * model-watch — notice when Google ships or rotates a model, so the eval
 * suite gets run before an alias silently changes what production runs on.
 *
 * Compares the live Gemini catalog + what each tracked alias resolves to
 * (probe `modelVersion`) against the committed snapshot in
 * `scripts/fixtures/gemini-model-catalog.json`. No DB, no admin emails —
 * the weekly workflow turns a change into a GitHub issue.
 *
 * Usage (from web/):
 *   npx tsx --env-file=.env.local scripts/model-watch.ts            # report diff
 *   npx tsx --env-file=.env.local scripts/model-watch.ts --update   # accept + rewrite snapshot
 *
 * Exit codes: 0 no change · 2 change detected, or no committed snapshot yet
 * (markdown on stdout) · 1 error. With `--update` it rewrites the snapshot and
 * exits 0 — that is the only path that writes the file.
 */

import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

import { SURFACE_MODELS } from "@/lib/ai/prompt-config";
import {
  diffCatalog,
  isTextGenerationModel,
  listGeminiModels,
  probeModelVersion,
  type CatalogSnapshot,
} from "@/lib/ai/model-catalog";

const SNAPSHOT = resolve(process.cwd(), "scripts/fixtures/gemini-model-catalog.json");

async function main() {
  const update = process.argv.includes("--update");
  process.env.GEMINI_TELEMETRY_DISABLED ??= "1";
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required");

  const catalog = (await listGeminiModels()).filter(isTextGenerationModel);
  const models = catalog.map((m) => m.id);
  // Track every floating alias Google publishes plus whatever production uses.
  const tracked = [...new Set([...models.filter((m) => m.endsWith("-latest")), ...Object.values(SURFACE_MODELS)])].sort();
  const aliases: Record<string, string | null> = {};
  for (const r of await Promise.all(tracked.map((m) => probeModelVersion(m)))) aliases[r.model] = r.modelVersion;

  const next: CatalogSnapshot = { capturedAt: new Date().toISOString(), models, aliases };

  let prev: CatalogSnapshot | null = null;
  try {
    prev = JSON.parse(await readFile(SNAPSHOT, "utf8")) as CatalogSnapshot;
  } catch {
    // First run: no snapshot yet.
  }

  if (update) {
    await writeFile(SNAPSHOT, JSON.stringify({ ...next, catalog }, null, 2) + "\n");
    console.error(`snapshot written: ${models.length} text models, ${tracked.length} tracked aliases`);
    return;
  }

  // No committed baseline: report everything as new rather than silently
  // writing one — in CI a written file is discarded, so a "first run" that
  // exits 0 would repeat forever and never flag a real change.
  const diff = diffCatalog(prev ?? { capturedAt: "none", models: [], aliases: {} }, next);
  // Without a baseline every alias looks "rotated"; only warn on a real change.
  const prodRotations = prev
    ? diff.rotated.filter((r) => Object.values(SURFACE_MODELS).includes(r.alias as never))
    : [];
  // A pinned (non-alias) production model that drops out of the catalog is
  // the July 2026 failure mode: every call 404s. Shout about it.
  const prodRetired = diff.removed.filter((m) => Object.values(SURFACE_MODELS).includes(m as never));
  const lines = [
    prev
      ? `## Gemini model catalog changed (${next.capturedAt.slice(0, 10)})`
      : `## No committed model-catalog snapshot yet — baseline below (${next.capturedAt.slice(0, 10)})`,
    "",
    diff.added.length ? `**New models:** ${diff.added.map((m) => `\`${m}\``).join(", ")}` : "",
    diff.removed.length ? `**Removed models:** ${diff.removed.map((m) => `\`${m}\``).join(", ")}` : "",
    diff.rotated.length
      ? ["**Alias rotations** (what the alias now serves):", ...diff.rotated.map((r) => `- \`${r.alias}\`: \`${r.from ?? "?"}\` → \`${r.to ?? "?"}\``)].join("\n")
      : "",
    prodRotations.length
      ? `\n> ⚠️ ${prodRotations.length} alias(es) used in production rotated — production is already running the new model. Re-run the eval and re-reconcile \`gemini-pricing.ts\`.`
      : "",
    prodRetired.length
      ? `\n> 🚨 Production model(s) no longer listed by the API: ${prodRetired.map((m) => `\`${m}\``).join(", ")}. Calls to a retired pinned id fail outright — move those surfaces in \`SURFACE_MODELS\` now.`
      : "",
    "",
    "### Next steps",
    "1. Run the **Model Eval** workflow (Actions → Model Eval → Run workflow) with the new model ids as candidates,",
    "   or locally: `cd web && npx tsx --env-file=.env.local scripts/model-eval.ts --models=<new ids> --judges=<strongest model>`.",
    "2. Follow the decision runbook in `docs/MODEL_EVALS.md`.",
    "3. Accept the new catalog: `npx tsx --env-file=.env.local scripts/model-watch.ts --update` and commit the snapshot.",
  ].filter(Boolean);

  if (!diff.changed) {
    console.error("no change");
    return;
  }
  console.log(lines.join("\n"));
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
