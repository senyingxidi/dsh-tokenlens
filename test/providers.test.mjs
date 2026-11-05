/**
 * Provider adapter tests.
 *
 * Fixtures come from the live APIs (2026-10-25) where possible:
 *   - OpenCode: real usage payload;
 *   - Command Code: the real free-tier payload of this machine's key, plus a
 *     synthetic paid-plan payload built from the documented response shape;
 *   - DeepSeek: the real `/user/balance` payload.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { UsageError } from '../lib/go-usage.mjs'
import {
  ADAPTERS,
  adapterFor,
  balanceFromWallets,
  canonicalProviderId,
  commandcodePlanLabel,
  joinUrl,
  makeWindow,
  parseCommandCode,
  parseDeepseekBalance,
  parseMoonshotBalance,
  parseOpenRouterCredits,
  parseSiliconflowBalance,
  parseStepfunBalance,
  parseNovitaBalance,
  parseHyperbolicBalance,
  parseDeepinfraBalance,
  parseZaiQuota,
  parseMinimaxRemains,
  parseOpencodeGo,
  parseOpenDesignSummary,
  parseOpenDesignUsage,
  parseOpenDesignWallet,
  toNumber,
  usedPercent,
} from '../lib/providers.mjs'

const NOW = Date.parse('2026-10-25T09:55:00.000Z')

const OPENCODE_PAYLOAD = {
  usage: {
    rolling: { status: 'ok', percent: 8, resetsAt: '2026-10-25T11:31:25.000Z' },
    weekly: { status: 'ok', percent: 24, resetsAt: '2026-10-26T00:00:00.000Z' },
    monthly: { status: 'ok', percent: 32, resetsAt: '2026-11-09T14:08:58.000Z' },
  },
}

/** The live free-tier response of this machine's Command Code key. */
const COMMANDCODE_FREE = {
  credits: {
    credits: { belowThreshold: false, creditThreshold: 0, monthlyCredits: 0, purchasedCredits: 0, freeCredits: 0 },
    windowLimits: { limited: false, exceeded: null, fiveHour: null, weekly: null },
    sandboxAccess: false,
    sandboxMinutes: null,
  },
  subscription: { success: true, data: null },
  whoami: { success: true, user: { id: 'u1', name: 'Acme Studio', email: 'x@example.com', userName: 'test-user' }, org: null },
}

/** A synthetic paid plan shaped exactly like the documented response. */
const COMMANDCODE_PAID = {
  credits: {
    credits: { monthlyCredits: 4.5, purchasedCredits: 0, monthlyCreditsGranted: 10, premiumMonthlyCredits: 0, opensourceMonthlyCredits: 0 },
    windowLimits: {
      limited: false,
      exceeded: null,
      fiveHour: { cap: 2.5, used: 0.5, resetAt: 1793000000 },
      weekly: { cap: 7.5, used: 3, resetAt: '2026-11-01T00:00:00.000Z' },
    },
  },
  subscription: { success: true, data: { planId: 'individual-go-v1', status: 'active', currentPeriodEnd: '2026-11-09T00:00:00.000Z' } },
  whoami: { success: true, user: { name: 'Acme Studio', userName: 'test-user' } },
}

test('toNumber / usedPercent handle strings, nulls and zero caps', () => {
  assert.equal(toNumber('2.26'), 2.26)
  assert.equal(toNumber(''), null)
  assert.equal(toNumber(Number.NaN), null)
  assert.equal(usedPercent(0.5, 2.5), 20)
  assert.equal(usedPercent(3, '7.5'), 40)
  assert.equal(usedPercent(1, 0), null)
  assert.equal(usedPercent(null, 2), null)
  assert.equal(usedPercent(5, 2), 100, 'over-limit clamps to 100')
})

test('makeWindow normalizes ISO/epoch timestamps and the percentage', () => {
  const fromIso = makeWindow('rolling', { percent: '8', status: 'ok', resetsAt: '2026-10-25T11:31:25.000Z' }, NOW)
  assert.equal(fromIso.percent, 8)
  assert.equal(fromIso.resetsAt, '2026-10-25T11:31:25.000Z')
  assert.equal(fromIso.remainingMs, Date.parse('2026-10-25T11:31:25.000Z') - NOW)
  assert.equal(fromIso.used, undefined, 'no native capacity unless the provider reports it')
  assert.equal(fromIso.cap, undefined)
  assert.equal(fromIso.unit, undefined)
  const withMoney = makeWindow('rolling', { percent: 20, used: '0.5', cap: 2.5, unit: 'USD' }, NOW)
  assert.equal(withMoney.used, 0.5)
  assert.equal(withMoney.cap, 2.5)
  assert.equal(withMoney.unit, 'USD')
  const partialMoney = makeWindow('rolling', { percent: 20, used: 1 }, NOW)
  assert.equal(partialMoney.used, 1)
  assert.equal(partialMoney.cap, undefined)
  assert.equal(partialMoney.unit, undefined, 'no unit without both numbers')
  const fromEpochSeconds = makeWindow('monthly', { percent: 50, resetsAt: 1793000000 }, NOW)
  assert.equal(fromEpochSeconds.resetsAt, new Date(1793000000 * 1000).toISOString())
  const missing = makeWindow('weekly', { percent: 12 }, NOW)
  assert.equal(missing.resetsAt, null)
  assert.equal(missing.remainingMs, null)
  assert.equal(missing.status, 'unknown')
  assert.equal(makeWindow('weekly', { percent: null }, NOW).percent, null)
})

test('parseOpencodeGo maps the three percentage windows', () => {
  const result = parseOpencodeGo(OPENCODE_PAYLOAD, NOW)
  assert.deepEqual(Object.keys(result.windows), ['rolling', 'weekly', 'monthly'])
  assert.equal(result.windows.rolling.percent, 8)
  assert.equal(result.windows.weekly.percent, 24)
  assert.equal(result.windows.monthly.resetsAt, '2026-11-09T14:08:58.000Z')
})

test('parseOpencodeGo is tolerant of a missing window but not of a missing usage object', () => {
  const partial = parseOpencodeGo({ usage: { rolling: { percent: 5 } } }, NOW)
  assert.equal(partial.windows.rolling.percent, 5)
  assert.equal(partial.windows.weekly, null)
  assert.equal(partial.windows.monthly, null)
  assert.throws(() => parseOpencodeGo({}, NOW), (error) => error instanceof UsageError && error.code === 'parse')
  assert.throws(() => parseOpencodeGo({ usage: {} }, NOW), (error) => error.code === 'parse')
})

test('parseCommandCode handles the live free-tier payload (no plan, no windows)', () => {
  const result = parseCommandCode(COMMANDCODE_FREE, NOW)
  assert.equal(result.plan, null)
  assert.equal(result.windows.rolling, null)
  assert.equal(result.windows.weekly, null)
  assert.equal(result.windows.monthly.percent, null, 'an unsized monthly credit is not fake 0%')
  assert.equal(result.windows.monthly.status, 'unknown')
  assert.equal(result.windows.monthly.used, undefined, 'no money when the API did not report it')
  assert.equal(result.windows.monthly.cap, undefined)
  assert.equal(result.windows.monthly.unit, undefined)
  assert.deepEqual(result.credits, { remaining: 0, granted: null, purchased: 0 })
  assert.equal(result.account.userName, 'test-user')
})

test('parseCommandCode maps a paid plan: 5-hour, weekly and monthly credit usage', () => {
  const result = parseCommandCode(COMMANDCODE_PAID, NOW)
  assert.deepEqual(result.plan, { id: 'individual-go-v1', label: 'Go' })
  assert.equal(result.windows.rolling.percent, 20)
  assert.equal(result.windows.weekly.percent, 40)
  assert.equal(result.windows.monthly.percent, 55, '(10 - 4.5) / 10')
  assert.equal(result.windows.monthly.resetsAt, '2026-11-09T00:00:00.000Z')
  assert.deepEqual(result.credits, { remaining: 4.5, granted: 10, purchased: 0 })
  assert.equal(result.windows.rolling.resetsAt, new Date(1793000000 * 1000).toISOString())
  // Provider-native capacity in dollars travels with the window.
  assert.equal(result.windows.rolling.used, 0.5)
  assert.equal(result.windows.rolling.cap, 2.5)
  assert.equal(result.windows.rolling.unit, 'USD')
  assert.equal(result.windows.weekly.used, 3)
  assert.equal(result.windows.weekly.cap, 7.5)
  assert.equal(result.windows.monthly.used, 5.5)
  assert.equal(result.windows.monthly.cap, 10)
  assert.equal(result.windows.monthly.unit, 'USD')
})

test('parseCommandCode reads `limited` as a capability flag, not as a warning (v1.6.6)', () => {
  // The live GOAT payload says `windowLimits.limited: true` while every
  // `fiveHour.exceeded` / `weekly.exceeded` is false: `limited` only means "this
  // plan paces you with rolling windows". Emitting it as a status made the client
  // paint a 6%-used account as critical, because PROTOCOL renders any non-"ok"
  // status as an alert. Only a real `exceeded` may do that.
  const pacingPlan = structuredClone(COMMANDCODE_PAID)
  pacingPlan.credits.windowLimits.limited = true
  const paced = parseCommandCode(pacingPlan, NOW)
  assert.equal(paced.windows.rolling.status, 'ok', 'merely having windows is not a warning')
  assert.equal(paced.windows.weekly.status, 'ok')

  const exhausted = structuredClone(COMMANDCODE_PAID)
  exhausted.credits.windowLimits.limited = true
  exhausted.credits.windowLimits.fiveHour.exceeded = true
  const exceeded = parseCommandCode(exhausted, NOW)
  assert.equal(exceeded.windows.rolling.status, 'limited', 'a real exhaustion IS a status')
  assert.equal(exceeded.windows.weekly.status, 'ok', 'the untouched window stays ok')

  const noSubscription = parseCommandCode({ ...COMMANDCODE_PAID, subscription: undefined }, NOW)
  assert.equal(noSubscription.plan, null)
  assert.equal(noSubscription.windows.monthly.percent, 55, 'the API-reported grant still sizes the month')
  assert.equal(noSubscription.windows.monthly.resetsAt, null, 'no billing period is known')
})

test('the monthly percentage is derived from remaining + period spend (v1.6.6)', () => {
  // A paid GOAT plan omits `monthlyCreditsGranted`, so the grant comes from the
  // arithmetic proved against the live API:
  //   grant = credits.monthlyCredits (remaining) + usage.totalMonthlyCredits (spend)
  // Real values captured 2026-11-05 on `individual-goat`.
  const paid = {
    credits: {
      credits: { monthlyCredits: 69.085104928, purchasedCredits: 0 },
      windowLimits: {
        limited: true,
        fiveHour: { cap: 14, used: 0.9119659668, resetAt: 1793904066643 },
        weekly: { cap: 35, used: 0.9119659668, resetAt: 1794490866643 },
      },
    },
    subscription: { success: true, data: { planId: 'individual-goat', status: 'active', currentPeriodEnd: '2026-12-05T13:36:10.000Z' } },
    usageSummary: { totalMonthlyCredits: 0.9119659668, periodBasis: 'billing-period' },
  }
  const parsed = parseCommandCode(paid, NOW)
  // 69.085104928 + 0.9119659668 = 69.9970708948 (the summary lags a fraction).
  assert.ok(Math.abs(parsed.windows.monthly.cap - 69.9970708948) < 1e-9, `cap was ${parsed.windows.monthly.cap}`)
  assert.ok(Math.abs(parsed.windows.monthly.used - 0.9119659668) < 1e-9, 'used is the period spend')
  assert.ok(Math.abs(parsed.windows.monthly.percent - 1.3028) < 0.01, `percent was ${parsed.windows.monthly.percent}`)
  assert.equal(parsed.windows.monthly.unit, 'USD')
  assert.equal(parsed.windows.monthly.resetsAt, '2026-12-05T13:36:10.000Z', 'the period end comes from the subscription')
  assert.equal(parsed.windows.monthly.status, 'ok', 'a 1%-used month is not a warning')
  assert.deepEqual(parsed.plan, { id: 'individual-goat', label: 'GOAT' })
  assert.equal(parsed.credits.granted, parsed.windows.monthly.cap, 'the derived grant is reported on credits too')
})

test('the monthly denominator never follows the selected model (v1.6.6)', () => {
  // GOAT advertises "up to $100" and per-model allowances ($100 on DeepSeek V4.1
  // Flash, $60 on others) because the same credits stretch further on a discounted
  // model — but the pool is ONE number. Dividing by a per-model figure would make
  // the meter move when the user merely switches models, so the parser takes no
  // model input at all and the derived pool stays 70 whatever was used.
  const base = {
    credits: {
      credits: { monthlyCredits: 69.1272003646, purchasedCredits: 0 },
      windowLimits: { limited: true, fiveHour: { cap: 14, used: 0.8727996354 }, weekly: { cap: 35, used: 0.8727996354 } },
    },
    subscription: { success: true, data: { planId: 'individual-goat', currentPeriodEnd: '2026-12-05T13:36:10.000Z' } },
    usageSummary: { totalMonthlyCredits: 0.8727996354 },
  }
  const parsed = parseCommandCode(base, NOW)
  // 69.1272003646 + 0.8727996354 is exactly 70 — the pool, not a model allowance.
  assert.equal(parsed.windows.monthly.cap, 70, 'the derived pool is exactly the plan pool')
  // The per-model "$100" must NOT appear as a denominator.
  assert.notEqual(parsed.windows.monthly.cap, 100)
  assert.notEqual(parsed.windows.monthly.cap, 60)
})

test('a plan that reports its grant still wins over the derived pool', () => {
  // The derivation is a fallback: a payload carrying monthlyCreditsGranted is
  // authoritative and is used verbatim.
  const parsed = parseCommandCode(
    {
      ...structuredClone(COMMANDCODE_PAID),
      usageSummary: { totalMonthlyCredits: 5.5 },
    },
    NOW,
  )
  assert.equal(parsed.windows.monthly.cap, 10, 'the reported grant is used, not the derivation')
  assert.equal(parsed.windows.monthly.percent, 55)
})

test('plan labels are documented ids only; grants are never guessed', () => {
  assert.equal(commandcodePlanLabel('individual-go-v1'), 'Go')
  assert.equal(commandcodePlanLabel('individual-go'), 'Go')
  // v1.6.6: GOAT/Pro/Max/Ultra ids are documented on the pricing page.
  assert.equal(commandcodePlanLabel('individual-goat'), 'GOAT')
  assert.equal(commandcodePlanLabel('individual-pro'), 'Pro')
  assert.equal(commandcodePlanLabel('unknown-plan'), 'unknown-plan', 'an unknown plan keeps its raw id')
  assert.equal(commandcodePlanLabel(null), null)

  // Without either a reported grant or a usage summary, the monthly percentage
  // stays null: the plugin never sizes it from a plan catalog.
  const noGrant = structuredClone(COMMANDCODE_PAID)
  delete noGrant.credits.credits.monthlyCreditsGranted
  const noGrantParsed = parseCommandCode(noGrant, NOW)
  assert.equal(noGrantParsed.windows.monthly.percent, null)
  assert.deepEqual(noGrantParsed.credits, { remaining: 4.5, granted: null, purchased: 0 })
})

test('canonicalProviderId maps picker ids onto adapters', () => {
  assert.equal(canonicalProviderId('deepseek-official'), 'deepseek')
  assert.equal(canonicalProviderId('opencode-go'), 'opencode-go')
  assert.equal(canonicalProviderId('commandcode'), 'commandcode')
  assert.equal(canonicalProviderId('deepseek-account'), 'deepseek-account')
  assert.equal(canonicalProviderId(undefined), undefined)
})

test('balanceFromWallets projects Platform wallets', () => {
  const result = balanceFromWallets(
    [{ currency: 'CNY', balance: '2.2679' }, { currency: 'USD', balance: '0.00' }],
    [{ currency: 'CNY', balance: '1.50' }],
  )
  assert.deepEqual(result.balance, {
    amount: 2.2679,
    currency: 'CNY',
    wallets: [{ currency: 'CNY', amount: 2.2679 }, { currency: 'USD', amount: 0 }],
    bonus: [{ currency: 'CNY', amount: 1.5 }],
  })
  assert.throws(() => balanceFromWallets([]), (error) => error.code === 'parse')
})

test('the DeepSeek Account adapter reads the account service, not the network', async () => {
  let requestedClient = null
  const result = await ADAPTERS['deepseek-account'].read({
    provider: { service: 'deepseekAccount', apiKeyRef: '' },
    fetchJson: async () => {
      throw new Error('the account adapter must not touch the network')
    },
    services: {
      account: {
        async getBalance(client) {
          requestedClient = client
          return { status: 'ready', value: [{ currency: 'CNY', balance: '12.34' }], bonusWallets: [] }
        },
      },
    },
    now: NOW,
  })
  assert.equal(result.balance.amount, 12.34)
  assert.equal(result.balance.currency, 'CNY')
  assert.equal(requestedClient.locale, 'zh-CN')
  assert.equal(typeof requestedClient.version, 'string')
  assert.equal(Number.isInteger(requestedClient.timezoneOffsetSeconds), true)

  // Signed out and failed queries become typed errors the client renders as
  // "hide the chip" and "warning + retry" respectively.
  await assert.rejects(
    ADAPTERS['deepseek-account'].read({ provider: {}, services: { account: { getBalance: async () => null } }, now: NOW }),
    (error) => error instanceof UsageError && error.code === 'missing-key',
  )
  await assert.rejects(
    ADAPTERS['deepseek-account'].read({
      provider: {},
      services: { account: { getBalance: async () => ({ status: 'failed' }) } },
      now: NOW,
    }),
    (error) => error.code === 'network' && error.retryable === true,
  )
  await assert.rejects(
    ADAPTERS['deepseek-account'].read({ provider: {}, services: {}, now: NOW }),
    (error) => error.code === 'missing-key',
  )
})

test('parseDeepseekBalance reads the live balance payload', () => {
  const result = parseDeepseekBalance({
    is_available: true,
    balance_infos: [{ currency: 'CNY', total_balance: '2.26', granted_balance: '0.00', topped_up_balance: '2.26' }],
  })
  assert.deepEqual(result.balance, { amount: 2.26, currency: 'CNY', granted: 0, toppedUp: 2.26 })
  assert.equal(result.available, true)
  assert.equal(result.windows.rolling, null)
  assert.throws(() => parseDeepseekBalance({}), (error) => error.code === 'parse')
})

test('joinUrl and adapterFor', () => {
  assert.equal(joinUrl('https://opencode.ai/', '/inference/go/v1/usage'), 'https://opencode.ai/inference/go/v1/usage')
  assert.equal(joinUrl('https://api.deepseek.com', 'user/balance'), 'https://api.deepseek.com/user/balance')
  assert.throws(() => joinUrl('', '/x'), (error) => error.code === 'disabled')
  assert.equal(adapterFor('opencode-go'), ADAPTERS['opencode-go'])
  assert.equal(adapterFor('commandcode'), ADAPTERS.commandcode)
  assert.equal(adapterFor('some-future-provider'), undefined)
})

test('the Command Code adapter survives a failing optional subscription/whoami read', async () => {
  const reads = []
  const fetchJson = async (url) => {
    reads.push(url)
    if (url.endsWith('/alpha/billing/credits')) return COMMANDCODE_PAID.credits
    if (url.endsWith('/alpha/billing/subscriptions')) return COMMANDCODE_PAID.subscription
    if (url.endsWith('/alpha/whoami')) throw new UsageError('network', 'offline')
    if (url.endsWith('/alpha/usage/summary')) throw new UsageError('network', 'offline')
    throw new Error(`unexpected url ${url}`)
  }
  const result = await ADAPTERS.commandcode.read({
    provider: { baseURL: 'https://api.commandcode.ai' },
    fetchJson,
    now: NOW,
  })
  assert.equal(readChecks(reads), true)
  assert.equal(result.windows.rolling.percent, 20)
  assert.equal(result.account, null, 'whoami failure only costs the account label')
  // The reported grant still sizes the month when the summary is unreachable:
  // granted 10, remaining 4.5 -> 55%.
  assert.equal(result.windows.monthly.percent, 55, 'the reported grant carries the month on its own')
})

test('the OpenCode adapter reads the usage endpoint', async () => {
  const urls = []
  const result = await ADAPTERS['opencode-go'].read({
    provider: { baseURL: 'https://opencode.ai', usagePath: '/inference/go/v1/usage' },
    fetchJson: async (url) => {
      urls.push(url)
      return OPENCODE_PAYLOAD
    },
    now: NOW,
  })
  assert.deepEqual(urls, ['https://opencode.ai/inference/go/v1/usage'])
  assert.equal(result.windows.weekly.percent, 24)
})

function readChecks(urls) {
  return (
    // v1.6.6: the usage aggregate joined the read so the monthly percentage can
    // be sized; it is optional, so it is allowed but not required here.
    urls.length >= 3 &&
    urls.length <= 4 &&
    urls.some((url) => url.endsWith('/alpha/billing/credits')) &&
    urls.some((url) => url.endsWith('/alpha/billing/subscriptions')) &&
    urls.some((url) => url.endsWith('/alpha/whoami')) &&
    urls.every(
      (url) =>
        url.endsWith('/alpha/billing/credits') ||
        url.endsWith('/alpha/billing/subscriptions') ||
        url.endsWith('/alpha/whoami') ||
        url.endsWith('/alpha/usage/summary'),
    )
  )
}

test('StepFun flat account payload becomes a balance', () => {
  const result = parseStepfunBalance({ object: 'account', type: 'prepaid', balance: 12.5, total_cash_balance: 2.5, total_voucher_balance: 10 })
  assert.equal(result.balance.amount, 12.5)
  assert.equal(result.balance.currency, 'CNY')
  assert.equal(result.balance.granted, 10)
  assert.equal(result.balance.toppedUp, 2.5)
  assert.equal(result.balance.postpaid, false)
  assert.equal(parseStepfunBalance({ balance: 1, type: 'postpaid' }, 'https://api.stepfun.ai').balance.currency, 'USD')
  assert.throws(() => parseStepfunBalance({ object: 'account' }), (error) => error.code === 'parse')
})

test('Novita balances are converted from 1/10000 USD', () => {
  const result = parseNovitaBalance({ availableBalance: '125000', cashBalance: '100000', creditLimit: '25000' })
  assert.equal(result.balance.amount, 12.5)
  assert.equal(result.balance.currency, 'USD')
  assert.equal(result.balance.toppedUp, 10)
})

test('Hyperbolic cents and DeepInfra prepaid signs normalize to USD', () => {
  assert.equal(parseHyperbolicBalance({ balanceCents: 12345 }).balance.amount, 123.45)
  const prepaid = parseDeepinfraBalance({ data: { stripe_balance: -12.34, spending_limit: 50 } })
  assert.equal(prepaid.balance.amount, 12.34)
  assert.equal(prepaid.balance.owed, 0)
  const owed = parseDeepinfraBalance({ data: { stripe_balance: 8 } })
  assert.equal(owed.balance.amount, 0)
  assert.equal(owed.balance.owed, 8)
})

test('Z.ai quota rows map to the canonical 5h/weekly/monthly windows', () => {
  const now = Date.now()
  const payload = { success: true, data: { level: 'pro', limits: [
    { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 42, nextResetTime: now + 3600_000 },
    { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 52, nextResetTime: now + 86_400_000 },
    { type: 'TIME_LIMIT', unit: 5, number: 1, percentage: 12.3, nextResetTime: now + 86_400_000 },
  ] } }
  const result = parseZaiQuota(payload, now)
  assert.equal(result.windows.rolling.percent, 42)
  assert.equal(result.windows.weekly.percent, 52)
  assert.equal(result.windows.monthly.percent, 12.3)
  assert.equal(result.windows.rolling.resetsAt, new Date(now + 3600_000).toISOString())
  assert.equal(result.plan.label, 'pro')
  assert.throws(() => parseZaiQuota({ success: false }), (error) => error.code === 'parse')
  assert.throws(() => parseZaiQuota({ success: true, data: { limits: [] } }), (error) => error.code === 'parse')
})

test('MiniMax remaining percentages are inverted into used windows', () => {
  const now = Date.now()
  const payload = {
    base_resp: { status_code: 0, status_msg: 'success' },
    model_remains: [
      { model_name: 'general', current_interval_remaining_percent: 72.5, current_weekly_remaining_percent: 85, current_weekly_status: 1, end_time: now + 3600_000, weekly_end_time: now + 86_400_000 },
    ],
  }
  const result = parseMinimaxRemains(payload, now)
  assert.equal(result.windows.rolling.percent, 27.5)
  assert.equal(result.windows.weekly.percent, 15)
  assert.throws(() => parseMinimaxRemains({ base_resp: { status_code: 1004 } }), (error) => error.code === 'parse')
})

test('OpenDesign windows map used/limit credits onto the canonical windows', () => {
  const payload = {
    workspaceId: 'ws_test',
    workspaceMemberId: 'member_1',
    eligible: true,
    windows: [
      { policyId: 'plan-5h', durationSeconds: 18000, usedCredits: '250', remainingCredits: '750', limitCredits: '1000', resetsAt: '2026-10-25T11:00:00.000Z' },
      { policyId: 'plan-7d', durationSeconds: 604800, usedCredits: '1200', remainingCredits: '0', limitCredits: '1000', resetsAt: '2026-11-01T00:00:00.000Z' },
      { policyId: 'plan-30d', durationSeconds: 2592000, usedCredits: '0', remainingCredits: '500', limitCredits: '500' },
      { policyId: 'plan-year', durationSeconds: 31536000, usedCredits: '1', remainingCredits: '1', limitCredits: '2' },
    ],
  }
  const result = parseOpenDesignUsage(payload, 'ws_test', NOW)
  assert.equal(result.windows.rolling.percent, 25)
  assert.equal(result.windows.rolling.resetsAt, '2026-10-25T11:00:00.000Z')
  assert.equal(result.windows.rolling.remainingMs, Date.parse('2026-10-25T11:00:00.000Z') - NOW)
  assert.equal(result.windows.weekly.percent, 100, 'used above the limit clamps at 100%')
  assert.equal(result.windows.monthly.percent, 0, 'a zero-usage window is a real zero, not a gap')
})

test('OpenDesign usage refuses mismatched workspaces and malformed windows', () => {
  const valid = {
    workspaceId: 'ws',
    eligible: true,
    windows: [{ policyId: 'p', durationSeconds: 18000, usedCredits: '1', remainingCredits: '1', limitCredits: '2' }],
  }
  assert.throws(() => parseOpenDesignUsage({ ...valid, workspaceId: 'other' }, 'ws', NOW), (error) => error.code === 'parse')
  assert.throws(() => parseOpenDesignUsage({ ...valid, windows: 'nope' }, 'ws', NOW), (error) => error.code === 'parse')
  assert.throws(
    () => parseOpenDesignUsage({ ...valid, windows: [{ ...valid.windows[0], usedCredits: '1.5' }] }, 'ws', NOW),
    (error) => error.code === 'parse',
  )
  assert.throws(
    () => parseOpenDesignUsage({ ...valid, windows: [] }, 'ws', NOW),
    (error) => error.code === 'parse',
    'an eligible plan without usable windows is a server inconsistency',
  )
  assert.throws(
    () => parseOpenDesignUsage({ ...valid, eligible: false }, 'ws', NOW),
    (error) => error.code === 'parse',
    'an ineligible plan must not report windows',
  )
  const ineligible = parseOpenDesignUsage({ workspaceId: 'ws', eligible: false, windows: [] }, 'ws', NOW)
  assert.equal(ineligible.windows.rolling, null)
  assert.equal(ineligible.windows.weekly, null)
})

test('OpenDesign wallet parses the USD balance and keeps the member identity', () => {
  const wallet = { billingScopeVersion: 2, workspaceId: 'ws', workspaceMemberId: 'member_1', balanceUsd: '-12.34' }
  const parsed = parseOpenDesignWallet(wallet, 'ws')
  assert.equal(parsed.balance.amount, -12.34)
  assert.equal(parsed.balance.currency, 'USD')
  assert.equal(parsed.workspaceMemberId, 'member_1')
  assert.throws(() => parseOpenDesignWallet({ ...wallet, billingScopeVersion: 1 }, 'ws'), (error) => error.code === 'parse')
  assert.throws(() => parseOpenDesignWallet({ ...wallet, workspaceId: 'other' }, 'ws'), (error) => error.code === 'parse')
  assert.throws(() => parseOpenDesignWallet({ ...wallet, workspaceMemberId: '' }, 'ws'), (error) => error.code === 'parse')
  assert.throws(() => parseOpenDesignWallet({ ...wallet, balanceUsd: 'n/a' }, 'ws'), (error) => error.code === 'parse')
})

test('OpenDesign billing summary exposes the plan tier and never invents one (v1.4.0)', () => {
  assert.deepEqual(parseOpenDesignSummary({ membershipTier: 'go' }).plan, { id: 'go', label: 'GO' })
  assert.deepEqual(parseOpenDesignSummary({ membershipTier: '  plus  ' }).plan, { id: 'plus', label: 'PLUS' })
  assert.equal(parseOpenDesignSummary({}).plan, null)
  assert.equal(parseOpenDesignSummary({ membershipTier: '' }).plan, null)
  assert.equal(parseOpenDesignSummary({ membershipTier: 42 }).plan, null)
  assert.equal(parseOpenDesignSummary(null).plan, null)
  assert.equal(parseOpenDesignSummary('junk').plan, null)
})
