/**
 * Optional startup update check: version parsing/comparison and the wire shape.
 *
 * The check itself is exercised through the Host bridge in host.test.mjs; this
 * file keeps the pure helpers (and the fixed endpoints) honest.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  UPDATE_CHECK_URL,
  UPDATE_PACKAGE_URL,
  buildUpdateInfo,
  compareVersions,
  isNewerVersion,
  parseLatestVersion,
  parseVersion,
} from '../lib/update-check.mjs'

test('parseVersion accepts plain, v-prefixed and prerelease versions', () => {
  assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, pre: '' })
  assert.deepEqual(parseVersion('v10.0.7'), { major: 10, minor: 0, patch: 7, pre: '' })
  assert.deepEqual(parseVersion('2.0.0-beta.1'), { major: 2, minor: 0, patch: 0, pre: 'beta.1' })
  assert.equal(parseVersion(''), null)
  assert.equal(parseVersion('1.2'), null)
  assert.equal(parseVersion('1.2.3.4'), null)
  assert.equal(parseVersion('latest'), null)
  assert.equal(parseVersion(null), null)
  assert.equal(parseVersion('1'.repeat(80)), null)
})

test('compareVersions orders releases above their prereleases', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0)
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0, 'numeric segments, not strings')
  assert.ok(compareVersions('1.2.3', '1.2.4') < 0)
  assert.ok(compareVersions('2.0.0', '2.0.0-rc.1') > 0, 'a release outranks its prerelease')
  assert.ok(compareVersions('2.0.0-rc.1', '2.0.0') < 0)
  assert.ok(compareVersions('2.0.0-rc.2', '2.0.0-rc.1') > 0)
  assert.equal(compareVersions('junk', '1.0.0'), null)
})

test('isNewerVersion only trusts well-formed, strictly newer versions', () => {
  assert.equal(isNewerVersion('1.3.0', '1.2.2'), true)
  assert.equal(isNewerVersion('1.2.2', '1.2.2'), false)
  assert.equal(isNewerVersion('1.2.1', '1.2.2'), false)
  assert.equal(isNewerVersion('junk', '1.2.2'), false)
})

test('parseLatestVersion reads only a usable npm /latest version field', () => {
  assert.equal(parseLatestVersion({ name: 'dsh-tokenlens', version: '1.4.0' }), '1.4.0')
  assert.equal(parseLatestVersion({ version: ' v1.4.0 ' }), 'v1.4.0')
  assert.equal(parseLatestVersion({ version: 'junk' }), null)
  assert.equal(parseLatestVersion({}), null)
  assert.equal(parseLatestVersion(null), null)
  assert.equal(parseLatestVersion([]), null)
})

test('buildUpdateInfo marks only a strictly newer version as available', () => {
  const newer = buildUpdateInfo('1.3.0', '1.4.0', '2026-11-02T00:00:00.000Z')
  assert.deepEqual(newer, {
    current: '1.3.0',
    latest: '1.4.0',
    available: true,
    checkedAt: '2026-11-02T00:00:00.000Z',
    error: null,
  })

  const same = buildUpdateInfo('1.3.0', '1.3.0', '2026-11-02T00:00:00.000Z')
  assert.equal(same.available, false)

  const failed = buildUpdateInfo('1.3.0', null, '2026-11-02T00:00:00.000Z', {
    code: 'network',
    message: 'offline',
    retryable: true,
  })
  assert.equal(failed.available, false)
  assert.equal(failed.latest, null)
  assert.equal(failed.error.code, 'network')

  const junk = buildUpdateInfo('1.3.0', 'nope', '2026-11-02T00:00:00.000Z')
  assert.equal(junk.latest, null)
  assert.equal(junk.available, false)
})

test('the update check endpoints are fixed HTTPS URLs', () => {
  assert.equal(UPDATE_CHECK_URL, 'https://registry.npmjs.org/dsh-tokenlens/latest')
  assert.equal(UPDATE_PACKAGE_URL, 'https://www.npmjs.com/package/dsh-tokenlens')
})
