/**
 * The Open Design "Design Plan" ledger: a local, honest reverse-derivation of
 * how much of a billing period's allowance has been used.
 *
 * WHY THIS EXISTS
 *
 * Open Design exposes the Design Plan allowance only as *rolling windows*
 * (5 hours and 7 days). There is no "current period usage" endpoint: the
 * console's own `/billing/usage` and `/billing/coding-plan-usage` routes are
 * cookie-authenticated, and a Control Key gets HTTP 401. The monthly cap itself
 * is real (`Go` is advertised as $120/month, 4 × the $30 weekly window) but the
 * "used so far this period" number is never served.
 *
 * So the Host remembers what it has *observed*. Every successful open-design
 * read reports the current window instances; this ledger keeps, per instance,
 * the HIGHEST `usedCredits` ever seen (a window's usage only grows until it
 * resets), and sums the finished + current weekly windows that belong to one
 * billing period.
 *
 * WHY THE 7-DAY WINDOW IS THE UNIT
 *
 * The 5-hour and 7-day windows are simultaneous, overlapping limits over the
 * same spend — a moment can show `usedCredits` identical in both (verified
 * live: 48,195 in the 5h window and 48,195 in the 7d window). Summing both
 * would double-count every credit. The 7-day window is the longest Design Plan
 * window, so it alone tiles the period without overlap.
 *
 * WHAT IT CANNOT DO
 *
 * Observation starts when the plugin first runs. Earlier windows of the same
 * period are unknowable, so the summary reports `complete` (true only when the
 * earliest observed window starts at the period start) and `since`, and the UI
 * must present the number as an estimate rather than an official figure.
 *
 * Storage: `$DSH_HOME/dsh-tokenlens/design-plan-ledger.json`, atomic, owner-only,
 * numbers and timestamps only — no credentials, no prompts.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Ledger schema version; a mismatch discards the file (regenerate by observing). */
export const LEDGER_VERSION = 1

/** The weekly window length; it is the accounting unit (see the module doc). */
export const WEEKLY_SECONDS = 604800

/** How many periods to retain (older ones only cost a little disk). */
const MAX_PERIODS = 6

/** How many window observations one period may hold (guards a runaway file). */
const MAX_WINDOWS = 64

/** Credits are decimal strings in the upstream document; accept a safe integer. */
function creditsOf(value) {
  if (typeof value === 'string' && /^\d{1,40}$/.test(value)) return Number(value)
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  return null
}

/** An ISO string, or '' when the value is not one. */
function isoOf(value) {
  if (typeof value !== 'string' || value.trim() === '') return ''
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : ''
}

/** The empty ledger document. */
export function emptyLedger() {
  return { version: LEDGER_VERSION, periods: {} }
}

/** Read the ledger; a missing or unusable file is an empty ledger (never throws). */
export function loadLedger(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed === null || typeof parsed !== 'object' || parsed.version !== LEDGER_VERSION) return emptyLedger()
    const periods = {}
    for (const [start, period] of Object.entries(parsed.periods ?? {})) {
      if (!isoOf(start)) continue
      if (period === null || typeof period !== 'object') continue
      const windows = {}
      for (const [key, window] of Object.entries(period.windows ?? {})) {
        if (!isoOf(key) || window === null || typeof window !== 'object') continue
        const used = creditsOf(window.usedCredits)
        if (used === null) continue
        windows[key] = {
          usedCredits: used,
          limitCredits: creditsOf(window.limitCredits) ?? 0,
          durationSeconds: Number.isSafeInteger(window.durationSeconds) ? window.durationSeconds : WEEKLY_SECONDS,
          resetsAt: isoOf(window.resetsAt),
          lastSeenAt: isoOf(window.lastSeenAt),
        }
      }
      periods[start] = {
        periodEnd: isoOf(period.periodEnd),
        creditsPerUsd: Number.isSafeInteger(period.creditsPerUsd) && period.creditsPerUsd > 0
          ? period.creditsPerUsd
          : null,
        windows,
      }
    }
    return { version: LEDGER_VERSION, periods }
  } catch {
    return emptyLedger()
  }
}

/** Persist the ledger atomically (tmp + rename, mode 0600). Returns the document written. */
export function saveLedger(file, ledger) {
  const periods = {}
  // Newest periods first, then keep a bounded history.
  for (const [start, period] of Object.entries(ledger.periods ?? {})
    .sort(([left], [right]) => right.localeCompare(left))
    .slice(0, MAX_PERIODS)) {
    periods[start] = {
      periodEnd: period.periodEnd ?? '',
      creditsPerUsd: period.creditsPerUsd ?? null,
      windows: Object.fromEntries(Object.entries(period.windows ?? {}).slice(0, MAX_WINDOWS)),
    }
  }
  const document = { version: LEDGER_VERSION, periods }
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`
  writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(temp, 0o600)
  } catch {
    /* POSIX-only nicety; Windows ACLs are inherited */
  }
  try {
    renameSync(temp, file)
  } catch (error) {
    try {
      unlinkSync(temp)
    } catch {
      /* best-effort cleanup */
    }
    throw error
  }
  return document
}

/**
 * Fold one observation into the ledger (pure: returns a new document).
 *
 * @param ledger - the current document (`loadLedger` or `emptyLedger`).
 * @param input.periodStart - the billing period start (ISO); the period key.
 * @param input.periodEnd - the billing period end (ISO), optional.
 * @param input.creditsPerUsd - credits per US dollar, optional.
 * @param input.windows - the upstream window rows (`durationSeconds`, `usedCredits`,
 *   `limitCredits`, `windowStart`/`resetsAt`).
 * @param input.now - epoch ms of the observation.
 * @returns `{ ledger, changed }` where `changed` is false when nothing grew.
 *
 * Only the weekly window is recorded: the 5-hour window measures the same
 * spending over a shorter span, so keeping both would double-count the period.
 * Within one window instance the stored value only ever grows, and an instance
 * that disappears from the upstream payload keeps its last (final) value.
 */
export function observeDesignPlan(ledger, input) {
  const periodStart = isoOf(input?.periodStart)
  if (periodStart === '') return { ledger, changed: false }
  const now = Number.isFinite(input?.now) ? input.now : Date.now()
  const period = ledger?.periods?.[periodStart] ?? { periodEnd: '', creditsPerUsd: null, windows: {} }
  const windows = { ...(period.windows ?? {}) }
  let changed = false
  for (const row of Array.isArray(input?.windows) ? input.windows : []) {
    if (row === null || typeof row !== 'object') continue
    if (row.durationSeconds !== WEEKLY_SECONDS) continue
    const used = creditsOf(row.usedCredits)
    if (used === null) continue
    const start = isoOf(row.windowStart) || isoOf(row.resetsAt)
    if (start === '') continue
    const previous = windows[start]
    const nextLimit = creditsOf(row.limitCredits) ?? 0
    const resetsAt = isoOf(row.resetsAt)
    if (previous === undefined) {
      windows[start] = {
        usedCredits: used,
        limitCredits: nextLimit,
        durationSeconds: WEEKLY_SECONDS,
        resetsAt,
        lastSeenAt: new Date(now).toISOString(),
      }
      changed = true
      continue
    }
    // A window's usage only grows until it resets; keep the maximum so a
    // transient smaller read (or a retried request) never lowers the record.
    const grew = used > previous.usedCredits
    const limitGrew = nextLimit > previous.limitCredits
    if (!grew && !limitGrew && resetsAt === previous.resetsAt) continue
    windows[start] = {
      ...previous,
      usedCredits: grew ? used : previous.usedCredits,
      limitCredits: limitGrew ? nextLimit : previous.limitCredits,
      resetsAt: resetsAt || previous.resetsAt,
      lastSeenAt: new Date(now).toISOString(),
    }
    changed = true
  }
  if (!changed && period.periodEnd === isoOf(input?.periodEnd) && period.creditsPerUsd === (input?.creditsPerUsd ?? null)) {
    return { ledger, changed: false }
  }
  return {
    ledger: {
      version: LEDGER_VERSION,
      periods: {
        ...(ledger?.periods ?? {}),
        [periodStart]: {
          periodEnd: isoOf(input?.periodEnd) || period.periodEnd,
          creditsPerUsd:
            Number.isSafeInteger(input?.creditsPerUsd) && input.creditsPerUsd > 0
              ? input.creditsPerUsd
              : period.creditsPerUsd,
          windows,
        },
      },
    },
    changed,
  }
}

/**
 * How many weekly windows make up one monthly allowance.
 *
 * The published pricing table states it for every tier — Go $120/mo vs $30
 * weekly, Plus $160 vs $40, Pro $360 vs $90, Max $600 vs $150 — so the monthly
 * cap is always exactly four weekly windows. This is the ONLY step in the
 * estimate that is a documented ratio rather than an observed number.
 */
export const WEEKS_PER_PERIOD = 4

/**
 * Summarize one period: the estimated Design Plan usage the Host has observed.
 *
 * @param ledger - the ledger document.
 * @param periodStart - the billing period key.
 * @param input - optional documented-price context (v1.6.0):
 *   `{ listPriceUsd, monthlyCapUsd, multiplier }`. `listPriceUsd` replaces the
 *   credits÷rate conversion as `estimatedUsd`; it is the documented list-price
 *   value of the tokens actually consumed, which is the figure comparable with
 *   the published caps.
 * @returns `null` when the period has no observations at all, else
 *   `{ usedCredits, estimatedUsd, creditsUsd, monthlyCapUsd, multiplier,
 *      capPercent, windows, complete, since, periodStart, periodEnd,
 *      limitPerWindow, periodLimitCredits, percent }`.
 *   `percent` is `usedCredits / periodLimitCredits` (observed credits against
 *   the account's own windows); `capPercent` is `estimatedUsd / monthlyCapUsd`
 *   (documented dollars against the documented cap). The two differ per model
 *   mix and are both reported. `complete` is true only when the earliest
 *   observed window starts at the period start — otherwise earlier windows of
 *   this period were never seen and the numbers are lower bounds.
 */
export function summarizeDesignPlan(ledger, periodStart, input = null) {
  const key = isoOf(periodStart)
  if (key === '') return null
  const period = ledger?.periods?.[key]
  if (period === undefined) return null
  const entries = Object.entries(period.windows ?? {}).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return null
  let usedCredits = 0
  let windows = 0
  for (const [, window] of entries) {
    usedCredits += window.usedCredits
    windows += 1
  }
  const creditsPerUsd = period.creditsPerUsd
  // v1.6.0: `creditsPerUsd` conversion is kept ONLY as a fallback. It assumes the
  // account burns credits at 1x, but the documented multipliers range 0.25x–4x,
  // so it is wrong for any non-1x model (2x too low for DeepSeek V4.1 Flash).
  // The caller passes the documented list-price cost instead.
  const creditsUsd =
    Number.isSafeInteger(creditsPerUsd) && creditsPerUsd > 0 ? usedCredits / creditsPerUsd : null
  const estimatedUsd = Number.isFinite(input?.listPriceUsd) ? input.listPriceUsd : creditsUsd
  const since = entries[0][0]
  const limitPerWindow = entries[entries.length - 1][1].limitCredits
  const usableWindowLimit = Number.isSafeInteger(limitPerWindow) && limitPerWindow > 0 ? limitPerWindow : null
  const periodLimitCredits = usableWindowLimit === null ? null : usableWindowLimit * WEEKS_PER_PERIOD
  const percent = periodLimitCredits === null ? null : (usedCredits / periodLimitCredits) * 100
  const monthlyCapUsd = Number.isFinite(input?.monthlyCapUsd) ? input.monthlyCapUsd : null
  const capPercent =
    estimatedUsd !== null && monthlyCapUsd !== null && monthlyCapUsd > 0
      ? Math.min(100, Math.max(0, (estimatedUsd / monthlyCapUsd) * 100))
      : null
  return {
    periodStart: key,
    periodEnd: period.periodEnd || '',
    usedCredits,
    estimatedUsd,
    creditsUsd,
    monthlyCapUsd,
    multiplier: Number.isFinite(input?.multiplier) ? input.multiplier : null,
    capPercent,
    windows,
    complete: since === key,
    since,
    limitPerWindow: usableWindowLimit,
    periodLimitCredits,
    percent: percent === null ? null : Math.min(100, Math.max(0, percent)),
  }
}

/** The default ledger file: `$DSH_HOME/dsh-tokenlens/design-plan-ledger.json`. */
export function defaultDesignPlanLedgerFile(dshHome) {
  return join(dshHome, 'dsh-tokenlens', 'design-plan-ledger.json')
}
