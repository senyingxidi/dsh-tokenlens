/**
 * Xiaomi MiMo "Token Plan" quota parsing (v1.6.5).
 *
 * Xiaomi exposes the plan's real usage on its **console** host, not the inference
 * host:
 *
 *   GET https://platform.xiaomimimo.com/api/v1/tokenPlan/usage
 *   GET https://platform.xiaomimimo.com/api/v1/tokenPlan/detail
 *   GET https://platform.xiaomimimo.com/api/v1/balance
 *
 * All three authenticate with the browser's console **session cookies**
 * (`api-platform_serviceToken` + `userId`) sent as a raw `Cookie:` header. The
 * inference key (`tp-...`) is rejected with
 * `{"code":401,"loginUrl":"https://account.xiaomi.com/pass/serviceLogin?...&sid=api-platform..."}`
 * — the same cookie-only shape as Open Design's billing routes. The cookie lasts
 * about 24 hours, so an expired session is a normal, expected state and must read
 * as guidance, not as a crash.
 *
 * This module is deliberately dependency-free and I/O-free: it only shapes
 * payloads the adapter fetched. Everything is defensive, because none of these
 * shapes are formally documented — they were transcribed from two independent
 * clients (OmniRoute issue #14834, steipete/CodexBar docs/mimo.md), and Xiaomi may
 * change them without notice. A wrong shape must degrade to `null`, never throw.
 */

/** The console origin that serves the quota API. */
export const XIAOMI_QUOTA_BASE_URL = 'https://platform.xiaomimimo.com'

/** The console routes, relative to {@link XIAOMI_QUOTA_BASE_URL}. */
export const XIAOMI_QUOTA_PATHS = {
  usage: '/api/v1/tokenPlan/usage',
  detail: '/api/v1/tokenPlan/detail',
  balance: '/api/v1/balance',
}

/** The console page a user opens to copy the cookie from. */
export const XIAOMI_CONSOLE_URL = 'https://platform.xiaomimimo.com'

/**
 * How long a pasted console cookie is expected to work, in milliseconds.
 *
 * Xiaomi's own cookie declaration puts the session at 24 hours; the plugin uses
 * this only to explain an `unauthorized` read, never to pre-empt one.
 */
export const XIAOMI_COOKIE_TTL_MS = 24 * 60 * 60 * 1000

/** A finite non-negative number, or `null`. */
function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  return null
}

/** A non-empty trimmed string, or `''`. */
function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** `data` of a payload, tolerating a payload that already IS the data. */
function dataOf(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const data = payload.data
  return data !== null && typeof data === 'object' && !Array.isArray(data) ? data : payload
}

/**
 * Normalize a pasted cookie into a `Cookie:` header value.
 *
 * Accepts three shapes people actually produce when copying from devtools:
 *   1. the bare pair(s)            `api-platform_serviceToken=abc; userId=123`
 *   2. the full header             `Cookie: api-platform_serviceToken=abc; userId=123`
 *   3. a `document.cookie` string  same as (1)
 *
 * @returns the header value, or `''` when nothing usable was pasted.
 */
export function normalizeCookie(raw) {
  if (typeof raw !== 'string') return ''
  let value = raw.trim()
  if (value === '') return ''
  // Accept a pasted "Cookie:" header prefix (any casing).
  value = value.replace(/^cookie\s*:\s*/i, '')
  // Collapse newlines/tabs a multi-line copy can introduce: a header value must
  // stay on one line, and a stray newline would be a header-injection hazard.
  value = value.replace(/[\r\n\t]+/g, ' ').trim()
  // A cookie value is `name=value` pairs separated by `;`. Require at least one.
  if (!/[^=;\s]+=[^;]*/.test(value)) return ''
  return value
}

/**
 * Whether a payload is Xiaomi's "you are not signed in" answer.
 *
 * Detected by the documented 401 body carrying a `loginUrl` (checked anywhere in
 * the JSON, since the envelope nesting is not guaranteed) or by a bare 401 code.
 */
export function isLoginRequired(payload, status = null) {
  if (status === 401) return true
  if (payload === null || typeof payload !== 'object') return false
  if (num(payload.code) === 401) return true
  let text = ''
  try {
    text = JSON.stringify(payload)
  } catch {
    return false
  }
  return text.includes('loginUrl') || text.includes('/pass/serviceLogin')
}

/**
 * Read one `{used, limit, percent}` triple.
 * @returns `{ used, limit, percent }` with `null`s for anything unusable.
 */
function readTriple(node) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return { used: null, limit: null, percent: null }
  }
  const used = num(node.used)
  const limit = num(node.limit)
  const percent = num(node.percent)
  return { used, limit, percent: percent === null || percent > 1000 ? null : percent }
}

/**
 * Combine the per-item rows of one bucket.
 *
 * Xiaomi lists items per plan/model but attaches the plan-level allowance to each,
 * so the totals are NOT simply summed: when every item repeats the same non-zero
 * `limit` it is one account-level allowance and is counted once; only genuinely
 * different limits are added. `used` is always summed, because usage is disjoint
 * per item.
 *
 * @returns `{ used, limit, percent }` (all `null` when no row had usable numbers).
 */
function combineItems(items) {
  const rows = Array.isArray(items) ? items.map(readTriple) : []
  const usable = rows.filter((row) => row.used !== null || row.limit !== null)
  if (usable.length === 0) return { used: null, limit: null, percent: null }

  let used = 0
  let sawUsed = false
  for (const row of usable) {
    if (row.used === null) continue
    used += row.used
    sawUsed = true
  }

  const limits = usable.map((row) => row.limit).filter((value) => value !== null)
  let limit = null
  if (limits.length > 0) {
    const allSame = limits.every((value) => value === limits[0])
    limit = allSame ? limits[0] : limits.reduce((sum, value) => sum + value, 0)
  }

  // Prefer the server's own percentage only when the rows agree on one value;
  // otherwise it cannot be attributed to the combined row.
  const percents = usable.map((row) => row.percent).filter((value) => value !== null)
  const percent =
    percents.length > 0 && percents.every((value) => Math.abs(value - percents[0]) < 1e-6) ? percents[0] : null

  return { used: sawUsed ? used : null, limit, percent }
}

/**
 * Parse `GET /api/v1/tokenPlan/usage`.
 *
 * Envelope (per OmniRoute #14834):
 * ```jsonc
 * { "data": {
 *     "usage":     { "items": [ { "plan_total_token":          { "used": N, "limit": M, "percent": P },
 *                                 "compensation_total_token":  { "used": n, "limit": m, "percent": p } } ] },
 *     "monthUsage":{ "items": [ { "month_total_token":         { "used": N, "limit": M, "percent": P } } ] }
 * } }
 * ```
 *
 * @returns `{ plan, month, compensation, contract }` — `plan` is the primary
 *   allowance this plugin reports; the rest is context. `contract` lists the
 *   token kinds actually found, so an empty result can be explained.
 */
export function parseTokenPlanUsage(payload) {
  const data = dataOf(payload)
  const contract = []
  if (data === null) return { plan: { used: null, limit: null, percent: null }, month: null, compensation: null, contract }

  const planItems = []
  const monthItems = []
  const compensationItems = []
  for (const container of [data.usage, data.monthUsage, data]) {
    if (container === null || typeof container !== 'object') continue
    if (Array.isArray(container.items)) {
      for (const item of container.items) {
        if (item === null || typeof item !== 'object') continue
        if (item.plan_total_token !== undefined) planItems.push(item.plan_total_token)
        if (item.month_total_token !== undefined) monthItems.push(item.month_total_token)
        if (item.compensation_total_token !== undefined) compensationItems.push(item.compensation_total_token)
        for (const key of Object.keys(item)) {
          if (!contract.includes(key)) contract.push(key)
        }
      }
    }
  }

  const plan = combineItems(planItems)
  const month = monthItems.length === 0 ? null : combineItems(monthItems)
  const compensation = compensationItems.length === 0 ? null : combineItems(compensationItems)
  return { plan, month, compensation, contract }
}

/** Epoch milliseconds from an ISO string, epoch number, or number-as-string. */
function instantMs(value) {
  const numeric = num(value)
  if (numeric !== null) {
    // Seconds vs milliseconds: anything below ~year 2286 in ms is a seconds value.
    return numeric < 1e12 ? Math.round(numeric * 1000) : Math.round(numeric)
  }
  const text = str(value)
  if (text === '') return null
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse `GET /api/v1/tokenPlan/detail`.
 *
 * @returns `{ planCode, resetsAt, expired }` — `resetsAt` is an ISO string or
 *   `null`; `expired` is `true` only when the payload says so.
 */
export function parseTokenPlanDetail(payload, now = Date.now()) {
  void now
  const data = dataOf(payload)
  if (data === null) return { planCode: '', resetsAt: null, expired: false }
  const planCode = str(data.planCode) || str(data.plan_code) || str(data.planName)
  const endMs =
    instantMs(data.currentPeriodEnd) ??
    instantMs(data.current_period_end) ??
    instantMs(data.periodEnd) ??
    instantMs(data.expireTime)
  return {
    planCode,
    resetsAt: endMs === null ? null : new Date(endMs).toISOString(),
    expired: data.expired === true,
  }
}

/**
 * Parse `GET /api/v1/balance` (CNY).
 *
 * @returns `{ amount, currency }` or `null` when no number was found. Xiaomi
 *   reports CNY; the currency code is passed through when the payload names one
 *   but never guessed into a different unit.
 */
export function parseAccountBalance(payload) {
  const data = dataOf(payload)
  if (data === null) return null
  const amount =
    num(data.balance) ??
    num(data.amount) ??
    num(data.availableBalance) ??
    num(data.totalBalance) ??
    num(data.balanceCny) ??
    null
  if (amount === null) return null
  const currency = str(data.currency).toUpperCase() || (str(data.unit).toUpperCase() === 'CNY' ? 'CNY' : 'CNY')
  return { amount, currency: currency === '' ? 'CNY' : currency }
}
