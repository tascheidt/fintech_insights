import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/admin";
import { log } from "@/lib/log";

const bodySchema = z.object({
  job_type: z.enum(["collect", "report", "tech-stack-backfill", "company-insights-refresh"]),
});

// POST /api/admin/trigger - Manually trigger a cron job
export async function POST(req: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid job type", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { job_type } = parsed.data;

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
    }).catch((error) => log.error({ err: error }, "Tech stack backfill trigger error"));
  } else if (job_type === "company-insights-refresh") {
    fetch(`${baseUrl}/api/internal/company-insights-refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ jobRunId: null }),
    }).catch((error) => log.error({ err: error }, "Company insights refresh trigger error"));
  } else {
    // Fire and forget — don't await the full job, just confirm it started
    fetch(`${baseUrl}/api/cron/${job_type}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    }).catch((error) => log.error({ err: error, jobType: job_type }, "Background job error"));
  }

  return NextResponse.json({
    success: true,
    message: `${job_type} job queued`,
  }, { status: 202 });
}
