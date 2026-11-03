/**
 * Design Plan documented-price accounting tests (v1.6.0).
 *
 * The whole point: Open Design bills credits, but the pricing page states caps in
 * LIST-PRICE dollars and gives each model a multiplier that decides how fast
 * credits burn. A cost computed as `usedCredits / creditsPerUsd` therefore
 * assumes 1x and is wrong for every other model — 2x too low for DeepSeek V4.1
 * Flash (0.5x), 4x too high for GPT-6 Luna (4x).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DESIGN_PLAN_MODELS,
  capsForModels,
  designPlanCostUsd,
  designPlanModel,
  modelCostUsd,
  normalizeModelId,
} from '../lib/design-plan-cost.mjs'

test('a 0.5x model unlocks the full documented $120 monthly cap', () => {
  // "如果我只用DeepSeek V4.1 Flash，是不是可以用120美元" -> yes.
  const caps = capsForModels(['deepseek-v4.1-flash'])
  assert.equal(caps.multiplier, 0.5)
  assert.equal(caps.monthlyCapUsd, 120)
  assert.equal(caps.weeklyCapUsd, 30)
  assert.equal(caps.fiveHourCapUsd, 10)
})

test('the documented cap ladder matches the pricing table for every multiplier', () => {
  assert.equal(capsForModels(['deepseek-v4.1-flash']).monthlyCapUsd, 120, '0.5x -> $120')
  assert.equal(capsForModels(['mimo-v2.6-flash']).monthlyCapUsd, 60, '1x -> $60')
  assert.equal(capsForModels(['claude-haiku-5.5']).monthlyCapUsd, 30, '2x -> $30')
  assert.equal(capsForModels(['gpt-6-luna']).monthlyCapUsd, 15, '4x -> $15')
})

test('a mixed history is capped by the WORST multiplier used, not an average', () => {
  // Every unit of a 4x model consumes its share four times faster, so the binding
  // ceiling is the highest multiplier, never the mean.
  const caps = capsForModels(['deepseek-v4.1-flash', 'gpt-6-luna'])
  assert.equal(caps.multiplier, 4)
  assert.equal(caps.monthlyCapUsd, 15)
})

test('an unknown model never invents a multiplier or a cap', () => {
  const caps = capsForModels(['some-private-model'])
  assert.equal(caps.multiplier, null)
  assert.equal(caps.monthlyCapUsd, null)
  assert.deepEqual(capsForModels([]), {
    monthlyCapUsd: null,
    weeklyCapUsd: null,
    fiveHourCapUsd: null,
    multiplier: null,
  })
})

test('cost is the documented list price of the tokens, per token kind', () => {
  // 1M input @ $0.3, 1M output @ $1.2, 1M cacheRead @ $0.006 for V4.1 Flash.
  const cost = modelCostUsd('deepseek-v4.1-flash', {
    input: 1e6,
    output: 1e6,
    cacheRead: 1e6,
    cacheWrite: 0,
  })
  assert.equal(cost.priced, true)
  assert.ok(Math.abs(cost.usd - (0.3 + 1.2 + 0.006)) < 1e-9, `usd was ${cost.usd}`)
})

test('the cost matches the console receipt for one real request (screenshot check)', () => {
  // The Open Design usage page breaks one deepseek-v4.1-flash request down as:
  //   input (non-cached) 311 @ $0.3000/M -> $0.0001
  //   output           2,610 @ $1.2000/M -> $0.0031
  //   cache read     258,560 @ $0.0060/M -> $0.0016
  //   billing subtotal $0.0048, Design Plan multiplier x0.5 -> charged $0.0024
  // Note the table's "input 258,871" is non-cached + cache, so `input` here must
  // exclude cacheRead or the cache bytes would be billed twice.
  const cost = modelCostUsd('deepseek-v4.1-flash', {
    input: 311,
    output: 2610,
    cacheRead: 258560,
    cacheWrite: 0,
  })
  assert.ok(Math.abs(cost.usd - 0.0048) < 0.00005, `list total was ${cost.usd}, console says 0.0048`)
  // The documented multiplier halves it, which is what actually leaves the cap.
  assert.ok(Math.abs(cost.usd * 0.5 - 0.0024) < 0.00005, 'the 0.5x multiplier reproduces the console charge')
})

test('a per-model map sums and reports the models it could not price', () => {
  const result = designPlanCostUsd({
    'deepseek-v4.1-flash': { input: 1e6, output: 0, cacheRead: 0, cacheWrite: 0 },
    'mimo-v2.6-flash': { input: 0, output: 1e6, cacheRead: 0, cacheWrite: 0 },
    'mystery-model': { input: 5e6, output: 0, cacheRead: 0, cacheWrite: 0 },
  })
  assert.ok(Math.abs(result.usd - (0.3 + 0.28)) < 1e-9, `usd was ${result.usd}`)
  assert.equal(result.priced, true)
  assert.deepEqual(result.unpricedModels, ['mystery-model'], 'an unpriced model is reported, not silently zeroed')
})

test('a model with no documented price yields no cost, not a guess', () => {
  assert.equal(designPlanCostUsd({}).priced, false, 'nothing priced')
  assert.deepEqual(designPlanCostUsd({}).unpricedModels, [])
  // hunyuan-h4-preview is documented as 1x but absent from the public price list,
  // so its prices are null and it must be treated as unpriced.
  const hunyuan = modelCostUsd('hunyuan-h4-preview', { input: 1e6 })
  assert.equal(hunyuan.priced, true)
  assert.equal(hunyuan.usd, 0, 'a null price contributes nothing rather than a fabricated amount')
})

test('model ids are matched case-insensitively and trimmed', () => {
  assert.equal(normalizeModelId('  DeepSeek-V4.1-Flash '), 'deepseek-v4.1-flash')
  assert.equal(designPlanModel('DEEPSEEK-V4.1-FLASH')?.multiplier, 0.5)
  assert.equal(designPlanModel('') === null, true)
  assert.equal(designPlanModel(null) === null, true)
})

test('every documented Design Plan model carries the pricing-table multiplier', () => {
  // Transcribed from open-design.ai/zh/model-credits/ — a drift here would
  // silently change the cap the user is told they have.
  const expected = {
    'deepseek-v4.1-flash': 0.5,
    'minimax-m3.1-flash': 1,
    'mimo-v2.6-flash': 1,
    'mimo-v2.6-pro': 1,
    'hunyuan-h4-preview': 1,
    'deepseek-v4-flash': 1,
    'deepseek-v4-flash-vision-exp': 1,
    'deepseek-v4-pro': 1,
    'glm-5.3-flash': 1,
    'kimi-k2.7-code': 1,
    'claude-haiku-5.5': 2,
    'glm-5.3-flash-x': 2,
    'gpt-6-luna': 4,
  }
  assert.deepEqual(
    Object.fromEntries(Object.entries(DESIGN_PLAN_MODELS).map(([id, model]) => [id, model.multiplier])),
    expected,
  )
})
