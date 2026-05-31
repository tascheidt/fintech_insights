/**
 * Daily Gemini cost alarm.
 *
 * Triggered by `.github/workflows/gemini-cost-alarm.yml` once per day over the
 * last 24h of `gemini_usage_events`. Fires `Sentry.captureMessage(...)` if ANY
 * of three independent tripwires trips:
 *
 *   1. Calibrated USD   — `SUM(estimated_usd)` with the grounded portion scaled
 *                          by `GROUNDING_CALIBRATION` (> `GEMINI_DAILY_USD_THRESHOLD`).
 *   2. Grounded calls   — count of `grounding_enabled` events
 *                          (> `GEMINI_DAILY_GROUNDED_CALL_THRESHOLD`).
 *   3. Token volume     — `SUM(total_tokens)`
 *                          (> `GEMINI_DAILY_TOKEN_THRESHOLD`).
 *
 * Why three signals: the May 2026 spike never paged because the alarm summed
 * only `estimated_usd`, which under-reports the GCP invoice ~2.7x — and most on
 * exactly the grounded calls that drove the spike. Grounded-call count and raw
 * token volume are computed from un-priced SDK fields, so a regression in
 * either pages even when the dollar estimate is wrong. The dollar number is now
 * one vote of three. Tripwire math lives in `@/lib/ai/cost-alarm-eval` (tested).
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
import {
  evaluateGeminiUsage,
  type GeminiUsageRow,
  type GeminiUsageThresholds,
} from "@/lib/ai/cost-alarm-eval";
import { log } from "@/lib/log";

export const maxDuration = 60;

// Defaults are deliberately generous backstops (well above the steady-state
// daily norm); tune the env vars to ~1.5-2x your observed daily numbers.
const DEFAULT_THRESHOLD_USD = 50;
const DEFAULT_GROUNDED_CALL_THRESHOLD = 500;
const DEFAULT_TOKEN_THRESHOLD = 15_000_000;

export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const thresholds: GeminiUsageThresholds = {
    usd: parsePositive(process.env.GEMINI_DAILY_USD_THRESHOLD, DEFAULT_THRESHOLD_USD),
    grounded: parsePositive(
      process.env.GEMINI_DAILY_GROUNDED_CALL_THRESHOLD,
      DEFAULT_GROUNDED_CALL_THRESHOLD
    ),
    tokens: parsePositive(process.env.GEMINI_DAILY_TOKEN_THRESHOLD, DEFAULT_TOKEN_THRESHOLD),
  };
  const supabase = createAdminClient();

  // Window: last 24h.
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("gemini_usage_events")
    .select("estimated_usd, call_site, model_served, grounding_enabled, total_tokens")
    .gte("created_at", windowStart);

  if (error) {
    log.error({ err: error.message }, "[cost-alarm] query failed");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as GeminiUsageRow[];
  const { metrics, breakdown, tripped } = evaluateGeminiUsage(rows, thresholds);

  log.info({ ...metrics, thresholds }, "[cost-alarm] daily Gemini usage computed");

  if (tripped.length > 0) {
    const message = `[cost-alarm] Daily Gemini usage tripwire(s): ${tripped.join(", ")}`;
    log.warn({ ...metrics, tripped, breakdown }, message);
    Sentry.captureMessage(message, {
      level: "warning",
      tags: {
        alarm: "gemini-cost",
        env: process.env.VERCEL_ENV ?? "development",
        tripwire: tripped.map((t) => t.split(" ")[0]).join("+"),
      },
      extra: { ...metrics, tripped, breakdown, thresholds },
    });

    return NextResponse.json({ alarm: true, tripped, ...metrics, thresholds, breakdown });
  }

  return NextResponse.json({ alarm: false, ...metrics, thresholds });
}

function parsePositive(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
