/**
 * Eval-only model registry for the open-model comparison harness.
 *
 * These candidate models are deliberately kept OUT of `AI_MODEL_OPTIONS`
 * (`prompt-config.ts`) so the admin UI never exposes an unvetted model to a
 * production surface. This registry is the single source of truth for the
 * evaluation candidates and how to reach them (provider + provider-native
 * model path).
 *
 * Nothing here changes any production default. It is consumed only when a
 * call site is explicitly handed one of these model ids by the bake-off
 * harness (`web/scripts/model-bakeoff.ts`). `resolveProvider` returns
 * `"gemini"` for everything else, so production call sites that never pass an
 * eval id keep their exact existing code path.
 *
 * See `docs/OPEN_MODEL_EVALUATION.md` for the methodology this supports.
 */

export type ProviderId = "gemini" | "fireworks";

export interface EvalModelSpec {
  /** Canonical id used across the harness, pricing table, and telemetry. */
  id: string;
  label: string;
  provider: ProviderId;
  /**
   * Provider-native model path. Fireworks uses the
   * `accounts/fireworks/models/<slug>` convention. Override per-deploy via
   * `providerModelEnv` if the slug rotates.
   */
  providerModel: string;
  /** Optional env var that overrides `providerModel` (e.g. on a slug change). */
  providerModelEnv?: string;
  notes?: string;
}

// NOTE on slugs: Fireworks rotates model slugs. Each entry carries a
// `providerModelEnv` override so a slug change is a `.env.local` edit, not a
// code change. Before a fresh bake-off, confirm the live slug on the Fireworks
// model page and set the override if it has moved. (June 2026 — GLM-5.2 was
// retired from this registry: on extract-structure it was *more* expensive than
// gemini-flash-latest, ~8x slower, and lower agreement — strictly dominated.)
export const EVAL_MODEL_REGISTRY: Record<string, EvalModelSpec> = {
  // The fast Fireworks pick: a 3B-active / 30B-total MoE. The small active +
  // total footprint is why it serves materially faster than the 284B-class
  // MoEs (DeepSeek-V4-Flash, the retired GLM-5.2) that ran ~13s/job. Strong
  // instruction-following; Fireworks JSON/grammar mode is best-in-class.
  "qwen3-30b-a3b": {
    id: "qwen3-30b-a3b",
    label: "Qwen3-30B-A3B Instruct (Alibaba)",
    provider: "fireworks",
    providerModel: "accounts/fireworks/models/qwen3-30b-a3b",
    providerModelEnv: "FIREWORKS_QWEN3_30B_MODEL",
    notes: "3B-active/30B MoE. Fastest strong candidate on Fireworks; lead replacement for GLM.",
  },
  // 17B-active/109B MoE. On Fireworks for the bake-off; its headline latency
  // win (~447 t/s) is a Groq-served property, so treat Fireworks latency as a
  // floor, not the ceiling. JSON mode + tool calling supported.
  "llama4-scout": {
    id: "llama4-scout",
    label: "Llama 4 Scout (Meta)",
    provider: "fireworks",
    providerModel: "accounts/fireworks/models/llama4-scout-instruct-basic",
    providerModelEnv: "FIREWORKS_LLAMA4_SCOUT_MODEL",
    notes: "Meta MoE. Cheap, JSON-mode capable. Fastest on Groq (future provider) — Fireworks here.",
  },
  // 24B dense — no MoE routing overhead, so predictable low latency. Mistral
  // tunes the Small line for tool use + structured output: the extraction-tuned
  // safety pick if a Qwen/Llama JSON adherence disappoints.
  "mistral-small": {
    id: "mistral-small",
    label: "Mistral Small 3.2 (24B dense)",
    provider: "fireworks",
    providerModel: "accounts/fireworks/models/mistral-small-24b-instruct-2501",
    providerModelEnv: "FIREWORKS_MISTRAL_SMALL_MODEL",
    notes: "Dense 24B, tuned for structured output. Extraction-tuned alternate.",
  },
  // Surviving cheap candidate from the first bake-off. Very low $/job but ~13s
  // latency (284B-total MoE) keeps it off the per-job hot path — backfill only.
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4-Flash",
    provider: "fireworks",
    providerModel: "accounts/fireworks/models/deepseek-v4-flash",
    providerModelEnv: "FIREWORKS_DEEPSEEK_MODEL",
    notes: "Cheapest credible candidate, but ~13s/job — backfill, not the hot path.",
  },
};

export const EVAL_MODEL_IDS = Object.keys(EVAL_MODEL_REGISTRY);

export function isEvalModel(model: string): boolean {
  return model in EVAL_MODEL_REGISTRY;
}

export function getEvalModelSpec(model: string): EvalModelSpec | null {
  return EVAL_MODEL_REGISTRY[model] ?? null;
}

/**
 * Which backend serves a given model id. Anything not in the eval registry is
 * treated as Gemini (the production default), so production call sites that
 * never pass an eval id keep their exact existing Gemini code path.
 */
export function resolveProvider(model: string): ProviderId {
  return EVAL_MODEL_REGISTRY[model]?.provider ?? "gemini";
}

/** Resolve the provider-native model path, honoring the env override. */
export function resolveProviderModel(spec: EvalModelSpec): string {
  if (spec.providerModelEnv) {
    const override = process.env[spec.providerModelEnv];
    if (override) return override;
  }
  return spec.providerModel;
}
