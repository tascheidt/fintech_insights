import { NextRequest, NextResponse } from "next/server";
import { refreshTechStacksForCompanies } from "@/lib/jobs";

export const maxDuration = 300;

/**
 * POST /api/internal/tech-stack-refresh
 * Internal endpoint called by the collect cron to refresh tech stacks
 * in a separate serverless invocation (its own timeout budget).
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobRunId } = (await req.json()) as { jobRunId: string };
  if (!jobRunId) {
    return NextResponse.json({ error: "jobRunId required" }, { status: 400 });
  }

  console.log(`Tech stack refresh started for job run: ${jobRunId}`);

  try {
    const result = await refreshTechStacksForCompanies(jobRunId);
    console.log("Tech stack refresh complete:", result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Tech stack refresh error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
