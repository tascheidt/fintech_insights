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

export const log: Logger = pino({
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
