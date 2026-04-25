import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCompanyInsight } from "@/lib/analysis/company-insights";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

const paramsSchema = z.object({
  id: z.string().uuid(),
  insightId: z.string().uuid(),
});

/**
 * GET /api/companies/[id]/insights/[insightId]
 * Get a specific company insight with full details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; insightId: string }> }
) {
  const paramsParsed = paramsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  const { id, insightId } = paramsParsed.data;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

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
    log.error({ err: error }, "Error fetching company insight");
    return NextResponse.json(
      { error: "Failed to fetch insight" },
      { status: 500 }
    );
  }
}
