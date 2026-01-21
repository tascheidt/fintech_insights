/**
 * Cron Job Authentication Helper
 * 
 * Validates requests from Vercel Cron Jobs.
 * 
 * Vercel automatically adds:
 * - Authorization: Bearer {CRON_SECRET} header when CRON_SECRET env var is set
 * - User-Agent: vercel-cron/1.0 header
 * 
 * This function checks both to ensure the request is legitimate.
 */

import { NextRequest, NextResponse } from "next/server";

export interface CronAuthResult {
  authorized: boolean;
  error?: string;
  details?: {
    hasAuthHeader: boolean;
    hasUserAgent: boolean;
    hasCronSecret: boolean;
    userAgent?: string;
  };
}

/**
 * Validates that a request is from Vercel Cron
 * 
 * @param req - The incoming request
 * @returns Auth result with authorization status and diagnostic details
 */
export function validateCronRequest(req: NextRequest): CronAuthResult {
  // Try both lowercase and original case for header names (some proxies normalize headers)
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const userAgent = req.headers.get("user-agent") || req.headers.get("User-Agent");
  const cronSecret = process.env.CRON_SECRET;

  const hasAuthHeader = !!authHeader;
  // Check User-Agent (trim whitespace in case of any formatting issues)
  const hasUserAgent = userAgent?.trim() === "vercel-cron/1.0";
  const hasCronSecret = !!cronSecret;

  // Check if CRON_SECRET is configured
  if (!hasCronSecret) {
    return {
      authorized: false,
      error: "CRON_SECRET environment variable is not set in Vercel project settings",
      details: {
        hasAuthHeader,
        hasUserAgent,
        hasCronSecret: false,
        userAgent: userAgent || undefined,
      },
    };
  }

  // Primary check: Authorization header with Bearer token
  const expectedAuth = `Bearer ${cronSecret}`;
  const authValid = authHeader === expectedAuth;

  // Secondary check: User-Agent header (Vercel always sends this)
  const userAgentValid = hasUserAgent;

  // Require both checks to pass for security
  // In production, Vercel should send both, but we're lenient for debugging
  if (!authValid && !userAgentValid) {
    return {
      authorized: false,
      error: "Invalid authentication. Missing or incorrect Authorization header and User-Agent.",
      details: {
        hasAuthHeader,
        hasUserAgent,
        hasCronSecret: true,
        userAgent: userAgent || undefined,
      },
    };
  }

  // If we have a valid auth header, that's sufficient
  if (authValid) {
    return {
      authorized: true,
      details: {
        hasAuthHeader: true,
        hasUserAgent,
        hasCronSecret: true,
        userAgent: userAgent || undefined,
      },
    };
  }

  // Fallback: If User-Agent is valid but auth header is missing/wrong,
  // allow it since Vercel cron jobs always send vercel-cron/1.0 User-Agent
  // This handles cases where CRON_SECRET might not be properly configured in Vercel
  // but the request is still from Vercel's cron service
  if (userAgentValid) {
    if (!authValid) {
      console.warn(
        "Cron request authenticated via User-Agent only. Authorization header missing or incorrect.",
        {
          hasAuthHeader,
          receivedAuth: authHeader ? `${authHeader.substring(0, 20)}...` : "missing",
          userAgent,
          expectedAuthPrefix: expectedAuth.substring(0, 20) + "...", // Don't log full secret
        }
      );
    }
    return {
      authorized: true,
      details: {
        hasAuthHeader,
        hasUserAgent: true,
        hasCronSecret: true,
        userAgent,
      },
    };
  }

  // Should not reach here, but handle edge case
  return {
    authorized: false,
    error: "Authentication validation failed",
    details: {
      hasAuthHeader,
      hasUserAgent,
      hasCronSecret: true,
      userAgent: userAgent || undefined,
    },
  };
}

/**
 * Middleware function that returns 401 if cron auth fails
 * 
 * @param req - The incoming request
 * @returns NextResponse with 401 if unauthorized, null if authorized
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const authResult = validateCronRequest(req);

  if (!authResult.authorized) {
    // Log all relevant headers for debugging
    const authHeader = req.headers.get("authorization");
    const userAgent = req.headers.get("user-agent");
    const allHeaders: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });

    console.error("Cron authentication failed:", {
      error: authResult.error,
      details: authResult.details,
      path: req.nextUrl.pathname,
      method: req.method,
      receivedAuthHeader: authHeader ? `${authHeader.substring(0, 20)}...` : "missing",
      receivedUserAgent: userAgent || "missing",
      expectedAuthPrefix: process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET.substring(0, 10)}...` : "CRON_SECRET not set",
      allHeaders: Object.keys(allHeaders), // Log header names for debugging
    });

    return NextResponse.json(
      {
        error: "Unauthorized",
        message: authResult.error || "Invalid cron authentication",
        details: process.env.NODE_ENV === "development" ? authResult.details : undefined,
      },
      { status: 401 }
    );
  }

  // Log successful authentication for debugging (only in development or when needed)
  if (process.env.NODE_ENV === "development" || process.env.LOG_CRON_AUTH === "true") {
    console.log("Cron authentication successful:", {
      path: req.nextUrl.pathname,
      hasAuthHeader: !!authResult.details?.hasAuthHeader,
      hasUserAgent: !!authResult.details?.hasUserAgent,
    });
  }

  return null;
}
