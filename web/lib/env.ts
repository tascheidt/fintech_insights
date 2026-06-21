/**
 * Centralized environment-variable validator.
 *
 * Imported once at app boot (see `web/instrumentation.ts`). The schema below is
 * the source of truth for every env var the app actually reads. Adding a new
 * env var? Add it here as well — startup will fail loudly if a required var is
 * missing instead of crashing deep inside a route handler at request time.
 */

import { z } from "zod";

const envSchema = z.object({
  // --- Required at runtime ---
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // --- Optional ---
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  RESEND_FROM: z.string().optional(),
  GJ_GITHUB_TOKEN: z.string().optional(),
  GJ_GITHUB_OWNER: z.string().optional(),
  GJ_GITHUB_REPO: z.string().optional(),
  GEMINI_TELEMETRY_DISABLED: z.string().optional(),
  LOG_CRON_AUTH: z.string().optional(),

  // --- Open-model evaluation (Fireworks; eval harness only, NOT production) ---
  // Read by the bake-off harness via lib/ai/providers/*. Optional: the app
  // never needs these at boot; only scripts/model-bakeoff.ts uses them.
  FIREWORKS_API_KEY: z.string().optional(),
  FIREWORKS_BASE_URL: z.string().url().optional(),
  FIREWORKS_GLM_MODEL: z.string().optional(),
  FIREWORKS_DEEPSEEK_MODEL: z.string().optional(),

  // --- Sentry (server-side only — DSN deliberately not NEXT_PUBLIC_*) ---
  // Required in production; optional in development. The runtime check below
  // throws when production deploys ship without a DSN, so we cannot rely on a
  // Zod `optional()` alone — see `loadEnv()`.
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),

  // --- Cost alarm threshold (USD) ---
  // Daily Gemini spend over this triggers a Sentry message via the
  // /api/admin/cost-alarm route invoked by the GH Actions workflow. Stored as
  // a string because env vars are strings; parsed at the call site.
  GEMINI_DAILY_USD_THRESHOLD: z.string().optional(),

  // --- Vercel-injected ---
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),

  // --- Build/runtime mode (set automatically by Next.js) ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables. Refusing to boot.\n${issues}\n\nSee web/.env.example for the full list of required + optional variables.`
    );
  }

  // Production guard: SENTRY_DSN is required when VERCEL_ENV=production. We
  // do not encode this with Zod's `optional()` because preview/dev deploys
  // legitimately ship without one, but a missing DSN in production would let
  // unhandled errors disappear silently — exactly what Sentry exists to prevent.
  if (parsed.data.VERCEL_ENV === "production" && !parsed.data.SENTRY_DSN) {
    throw new Error(
      "SENTRY_DSN is required in production but is unset. Refusing to boot."
    );
  }

  return parsed.data;
}

/**
 * Typed, validated environment. Reading any property guarantees the schema has
 * already passed validation at module load.
 */
export const env: Env = loadEnv();
