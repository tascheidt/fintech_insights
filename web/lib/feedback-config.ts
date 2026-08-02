import type { FeedbackConfig } from "@tascheidt/feedback";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://fintech-talent-brief.vercel.app";

/**
 * Kick off AI triage for a freshly submitted row.
 *
 * This replaces the old path: an AFTER INSERT trigger calling `net.http_post`
 * against a `verify_jwt: false` Supabase Edge Function whose source lived
 * outside this repo. Going through our own `/api/internal/**` route keeps the
 * CRON_SECRET in Vercel env (never in the database), keeps the endpoint
 * non-public, and puts the work where AI_MODEL_OPTIONS, gemini_usage_events
 * telemetry and structured logging already are. See docs/FEEDBACK_PIPELINE.md.
 */
async function triggerTriage(submissionId: string): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    log.error({ submissionId }, "CRON_SECRET not set — cannot trigger feedback triage");
    return;
  }

  const res = await fetch(`${APP_URL}/api/internal/feedback/triage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({ id: submissionId }),
  });

  if (!res.ok) {
    log.error(
      { submissionId, status: res.status },
      "Feedback triage trigger returned a non-OK status"
    );
  }
}

export const feedbackConfig: FeedbackConfig = {
  appName: "The Fintech Talent Brief",
  appUrl: APP_URL,
  createServerClient: () => createClient(),
  createAdminClient: () => createAdminClient(),

  onSubmissionCreated: ({ id }) => triggerTriage(id),

  // Each submission costs a Gemini Pro triage call plus a Resend batch to every
  // admin. 10/hour is far above real use and far below what a loop would do.
  rateLimit: { maxPerHour: 10, duplicateWindowMinutes: 10 },

  // Route package-internal messages into the app's pino pipeline instead of
  // raw console (CLAUDE.md §7). The package keeps `console` as its default so
  // it stays portable.
  logger: {
    info: (...args) => log.info({ args }, "[feedback]"),
    warn: (...args) => log.warn({ args }, "[feedback]"),
    error: (...args) => log.error({ args }, "[feedback]"),
  },

  github: process.env.GJ_GITHUB_TOKEN
    ? {
        token: process.env.GJ_GITHUB_TOKEN,
        owner: process.env.GJ_GITHUB_OWNER!,
        repo: process.env.GJ_GITHUB_REPO!,
      }
    : undefined,

  email: process.env.RESEND_API_KEY
    ? {
        resendApiKey: process.env.RESEND_API_KEY,
        fromAddress: process.env.RESEND_FROM || "onboarding@resend.dev",
      }
    : undefined,
};
