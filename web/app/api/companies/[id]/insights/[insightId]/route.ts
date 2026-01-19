import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCompanyInsight } from "@/lib/analysis/company-insights";

/**
 * GET /api/companies/[id]/insights/[insightId]
 * Get a specific company insight with full details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; insightId: string }> }
) {
  const { id, insightId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user has access to this company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const insight = await getCompanyInsight(insightId);

    if (!insight) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    // Verify the insight belongs to the requested company
    if (insight.companyId !== id) {
      return NextResponse.json({ error: "Insight not found" }, { status: 404 });
    }

    return NextResponse.json({ insight });
  } catch (error) {
    console.error("Error fetching company insight:", error);
    return NextResponse.json(
      { error: "Failed to fetch insight" },
      { status: 500 }
    );
  }
}
