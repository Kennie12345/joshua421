import { test } from 'node:test'
import assert from 'node:assert/strict'
import { periodFor, periodRange, rollupTitle, ROLLUP_LEVELS } from './rollup'

/**
 * Period keys are Journal identities (ADR 0005: one entry per kind + period) —
 * a wrong key doesn't error, it quietly files a memorial under the wrong stone.
 * So the calendar arithmetic is pinned, edges first.
 */

test('periodFor produces one canonical key per level', () => {
  assert.equal(periodFor('week', '2026-07-19'), '2026-W29')
  assert.equal(periodFor('month', '2026-07-19'), '2026-07')
  assert.equal(periodFor('season', '2026-07-19'), '2026-Q3')
  assert.equal(periodFor('year', '2026-07-19'), '2026')
})

test('ISO week edges: New Year days can belong to the other year’s week', () => {
  // 2026-01-01 is a Thursday → week 1 of 2026. 2027-01-01 is a Friday whose week's
  // Thursday is 2026-12-31 → it belongs to 2026-W53, not 2027.
  assert.equal(periodFor('week', '2026-01-01'), '2026-W01')
  assert.equal(periodFor('week', '2027-01-01'), '2026-W53')
  // 2025-12-29 is the Monday of the week holding 2026-01-01 → already 2026-W01.
  assert.equal(periodFor('week', '2025-12-29'), '2026-W01')
})

test('every day of a week maps to the same key and the same Monday–Sunday range', () => {
  // 2026-07-13 (Mon) … 2026-07-19 (Sun) are one week.
  for (let d = 13; d <= 19; d++) {
    const iso = `2026-07-${d}`
    assert.equal(periodFor('week', iso), '2026-W29', `${iso} must sit in 2026-W29`)
    assert.deepEqual(periodRange('week', iso), { since: '2026-07-13', until: '2026-07-19' })
  }
  // And the day after starts the next week.
  assert.equal(periodFor('week', '2026-07-20'), '2026-W30')
})

test('month and season ranges hug their real edges — leap February included', () => {
  assert.deepEqual(periodRange('month', '2026-07-19'), { since: '2026-07-01', until: '2026-07-31' })
  assert.deepEqual(periodRange('month', '2028-02-10'), { since: '2028-02-01', until: '2028-02-29' })
  assert.deepEqual(periodRange('season', '2026-07-19'), { since: '2026-07-01', until: '2026-09-30' })
  assert.deepEqual(periodRange('season', '2026-12-31'), { since: '2026-10-01', until: '2026-12-31' })
  assert.deepEqual(periodRange('year', '2026-07-19'), { since: '2026-01-01', until: '2026-12-31' })
})

test('a period’s range always contains the date that named it, for every level', () => {
  for (const level of ROLLUP_LEVELS) {
    for (const iso of ['2026-01-01', '2026-06-15', '2026-12-31', '2027-01-01']) {
      const { since, until } = periodRange(level, iso)
      assert.ok(since <= iso && iso <= until, `${level} range for ${iso} must contain it (got ${since}..${until})`)
      assert.equal(
        periodFor(level, since),
        periodFor(level, iso),
        `${level}: the range's first day must share ${iso}'s period key`,
      )
    }
  }
})

test('the default rollup title speaks the design’s own language', () => {
  assert.equal(rollupTitle('year', '2026'), 'Your year with God · 2026')
  assert.ok(!/streak|score/i.test(rollupTitle('week', '2026-W29')))
})
