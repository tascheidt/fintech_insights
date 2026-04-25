/**
 * Daily Gemini cost alarm.
 *
 * Triggered by `.github/workflows/gemini-cost-alarm.yml` once per day. Sums
 * the last 24h of `gemini_usage_events.estimated_usd`; if the total exceeds
 * `GEMINI_DAILY_USD_THRESHOLD` (default $50) it fires
 * `Sentry.captureMessage(...)` so the on-call rotation gets paged.
 *
 * Auth: `requireCronSecret` — same pattern as `/api/cron/**`. This is the
 * one route under `/api/admin/**` that intentionally does NOT require an
 * admin user, because the GH Actions runner has no Supabase session.
 * Documented in [`web/lib/auth/CLAUDE.md`](../../../../lib/auth/CLAUDE.md).
 */

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronSecret } from "@/lib/auth/guards";
import { log } from "@/lib/log";

export const maxDuration = 60;

const DEFAULT_THRESHOLD_USD = 50;

export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const thresholdUsd = parseThreshold(process.env.GEMINI_DAILY_USD_THRESHOLD);
  const supabase = createAdminClient();

  // Window: last 24h. Sum estimated_usd from `gemini_usage_events`.
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("gemini_usage_events")
    .select("estimated_usd, call_site, model_served")
    .gte("created_at", windowStart);

  if (error) {
    log.error({ err: error.message }, "[cost-alarm] query failed");
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  type Row = { estimated_usd: number | string | null; call_site: string; model_served: string };
  const rows = (data ?? []) as Row[];

  let totalUsd = 0;
  const byCallSite = new Map<string, number>();
  const byModel = new Map<string, number>();
  for (const row of rows) {
    const usd = typeof row.estimated_usd === "string"
      ? parseFloat(row.estimated_usd)
      : (row.estimated_usd ?? 0);
    if (Number.isFinite(usd)) {
      totalUsd += usd;
      byCallSite.set(row.call_site, (byCallSite.get(row.call_site) ?? 0) + usd);
      byModel.set(row.model_served, (byModel.get(row.model_served) ?? 0) + usd);
    }
  }

  const breakdown = {
    byCallSite: Object.fromEntries(byCallSite),
    byModel: Object.fromEntries(byModel),
  };

  log.info(
    { totalUsd, thresholdUsd, eventCount: rows.length },
    "[cost-alarm] daily Gemini spend computed"
  );

  if (totalUsd > thresholdUsd) {
    const message = `[cost-alarm] Daily Gemini spend exceeded $${thresholdUsd.toFixed(2)} (actual: $${totalUsd.toFixed(2)} over ${rows.length} events)`;
    log.warn({ totalUsd, thresholdUsd, breakdown }, message);
    Sentry.captureMessage(message, {
      level: "warning",
      tags: { alarm: "gemini-cost", env: process.env.VERCEL_ENV ?? "development" },
      extra: { totalUsd, thresholdUsd, breakdown, eventCount: rows.length },
    });

    return NextResponse.json({
      alarm: true,
      totalUsd,
      thresholdUsd,
      eventCount: rows.length,
      breakdown,
    });
  }

  return NextResponse.json({
    alarm: false,
    totalUsd,
    thresholdUsd,
    eventCount: rows.length,
  });
}

function parseThreshold(raw: string | undefined): number {
  if (!raw) return DEFAULT_THRESHOLD_USD;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD_USD;
}
