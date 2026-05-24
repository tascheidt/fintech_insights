/**
 * One-off report generator: AI-relevant Engineering roles (Canadian companies).
 *
 * Produces a complete extract of every Engineering-function job posting from
 * active Canadian companies that has a significant AI component, intended to be
 * fed to a downstream benchmarking agent.
 *
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/report-ai-engineering-roles.ts
 */

import * as fs from "fs";
import { createAdminClient } from "../lib/supabase/admin";

// Supabase v2 collapses long concatenated select strings to `GenericStringError`
// at the type level. The columns selected below are real — we declare the row
// shape locally so callers see proper types.
interface JobRow {
  id: string;
  company_id: string;
  title: string;
  normalized_title: string | null;
  department: string | null;
  team: string | null;
  location: string | null;
  location_type: string | null;
  commitment: string | null;
  seniority_level: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_date: string | null;
  first_seen_date: string | null;
  last_seen_date: string | null;
  closed_date: string | null;
  is_active: boolean;
  url: string | null;
  tech_stack: unknown;
  keywords: string[] | null;
  summary: string | null;
  function_category: string;
  description_text: string | null;
}

interface InsightRow {
  job_posting_id: string;
  category: string | null;
  insight_summary: string | null;
  strategic_signals: unknown;
  strategic_hypothesis: string | null;
  confidence: string | null;
  novelty_score: number | null;
  is_new_direction: boolean | null;
}

// Strong AI / ML signal terms. Deliberately excludes bare "agent" (noisy:
// endpoint agents, support agents) and bare "ML"/"AI". Short acronyms are
// word-bounded so "RAG" does not match inside "stoRAGe", etc.
const AI_PATTERN =
  "machine learning|artificial intelligence|\\bLLMs?\\b|\\bGenAI\\b|generative ai|" +
  "large language model|foundation model|agentic|co-?pilot|prompt engineer|prompting|" +
  "neural network|deep learning|\\bRAG\\b|\\bMLOps\\b|AI/ML|AI-?powered|AI-?assisted|" +
  "AI-?driven|AI agent|AI tool|AI capabilit|AI feature|AI platform|AI model|" +
  "GitHub Copilot|\\bCursor\\b";

const AI_REGEX = new RegExp(`(${AI_PATTERN})`, "gi");
const AI_TITLE_REGEX = /\b(ai|ml|llm|genai|mlops)\b|machine learning|artificial intelligence|generative|data science/i;

function countHits(text: string): number {
  if (!text) return 0;
  const m = text.match(AI_REGEX);
  return m ? m.length : 0;
}

/** Extract de-duplicated ~context windows around each AI term mention. */
function aiSnippets(text: string, maxSnippets = 12): string[] {
  if (!text) return [];
  const snippets: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(AI_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const start = Math.max(0, match.index - 110);
    const end = Math.min(text.length, match.index + match[0].length + 110);
    let snip = text.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) snip = "…" + snip;
    if (end < text.length) snip = snip + "…";
    const key = snip.slice(0, 60).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      snippets.push(snip);
    }
    if (snippets.length >= maxSnippets) break;
  }
  return snippets;
}

function fmtSalary(min: number | null, max: number | null, ccy: string | null): string {
  if (min == null && max == null) return "Not disclosed";
  const c = ccy || "CAD";
  const f = (n: number) => "$" + n.toLocaleString("en-US");
  if (min != null && max != null) return `${f(min)} – ${f(max)} ${c}`;
  if (min != null) return `from ${f(min)} ${c}`;
  return `up to ${f(max as number)} ${c}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

async function main() {
  const supabase = createAdminClient();

  // 1. Active Canadian companies.
  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("id, name, country, is_active")
    .eq("country", "CA")
    .eq("is_active", true);
  if (cErr) throw cErr;
  const companyById = new Map(companies!.map((c) => [c.id, c.name as string]));

  // 2. All Engineering-function postings for those companies.
  const { data: jobsRaw, error: jErr } = await supabase
    .from("job_postings")
    .select(
      "id, company_id, title, normalized_title, department, team, location, location_type, " +
        "commitment, seniority_level, salary_min, salary_max, salary_currency, posted_date, " +
        "first_seen_date, last_seen_date, closed_date, is_active, url, tech_stack, keywords, " +
        "summary, function_category, description_text"
    )
    .in("company_id", Array.from(companyById.keys()))
    .like("function_category", "engineering-%");
  if (jErr) throw jErr;
  const jobs = (jobsRaw ?? []) as unknown as JobRow[];

  // 3. Score and select.
  const selected = jobs
    .map((j) => {
      const hits = countHits(j.description_text || "");
      const aiTitle = AI_TITLE_REGEX.test(j.title || "");
      const isAiMl = j.function_category === "engineering-ai-ml";
      const tier: "A" | "B" | null =
        isAiMl || aiTitle ? "A" : hits >= 4 ? "B" : null;
      return { ...j, hits, aiTitle, tier };
    })
    .filter((j) => j.tier !== null)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === "A" ? -1 : 1;
      const ca = companyById.get(a.company_id)!;
      const cb = companyById.get(b.company_id)!;
      if (ca !== cb) return ca.localeCompare(cb);
      return b.hits - a.hits;
    });

  // 4. Strategic insights for selected jobs.
  const { data: insightsRaw } = await supabase
    .from("strategic_insights")
    .select(
      "job_posting_id, category, insight_summary, strategic_signals, strategic_hypothesis, " +
        "confidence, novelty_score, is_new_direction"
    )
    .in(
      "job_posting_id",
      selected.map((j) => j.id)
    );
  const insights = (insightsRaw ?? []) as unknown as InsightRow[];
  const insightByJob = new Map<string, InsightRow>();
  for (const ins of insights) {
    if (!insightByJob.has(ins.job_posting_id)) insightByJob.set(ins.job_posting_id, ins);
  }

  // 5. Render report.
  const out: string[] = [];
  const now = new Date().toISOString().slice(0, 10);
  const tierA = selected.filter((j) => j.tier === "A");
  const tierB = selected.filter((j) => j.tier === "B");

  out.push("# AI-Relevant Engineering Roles — Competitive Extract");
  out.push("");
  out.push(`*Generated ${now} from the Fintech Talent Brief database.*`);
  out.push("");
  out.push("## Scope & methodology");
  out.push("");
  out.push(
    "This is a complete extract of every Engineering-function job posting (active and " +
      "historical) from **active Canadian companies** in the tracked competitor set, filtered " +
      "to roles with a significant AI component. Monzo (UK) is excluded."
  );
  out.push("");
  out.push(
    `Companies in scope: ${companies!
      .map((c) => c.name)
      .sort()
      .join(", ")}.`
  );
  out.push("");
  out.push("Roles are classified into two tiers:");
  out.push("");
  out.push(
    "- **Tier A — Core AI/ML roles.** The role itself is the AI work: function category is " +
      "`engineering-ai-ml`, or the title names AI / ML / LLM / MLOps / Data Science. " +
      `(${tierA.length} roles.)`
  );
  out.push(
    "- **Tier B — AI-significant engineering roles.** General engineering roles (backend, " +
      "fullstack, mobile, platform, security, QA, data, management) whose description shows a " +
      "significant AI component — building AI features or applying AI across the software " +
      `development lifecycle — with 4+ distinct strong AI-term mentions. (${tierB.length} roles.)`
  );
  out.push("");
  out.push(
    "`AI hits` = count of strong AI/ML term mentions in the job description (machine learning, " +
      "LLM, GenAI, agentic, copilot, MLOps, AI-powered/-assisted/-driven, prompt engineering, " +
      "RAG, etc.). Bare 'agent' and 'ML' are excluded as noise. Use it as a relevance signal, " +
      "not an absolute measure."
  );
  out.push("");
  out.push(
    "Salary fields reflect what each posting disclosed; many Canadian postings disclose no band."
  );
  out.push("");

  // Summary table.
  out.push("## Summary table");
  out.push("");
  out.push(
    "| # | Tier | Company | Title | Function | Seniority | Salary | Location | Active | AI hits |"
  );
  out.push("|---|---|---|---|---|---|---|---|---|---|");
  selected.forEach((j, i) => {
    out.push(
      `| ${i + 1} | ${j.tier} | ${companyById.get(j.company_id)} | ${j.title.trim()} | ${
        j.function_category
      } | ${j.seniority_level || "—"} | ${fmtSalary(
        j.salary_min,
        j.salary_max,
        j.salary_currency
      )} | ${(j.location || "—").trim()} | ${j.is_active ? "yes" : "no"} | ${j.hits} |`
    );
  });
  out.push("");

  // Salary roll-up.
  out.push("## Disclosed salary bands (quick reference)");
  out.push("");
  out.push("| Company | Title | Seniority | Band |");
  out.push("|---|---|---|---|");
  selected
    .filter((j) => j.salary_min != null || j.salary_max != null)
    .forEach((j) => {
      out.push(
        `| ${companyById.get(j.company_id)} | ${j.title.trim()} | ${
          j.seniority_level || "—"
        } | ${fmtSalary(j.salary_min, j.salary_max, j.salary_currency)} |`
      );
    });
  out.push("");

  // Full per-role detail.
  out.push("## Full role extracts");
  out.push("");
  selected.forEach((j, i) => {
    const company = companyById.get(j.company_id)!;
    out.push(`### ${i + 1}. ${j.title.trim()} — ${company}`);
    out.push("");
    out.push(`- **Tier:** ${j.tier} (${j.tier === "A" ? "core AI/ML" : "AI-significant"})`);
    out.push(`- **Company:** ${company}`);
    out.push(`- **Function category:** ${j.function_category}`);
    out.push(`- **Normalized title:** ${j.normalized_title || "—"}`);
    out.push(`- **Seniority level:** ${j.seniority_level || "—"}`);
    out.push(`- **Department:** ${j.department || "—"}`);
    out.push(`- **Team:** ${j.team || "—"}`);
    out.push(`- **Location:** ${(j.location || "—").trim()}  (${j.location_type || "—"})`);
    out.push(`- **Commitment:** ${j.commitment || "—"}`);
    out.push(`- **Salary:** ${fmtSalary(j.salary_min, j.salary_max, j.salary_currency)}`);
    out.push(`- **Currently active:** ${j.is_active ? "yes" : "no"}`);
    out.push(
      `- **Posted:** ${fmtDate(j.posted_date)}  |  **First seen:** ${fmtDate(
        j.first_seen_date
      )}  |  **Last seen:** ${fmtDate(j.last_seen_date)}  |  **Closed:** ${fmtDate(
        j.closed_date
      )}`
    );
    out.push(`- **AI hits:** ${j.hits}`);
    out.push(`- **URL:** ${j.url || "—"}`);

    const tech = j.tech_stack;
    if (tech && (Array.isArray(tech) ? tech.length : Object.keys(tech).length)) {
      out.push(`- **Tech stack:** ${JSON.stringify(tech)}`);
    }
    const kw = j.keywords as string[] | null;
    if (kw && kw.length) out.push(`- **Keywords:** ${kw.join(", ")}`);
    out.push("");

    if (j.summary) {
      out.push(`**Summary:** ${j.summary}`);
      out.push("");
    }

    const ins = insightByJob.get(j.id);
    if (ins) {
      out.push("**Strategic insight (AI-analyzed):**");
      out.push("");
      if (ins.insight_summary) out.push(`- Summary: ${ins.insight_summary}`);
      if (ins.strategic_hypothesis) out.push(`- Hypothesis: ${ins.strategic_hypothesis}`);
      if (ins.category) out.push(`- Category: ${ins.category}`);
      if (ins.confidence) out.push(`- Confidence: ${ins.confidence}`);
      if (ins.novelty_score != null) out.push(`- Novelty score: ${ins.novelty_score}`);
      if (ins.strategic_signals)
        out.push(`- Signals: ${JSON.stringify(ins.strategic_signals)}`);
      out.push("");
    }

    const snips = aiSnippets(j.description_text || "");
    if (snips.length) {
      out.push("**AI-context snippets (from description):**");
      out.push("");
      snips.forEach((s) => out.push(`> ${s}`));
      out.push("");
    }

    out.push("**Full job description:**");
    out.push("");
    out.push("```text");
    out.push((j.description_text || "(no description text stored)").trim());
    out.push("```");
    out.push("");
    out.push("---");
    out.push("");
  });

  const path = "reports/ai-engineering-roles-extract.md";
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(path, out.join("\n"), "utf8");
  console.log(`Wrote ${selected.length} roles (Tier A: ${tierA.length}, Tier B: ${tierB.length}) to ${path}`);
  console.log(`Report size: ${(out.join("\n").length / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
