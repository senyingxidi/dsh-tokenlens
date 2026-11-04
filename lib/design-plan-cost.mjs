/**
 * Design Plan cost accounting (v1.6.0).
 *
 * WHY
 *
 * Open Design bills the Design Plan in "credits", never in dollars. The
 * published pricing page (`open-design.ai/zh/model-credits/`) states the caps in
 * LIST-PRICE dollars ($120/month, $30/7d, $10/5h for Go) and, crucially, that
 * the credits a model BURNS are `list-price value × that model's multiplier`:
 *
 *   DeepSeek V4.1 Flash   0.5x     -> the whole $120 monthly cap is available
 *   MiMo V2.6 Flash       1x       -> half of it ($60)
 *   Claude Haiku 5.5      2x       -> $30
 *   GPT-6 Luna            4x       -> $15
 *
 * So a dollar amount computed from credits alone (usedCredits / creditsPerUsd)
 * is NOT comparable with the pricing table: it silently assumes the account
 * burns credits at 1x, understating a 0.5x model by 2x and overstating a 4x
 * model by 4x. The honest figure is the LIST-PRICE value of the tokens actually
 * consumed, which is what this module computes:
 *
 *   cost = Σ over models ( input×p_in + output×p_out + cacheRead×p_read ) / 1e6
 *
 * That number is directly comparable with the documented caps, and the cap that
 * applies depends on the model mix — hence `monthlyCapFor` and
 * `effectiveMonthlyCap`.
 *
 * Credits remain the authoritative *consumption* signal (the server owns the
 * counters); prices only turn observed tokens into a dollar figure the user can
 * check against the pricing page.
 */

/**
 * Documented per-million-token list prices (USD) and Design Plan multipliers.
 *
 * Transcribed from `open-design.ai/zh/model-credits/` (pricing table + the
 * "Design Plan 模型与额度扣除倍率" table). The public
 * `GET /api/v1/public/model-prices` endpoint serves the same input/output/
 * cacheRead numbers; only `hunyuan-h4-preview` and `glm-5.3-flash-x` are absent
 * from it, so their prices fall back to the endpoint at runtime when available.
 *
 * `multiplier` is what the DOCUMENTED table says; an unknown model gets `null`
 * and is reported as unpriceable rather than assumed to be 1x.
 */
export const DESIGN_PLAN_MODELS = {
  'deepseek-v4.1-flash': { multiplier: 0.5, input: 0.3, output: 1.2, cacheRead: 0.006, label: 'DeepSeek V4.1 Flash' },
  'deepseek-v4-flash': { multiplier: 1, input: 0.44, output: 1.32, cacheRead: 0.014, label: 'DeepSeek V4 Flash' },
  'deepseek-v4-flash-vision-exp': {
    multiplier: 1,
    input: 0.44,
    output: 1.32,
    cacheRead: 0.014,
    label: 'DeepSeek V4 Flash Vision Exp',
  },
  'deepseek-v4-pro': { multiplier: 1, input: 1.32, output: 3.96, cacheRead: 0.044, label: 'DeepSeek V4 Pro' },
  'glm-5.3-flash': { multiplier: 1, input: 0.075, output: 0.25, cacheRead: 0.015, label: 'GLM-5.3 Flash' },
  'glm-5.3-flash-x': { multiplier: 2, input: 0.37, output: 1.25, cacheRead: 0.075, label: 'GLM-5.3 Flash-X' },
  'kimi-k2.7-code': { multiplier: 1, input: 0.95, output: 4, cacheRead: 0.19, label: 'Kimi K2.7 Code' },
  'mimo-v2.6-flash': { multiplier: 1, input: 0.14, output: 0.28, cacheRead: 0.0028, label: 'MiMo V2.6 Flash' },
  'mimo-v2.6-pro': { multiplier: 1, input: 0.435, output: 0.87, cacheRead: 0.0036, label: 'MiMo V2.6 Pro' },
  'minimax-m3.1-flash': { multiplier: 1, input: 0.15, output: 0.6, cacheRead: 0.015, label: 'MiniMax M3.1 Flash' },
  'claude-haiku-5.5': { multiplier: 2, input: 0.1, output: 0.5, cacheRead: 0.01, label: 'Claude Haiku 5.5' },
  'gpt-6-luna': { multiplier: 4, input: 0.1, output: 0.5, cacheRead: 0.01, label: 'GPT-6 Luna' },
  'hunyuan-h4-preview': { multiplier: 1, input: null, output: null, cacheRead: null, label: 'Hunyuan H4 Preview' },
}

/** The documented list-price dollar caps of the Go tier (used only as a default). */
export const DESIGN_PLAN_CAPS_USD = { rolling: 10, weekly: 30, monthly: 120 }

/**
 * The monthly list-price cap available to a model mix.
 *
 * The $120 monthly cap is entirely Design Plan value and is consumed at the
 * model's multiplier, so using ONLY a 0.5x model (DeepSeek V4.1 Flash) unlocks
 * the full $120 of list-price usage; a 1x model reaches $60; 2x reaches $30.
 * With a mixed history the binding constraint is NOT simply the highest
 * multiplier: the caps are denominated in credits (600,000/month at 10,000
 * credits per list-price dollar), and each model burns those credits at its own
 * rate. The account's spendable list-price value is therefore
 *
 *   600,000 credits / m_effective
 *
 * where `m_effective` is the credit-weighted harmonic mean of the multipliers
 * actually used:
 *
 *   m_eff = Σ credits_i / Σ (credits_i / m_i),  credits_i = listUsd_i × 10000 × m_i
 *
 * Using the plain maximum would understate a mostly-0.5x account that touched a
 * 4x model once: 90% of the credits at 0.5x plus 10% at 4x gives $97.89, not
 * $15. With a single model the formula reduces exactly to that model's
 * documented cap, so the pure cases still match the pricing page.
 *
 * @param modelIds - the model ids in the mix, or
 * @param mixes - a per-model `{ listUsd, multiplier }` split (preferred: it
 *   weights by real consumption). `modelIds` is used only when no split is given.
 * @returns `{ monthlyCapUsd, weeklyCapUsd, fiveHourCapUsd, multiplier }` where
 *   `multiplier` is the effective multiplier, or all-null caps when no model is
 *   known.
 */
export function capsForModels(modelIds, mixes = null) {
  const rows = Array.isArray(mixes)
    ? mixes
        .map((mix) => ({
          listUsd: typeof mix?.listUsd === 'number' && Number.isFinite(mix.listUsd) && mix.listUsd > 0 ? mix.listUsd : 0,
          multiplier:
            typeof mix?.multiplier === 'number' && Number.isFinite(mix.multiplier) && mix.multiplier > 0
              ? mix.multiplier
              : null,
        }))
        .filter((row) => row.multiplier !== null && row.listUsd > 0)
    : null
  let effective = 0
  if (rows !== null && rows.length > 0) {
    // Credit-weighted harmonic mean (see the doc comment).
    let credits = 0
    let inverse = 0
    for (const row of rows) {
      const rowCredits = row.listUsd * row.multiplier
      credits += rowCredits
      inverse += rowCredits / row.multiplier
    }
    effective = credits > 0 && inverse > 0 ? credits / inverse : 0
  } else {
    // No consumption weighting available: fall back to the highest multiplier,
    // the conservative reading (it promises the LEAST remaining capacity).
    let worst = 0
    for (const id of Array.isArray(modelIds) ? modelIds : []) {
      const model = DESIGN_PLAN_MODELS[normalizeModelId(id)]
      if (model === undefined || !Number.isFinite(model.multiplier) || model.multiplier <= 0) continue
      if (model.multiplier > worst) worst = model.multiplier
    }
    effective = worst
  }
  if (!(effective > 0)) {
    return { monthlyCapUsd: null, weeklyCapUsd: null, fiveHourCapUsd: null, multiplier: null }
  }
  return {
    // 600,000 credits / m at 10,000 credits per list-price dollar == $60 / m.
    monthlyCapUsd: 60 / effective,
    weeklyCapUsd: 15 / effective,
    fiveHourCapUsd: 5 / effective,
    multiplier: effective,
  }
}

/** A model id as the documented table spells it (lower-case, trimmed). */
export function normalizeModelId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** The documented entry for a model id, or null. */
export function designPlanModel(modelId) {
  return DESIGN_PLAN_MODELS[normalizeModelId(modelId)] ?? null
}

/** A token count as a finite non-negative number. */
function tokens(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * The documented list-price cost of one bucket of tokens for one model.
 *
 * @returns `{ usd, priced }`; `priced` is false when the model has no documented
 *   price (the cost is then 0 for that model, and callers must say so rather
 *   than pretend the total is complete).
 */
export function modelCostUsd(modelId, bucket) {
  const model = designPlanModel(modelId)
  if (model === null) return { usd: 0, priced: false }
  const input = tokens(bucket?.input)
  const output = tokens(bucket?.output)
  const cacheRead = tokens(bucket?.cacheRead)
  const cacheWrite = tokens(bucket?.cacheWrite)
  // cacheWrite has no documented Design Plan price; bill it as fresh input so a
  // value is never silently dropped, and flag it so the caller can explain.
  const priced =
    Number.isFinite(model.input) && Number.isFinite(model.output) && Number.isFinite(model.cacheRead)
  if (!priced) return { usd: 0, priced: true, unavailability: 'the model has no documented Design Plan price' }
  const usd =
    (input / 1e6) * model.input +
    (output / 1e6) * model.output +
    (cacheRead / 1e6) * model.cacheRead +
    (cacheWrite / 1e6) * model.input
  return { usd, priced: true }
}

/**
 * Total documented list-price cost of a per-model token map.
 *
 * @param models - `{ [modelId]: { input, output, cacheRead, cacheWrite } }`
 * @returns `{ usd, priced, unpricedModels }` where `unpricedModels` lists the
 *   ids that had tokens but no documented price (their cost is not included).
 */
export function designPlanCostUsd(models) {
  let usd = 0
  let priced = false
  const unpricedModels = []
  const mixes = []
  for (const [modelId, bucket] of Object.entries(models ?? {})) {
    const total = tokens(bucket?.input) + tokens(bucket?.output) + tokens(bucket?.cacheRead) + tokens(bucket?.cacheWrite)
    if (total === 0) continue
    const cost = modelCostUsd(modelId, bucket)
    if (cost.priced !== true) {
      unpricedModels.push(modelId)
      continue
    }
    usd += cost.usd
    priced = true
    // Per-model list-price spend, so the cap can be weighted by real consumption.
    const model = designPlanModel(modelId)
    if (model !== null && Number.isFinite(model.multiplier) && model.multiplier > 0 && cost.usd > 0) {
      mixes.push({ modelId: normalizeModelId(modelId), listUsd: cost.usd, multiplier: model.multiplier })
    }
  }
  return { usd, priced, unpricedModels, mixes }
}
