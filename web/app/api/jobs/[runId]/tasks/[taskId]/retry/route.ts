import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { retryTask } from "@/lib/jobs";

/**
 * POST /api/jobs/[runId]/tasks/[taskId]/retry
 * Retry a failed task from a specific stage
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const supabase = await createClient();

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

    const body = await req.json().catch(() => ({}));
    const { fromStage } = body;

    // Retry task (fire and forget)
    retryTask(taskId, fromStage).catch(console.error);

    return NextResponse.json({ success: true, message: "Task retry initiated" });
  } catch (error) {
    console.error("Retry task error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
