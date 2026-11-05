/**
 * Xiaomi MiMo "Token Plan" adapter tests (v1.6.5).
 *
 * The quota API is console-cookie-only, so none of this can be verified against
 * a live account here. These tests pin the SHAPE handling and the failure modes
 * instead: a wrong or changed response must degrade to an explained error, never
 * to a crash or an invented number.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { UsageError } from '../lib/go-usage.mjs'
import {
  XIAOMI_QUOTA_PATHS,
  isLoginRequired,
  normalizeCookie,
  parseAccountBalance,
  parseTokenPlanDetail,
  parseTokenPlanUsage,
} from '../lib/xiaomi-token-plan.mjs'
import { ADAPTERS, PROVIDER_DEFAULTS } from '../lib/providers.mjs'

const NOW = Date.parse('2026-11-05T12:00:00.000Z')

/** The documented usage envelope (from OmniRoute issue #14834). */
const USAGE = {
  data: {
    usage: {
      items: [
        {
          plan_total_token: { used: 4100000000, limit: 8200000000, percent: 50 },
          compensation_total_token: { used: 0, limit: 0, percent: 0 },
        },
      ],
    },
    monthUsage: {
      items: [{ month_total_token: { used: 1200000000, limit: 8200000000, percent: 14.63 } }],
    },
  },
}

const DETAIL = { data: { planCode: 'MiMo-Token-Plan-Pro', currentPeriodEnd: '2026-12-01T00:00:00.000Z', expired: false } }

test('the three regional providers are registered as windows adapters', () => {
  for (const id of ['xiaomi-token-plan-cn', 'xiaomi-token-plan-ams', 'xiaomi-token-plan-sgp']) {
    assert.equal(PROVIDER_DEFAULTS[id]?.kind, 'windows', `${id} is a windows provider`)
    assert.equal(PROVIDER_DEFAULTS[id]?.supportsConsoleCookie, true, `${id} advertises the cookie field`)
    assert.equal(ADAPTERS[id]?.kind, 'windows', `${id} has an adapter`)
    // Short labels must stay unique across the pool (the chip shows them).
    assert.notEqual(PROVIDER_DEFAULTS[id].shortLabel, '', `${id} has a short label`)
  }
  const labels = ['xiaomi-token-plan-cn', 'xiaomi-token-plan-ams', 'xiaomi-token-plan-sgp'].map(
    (id) => PROVIDER_DEFAULTS[id].shortLabel,
  )
  assert.equal(new Set(labels).size, 3, 'each region has its own short label')
})

test('a pasted cookie is normalized into a single-line header value', () => {
  // Bare pairs, as copied from a Cookie header's value.
  assert.equal(
    normalizeCookie('api-platform_serviceToken=abc; userId=123'),
    'api-platform_serviceToken=abc; userId=123',
  )
  // With the header name prefix.
  assert.equal(normalizeCookie('Cookie: api-platform_serviceToken=abc; userId=123'), 'api-platform_serviceToken=abc; userId=123')
  // Multi-line copies must collapse: a newline inside a header value is an
  // injection hazard, so it never reaches the request.
  assert.equal(normalizeCookie('  a=1;\n\tb=2  '), 'a=1; b=2')
  // Nothing usable.
  assert.equal(normalizeCookie(''), '')
  assert.equal(normalizeCookie('   '), '')
  assert.equal(normalizeCookie('not-a-cookie'), '')
  assert.equal(normalizeCookie(null), '')
  assert.equal(normalizeCookie(42), '')
})

test('the quota usage envelope is parsed into a plan triple', () => {
  const parsed = parseTokenPlanUsage(USAGE)
  assert.equal(parsed.plan.used, 4100000000)
  assert.equal(parsed.plan.limit, 8200000000)
  assert.equal(parsed.plan.percent, 50, "the server's own percent is preferred")
  assert.equal(parsed.month.used, 1200000000, 'the month bucket is read too')
  assert.equal(parsed.month.percent, 14.63)
  assert.equal(parsed.compensation.limit, 0)
  assert.ok(parsed.contract.includes('plan_total_token'))
})

test('daily-quota items share one plan allowance and are not double-counted', () => {
  // Xiaomi lists an item per day (or per model) but attaches the same account-level
  // limit to each. Summing limits would invent a 3x allowance.
  const parsed = parseTokenPlanUsage({
    data: {
      usage: {
        items: [
          { plan_total_token: { used: 10, limit: 100, percent: 10 } },
          { plan_total_token: { used: 20, limit: 100, percent: 20 } },
        ],
      },
    },
  })
  assert.equal(parsed.plan.used, 30, 'usage is disjoint and sums')
  assert.equal(parsed.plan.limit, 100, 'an identical limit is one allowance')
  // The per-item percentages disagree, so none can describe the combined row.
  assert.equal(parsed.plan.percent, null)
})

test('genuinely different limits are added', () => {
  const parsed = parseTokenPlanUsage({
    data: {
      usage: {
        items: [
          { plan_total_token: { used: 10, limit: 100 } },
          { plan_total_token: { used: 20, limit: 250 } },
        ],
      },
    },
  })
  assert.equal(parsed.plan.used, 30)
  assert.equal(parsed.plan.limit, 350)
})

test('an unknown usage shape degrades to nulls instead of throwing', () => {
  for (const payload of [null, undefined, 'text', 42, [], {}, { data: null }, { data: { usage: {} } }]) {
    const parsed = parseTokenPlanUsage(payload)
    assert.equal(parsed.plan.used, null, `used for ${JSON.stringify(payload)}`)
    assert.equal(parsed.plan.limit, null)
    assert.deepEqual(parsed.contract, [])
  }
})

test('the plan detail carries the period end and the plan code', () => {
  const detail = parseTokenPlanDetail(DETAIL, NOW)
  assert.equal(detail.planCode, 'MiMo-Token-Plan-Pro')
  assert.equal(detail.resetsAt, '2026-12-01T00:00:00.000Z')
  assert.equal(detail.expired, false)
  // Epoch seconds and epoch milliseconds are both accepted.
  assert.equal(parseTokenPlanDetail({ data: { currentPeriodEnd: 1790000000 } }).resetsAt, new Date(1790000000 * 1000).toISOString())
  assert.equal(
    parseTokenPlanDetail({ data: { currentPeriodEnd: 1790000000000 } }).resetsAt,
    new Date(1790000000000).toISOString(),
  )
  // Missing entirely.
  assert.deepEqual(parseTokenPlanDetail({}), { planCode: '', resetsAt: null, expired: false })
})

test('a balance is reported in CNY and never silently converted', () => {
  assert.deepEqual(parseAccountBalance({ data: { balance: 12.5 } }), { amount: 12.5, currency: 'CNY' })
  assert.deepEqual(parseAccountBalance({ data: { amount: 3, currency: 'cny' } }), { amount: 3, currency: 'CNY' })
  assert.equal(parseAccountBalance({ data: {} }), null)
  assert.equal(parseAccountBalance(null), null)
})

test('the 401 login envelope is recognised as an expired session', () => {
  const login = { code: 401, loginUrl: 'https://account.xiaomi.com/pass/serviceLogin?sid=api-platform' }
  assert.equal(isLoginRequired(login), true)
  assert.equal(isLoginRequired({}, 401), true, 'a bare HTTP 401 is enough')
  assert.equal(isLoginRequired({ data: { nested: { loginUrl: 'x' } } }), true, 'the envelope nesting is not assumed')
  assert.equal(isLoginRequired(USAGE), false)
  assert.equal(isLoginRequired(null), false)
})

test('a configured cookie produces a monthly window and never invents 5h/weekly', async () => {
  const called = []
  const httpJson = async (url) => {
    called.push(url)
    if (url.endsWith(XIAOMI_QUOTA_PATHS.usage)) return USAGE
    if (url.endsWith(XIAOMI_QUOTA_PATHS.detail)) return DETAIL
    if (url.endsWith(XIAOMI_QUOTA_PATHS.balance)) return { data: { balance: 9.99 } }
    throw new Error(`unexpected url ${url}`)
  }
  const result = await ADAPTERS['xiaomi-token-plan-cn'].read({
    providerId: 'xiaomi-token-plan-cn',
    provider: { consoleCookie: 'api-platform_serviceToken=abc; userId=1' },
    httpJson,
    now: NOW,
  })
  assert.equal(called.length, 3, 'usage + detail + balance were read')
  assert.equal(result.kind, 'windows')
  assert.equal(result.windows.monthly.percent, 14.63, 'the month bucket wins when present')
  assert.equal(result.windows.monthly.resetsAt, '2026-12-01T00:00:00.000Z')
  assert.equal(result.windows.monthly.unit, 'tokens')
  assert.equal(result.windows.rolling, null, 'no invented 5-hour window')
  assert.equal(result.windows.weekly, null, 'no invented weekly window')
  assert.deepEqual(result.balance, { amount: 9.99, currency: 'CNY' })
  assert.equal(result.plan.label, 'MiMo-Token-Plan-Pro')
})

test('without a month bucket the plan triple drives the percentage', async () => {
  const httpJson = async (url) => {
    if (url.endsWith(XIAOMI_QUOTA_PATHS.usage)) {
      return { data: { usage: { items: [{ plan_total_token: { used: 25, limit: 100 } }] } } }
    }
    if (url.endsWith(XIAOMI_QUOTA_PATHS.detail)) return DETAIL
    throw new UsageError('network', 'balance endpoint offline')
  }
  const result = await ADAPTERS['xiaomi-token-plan-cn'].read({
    provider: { consoleCookie: 'a=1; b=2' },
    httpJson,
    now: NOW,
  })
  assert.equal(result.windows.monthly.percent, 25, 'percent is computed from used/limit when absent')
  assert.equal(result.balance, null, 'a failed balance read only costs the balance')
})

test('an expired session reads as unauthorized with actionable guidance', async () => {
  const httpJson = async () => {
    throw new UsageError('unauthorized', 'HTTP 401')
  }
  await assert.rejects(
    () =>
      ADAPTERS['xiaomi-token-plan-cn'].read({
        provider: { consoleCookie: 'a=1' },
        httpJson,
        now: NOW,
      }),
    (error) => {
      assert.equal(error.code, 'unauthorized')
      assert.equal(error.retryable, false, 'an expired cookie is not retryable by itself')
      assert.match(error.message, /24 hours/, 'the lifetime is explained')
      assert.match(error.message, /platform\.xiaomimimo\.com/, 'it says where to get a fresh one')
      return true
    },
  )
})

test('a 200 response carrying the login envelope is also treated as expired', async () => {
  const httpJson = async () => ({
    code: 401,
    loginUrl: 'https://account.xiaomi.com/pass/serviceLogin?sid=api-platform',
  })
  await assert.rejects(
    () => ADAPTERS['xiaomi-token-plan-cn'].read({ provider: { consoleCookie: 'a=1' }, httpJson, now: NOW }),
    (error) => {
      assert.equal(error.code, 'unauthorized')
      return true
    },
  )
})

test('no cookie produces missing-key without any network read', async () => {
  let reads = 0
  const httpJson = async () => {
    reads += 1
    return USAGE
  }
  await assert.rejects(
    () => ADAPTERS['xiaomi-token-plan-cn'].read({ provider: {}, httpJson, now: NOW }),
    (error) => {
      assert.equal(error.code, 'missing-key')
      assert.equal(error.retryable, false)
      assert.match(error.message, /CONSOLE COOKIE/)
      assert.match(error.message, /cannot read the quota API/, 'it warns that a key will not work')
      return true
    },
  )
  assert.equal(reads, 0, 'nothing was fetched without a credential')
})

test('a recognised-but-unusable payload reports parse with the fields it saw', async () => {
  const httpJson = async (url) => {
    if (url.endsWith(XIAOMI_QUOTA_PATHS.usage)) return { data: { usage: { items: [{ something_else: {} }] } } }
    return {}
  }
  await assert.rejects(
    () => ADAPTERS['xiaomi-token-plan-cn'].read({ provider: { consoleCookie: 'a=1' }, httpJson, now: NOW }),
    (error) => {
      assert.equal(error.code, 'parse')
      assert.match(error.message, /something_else/, 'the fields it DID see are reported for debugging')
      return true
    },
  )
})
