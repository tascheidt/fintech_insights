/**
 * Embedding helper for Jobs semantic search.
 *
 * Wraps Gemini `gemini-embedding-001` (resolved through prompt-config, never
 * hardcoded). Like every Gemini call site in this repo, each embed writes to
 * `gemini_usage_events` via recordUsage + writeUsageEvent (fire-and-forget),
 * and accepts an optional `onUsage` observer for scripts.
 *
 * Two callers:
 *   - the backfill sweep (embeds `title + summary/description` per job)
 *   - the query path (embeds the user's search string on submit)
 * Both must use the SAME model + dims, or cosine ranking is garbage — that
 * invariant is enforced by stamping embedding_model/embedding_dims on rows and
 * checking them in the query path.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { EMBEDDING_MODEL, EMBEDDING_DIMS } from "./prompt-config";
import { recordUsage, type OnUsage } from "./gemini-meter";
import { writeUsageEvent } from "./gemini-telemetry";
import { log } from "@/lib/log";

/** Cap embed input — descriptions can be 200KB; embedding models truncate
 *  anyway and we only need the gist. ~8k chars ≈ ~2k tokens. */
const EMBED_INPUT_MAX_CHARS = 8000;

export interface EmbedResult {
  embedding: number[];
  model: string;
  dims: number;
}

/** L2-normalize. gemini-embedding-001 truncated below its native 3072 dims is
 *  NOT pre-normalized; normalizing makes cosine distance well-behaved and lets
 *  the stored vectors double as unit vectors. */
function l2normalize(values: number[]): number[] {
  let sumSq = 0;
  for (const v of values) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return values;
  return values.map((v) => v / norm);
}

/**
 * Embed a single piece of text. Returns null on missing key / error / a
 * dimensionality mismatch (caller skips the row rather than storing a vector
 * that can't be compared). Records usage either way.
 */
export async function embedText(
  text: string,
  opts: { callSite: string; onUsage?: OnUsage }
): Promise<EmbedResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    log.error("GEMINI_API_KEY not configured — cannot embed");
    return null;
  }

  const input = text.trim().slice(0, EMBED_INPUT_MAX_CHARS);
  if (!input) return null;

  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const startedAt = Date.now();

  try {
    // `outputDimensionality` is supported by the embeddings API and the
    // runtime SDK (verified: returns 768-d vectors), but is missing from the
    // EmbedContentRequest type in @google/generative-ai@0.24.1 — cast past the
    // typing gap rather than dropping the field (without it we'd get 3072-d).
    const request = {
      content: { role: "user", parts: [{ text: input }] },
      outputDimensionality: EMBEDDING_DIMS,
    };
    const result = await model.embedContent(
      request as Parameters<typeof model.embedContent>[0]
    );
    const latencyMs = Date.now() - startedAt;
    const values = result.embedding?.values ?? [];

    // The embeddings endpoint may omit usageMetadata; fall back to a
    // char/4 token estimate so cost telemetry isn't silently zero.
    const usageMetadata =
      (result as { usageMetadata?: { promptTokenCount?: number; totalTokenCount?: number } })
        .usageMetadata ?? {
        promptTokenCount: Math.ceil(input.length / 4),
        totalTokenCount: Math.ceil(input.length / 4),
      };

    const record = recordUsage({
      callSite: opts.callSite,
      modelRequested: EMBEDDING_MODEL,
      groundingEnabled: false,
      usageMetadata,
      latencyMs,
      status: "ok",
      extra: { dims: EMBEDDING_DIMS, text_length: input.length },
    });
    writeUsageEvent(record);
    opts.onUsage?.(record);

    if (values.length !== EMBEDDING_DIMS) {
      log.error(
        { got: values.length, want: EMBEDDING_DIMS },
        "embedding dimensionality mismatch — skipping"
      );
      return null;
    }

    return { embedding: l2normalize(values), model: EMBEDDING_MODEL, dims: EMBEDDING_DIMS };
  } catch (err) {
    const record = recordUsage({
      callSite: opts.callSite,
      modelRequested: EMBEDDING_MODEL,
      groundingEnabled: false,
      latencyMs: Date.now() - startedAt,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    writeUsageEvent(record);
    opts.onUsage?.(record);
    log.error({ err }, "embedText failed");
    return null;
  }
}

/** Compose the text we embed for a job: title carries the most signal, then a
 *  short summary or the description body. Keep the title weighted by leading
 *  with it. */
export function jobEmbeddingInput(job: {
  title?: string | null;
  summary?: string | null;
  description_text?: string | null;
}): string {
  const parts = [job.title?.trim(), (job.summary || job.description_text)?.trim()].filter(
    Boolean
  );
  return parts.join("\n\n");
}
