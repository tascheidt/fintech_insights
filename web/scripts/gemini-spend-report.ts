/**
 * gemini-spend-report — read-only rollup of `gemini_usage_events` so we can see
 * WHERE the Gemini money actually goes before/while evaluating open models.
 *
 * The cost-alarm route only looks at a 24h window; this groups a longer window
 * by call-site and by model so the bake-off (and any later migration) is
 * prioritized by real spend.
 *
 * Usage:
 *   cd web
 *   npx tsx --env-file=.env.local scripts/gemini-spend-report.ts --days=30
 *
 * Requires the Supabase service-role env the admin client reads. Read-only.
 */

import { createAdminClient } from "@/lib/supabase/admin";

interface Row {
  call_site: string;
  model_served: string;
  grounding_enabled: boolean | null;
  estimated_usd: number | string | null;
  total_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
}

interface Bucket {
  calls: number;
  usd: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  grounded: number;
}

function emptyBucket(): Bucket {
  return { calls: 0, usd: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, grounded: 0 };
}

function add(b: Bucket, r: Row) {
  b.calls += 1;
  b.usd += typeof r.estimated_usd === "string" ? parseFloat(r.estimated_usd) || 0 : r.estimated_usd ?? 0;
  b.totalTokens += r.total_tokens ?? 0;
  b.inputTokens += r.input_tokens ?? 0;
  b.outputTokens += r.output_tokens ?? 0;
  if (r.grounding_enabled) b.grounded += 1;
}

function table(title: string, buckets: Record<string, Bucket>): string {
  const lines: string[] = [`## ${title}`, ""];
  lines.push("| key | calls | est USD | total tokens | in tokens | out tokens | grounded |");
  lines.push("|---|---|---|---|---|---|---|");
  const sorted = Object.entries(buckets).sort((a, b) => b[1].usd - a[1].usd);
  for (const [key, b] of sorted) {
    lines.push(
      `| \`${key}\` | ${b.calls.toLocaleString()} | $${b.usd.toFixed(4)} | ${b.totalTokens.toLocaleString()} | ${b.inputTokens.toLocaleString()} | ${b.outputTokens.toLocaleString()} | ${b.grounded.toLocaleString()} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const daysArg = process.argv.find((a) => a.startsWith("--days="));
  const days = daysArg ? Math.max(1, parseInt(daysArg.slice("--days=".length), 10) || 30) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const rows: Row[] = [];
  const pageSize = 1000;
  let from = 0;
  // Paginate so we don't silently truncate a busy window.
  for (;;) {
    const { data, error } = await supabase
      .from("gemini_usage_events")
      .select("call_site, model_served, grounding_enabled, estimated_usd, total_tokens, input_tokens, output_tokens")
      .gte("created_at", since)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const byCallSite: Record<string, Bucket> = {};
  const byModel: Record<string, Bucket> = {};
  const total = emptyBucket();
  for (const r of rows) {
    add((byCallSite[r.call_site] ??= emptyBucket()), r);
    add((byModel[r.model_served] ??= emptyBucket()), r);
    add(total, r);
  }

  const out: string[] = [];
  out.push(`# Gemini spend report — last ${days} days`);
  out.push("");
  out.push(`- window start: ${since}`);
  out.push(`- total calls: ${total.calls.toLocaleString()}`);
  out.push(`- total estimated USD: **$${total.usd.toFixed(2)}**`);
  out.push(`- total tokens: ${total.totalTokens.toLocaleString()}`);
  out.push(`- grounded calls: ${total.grounded.toLocaleString()}`);
  out.push("");
  out.push(table("By call site", byCallSite));
  out.push(table("By model served", byModel));

  console.log(out.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
