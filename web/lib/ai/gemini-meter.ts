/**
 * Gemini usage metering — Phase 1 of the Gemini cost-reduction effort.
 *
 * Pure observational primitive. Callers hand in the shape of the Gemini
 * response's `usageMetadata` (or nullish if the call errored), plus
 * request-side context (call-site label, model, grounding flag, latency),
 * and get back a normalized `UsageRecord` with a USD estimate.
 *
 * Production analysis functions accept an optional `onUsage: OnUsage`
 * callback so scripts (Phase 1 `gemini-compare.ts`, Phase 5 production
 * telemetry) can observe real production-path Gemini calls without the
 * production code taking on any logging responsibility itself.
 */

import { estimateUsd } from "./gemini-pricing";

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
}

export interface UsageRecord {
  callSite: string;
  modelRequested: string;
  /** The model that actually served the call — may differ from `modelRequested` when a quota fallback kicks in. */
  modelServed: string;
  groundingEnabled: boolean;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  latencyMs: number;
  status: "ok" | "error";
  errorMessage?: string;
  /** Per-call-site extras (job id, retry count, fallback reason, etc.). */
  extra?: Record<string, unknown>;
}

export type OnUsage = (record: UsageRecord) => void;

export function recordUsage(opts: {
  callSite: string;
  modelRequested: string;
  modelServed?: string;
  groundingEnabled: boolean;
  usageMetadata?: GeminiUsageMetadata | null;
  latencyMs: number;
  status: "ok" | "error";
  errorMessage?: string;
  extra?: Record<string, unknown>;
}): UsageRecord {
  const modelServed = opts.modelServed ?? opts.modelRequested;
  const inputTokens = opts.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = opts.usageMetadata?.candidatesTokenCount ?? 0;
  const cachedTokens = opts.usageMetadata?.cachedContentTokenCount ?? 0;
  const totalTokens = opts.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens;
  const estimatedUsd = estimateUsd(modelServed, {
    inputTokens,
    outputTokens,
    groundingEnabled: opts.groundingEnabled,
  });

  return {
    callSite: opts.callSite,
    modelRequested: opts.modelRequested,
    modelServed,
    groundingEnabled: opts.groundingEnabled,
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
    estimatedUsd,
    latencyMs: opts.latencyMs,
    status: opts.status,
    errorMessage: opts.errorMessage,
    extra: opts.extra,
  };
}
