import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createJobRun, executeCollectionJob, triggerAnalysisJobIfNeeded } from "@/lib/jobs";

export const maxDuration = 120;

/**
 * POST /api/companies/[id]/process
 * Manually trigger job collection and analysis for a specific company
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const adminSupabase = createAdminClient();

    // Verify user is authenticated and has permission
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!["editor", "admin"].includes(profile?.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get the company
    const { data: company, error: companyError } = await adminSupabase
      .from("companies")
      .select("*")
      .eq("id", id)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (!company.is_active) {
      return NextResponse.json({ error: "Company is not active" }, { status: 400 });
    }

    // Phase 1: Collection (fires immediately)
    const jobRunId = await createJobRun({
      jobType: 'collect',
      triggerType: 'manual',
      triggeredBy: user.id,
      companyIds: [id],
    });

    // Fire and forget - return immediately, process in background
    (async () => {
      try {
        await executeCollectionJob(jobRunId);
        await triggerAnalysisJobIfNeeded(jobRunId); // Auto-trigger Phase 2
      } catch (error) {
        console.error(`Background processing error for job ${jobRunId}:`, error);
      }
    })();

    return NextResponse.json({ jobRunId, status: 'started' });
  } catch (error) {
    console.error("Process company error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
