import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";

// POST /api/admin/trigger - Manually trigger a cron job
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const { job_type } = body;

  if (!job_type || !["collect", "report", "tech-stack-backfill", "company-insights-refresh"].includes(job_type)) {
    return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
  }

  const baseUrl = req.nextUrl.origin;
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (job_type === "tech-stack-backfill") {
    // Trigger backfill for all companies with no tech stack
    fetch(`${baseUrl}/api/internal/tech-stack-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ jobRunId: null }),
    }).catch((error) => console.error("Tech stack backfill trigger error:", error));
  } else if (job_type === "company-insights-refresh") {
    fetch(`${baseUrl}/api/internal/company-insights-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ jobRunId: null }),
    }).catch((error) => console.error("Company insights refresh trigger error:", error));
  } else {
    // Fire and forget — don't await the full job, just confirm it started
    fetch(`${baseUrl}/api/cron/${job_type}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch((error) => console.error(`Background ${job_type} job error:`, error));
  }

  return NextResponse.json({
    success: true,
    message: `${job_type} job queued`,
  }, { status: 202 });
}
