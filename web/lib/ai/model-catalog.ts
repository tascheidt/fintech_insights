/**
 * Gemini model catalog + alias resolution.
 *
 * Two questions the rest of the AI tooling cannot answer on its own:
 *   1. Which models does the API currently offer? (`listGeminiModels`)
 *   2. What concrete model is a floating alias like `gemini-flash-latest`
 *      serving *right now*? (`probeModelVersion` — the response's
 *      `modelVersion` field.)
 *
 * Production telemetry records the alias we requested, never the model that
 * served it, which is why the May 2026 rotation of every alias to Gemini 3.x
 * went unnoticed until the invoice. `web/scripts/model-watch.ts` diffs these
 * answers against the committed snapshot and flags a change; the model eval
 * suite stamps them on every report.
 *
 * Plain REST (no SDK) so it exposes fields the SDK does not type. Model ids
 * are always passed in — this module holds no model literals.
 */

import { recordUsage } from "@/lib/ai/gemini-meter";
import { writeUsageEvent } from "@/lib/ai/gemini-telemetry";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export interface CatalogModel {
  /** Id without the `models/` prefix, e.g. `gemini-flash-latest`. */
  id: string;
  displayName: string | null;
  version: string | null;
  description: string | null;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  supportedGenerationMethods: string[];
  /** Whether the API advertises thinking support (newer models only). */
  thinking: boolean | null;
}

export interface AliasResolution {
  model: string;
  /** Concrete model that served the probe, or null when the probe failed. */
  modelVersion: string | null;
  error: string | null;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return key;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Normalize one raw ListModels entry. Pure; exported for tests. */
export function normalizeCatalogEntry(raw: Record<string, unknown>): CatalogModel {
  return {
    id: String(raw.name ?? "").replace(/^models\//, ""),
    displayName: str(raw.displayName),
    version: str(raw.version),
    description: str(raw.description),
    inputTokenLimit: num(raw.inputTokenLimit),
    outputTokenLimit: num(raw.outputTokenLimit),
    supportedGenerationMethods: Array.isArray(raw.supportedGenerationMethods)
      ? raw.supportedGenerationMethods.map(String)
      : [],
    thinking: typeof raw.thinking === "boolean" ? raw.thinking : null,
  };
}

/** Every model the API lists, following pagination. */
export async function listGeminiModels(): Promise<CatalogModel[]> {
  const out: CatalogModel[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API_ROOT}/models`);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey() } });
    if (!res.ok) throw new Error(`ListModels failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { models?: Record<string, unknown>[]; nextPageToken?: string };
    for (const m of body.models ?? []) out.push(normalizeCatalogEntry(m));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Ask a model for one trivial completion and read `modelVersion` off the
 * response — the only reliable way to see what an alias resolves to.
 * Costs a few dozen tokens; telemetered like any other call.
 */
export async function probeModelVersion(model: string): Promise<AliasResolution> {
  const started = Date.now();
  try {
    const res = await fetch(`${API_ROOT}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey(), "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
        generationConfig: { maxOutputTokens: 256 },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as { modelVersion?: string; usageMetadata?: Record<string, number> };
    writeUsageEvent(
      recordUsage({
        callSite: "modelCatalog.probe",
        modelRequested: model,
        groundingEnabled: false,
        usageMetadata: body.usageMetadata ?? null,
        latencyMs: Date.now() - started,
        status: "ok",
        extra: { modelVersion: body.modelVersion ?? null },
      })
    );
    return { model, modelVersion: body.modelVersion ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeUsageEvent(
      recordUsage({
        callSite: "modelCatalog.probe",
        modelRequested: model,
        groundingEnabled: false,
        latencyMs: Date.now() - started,
        status: "error",
        errorMessage: message,
      })
    );
    return { model, modelVersion: null, error: message };
  }
}

export interface CatalogSnapshot {
  capturedAt: string;
  /** Text-generation model ids only (embeddings/AQA/imagen etc. are noise here). */
  models: string[];
  /** Alias → concrete model it served at capture time. */
  aliases: Record<string, string | null>;
}

export interface CatalogDiff {
  added: string[];
  removed: string[];
  /** Aliases whose resolved model changed (`from` → `to`). */
  rotated: Array<{ alias: string; from: string | null; to: string | null }>;
  changed: boolean;
}

/** Text-generation models worth tracking (excludes embeddings, imagen, tts, …). */
export function isTextGenerationModel(m: CatalogModel): boolean {
  return (
    m.supportedGenerationMethods.includes("generateContent") &&
    /^gemini-/.test(m.id) &&
    !/(embedding|image|imagen|tts|audio|live|veo|robotics|computer-use)/i.test(m.id)
  );
}

/** Pure diff between two snapshots. Exported for tests. */
export function diffCatalog(prev: CatalogSnapshot, next: CatalogSnapshot): CatalogDiff {
  const p = new Set(prev.models);
  const n = new Set(next.models);
  const added = [...n].filter((m) => !p.has(m)).sort();
  const removed = [...p].filter((m) => !n.has(m)).sort();
  const rotated = Object.keys({ ...prev.aliases, ...next.aliases })
    .sort()
    .filter((alias) => (prev.aliases[alias] ?? null) !== (next.aliases[alias] ?? null))
    // A probe that failed this time is not evidence of a rotation.
    .filter((alias) => next.aliases[alias] !== null)
    .map((alias) => ({ alias, from: prev.aliases[alias] ?? null, to: next.aliases[alias] ?? null }));
  return { added, removed, rotated, changed: added.length + removed.length + rotated.length > 0 };
}
