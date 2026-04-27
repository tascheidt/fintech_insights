/**
 * Migrate data from SQLite (data/jobs.db) to Supabase PostgreSQL.
 * Run from project root: npx tsx web/scripts/migrate-sqlite.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";

const dbPath = process.env.SQLITE_PATH || path.join(process.cwd(), "data", "jobs.db");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

function toIso(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "number") return new Date(val).toISOString();
  if (typeof val === "string") return new Date(val).toISOString();
  return null;
}

async function main() {
  const db = new Database(dbPath, { readonly: true });

  const { data: orgs } = await supabase.from("organizations").select("id").eq("slug", "default").limit(1);
  let orgId: string;
  if (orgs?.length) {
    orgId = orgs[0].id;
    console.log("Using existing default org", orgId);
  } else {
    const { data: inserted } = await supabase.from("organizations").insert({ name: "Default Organization", slug: "default" }).select("id").single();
    orgId = inserted!.id;
    console.log("Created default org", orgId);
  }

  const companyMap = new Map<number, string>();
  const companies = db.prepare("SELECT * FROM companies").all() as { id: number; name: string; slug: string; country: string; ats_type: string; ats_identifier: string | null; careers_url: string | null; created_at: string }[];
  for (const c of companies) {
    const { data, error } = await supabase
      .from("companies")
      .insert({
        organization_id: orgId,
        name: c.name,
        slug: c.slug,
        country: c.country,
        ats_type: c.ats_type,
        ats_identifier: c.ats_identifier,
        careers_url: c.careers_url,
        is_active: true,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("Company insert error", c.slug, error.message);
      continue;
    }
    companyMap.set(c.id, data!.id);
  }
  console.log("Companies migrated:", companyMap.size);

  const jobMap = new Map<number, string>();
  const jobs = db.prepare("SELECT * FROM job_postings").all() as { id: number; company_id: number; external_id: string; title: string; department: string | null; team: string | null; location: string | null; location_type: string | null; description_html: string | null; description_text: string | null; commitment: string | null; posted_date: string | null; first_seen_date: string | null; last_seen_date: string | null; closed_date: string | null; is_active: number; url: string | null }[];
  for (const j of jobs) {
    const newCompanyId = companyMap.get(j.company_id);
    if (!newCompanyId) continue;
    const { data, error } = await supabase
      .from("job_postings")
      .insert({
        company_id: newCompanyId,
        external_id: j.external_id,
        title: j.title,
        department: j.department,
        team: j.team,
        location: j.location,
        location_type: j.location_type,
        description_html: j.description_html,
        description_text: j.description_text,
        commitment: j.commitment,
        posted_date: toIso(j.posted_date),
        first_seen_date: toIso(j.first_seen_date) || new Date().toISOString(),
        last_seen_date: toIso(j.last_seen_date) || new Date().toISOString(),
        closed_date: toIso(j.closed_date),
        is_active: Boolean(j.is_active),
        url: j.url,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("Job insert error", j.id, error.message);
      continue;
    }
    jobMap.set(j.id, data!.id);
  }
  console.log("Job postings migrated:", jobMap.size);

  const insights = db.prepare("SELECT * FROM strategic_insights").all() as { id: number; job_posting_id: number; run_date: string; category: string | null; insight_summary: string | null; strategic_signals: string; is_new_direction: number; confidence: string | null }[];
  let ins = 0;
  for (const i of insights) {
    const newJobId = jobMap.get(i.job_posting_id);
    if (!newJobId) continue;
    let signals: unknown = [];
    try {
      signals = typeof i.strategic_signals === "string" ? JSON.parse(i.strategic_signals) : i.strategic_signals;
    } catch {}
    const { error } = await supabase.from("strategic_insights").insert({
      job_posting_id: newJobId,
      run_date: toIso(i.run_date) || new Date().toISOString(),
      category: i.category,
      insight_summary: i.insight_summary,
      strategic_signals: Array.isArray(signals) ? signals : [],
      is_new_direction: Boolean(i.is_new_direction),
      confidence: i.confidence,
    });
    if (!error) ins++;
  }
  console.log("Strategic insights migrated:", ins);

  const templates = db.prepare("SELECT * FROM job_templates").all() as { id: number; job_posting_id: number; role_category: string | null; extracted_sections: string; quality_score: number | null; notes: string | null; created_at: string }[];
  let tmpl = 0;
  for (const t of templates) {
    const newJobId = jobMap.get(t.job_posting_id);
    if (!newJobId) continue;
    let sections: unknown = {};
    try {
      sections = typeof t.extracted_sections === "string" ? JSON.parse(t.extracted_sections) : t.extracted_sections;
    } catch {}
    const { error } = await supabase.from("job_templates").insert({
      job_posting_id: newJobId,
      role_category: t.role_category,
      extracted_sections: typeof sections === "object" && sections ? sections : {},
      quality_score: t.quality_score,
      notes: t.notes,
    });
    if (!error) tmpl++;
  }
  console.log("Job templates migrated:", tmpl);

  db.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
