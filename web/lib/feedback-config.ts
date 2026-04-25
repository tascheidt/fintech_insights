import type { FeedbackConfig } from "@tascheidt/feedback";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const feedbackConfig: FeedbackConfig = {
  appName: "The Fintech Talent Brief",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://fintech-talent-brief.vercel.app",
  createServerClient: () => createClient(),
  createAdminClient: () => createAdminClient(),

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
