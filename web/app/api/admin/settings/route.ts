import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Default descriptions for known system settings (matches migration seed data)
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  job_collection: "Job collection cron schedule",
  weekly_report: "Weekly report email schedule",
  analysis_settings: "Strategic analysis configuration",
  notification_settings: "Notification preferences",
};

// GET /api/admin/settings - Fetch all system settings
export async function GET() {
  const supabase = await createClient();
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
    
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data: settings, error } = await supabase
    .from("system_settings")
    .select("*")
    .order("setting_key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to key-value object for easier consumption
  const settingsMap = (settings ?? []).reduce((acc, s) => {
    acc[s.setting_key] = {
      value: s.setting_value,
      description: s.description,
      updated_at: s.updated_at,
    };
    return acc;
  }, {} as Record<string, { value: unknown; description: string; updated_at: string }>);

  return NextResponse.json({ settings: settingsMap });
}

// PUT /api/admin/settings - Update a specific setting
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
    
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: "Missing key or value" }, { status: 400 });
  }

  // First check if the setting exists (using user session - respects RLS)
  const { data: existing, error: checkError } = await supabase
    .from("system_settings")
    .select("id, description")
    .eq("setting_key", key)
    .maybeSingle();

  if (checkError) {
    return NextResponse.json({ error: checkError.message }, { status: 500 });
  }

  if (existing) {
    // Row exists - update it using user session (respects RLS)
    const { data: updated, error: updateError } = await supabase
      .from("system_settings")
      .update({ 
        setting_value: value,
        updated_by: user.id,
      })
      .eq("setting_key", key)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, setting: updated });
  } else {
    // Row doesn't exist - insert it using admin client (bypasses RLS)
    // Still track the actual user in updated_by
    const adminSupabase = createAdminClient();
    const { data: inserted, error: insertError } = await adminSupabase
      .from("system_settings")
      .insert({
        setting_key: key,
        setting_value: value,
        updated_by: user.id, // Track the actual user who created it
        description: DEFAULT_DESCRIPTIONS[key] ?? "",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, setting: inserted });
  }
}
