/**
 * One-off: sample 20 real jobs for the gemini-compare fixture.
 *
 * Writes `scripts/fixtures/gemini-sample-jobs.json`. Stratified across
 * active companies (up to 4 per company) and filtered to jobs with a
 * non-trivial description (>= 500 chars) so downstream extraction and
 * analysis calls have something meaningful to chew on.
 *
 * Fixture is committed to the repo and regenerated occasionally (roughly
 * annually, or when the active company list changes materially).
 *
 * Usage:
 *   cd web
 *   npx tsx --env-file=.env.local scripts/fixtures/build-gemini-sample-jobs.ts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";

interface FixtureJob {
  id: string;
  title: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  department: string | null;
  location: string | null;
  description_text: string;
}

const TARGET_TOTAL = 30;
const MIN_DESCRIPTION_CHARS = 500;

async function main() {
  const supabase = createAdminClient();

  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (cErr || !companies || companies.length === 0) {
    throw new Error(`Failed to load active companies: ${cErr?.message ?? "none found"}`);
  }

  const perCompany = Math.max(1, Math.ceil(TARGET_TOTAL / companies.length));
  const all: FixtureJob[] = [];

  for (const c of companies) {
    const { data: jobs, error: jErr } = await supabase
      .from("job_postings")
      .select("id, title, department, location, description_text")
      .eq("company_id", c.id)
      .eq("is_active", true)
      .not("description_text", "is", null)
      .order("first_seen_date", { ascending: false })
      .limit(perCompany * 3);

    if (jErr) {
      console.warn(`Skipping ${c.name}: ${jErr.message}`);
      continue;
    }

    const withDesc = (jobs ?? []).filter(
      (j) => (j.description_text ?? "").length >= MIN_DESCRIPTION_CHARS
    );

    for (const j of withDesc.slice(0, perCompany)) {
      all.push({
        id: j.id,
        title: j.title,
        company_id: c.id,
        company_name: c.name,
        company_slug: c.slug,
        department: j.department ?? null,
        location: j.location ?? null,
        description_text: j.description_text as string,
      });
    }
  }

  const sample = all.slice(0, TARGET_TOTAL);

  const fixture = {
    seed: 42,
    generatedAt: new Date().toISOString(),
    targetTotal: TARGET_TOTAL,
    minDescriptionChars: MIN_DESCRIPTION_CHARS,
    companiesIncluded: Array.from(new Set(sample.map((j) => j.company_slug))).sort(),
    count: sample.length,
    jobs: sample,
  };

  const outPath = resolve(process.cwd(), "scripts/fixtures/gemini-sample-jobs.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(fixture, null, 2));

  console.log(`Wrote ${sample.length} jobs to ${outPath}`);
  console.log(`Companies: ${fixture.companiesIncluded.join(", ")}`);

  if (sample.length < TARGET_TOTAL) {
    console.warn(
      `Only ${sample.length}/${TARGET_TOTAL} jobs matched; consider lowering MIN_DESCRIPTION_CHARS or verifying company activity.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
