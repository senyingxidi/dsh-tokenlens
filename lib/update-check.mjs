/**
 * Optional startup update check.
 *
 * The plugin stays local-only by default: nothing is sent anywhere unless the
 * user enables `settings.updateCheck` in the management page. When enabled, one
 * HTTPS GET asks the npm registry for the published `latest` version and the
 * result is surfaced on the management page (and as a line in the detail dialog
 * footer). No identifiers, credentials or usage data are sent — only a plain
 * version-metadata request with the plugin's user agent.
 */

/** The npm registry endpoint that answers the published `latest` version. */
export const UPDATE_CHECK_URL = 'https://registry.npmjs.org/dsh-tokenlens/latest'

/** The canonical npm page of the package (for the "open on npm" link). */
export const UPDATE_PACKAGE_URL = 'https://www.npmjs.com/package/dsh-tokenlens'

/**
 * Parse one version string into comparable parts.
 *
 * Accepts `1.2.3`, `v1.2.3` and an optional prerelease (`1.3.0-beta.1`). Junk,
 * empty strings and absurdly long input return null.
 */
export function parseVersion(raw) {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (text === '' || text.length > 64) return null
  const match = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]{1,40}))?$/.exec(text)
  if (match === null) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ?? '',
  }
}

/**
 * Compare two versions (`> 0` when `left` is newer, `< 0` when older, `0` when
 * equal). A release always outranks its prereleases; prereleases compare as
 * strings, which is enough for this plugin's plain `x.y.z` history.
 */
export function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === null || b === null) return null
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  if (a.pre === b.pre) return 0
  if (a.pre === '') return 1
  if (b.pre === '') return -1
  return a.pre < b.pre ? -1 : 1
}

/** Whether `latest` is strictly newer than `current` (false for junk input). */
export function isNewerVersion(latest, current) {
  const compared = compareVersions(latest, current)
  return compared !== null && compared > 0
}

/** The `version` field of the npm `/latest` document, or null. */
export function parseLatestVersion(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const version = payload.version
  if (typeof version !== 'string') return null
  const trimmed = version.trim()
  return parseVersion(trimmed) === null ? null : trimmed
}

/**
 * The wire shape the client renders:
 * `{ current, latest, available, checkedAt, error }`.
 *
 * `available` is only true for a well-formed, strictly newer non-errored answer;
 * the check never invents a version and an upstream failure keeps `latest: null`.
 */
export function buildUpdateInfo(current, latest, checkedAt, error = null) {
  const latestVersion = typeof latest === 'string' && parseVersion(latest) !== null ? latest.trim() : null
  return {
    current: typeof current === 'string' ? current : '',
    latest: latestVersion,
    available: error === null && latestVersion !== null && isNewerVersion(latestVersion, current),
    checkedAt: typeof checkedAt === 'string' && checkedAt !== '' ? checkedAt : new Date().toISOString(),
    error: error === null || error === undefined ? null : error,
  }
}
