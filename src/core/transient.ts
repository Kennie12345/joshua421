/**
 * Is this failure the MACHINE's state, or a fault worth surfacing?
 *
 * Pure, and separated from the worker so it can be tested: the worker's entry
 * point wires production dependencies at import time, and this is the one piece
 * of its logic that can be wrong in an expensive way. Misclassify a bad token as
 * transient and every scheduled run burns the full retry budget before failing
 * anyway, with the real cause buried under three identical warnings.
 *
 * The case that matters is ordinary: the nudge fires at 20:00 on a laptop that is
 * asleep, on a train, or still bringing Wi-Fi up after wake. Google's token
 * endpoint fails DNS and the whole job used to die unhandled, losing that day's
 * nudge entirely. For a product whose loop IS the daily email, a sleeping laptop
 * must cost a short wait, not a day.
 */

/** Network conditions that mean "no network", not "something is wrong with us". */
const TRANSIENT_CODES = new Set([
  'ENOTFOUND', // DNS not up yet — the wake-from-sleep case
  'EAI_AGAIN', // DNS temporary failure
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETDOWN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
])

/**
 * Messages that carry the same meaning when no errno survived the wrapping.
 * Deliberately narrow: it must not match an auth failure. `invalid_grant` — the
 * expired-token case, and the single most likely REAL fault — says nothing about
 * networks, and retrying it three times would only delay the honest error.
 */
const TRANSIENT_MESSAGES = /socket hang up|getaddrinfo|network is (down|unreachable)|dns lookup failed/i

/**
 * Walk the `cause` chain — gaxios wraps node-fetch wraps the real errno, so the
 * code that matters is routinely two or three levels down and invisible to a
 * top-level `err.code` check. Depth-bounded against a cyclic cause.
 */
export function isTransient(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== 'object' || depth > 5) return false
  const e = err as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown }
  for (const v of [e.code, e.errno]) {
    if (typeof v === 'string' && TRANSIENT_CODES.has(v)) return true
  }
  if (typeof e.message === 'string' && TRANSIENT_MESSAGES.test(e.message)) return true
  return isTransient(e.cause, depth + 1)
}

/** One line, not a stack — this log is read by a person asking "why no email?". */
export function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown }
    if (typeof e.code === 'string') return e.code
    if (typeof e.message === 'string') return e.message.split('\n')[0].slice(0, 120)
  }
  return String(err)
}
