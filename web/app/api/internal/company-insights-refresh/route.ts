import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCompanyInsight } from "@/lib/analysis/company-insights";
import { requireCronSecret } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 300;

const bodySchema = z.object({
  jobRunId: z.string().uuid().nullable().optional(),
});

interface RefreshDetails {
  mode: "force-refresh-all";
  processedCompanyIds: string[];
  refreshed: number;
  failed: number;
  failures: Array<{ companyId: string; companyName: string; error: string }>;
  lastCompanyId?: string;
  lastCompanyName?: string;
}

function normalizeDetails(value: unknown): RefreshDetails {
  const record = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return {
    mode: "force-refresh-all",
    processedCompanyIds: Array.isArray(record.processedCompanyIds)
      ? record.processedCompanyIds.filter((item): item is string => typeof item === "string")
      : [],
    refreshed: typeof record.refreshed === "number" ? record.refreshed : 0,
    failed: typeof record.failed === "number" ? record.failed : 0,
    failures: Array.isArray(record.failures)
      ? record.failures.filter((item): item is { companyId: string; companyName: string; error: string } => {
          return (
            typeof item === "object" &&
            item !== null &&
            typeof (item as Record<string, unknown>).companyId === "string" &&
            typeof (item as Record<string, unknown>).companyName === "string" &&
            typeof (item as Record<string, unknown>).error === "string"
          );
        })
      : [],
    lastCompanyId: typeof record.lastCompanyId === "string" ? record.lastCompanyId : undefined,
    lastCompanyName: typeof record.lastCompanyName === "string" ? record.lastCompanyName : undefined,
  };
}

async function queueNextInvocation(baseUrl: string, cronSecret: string, jobRunId: string) {
  await fetch(`${baseUrl}/api/internal/company-insights-refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({ jobRunId }),
  });
}

export async function POST(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  const supabase = createAdminClient();

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const baseUrl = req.nextUrl.origin;

  const { data: activeCompanies, error: companiesError } = await supabase
    .from("companies")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (companiesError) {
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  const companies = activeCompanies ?? [];

  let jobRunId = body.jobRunId ?? null;
  let details: RefreshDetails;

  if (!jobRunId) {
    const { data: jobRun, error: jobRunError } = await supabase
      .from("job_runs")
      .insert({
        job_type: "company-insights",
        trigger_type: "admin",
        scope: "all",
        status: "running",
        started_at: new Date().toISOString(),
        total_companies: companies.length,
        details: {
          mode: "force-refresh-all",
          processedCompanyIds: [],
          refreshed: 0,
          failed: 0,
          failures: [],
        },
      })
      .select("id, details")
      .single();

    if (jobRunError || !jobRun) {
      return NextResponse.json(
        { error: jobRunError?.message ?? "Failed to create job run" },
        { status: 500 }
      );
    }

    jobRunId = jobRun.id;
    details = normalizeDetails(jobRun.details);
  } else {
    const { data: jobRun, error: jobRunError } = await supabase
      .from("job_runs")
      .select("id, details")
      .eq("id", jobRunId)
      .single();

    if (jobRunError || !jobRun) {
      return NextResponse.json(
        { error: jobRunError?.message ?? "Job run not found" },
        { status: 404 }
      );
    }

    details = normalizeDetails(jobRun.details);
  }

  const resolvedJobRunId = jobRunId;
  if (!resolvedJobRunId) {
    return NextResponse.json({ error: "Job run not initialized" }, { status: 500 });
  }

  const processedCompanyIds = new Set(details.processedCompanyIds);
  const nextCompany = companies.find((company) => !processedCompanyIds.has(company.id));

  if (!nextCompany) {
    await supabase
      .from("job_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_companies: companies.length,
        total_insights: details.refreshed,
        details: {
          mode: details.mode,
          refreshed: details.refreshed,
          failed: details.failed,
          failures: details.failures,
          lastCompanyId: details.lastCompanyId,
          lastCompanyName: details.lastCompanyName,
        },
      })
      .eq("id", resolvedJobRunId);

    return NextResponse.json({
      success: true,
      completed: true,
      jobRunId: resolvedJobRunId,
      refreshed: details.refreshed,
      failed: details.failed,
    });
  }

  try {
    await generateCompanyInsight(nextCompany.id, nextCompany.name, {
      periodDays: 90,
      researchDepth: "deep",
      compareToPrevious: true,
      forceRegenerate: true,
    });

    details.refreshed += 1;
  } catch (error) {
    details.failed += 1;
    details.failures.push({
      companyId: nextCompany.id,
      companyName: nextCompany.name,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  details.processedCompanyIds.push(nextCompany.id);
  details.lastCompanyId = nextCompany.id;
  details.lastCompanyName = nextCompany.name;

  await supabase
    .from("job_runs")
    .update({
      status: "running",
      company_id: nextCompany.id,
      total_companies: companies.length,
      total_insights: details.refreshed,
      details,
    })
    .eq("id", resolvedJobRunId);

  const remaining = companies.length - details.processedCompanyIds.length;
  if (remaining > 0) {
    queueNextInvocation(baseUrl, cronSecret, resolvedJobRunId).catch((error) => {
      log.error({ err: error }, "Company insight refresh chain error");
    });
  } else {
    await supabase
      .from("job_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_companies: companies.length,
        total_insights: details.refreshed,
        details: {
          mode: details.mode,
          refreshed: details.refreshed,
          failed: details.failed,
          failures: details.failures,
          lastCompanyId: details.lastCompanyId,
          lastCompanyName: details.lastCompanyName,
        },
      })
      .eq("id", resolvedJobRunId);
  }

  return NextResponse.json({
    success: true,
    queued: true,
    jobRunId: resolvedJobRunId,
    companyId: nextCompany.id,
    companyName: nextCompany.name,
    remaining: Math.max(remaining, 0),
  });
}
