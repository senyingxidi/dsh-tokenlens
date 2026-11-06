/**
 * Command Code per-model monthly allowances (v1.7.2).
 *
 * `mimo`-style plan catalogues are not served by any public API — the numbers
 * live in the provider's own console bundle (`assets/plan-tiers-*.js`), which is
 * where the console gets the allowance it prints per model. The plugin needs the
 * same table to answer "how much does THIS model get?", because a plan's credit
 * pool and a model's allowance are two different numbers:
 *
 *   - the POOL is what the API meters (`credits.monthlyCredits`, and
 *     `windowLimits.*.used` are charged against it): `individual-goat` = $70;
 *   - the ALLOWANCE is what the console advertises for a given model, because a
 *     discounted model stretches the same pool further: DeepSeek V4.1 Flash on
 *     GOAT = $100, even though the pool is $70.
 *
 * Transcribed 2026-11-06 from the console bundle:
 * ```js
 * {"zai-org/GLM-5.2":70,"tencent/hy3-paid":70,"Qwen/Qwen3.8-27B":70,
 *  "MiniMaxAI/MiniMax-M3":47,"deepseek/deepseek-v4-flash":60,
 *  "deepseek/deepseek-v4.1-flash":100,"deepseek/deepseek-v4.1-flash-fast":60,
 *  "moonshotai/Kimi-K2.7-Code":60,"xiaomi/mimo-v2.6-pro-ultraspeed":10,
 *  "claude-sonnet-5-5":10,"Qwen/Qwen3.7-Max":33,"Qwen/Qwen3.7-Plus":33,
 *  "Qwen/Qwen3.6-Plus":33,"google/gemini-3.7-flash":40,
 *  "google/gemini-3.8-flash":40,"z-ai/glm-5.3-flash":100,
 *  "meituan/LongCat-2.0":50,"inclusionai/ling-3.1-flash":100,
 *  "inclusionai/ling-3.1-flash-1019":100}
 * ```
 *
 * Only the two plans whose tables were captured carry per-model numbers; every
 * other plan falls back to its pool, and a model missing from a table falls back
 * to that plan's pool too — the plugin never invents an allowance.
 */

/** Plan id -> `{ poolUsd, byModel }`, with model ids as the console spells them. */
export const COMMANDCODE_PLAN_ALLOWANCES = {
  // GOAT: $70 of credits, but discounted models advertise up to $100 of usage.
  'individual-goat': {
    poolUsd: 70,
    byModel: {
      'zai-org/GLM-5.2': 70,
      'tencent/hy3-paid': 70,
      'Qwen/Qwen3.8-27B': 70,
      'MiniMaxAI/MiniMax-M3': 47,
      'deepseek/deepseek-v4-flash': 60,
      'deepseek/deepseek-v4.1-flash': 100,
      'deepseek/deepseek-v4.1-flash-fast': 60,
      'moonshotai/Kimi-K2.7-Code': 60,
      'xiaomi/mimo-v2.6-pro-ultraspeed': 10,
      'claude-sonnet-5-5': 10,
      'Qwen/Qwen3.7-Max': 33,
      'Qwen/Qwen3.7-Plus': 33,
      'Qwen/Qwen3.6-Plus': 33,
      'google/gemini-3.7-flash': 40,
      'google/gemini-3.8-flash': 40,
      'z-ai/glm-5.3-flash': 100,
      'meituan/LongCat-2.0': 50,
      'inclusionai/ling-3.1-flash': 100,
      'inclusionai/ling-3.1-flash-1019': 100,
    },
  },
  // Go ($10 of credits).
  'individual-go': {
    poolUsd: 10,
    byModel: {
      'zai-org/GLM-5.2': 10,
      'tencent/hy3-paid': 10,
      'Qwen/Qwen3.8-27B': 10,
      'Qwen/Qwen3.7-Max': 10,
      'Qwen/Qwen3.7-Plus': 10,
      'Qwen/Qwen3.6-Plus': 10,
      'meituan/LongCat-2.0': 10,
      'zai-org/GLM-5.3': 10,
      'z-ai/glm-5.3-flash': 10,
      'deepseek/deepseek-v4.1-flash': 10,
      'moonshotai/Kimi-K2.7-Code': 9,
      'zai-org/GLM-5.2-Fast': 9,
      'MiniMaxAI/MiniMax-M3': 8,
      'moonshotai/Kimi-K3': 8,
      'deepseek/deepseek-v4-flash-fast': 8,
      'Qwen/Qwen3.8-Max': 7,
      'Qwen/Qwen3.8-Max-0902': 7,
    },
  },
  // Plans whose pools are documented but whose per-model tables were not captured.
  'individual-go-v1': { poolUsd: 10, byModel: {} },
  'individual-pro': { poolUsd: 30, byModel: {} },
  'individual-pro-v1': { poolUsd: 80, byModel: {} },
  'individual-provider': { poolUsd: 15, byModel: {} },
  'individual-max': { poolUsd: 150, byModel: {} },
  'individual-ultra': { poolUsd: 300, byModel: {} },
  'teams-pro': { poolUsd: 40, byModel: {} },
}

/** A model id without its vendor prefix (`z-ai/glm-5.3-flash` -> `glm-5.3-flash`). */
function bareModel(modelId) {
  return typeof modelId === 'string' ? modelId.trim().toLowerCase().replace(/^[^/]+\//, '') : ''
}

/**
 * The monthly allowance advertised for one model on one plan.
 *
 * Matching is tolerant about the vendor prefix and casing, because the same model
 * reaches the plugin as `deepseek/deepseek-v4.1-flash` from DSH and as
 * `deepseek-v4.1-flash` in some payloads.
 *
 * @returns `{ allowanceUsd, poolUsd, matched, basis }` where `basis` is
 *   `'model'` when a per-model number was found and `'pool'` otherwise.
 *   `allowanceUsd` is `null` when the plan itself is unknown.
 */
export function commandcodeAllowance(planId, modelId) {
  const plan = typeof planId === 'string' ? COMMANDCODE_PLAN_ALLOWANCES[planId.trim()] : undefined
  if (plan === undefined) return { allowanceUsd: null, poolUsd: null, matched: '', basis: 'unknown' }
  const wanted = bareModel(modelId)
  if (wanted !== '') {
    // Exact key first, then a bare-id match so a missing vendor prefix still hits.
    for (const [key, usd] of Object.entries(plan.byModel)) {
      if (key.toLowerCase() === wanted) return { allowanceUsd: usd, poolUsd: plan.poolUsd, matched: key, basis: 'model' }
    }
    for (const [key, usd] of Object.entries(plan.byModel)) {
      if (bareModel(key) === wanted) return { allowanceUsd: usd, poolUsd: plan.poolUsd, matched: key, basis: 'model' }
    }
  }
  return { allowanceUsd: plan.poolUsd, poolUsd: plan.poolUsd, matched: '', basis: 'pool' }
}
