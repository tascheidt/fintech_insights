/**
 * Centralized structured logger (pino).
 *
 * Replaces ad-hoc `console.error` / `console.log` across `app/api/**` and
 * `lib/**`. Configures redaction so secrets cannot accidentally leak into log
 * output, and pretty-prints in development for readability.
 *
 * Usage:
 *   import { log } from "@/lib/log";
 *   log.info({ jobRunId }, "Cron job started");
 *   log.error({ err }, "Cron job failed");
 */

import pino, { type Logger } from "pino";

const isProd = process.env.NODE_ENV === "production";

const redactPaths = [
  // Auth headers (any case variant)
  "Authorization",
  "authorization",
  "headers.authorization",
  "headers.Authorization",
  "*.authorization",
  "*.Authorization",
  // Cookies
  "cookie",
  "Cookie",
  "headers.cookie",
  "headers.Cookie",
  // Generic secret-bearing fields (deep wildcard)
  "*.api_key",
  "*.apiKey",
  "*.token",
  "*.secret",
  "password",
  "*.password",
  // Specific service keys we never want in logs
  "*.SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "*.RESEND_API_KEY",
  "*.GEMINI_API_KEY",
  "*.CRON_SECRET",
];

function createLogger(): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
    redact: {
      paths: redactPaths,
      censor: "[redacted]",
    },
    ...(isProd
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }),
  });
}

/**
 * Cache the logger on `globalThis` so it is instantiated exactly once per
 * process. In Next.js dev the module is re-evaluated across route/RSC bundles
 * and on every HMR reload; without this, each evaluation spins up a new
 * `pino-pretty` transport worker that pipes into `process.stdout` and adds a
 * fresh set of `unpipe`/`error`/`close`/`finish` listeners to that shared
 * WriteStream — which is what triggers `MaxListenersExceededWarning`. Reusing
 * the singleton keeps a single transport worker and a single set of listeners.
 */
const globalForLog = globalThis as typeof globalThis & {
  __fintechLogger?: Logger;
};

export const log: Logger = globalForLog.__fintechLogger ?? createLogger();

if (!isProd) {
  globalForLog.__fintechLogger = log;
}
