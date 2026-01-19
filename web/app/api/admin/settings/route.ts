import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("system_settings")
    .update({ 
      setting_value: value,
      updated_by: user.id,
    })
    .eq("setting_key", key)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, setting: data });
}
