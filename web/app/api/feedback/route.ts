import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const feedbackSchema = z.object({
  type: z.enum(["feature", "bug", "improvement", "general"]),
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters").max(5000),
  pageUrl: z.string().optional(),
});

/**
 * POST /api/feedback — Submit user feedback
 * The database webhook handles async LLM triage via Edge Function.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { type, title, description, pageUrl } = parsed.data;

  const { data, error } = await supabase
    .from("feedback_submissions")
    .insert({
      user_id: user.id,
      type,
      title,
      description,
      page_url: pageUrl || null,
      status: "submitted",
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * GET /api/feedback — Fetch current user's feedback submissions
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("feedback_submissions")
    .select(
      "id, type, title, description, status, triage_decision, triage_confidence, triage_reasoning, triage_suggested_title, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
