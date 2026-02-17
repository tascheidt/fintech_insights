import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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
 * GET /api/admin/feedback — Fetch all feedback submissions (admin only)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("feedback_submissions")
    .select(
      `id, type, title, description, page_url, status,
       triage_decision, triage_confidence, triage_reasoning,
       triage_mapped_priority, triage_duplicate_of, triage_suggested_title,
       triage_suggested_labels, triage_completed_at, generated_issue,
       admin_override_decision, admin_notes, reviewed_at,
       created_at, updated_at,
       profiles!feedback_submissions_user_id_fkey(email)`
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

const patchSchema = z.object({
  id: z.string().uuid(),
  admin_override_decision: z.enum(["accepted", "declined"]).optional(),
  admin_notes: z.string().max(2000).optional(),
});

/**
 * PATCH /api/admin/feedback — Admin actions on feedback (accept/decline/note)
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { id, admin_override_decision, admin_notes } = parsed.data;

  const updateData: Record<string, unknown> = {
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };

  if (admin_override_decision) {
    updateData.admin_override_decision = admin_override_decision;
    updateData.status = admin_override_decision;
  }
  if (admin_notes !== undefined) {
    updateData.admin_notes = admin_notes;
  }

  const { data, error } = await supabase
    .from("feedback_submissions")
    .update(updateData)
    .eq("id", id)
    .select("id, status, admin_override_decision, admin_notes, reviewed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
