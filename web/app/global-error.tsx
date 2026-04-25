"use client";

/**
 * Global error boundary — fires for unhandled errors that escape every other
 * boundary (root layout failures, etc.). Reports the error to Sentry and
 * renders a minimal fallback. Browser-side Sentry init is out of scope, so
 * `captureException` here is a best-effort signal — the server-side init
 * also picks up these errors via `onRequestError` in `instrumentation.ts`.
 */

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
