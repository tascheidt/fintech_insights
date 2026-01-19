import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/trigger - Manually trigger a cron job (for testing)
export async function POST(req: NextRequest) {
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
  const { job_type } = body;

  if (!job_type || !["collect", "report"].includes(job_type)) {
    return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
  }

  // Get the base URL for internal API calls
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  try {
    // Call the cron endpoint internally
    const response = await fetch(`${baseUrl}/api/cron/${job_type}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cronSecret}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: result.error || "Job failed" }, { status: response.status });
    }

    return NextResponse.json({ 
      success: true, 
      message: `${job_type} job triggered successfully`,
      result 
    });
  } catch (error) {
    console.error("Trigger job error:", error);
    return NextResponse.json({ error: "Failed to trigger job" }, { status: 500 });
  }
}
