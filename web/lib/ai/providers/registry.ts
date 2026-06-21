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

export const EVAL_MODEL_REGISTRY: Record<string, EvalModelSpec> = {
  "glm-5.2": {
    id: "glm-5.2",
    label: "GLM-5.2 (Z.ai)",
    provider: "fireworks",
    providerModel: "accounts/fireworks/models/glm-5p2",
    providerModelEnv: "FIREWORKS_GLM_MODEL",
    notes: "MIT-licensed 753B MoE. Reasoning / narrative candidate.",
  },
  "deepseek-v4-flash": {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4-Flash",
    provider: "fireworks",
    providerModel: "accounts/fireworks/models/deepseek-v4-flash",
    providerModelEnv: "FIREWORKS_DEEPSEEK_MODEL",
    notes: "Cheapest credible candidate. High-volume extraction / classification.",
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
