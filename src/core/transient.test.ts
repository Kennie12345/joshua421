import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isTransient, describeError } from './transient'

/** The real shape gaxios produces: the errno lives two levels down. */
const gaxiosLike = (code: string) => ({
  message: 'request to https://oauth2.googleapis.com/token failed',
  code: undefined,
  cause: { name: 'FetchError', cause: { code, errno: code, syscall: 'getaddrinfo' } },
})

test('a sleeping laptop is transient — the real logged failure, at its real depth', () => {
  // Verbatim shape from the worker log that lost a day's nudge.
  assert.equal(isTransient(gaxiosLike('ENOTFOUND')), true)
  assert.equal(isTransient(gaxiosLike('EAI_AGAIN')), true)
  assert.equal(isTransient(gaxiosLike('ECONNRESET')), true)
})

test('a top-level errno is caught too', () => {
  assert.equal(isTransient({ code: 'ETIMEDOUT' }), true)
  assert.equal(isTransient({ errno: 'ENETUNREACH' }), true)
})

/** THE ONE THAT MUST NOT DRIFT. An expired token is the likeliest real fault. */
test('an expired token is NOT transient — it must fail fast and say so', () => {
  const invalidGrant = {
    message: 'invalid_grant',
    response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
  }
  assert.equal(isTransient(invalidGrant), false, 'retrying this only buries the real cause')
})

test('other genuine faults stay fatal', () => {
  assert.equal(isTransient(new Error('Calendar not found')), false)
  assert.equal(isTransient({ code: 404, message: 'Not Found' }), false)
  assert.equal(isTransient({ code: 'EACCES' }), false, 'a permissions fault is ours, not the network')
  assert.equal(isTransient(null), false)
  assert.equal(isTransient(undefined), false)
  assert.equal(isTransient('a string'), false)
})

test('a cyclic cause chain terminates instead of hanging the worker', () => {
  const a: Record<string, unknown> = { message: 'boom' }
  a.cause = a
  assert.equal(isTransient(a), false)
})

test('describeError gives one readable line, never a stack', () => {
  assert.equal(describeError({ code: 'ENOTFOUND' }), 'ENOTFOUND')
  assert.equal(describeError(new Error('first line\nsecond line')), 'first line')
  assert.ok(describeError(new Error('x'.repeat(500))).length <= 120)
})
