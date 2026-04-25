import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";

const emailPreferencesSchema = z.object({
  weekly_digest: z.boolean(),
});

/**
 * GET /api/user/email-preferences
 * Fetch current user's email preferences
 */
export async function GET() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email_preferences")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Default to opted in if preferences are null
  const weeklyDigest = profile?.email_preferences?.weekly_digest ?? true;

  return NextResponse.json({
    weekly_digest: weeklyDigest === true || weeklyDigest === "true",
  });
}

/**
 * PUT /api/user/email-preferences
 * Update current user's email preferences
 */
export async function PUT(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = emailPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const emailPreferences = parsed.data;

  const { data, error } = await supabase
    .from("profiles")
    .update({ email_preferences: emailPreferences })
    .eq("id", user.id)
    .select("email_preferences")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    email_preferences: data.email_preferences,
  });
}
