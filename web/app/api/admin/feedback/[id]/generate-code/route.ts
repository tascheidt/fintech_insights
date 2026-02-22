import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerCodeGenWorkflow } from "@/lib/github";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }

  return { supabase, user };
}

/**
 * POST /api/admin/feedback/[id]/generate-code
 * Triggers the auto-implement GitHub Actions workflow for an accepted feedback issue.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { supabase } = auth;

  const { id } = await params;

  const { data: feedback, error } = await supabase
    .from("feedback_submissions")
    .select("id, status, github_issue_number")
    .eq("id", id)
    .single();

  if (error || !feedback) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  if (feedback.status !== "accepted") {
    return NextResponse.json({ error: "Feedback must be accepted before generating code" }, { status: 400 });
  }

  if (!feedback.github_issue_number) {
    return NextResponse.json({ error: "No GitHub issue linked to this feedback" }, { status: 400 });
  }

  try {
    await triggerCodeGenWorkflow(feedback.github_issue_number);
    return NextResponse.json({ triggered: true, issue_number: feedback.github_issue_number });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to trigger workflow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
