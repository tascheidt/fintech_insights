/**
 * build-golden-labeler — generate a self-contained HTML labeling tool for
 * authoring the golden extraction set the bake-off scores against
 * (`scripts/fixtures/golden-extraction.json`, shape `{records:[{jobId,expected}]}`).
 *
 * Why a static HTML file: it opens directly in a browser (no server, no CORS),
 * shows each fixture job's description next to an edit form (enum dropdowns for
 * seniority/function, comma-separated arrays, salary + location fields), and
 * downloads the golden JSON in the exact shape `model-bakeoff.ts --reference=golden`
 * expects. Progress auto-saves to localStorage so you can label across sittings.
 *
 * Crucially it PRE-SEEDS each form from a prior bake-off artifact's
 * `gemini-flash-latest` output, so labeling is "verify/correct" not
 * "type-from-blank". Verify each field against the JD, tick "Verified", export.
 *
 * Usage:
 *   cd web
 *   npx tsx scripts/build-golden-labeler.ts
 *   # then: open scripts/golden-labeler.html  (double-click / open in a browser)
 *
 * Flags:
 *   --seed-from=<artifact.json>  Pre-fill from this bake-off artifact's
 *                                gemini-flash-latest run. Default: newest
 *                                extract-structure artifact in scripts/artifacts.
 *   --seed-model=<id>            Which run in the artifact to seed from
 *                                (default: gemini-flash-latest).
 *   --no-seed                    Blank forms (no pre-fill).
 *   --out=<path>                 Output HTML path (default: scripts/golden-labeler.html).
 */

import { readFile, writeFile, readdir } from "fs/promises";
import { resolve } from "path";

import { ROLE_CATEGORIES } from "@/lib/analysis/function-categories";

// Mirrors the seniority enum in lib/analysis/structure.ts (JobStructureSchema).
const SENIORITY_LEVELS = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "lead",
  "executive",
] as const;

interface FixtureJob {
  id: string;
  title: string;
  company_name: string;
  company_slug: string;
  department: string | null;
  location: string | null;
  description_text: string;
}

// Shape we hand to the browser: the JD context + an optional pre-fill `seed`.
interface LabelerJob {
  jobId: string;
  title: string;
  companyName: string;
  companySlug: string;
  rawDepartment: string | null;
  description: string;
  seed: Record<string, unknown> | null;
}

function parseFlags(argv: string[]) {
  let seedFrom: string | null = null;
  let seedModel = "gemini-flash-latest";
  let noSeed = false;
  let out = resolve(process.cwd(), "scripts/golden-labeler.html");
  for (const a of argv) {
    if (a.startsWith("--seed-from=")) seedFrom = a.slice("--seed-from=".length);
    else if (a.startsWith("--seed-model=")) seedModel = a.slice("--seed-model=".length);
    else if (a === "--no-seed") noSeed = true;
    else if (a.startsWith("--out=")) out = resolve(process.cwd(), a.slice("--out=".length));
  }
  return { seedFrom, seedModel, noSeed, out };
}

async function loadFixture(): Promise<FixtureJob[]> {
  const file = resolve(process.cwd(), "scripts/fixtures/gemini-sample-jobs.json");
  const parsed = JSON.parse(await readFile(file, "utf8")) as { jobs: FixtureJob[] };
  return parsed.jobs;
}

/** Find the newest extract-structure bake-off artifact, if any. */
async function newestExtractArtifact(): Promise<string | null> {
  const dir = resolve(process.cwd(), "scripts/artifacts");
  try {
    const files = (await readdir(dir))
      .filter((f) => f.startsWith("bakeoff-extract-structure-") && f.endsWith(".json"))
      .sort();
    return files.length ? resolve(dir, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

/** Build jobId -> seed map from a bake-off artifact's chosen model run. */
async function loadSeed(
  artifactPath: string,
  seedModel: string
): Promise<Map<string, Record<string, unknown>>> {
  const seed = new Map<string, Record<string, unknown>>();
  const parsed = JSON.parse(await readFile(artifactPath, "utf8")) as {
    runs?: { model: string; perJob: { jobId: string; output: Record<string, unknown> | null }[] }[];
  };
  const run = parsed.runs?.find((r) => r.model === seedModel);
  if (!run) return seed;
  for (const p of run.perJob) {
    if (p.output) seed.set(p.jobId, p.output);
  }
  return seed;
}

/** Escape a JSON string so it can't terminate the embedding <script> tag. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function renderHtml(jobs: LabelerJob[], meta: { seededFrom: string | null; seedModel: string }): string {
  const data = {
    jobs,
    seniority: SENIORITY_LEVELS,
    categories: ROLE_CATEGORIES,
    seededFrom: meta.seededFrom,
    seedModel: meta.seedModel,
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Golden Extraction Labeler</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1a1a1a; background: #fafafa; }
  header { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e7e7e7; padding: 12px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { font-size: 15px; margin: 0; font-weight: 600; }
  header .meta { color: #777; font-size: 12px; }
  .progress { font-weight: 600; }
  .progress b { color: #0a7d33; }
  button { font: inherit; padding: 7px 14px; border-radius: 7px; border: 1px solid #d0d0d0; background: #fff; cursor: pointer; }
  button.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  button:hover { background: #f0f0f0; }
  button.primary:hover { background: #333; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 20px; }
  .card { background: #fff; border: 1px solid #e7e7e7; border-radius: 12px; margin-bottom: 20px; overflow: hidden; }
  .card.verified { border-color: #b6e3c4; box-shadow: 0 0 0 1px #b6e3c4 inset; }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #f7f7f7; border-bottom: 1px solid #ededed; }
  .card-head .t { font-weight: 600; }
  .card-head .c { color: #888; font-size: 12px; }
  .card-head .idx { color: #aaa; font-size: 12px; font-variant-numeric: tabular-nums; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .jd { padding: 16px; border-right: 1px solid #ededed; max-height: 560px; overflow: auto; white-space: pre-wrap; font-size: 13px; color: #333; background: #fcfcfc; }
  form { padding: 16px; display: grid; gap: 10px; }
  label { display: grid; gap: 3px; font-size: 12px; color: #666; font-weight: 500; }
  input, select, textarea { font: inherit; padding: 6px 8px; border: 1px solid #d6d6d6; border-radius: 6px; background: #fff; width: 100%; }
  textarea { resize: vertical; min-height: 52px; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .verify { display: flex; align-items: center; gap: 8px; margin-top: 4px; padding-top: 10px; border-top: 1px dashed #e0e0e0; }
  .verify input { width: auto; }
  .verify label { flex-direction: row; align-items: center; font-size: 13px; color: #1a1a1a; font-weight: 600; }
  .hint { color: #999; font-weight: 400; font-size: 11px; }
  @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } .jd { border-right: none; border-bottom: 1px solid #ededed; } }
</style>
</head>
<body>
<header>
  <h1>Golden Extraction Labeler</h1>
  <span class="progress">Verified: <b id="vcount">0</b> / <span id="total">0</span></span>
  <span class="meta" id="seedmeta"></span>
  <span style="flex:1"></span>
  <button id="saveBtn">Save progress</button>
  <button id="resetBtn">Reset</button>
  <button class="primary" id="downloadBtn">Download golden-extraction.json</button>
</header>
<div class="wrap" id="cards"></div>

<script id="data" type="application/json">${safeJson(data)}</script>
<script>
const DATA = JSON.parse(document.getElementById("data").textContent);
const LS_KEY = "golden-labeler-v1";
const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");

function csv(arr) { return Array.isArray(arr) ? arr.join(", ") : ""; }
function fromCsv(s) { return (s || "").split(",").map(x => x.trim()).filter(Boolean); }
function numOrNull(s) { const n = parseInt(s, 10); return Number.isFinite(n) ? n : null; }

// Build the working state: saved value wins, else the Gemini seed, else blank.
function initial(job) {
  if (saved[job.jobId]) return saved[job.jobId];
  const s = job.seed || {};
  const loc = s.location_structured || {};
  return {
    summary: s.summary || "",
    seniority_level: s.seniority_level || "mid",
    salary_min: s.salary_min ?? null,
    salary_max: s.salary_max ?? null,
    salary_currency: s.salary_currency || "USD",
    tech_stack: s.tech_stack || [],
    keywords: s.keywords || [],
    standardized_department: s.standardized_department || "",
    function_category: s.function_category || "other",
    location_structured: { city: loc.city ?? null, state: loc.state ?? null, country: loc.country ?? null, formatted: loc.formatted ?? null },
    _verified: false,
  };
}

const state = {};
for (const job of DATA.jobs) state[job.jobId] = initial(job);

function opts(list, sel) {
  return list.map(v => '<option value="' + v + '"' + (v === sel ? " selected" : "") + ">" + v + "</option>").join("");
}

function render() {
  document.getElementById("total").textContent = DATA.jobs.length;
  document.getElementById("seedmeta").textContent = DATA.seededFrom
    ? "seeded from " + DATA.seedModel + " — verify each field against the JD"
    : "blank forms (no seed)";
  const root = document.getElementById("cards");
  root.innerHTML = "";
  DATA.jobs.forEach((job, i) => {
    const v = state[job.jobId];
    const card = document.createElement("div");
    card.className = "card" + (v._verified ? " verified" : "");
    card.innerHTML =
      '<div class="card-head"><span class="t">' + esc(job.title) + ' <span class="c">' + esc(job.companyName) + '</span></span>' +
      '<span class="idx">' + (i + 1) + " / " + DATA.jobs.length + '</span></div>' +
      '<div class="grid"><div class="jd">' + esc(job.description) + '</div>' +
      '<form data-id="' + job.jobId + '">' +
        field("Summary", '<textarea name="summary">' + esc(v.summary) + '</textarea>') +
        '<div class="row">' +
          field("Seniority", '<select name="seniority_level">' + opts(DATA.seniority, v.seniority_level) + '</select>') +
          field("Function category", '<select name="function_category">' + opts(DATA.categories, v.function_category) + '</select>') +
        '</div>' +
        field("Standardized department", '<input name="standardized_department" value="' + esc(v.standardized_department) + '">') +
        '<div class="row3">' +
          field("Salary min", '<input name="salary_min" type="number" value="' + (v.salary_min ?? "") + '">') +
          field("Salary max", '<input name="salary_max" type="number" value="' + (v.salary_max ?? "") + '">') +
          field("Currency", '<input name="salary_currency" value="' + esc(v.salary_currency) + '">') +
        '</div>' +
        field('Tech stack <span class="hint">comma-separated</span>', '<input name="tech_stack" value="' + esc(csv(v.tech_stack)) + '">') +
        field('Keywords <span class="hint">comma-separated</span>', '<input name="keywords" value="' + esc(csv(v.keywords)) + '">') +
        '<div class="row">' +
          field("Location city", '<input name="loc_city" value="' + esc(v.location_structured.city) + '">') +
          field("Location state", '<input name="loc_state" value="' + esc(v.location_structured.state) + '">') +
        '</div>' +
        '<div class="row">' +
          field("Location country", '<input name="loc_country" value="' + esc(v.location_structured.country) + '">') +
          field("Location formatted", '<input name="loc_formatted" value="' + esc(v.location_structured.formatted) + '">') +
        '</div>' +
        '<div class="verify"><label><input type="checkbox" name="_verified"' + (v._verified ? " checked" : "") + '> Verified</label></div>' +
      '</form></div>';
    root.appendChild(card);
  });
  bind();
  updateCount();
}

function field(labelHtml, inputHtml) { return '<label>' + labelHtml + inputHtml + '</label>'; }
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function bind() {
  document.querySelectorAll("form").forEach(form => {
    const id = form.dataset.id;
    form.addEventListener("input", () => sync(form, id));
    form.addEventListener("change", () => { sync(form, id); render(); window.scrollTo(0, scrollY); });
  });
}

function sync(form, id) {
  const g = (n) => form.querySelector('[name="' + n + '"]');
  const cur = state[id];
  cur.summary = g("summary").value;
  cur.seniority_level = g("seniority_level").value;
  cur.function_category = g("function_category").value;
  cur.standardized_department = g("standardized_department").value;
  cur.salary_min = numOrNull(g("salary_min").value);
  cur.salary_max = numOrNull(g("salary_max").value);
  cur.salary_currency = g("salary_currency").value || "USD";
  cur.tech_stack = fromCsv(g("tech_stack").value);
  cur.keywords = fromCsv(g("keywords").value);
  cur.location_structured = {
    city: g("loc_city").value || null,
    state: g("loc_state").value || null,
    country: g("loc_country").value || null,
    formatted: g("loc_formatted").value || null,
  };
  cur._verified = g("_verified").checked;
  persist();
  updateCount();
}

function updateCount() {
  const n = Object.values(state).filter(v => v._verified).length;
  document.getElementById("vcount").textContent = n;
}
function persist() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

function toRecord(jobId) {
  const v = state[jobId];
  return { jobId, expected: {
    summary: v.summary,
    seniority_level: v.seniority_level,
    salary_min: v.salary_min, salary_max: v.salary_max, salary_currency: v.salary_currency,
    tech_stack: v.tech_stack, keywords: v.keywords,
    standardized_department: v.standardized_department,
    function_category: v.function_category,
    location_structured: v.location_structured,
  }};
}

document.getElementById("downloadBtn").addEventListener("click", () => {
  const records = DATA.jobs.filter(j => state[j.jobId]._verified).map(j => toRecord(j.jobId));
  if (!records.length) { alert("No jobs marked Verified yet. Tick 'Verified' on the rows you've checked."); return; }
  const out = {
    _README: "Human-labeled golden set for the extract-structure bake-off. Generated via golden-labeler.html. Only Verified rows are included.",
    records,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "golden-extraction.json";
  a.click();
  alert("Downloaded " + records.length + " verified record(s).\\nMove the file to scripts/fixtures/golden-extraction.json, then run the bake-off with --reference=golden.");
});

document.getElementById("saveBtn").addEventListener("click", () => { persist(); alert("Progress saved to this browser."); });
document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Clear all saved progress in this browser and reload from the seed?")) return;
  localStorage.removeItem(LS_KEY); location.reload();
});

render();
</script>
</body>
</html>`;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const fixture = await loadFixture();

  let seed = new Map<string, Record<string, unknown>>();
  let seededFrom: string | null = null;
  if (!flags.noSeed) {
    const artifactPath = flags.seedFrom ?? (await newestExtractArtifact());
    if (artifactPath) {
      try {
        seed = await loadSeed(artifactPath, flags.seedModel);
        if (seed.size) seededFrom = artifactPath;
      } catch {
        // Non-fatal — just produce blank forms.
      }
    }
  }

  const jobs: LabelerJob[] = fixture.map((j) => ({
    jobId: j.id,
    title: j.title,
    companyName: j.company_name,
    companySlug: j.company_slug,
    rawDepartment: j.department,
    description: j.description_text,
    seed: seed.get(j.id) ?? null,
  }));

  const html = renderHtml(jobs, { seededFrom, seedModel: flags.seedModel });
  await writeFile(flags.out, html, "utf8");

  console.error(`Wrote ${flags.out}`);
  console.error(`  jobs: ${jobs.length}`);
  console.error(
    seededFrom
      ? `  seeded ${seed.size} form(s) from ${flags.seedModel} in ${seededFrom}`
      : `  no seed (blank forms) — pass --seed-from=<artifact.json> to pre-fill`
  );
  console.error(`\nOpen it in a browser:\n  open ${flags.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
