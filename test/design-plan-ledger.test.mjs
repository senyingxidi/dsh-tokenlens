/**
 * Design Plan period ledger tests (v1.5.0).
 *
 * Open Design serves rolling 5h/7d windows but no period-usage endpoint, so the
 * Host accumulates what it observes. The rules that matter:
 *   - only the WEEKLY window is recorded (5h measures the same spend: summing
 *     both double-counts, verified live);
 *   - a window instance keeps its HIGHEST observed usedCredits;
 *   - a window that disappears keeps its final value;
 *   - a period whose earliest window is not the period start is incomplete.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  LEDGER_VERSION,
  WEEKLY_SECONDS,
  defaultDesignPlanLedgerFile,
  emptyLedger,
  loadLedger,
  observeDesignPlan,
  saveLedger,
  summarizeDesignPlan,
} from '../lib/design-plan-ledger.mjs'

const PERIOD_START = '2026-11-02T09:53:18.000Z'
const PERIOD_END = '2026-12-02T09:53:18.000Z'
const W1 = '2026-11-02T09:53:18.000Z'
const W2 = '2026-11-09T09:53:18.000Z'

/** One weekly window row as the upstream funding-check reports it. */
function weekly(start, used, limit = 150000, resetsAt = undefined) {
  return {
    policyId: `policy_${start}`,
    durationSeconds: WEEKLY_SECONDS,
    usedCredits: String(used),
    limitCredits: String(limit),
    remainingCredits: String(limit - used),
    windowStart: start,
    resetsAt: resetsAt ?? new Date(Date.parse(start) + WEEKLY_SECONDS * 1000).toISOString(),
  }
}

/** A 5-hour window row (recorded never — it double-counts the weekly window). */
function rolling(start, used, limit = 50000) {
  return {
    policyId: `policy_5h_${start}`,
    durationSeconds: 18000,
    usedCredits: String(used),
    limitCredits: String(limit),
    remainingCredits: String(limit - used),
    windowStart: start,
    resetsAt: new Date(Date.parse(start) + 18000 * 1000).toISOString(),
  }
}

function fold(ledger, windows, now = Date.parse('2026-11-03T00:00:00.000Z')) {
  return observeDesignPlan(ledger, {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    creditsPerUsd: 10000,
    windows,
    now,
  })
}

test('the ledger file defaults to $DSH_HOME/dsh-tokenlens/design-plan-ledger.json', () => {
  assert.equal(
    defaultDesignPlanLedgerFile('C:\\users\\x\\.dsh'),
    join('C:\\users\\x\\.dsh', 'dsh-tokenlens', 'design-plan-ledger.json'),
  )
})

test('loadLedger tolerates a missing, malformed or foreign-version file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tokenlens-ledger-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  assert.deepEqual(loadLedger(join(dir, 'missing.json')), emptyLedger())
  const malformed = join(dir, 'bad.json')
  await saveLedger(malformed, { version: 99, periods: {} })
  const raw = JSON.parse(await readFile(malformed, 'utf8'))
  assert.equal(raw.version, LEDGER_VERSION, 'save always stamps the current version')
  assert.deepEqual(loadLedger(malformed), emptyLedger())
})

test('the Design Plan figure comes from server credits, excluding wallet-paid usage (v1.6.4)', () => {
  // Wallet-funded calls never touch `usedCredits`; they debit `balanceUsd`
  // instead. Deriving the dollar figure from credits is therefore what keeps the
  // display Design-Plan-only. The locally priced token total includes wallet
  // calls, so it can exceed this figure and is reported separately.
  const { ledger } = fold(emptyLedger(), [weekly(W1, 149932)])
  const summary = summarizeDesignPlan(ledger, PERIOD_START, {
    // A local token estimate that includes wallet-paid usage: deliberately higher.
    listPriceUsd: 40,
    monthlyCapUsd: 120,
    multiplier: 0.5,
  })
  // 149,932 credits / 10,000 = $14.9932 credit value; / 0.5x = $29.99 list price.
  assert.ok(Math.abs(summary.estimatedUsd - 29.9864) < 0.01, `estimatedUsd was ${summary.estimatedUsd}`)
  assert.equal(summary.localPricedUsd, 40, 'the wallet-inclusive estimate is kept separately')
  assert.ok(summary.estimatedUsd < summary.localPricedUsd, 'Design Plan figure excludes wallet usage')
  // Cross-check against the documented 7-day cap: 30 * (149,932 / 150,000) = $29.99.
  assert.ok(Math.abs(30 * (149932 / 150000) - summary.estimatedUsd) < 0.01)
})

test('without a known multiplier the Design Plan figure falls back to the credit value', () => {
  const { ledger } = fold(emptyLedger(), [weekly(W1, 150000)])
  const noMultiplier = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(noMultiplier.estimatedUsd, 15, '150,000 credits at 10,000/USD')
  assert.equal(noMultiplier.multiplier, null)
})

test('the period percentage divides by four weekly windows (the published monthly cap)', () => {
  // The pricing table states the monthly cap as exactly 4 × the weekly window for
  // every tier (Go $120 vs $30, Plus $160 vs $40, Pro $360 vs $90, Max $600 vs $150).
  const { ledger } = fold(emptyLedger(), [weekly(W1, 150000)])
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.limitPerWindow, 150000)
  assert.equal(summary.periodLimitCredits, 600000, 'four weekly windows make the monthly allowance')
  assert.equal(summary.percent, 25, '150000 of 600000 credits')
})

test('the period percentage is capped at 100 even when the windows overshoot', () => {
  // A 31-day period can hold five weekly windows, so the tally can exceed the
  // four-window allowance; the percentage must still clamp at 100.
  const starts = [W1, W2, '2026-11-16T09:53:18.000Z', '2026-11-23T09:53:18.000Z', '2026-11-30T09:53:18.000Z']
  const windows = starts.map((start) => weekly(start, 150000))
  const { ledger } = fold(emptyLedger(), windows)
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.usedCredits, 750000, 'five fully used windows')
  assert.equal(summary.percent, 100, '750000 of 600000 clamps at 100%')
})

test('a period with no usable weekly limit reports no percentage rather than inventing one', () => {
  // A window whose limit is missing leaves no honest denominator.
  const { ledger } = observeDesignPlan(emptyLedger(), {
    periodStart: PERIOD_START,
    creditsPerUsd: 10000,
    windows: [{ durationSeconds: WEEKLY_SECONDS, usedCredits: '100', windowStart: W1 }],
    now: Date.parse('2026-11-03T00:00:00.000Z'),
  })
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.usedCredits, 100)
  assert.equal(summary.limitPerWindow, null)
  assert.equal(summary.periodLimitCredits, null)
  assert.equal(summary.percent, null, 'no percentage without a denominator')
})

test('the period percentage matches the sum of window percentages when limits agree', () => {
  // One finished window plus the current one: 2 of 4 windows.
  let { ledger } = fold(emptyLedger(), [weekly(W1, 150000)])
  ;({ ledger } = fold(ledger, [weekly(W1, 150000), weekly(W2, 75000)]))
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.percent, 37.5, '(150000 + 75000) / 600000')
})

test('only the weekly window is recorded, so overlapping limits never double-count', () => {
  const { ledger } = fold(emptyLedger(), [rolling(W1, 48195), weekly(W1, 48195)])
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.windows, 1, 'one weekly window, not two window rows')
  assert.equal(summary.usedCredits, 48195, 'the identical 5h number is not added again')
})

test('a window instance keeps its highest observed usage', () => {
  let { ledger } = fold(emptyLedger(), [weekly(W1, 1000)])
  ;({ ledger } = fold(ledger, [weekly(W1, 2500)]))
  // A transient smaller read (a retry, or a partial upstream answer) must not lower it.
  ;({ ledger } = fold(ledger, [weekly(W1, 900)]))
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.usedCredits, 2500)
  assert.equal(summary.windows, 1)
})

test('windows accumulate across the period and the estimate converts credits to USD', () => {
  let { ledger } = fold(emptyLedger(), [weekly(W1, 50000)])
  ;({ ledger } = fold(ledger, [weekly(W1, 100000)]))
  ;({ ledger } = fold(ledger, [weekly(W1, 150000), weekly(W2, 30000)]))
  const summary = summarizeDesignPlan(ledger, PERIOD_START)
  assert.equal(summary.windows, 2)
  assert.equal(summary.usedCredits, 180000, 'the finished window keeps its final value')
  assert.equal(summary.estimatedUsd, 18, '180000 credits at 10000/USD')
  assert.equal(summary.limitPerWindow, 150000)
})

test('completeness is only claimed when the first window starts at the period start', () => {
  const { ledger: covering } = fold(emptyLedger(), [weekly(W1, 1000)])
  assert.equal(summarizeDesignPlan(covering, PERIOD_START).complete, true)

  // Observed mid-period: earlier windows of this period were never seen.
  const { ledger: late } = fold(emptyLedger(), [weekly(W2, 1000)])
  const partial = summarizeDesignPlan(late, PERIOD_START)
  assert.equal(partial.complete, false)
  assert.equal(partial.since, W2)
})

test('a period with no observations summarizes to null', () => {
  assert.equal(summarizeDesignPlan(emptyLedger(), PERIOD_START), null)
  assert.equal(summarizeDesignPlan(emptyLedger(), ''), null)
  assert.equal(summarizeDesignPlan(null, PERIOD_START), null)
})

test('an observation without a period start is ignored', () => {
  const ledger = emptyLedger()
  const result = observeDesignPlan(ledger, { periodStart: '', windows: [weekly(W1, 1)], now: 0 })
  assert.equal(result.changed, false)
  assert.deepEqual(result.ledger, ledger)
})

test('a new billing period starts a fresh tally', () => {
  const { ledger } = fold(emptyLedger(), [weekly(W1, 150000)])
  const nextStart = '2026-12-02T09:53:18.000Z'
  const next = observeDesignPlan(ledger, {
    periodStart: nextStart,
    periodEnd: '2027-01-02T09:53:18.000Z',
    creditsPerUsd: 10000,
    windows: [weekly(nextStart, 5000)],
    now: Date.parse('2026-12-03T00:00:00.000Z'),
  })
  assert.equal(summarizeDesignPlan(next.ledger, PERIOD_START).usedCredits, 150000, 'the old period is kept')
  assert.equal(summarizeDesignPlan(next.ledger, nextStart).usedCredits, 5000, 'the new period starts from zero')
})

test('the ledger round-trips through disk and caps its history', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'tokenlens-ledger-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'design-plan-ledger.json')
  const { ledger } = fold(emptyLedger(), [weekly(W1, 1234)])
  saveLedger(file, ledger)
  const loaded = loadLedger(file)
  assert.equal(summarizeDesignPlan(loaded, PERIOD_START).usedCredits, 1234)

  // Eight periods in, only the newest six survive.
  let many = emptyLedger()
  for (let month = 1; month <= 8; month += 1) {
    const start = `2026-${String(month).padStart(2, '0')}-02T00:00:00.000Z`
    many = observeDesignPlan(many, {
      periodStart: start,
      creditsPerUsd: 10000,
      windows: [weekly(start, 100)],
      now: Date.parse('2026-06-01T00:00:00.000Z'),
    }).ledger
  }
  const saved = saveLedger(file, many)
  assert.equal(Object.keys(saved.periods).length, 6)
  assert.ok(saved.periods['2026-08-02T00:00:00.000Z'] !== undefined, 'the newest period is kept')
  assert.equal(saved.periods['2026-01-02T00:00:00.000Z'], undefined, 'the oldest is dropped')
})
