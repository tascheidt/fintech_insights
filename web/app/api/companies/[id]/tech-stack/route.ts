import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractCompanyTechStack, type CompanyTechStack } from "@/lib/ai/tech-stack-extraction";

export const maxDuration = 120;

/**
 * GET /api/companies/[id]/tech-stack
 * Retrieve cached tech stack for a company
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, tech_stack, tech_stack_generated_at")
    .eq("id", id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json({
    techStack: company.tech_stack as CompanyTechStack | null,
    generatedAt: company.tech_stack_generated_at,
  });
}

/**
 * POST /api/companies/[id]/tech-stack
 * Generate/refresh tech stack for a company
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify access
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, organization_id")
    .eq("id", id)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id || company.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: once per 24 hours
  const adminSupabase = createAdminClient();
  const { data: existing } = await adminSupabase
    .from("companies")
    .select("tech_stack_generated_at")
    .eq("id", id)
    .single();

  if (existing?.tech_stack_generated_at) {
    const lastGen = new Date(existing.tech_stack_generated_at).getTime();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (lastGen > oneDayAgo) {
      return NextResponse.json(
        { error: "Tech stack was generated recently. Try again later." },
        { status: 429 }
      );
    }
  }

  // Fetch job postings with descriptions
  const { data: jobs } = await adminSupabase
    .from("job_postings")
    .select("id, title, description_text, first_seen_date")
    .eq("company_id", id)
    .order("first_seen_date", { ascending: false })
    .limit(100);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json(
      { error: "No job postings found for this company" },
      { status: 404 }
    );
  }

  try {
    const techStack = await extractCompanyTechStack(
      company.name,
      jobs.map((j) => ({
        id: j.id,
        title: j.title,
        description_text: j.description_text,
        first_seen_date: j.first_seen_date,
      }))
    );

    // Store the result on the company record
    await adminSupabase
      .from("companies")
      .update({
        tech_stack: techStack,
        tech_stack_generated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ techStack }, { status: 201 });
  } catch (error) {
    console.error("Tech stack generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate tech stack" },
      { status: 500 }
    );
  }
}
