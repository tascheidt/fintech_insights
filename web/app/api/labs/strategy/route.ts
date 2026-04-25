/**
 * Strategy Analysis API Endpoint
 *
 * POST /api/labs/strategy
 *
 * Analyzes a company's job postings to infer strategic initiatives.
 * Requires authentication. Rate-limited by company to prevent abuse.
 *
 * Body: { companyId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import {
  analyzeCompanyStrategy,
  type JobPosting,
} from "@/lib/ai/strategy-analysis";
import { log } from "@/lib/log";

const bodySchema = z.object({
  companyId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { companyId } = parsed.data;

    // Fetch company
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, slug")
      .eq("id", companyId)
      .eq("is_active", true)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Fetch job postings from the last 12 months
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);

    const { data: jobsRaw, error: jobsError } = await supabase
      .from("job_postings")
      .select(
        "id, title, standardized_department, function_category, location, first_seen_date, is_active"
      )
      .eq("company_id", company.id)
      .gte("first_seen_date", cutoff.toISOString())
      .order("first_seen_date", { ascending: false });

    if (jobsError) {
      log.error({ err: jobsError }, "Error fetching jobs for strategy analysis");
      return NextResponse.json(
        { error: "Failed to fetch job data" },
        { status: 500 }
      );
    }

    // Transform to analysis format
    const jobs: JobPosting[] = (jobsRaw ?? []).map((j: Record<string, unknown>) => ({
      id: String(j.id),
      title: String(j.title),
      department: j.standardized_department as string | null,
      function_category: j.function_category as string | null,
      location: j.location as string | null,
      first_seen_date: String(j.first_seen_date),
      is_active: Boolean(j.is_active),
    }));

    // Run analysis
    const result = await analyzeCompanyStrategy(company.name, jobs);

    if (!result) {
      return NextResponse.json(
        { error: "Analysis failed — check API key configuration" },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    log.error({ err: error }, "Strategy analysis API error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
