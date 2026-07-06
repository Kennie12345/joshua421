import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCadence, decideCadence } from './cadence'
import type { Reflection } from './reflection'

const refl = (date: string): Reflection => ({ id: date, date, kind: 'after', status: 'shown-up' })

// July 2026: 01=Wed, 04=Sat, 05=Sun, 06=Mon, 12=Sun, 15=Wed. (Used below.)
const WED = new Date('2026-07-15T20:00:00')
const SAT = new Date('2026-07-04T20:00:00')
const SUN = new Date('2026-07-12T09:00:00')

test('weekday map sanity — the fixtures rest on these', () => {
  assert.equal(WED.getDay(), 3, 'sanity: 2026-07-15 is a Wednesday')
  assert.equal(SAT.getDay(), 6, 'sanity: 2026-07-04 is a Saturday')
  assert.equal(SUN.getDay(), 0, 'sanity: 2026-07-12 is a Sunday')
})

// ── parseCadence ─────────────────────────────────────────────────────────────

test('parseCadence: no grounding → both kinds, daily (degrade safe, never silence the nudge)', () => {
  const c = parseCadence(null)
  assert.deepEqual({ morning: c.morning, evening: c.evening, days: c.days }, { morning: true, evening: true, days: 'daily' })
  assert.equal(c.churchDay, undefined)
})

test('parseCadence: canonical inline lines an assistant should write', () => {
  const c = parseCadence('## Goals\nGrow in patience.\n\nRhythm: weekdays\nChurch: Sunday')
  assert.deepEqual([...(c.days as Set<number>)].sort(), [1, 2, 3, 4, 5])
  assert.equal(c.churchDay, 0)
  assert.ok(c.morning && c.evening)
})

test('parseCadence: markdown heading + prose (no canonical line) still parses', () => {
  const doc = '## Rhythm\nWeekday mornings mostly; evenings when I can.\n\n## Church\nWe go to church on Sundays at 10.'
  const c = parseCadence(doc)
  assert.deepEqual([...(c.days as Set<number>)].sort(), [1, 2, 3, 4, 5], 'weekday rhythm')
  assert.equal(c.churchDay, 0, 'church on Sundays')
  assert.ok(c.morning && c.evening, 'mentions both mornings and evenings → both on')
})

test('parseCadence: a real toggle phrase in Goals does NOT leak into kinds (scoped to the rhythm section)', () => {
  // "no mornings" WOULD switch mornings off under a whole-doc scan; scoping to the
  // Rhythm section must keep it out. This fixture makes the guard able to fail.
  const c = parseCadence('Goals: no mornings without prayer, and grow in evening prayer\nRhythm: daily\nChurch: sunday')
  assert.ok(c.morning && c.evening, 'a "no mornings" goal must not switch the morning kind off')
  assert.equal(c.days, 'daily')
  assert.equal(c.churchDay, 0)
})

test('parseCadence: a contradictory rhythm degrades safe — never silences every nudge', () => {
  const c = parseCadence('Rhythm: mornings only, evenings only')
  assert.ok(c.morning || c.evening, 'both-off is never intent (no "off" in the vocabulary) — keep at least one on')
})

test('parseCadence: "evenings only" turns mornings off; "weekly" anchors to the church day', () => {
  const only = parseCadence('Rhythm: evenings only, weekdays')
  assert.equal(only.morning, false)
  assert.equal(only.evening, true)

  const weekly = parseCadence('Rhythm: weekly\nChurch: Wednesday')
  assert.deepEqual([...(weekly.days as Set<number>)], [3], 'weekly falls on the church day')
  assert.equal(weekly.churchDay, 3)
})

// ── decideCadence ────────────────────────────────────────────────────────────

const DEFAULT = parseCadence(null)

test('decide: cold start (empty log) is a present new user — normal send, not deep silence', () => {
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [] })
  assert.deepEqual([d.send, d.tone], [true, 'normal'])
})

test('decide: a kind the user turned off is never sent', () => {
  const cadence = parseCadence('Rhythm: evenings only')
  assert.equal(decideCadence({ kind: 'morning', now: WED, cadence, reflections: [] }).send, false)
  assert.equal(decideCadence({ kind: 'evening', now: WED, cadence, reflections: [] }).send, true)
})

test('decide: weekdays-only rests on the weekend, sends on a weekday', () => {
  const cadence = parseCadence('Rhythm: weekdays')
  assert.equal(decideCadence({ kind: 'morning', now: SAT, cadence, reflections: [] }).reason, 'off-day')
  assert.equal(decideCadence({ kind: 'morning', now: WED, cadence, reflections: [] }).send, true)
})

test('decide: already reflected today → soften the evening, do not skip it', () => {
  const d = decideCadence({ kind: 'evening', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-15')] })
  assert.deepEqual([d.send, d.tone, d.reason], [true, 'light', 'already-reflected'])
})

test('decide: a short gap (5 days) still sends, but with a gentle welcome-back tone', () => {
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-10')] })
  assert.deepEqual([d.send, d.tone], [true, 'return'])
})

test('decide: deep silence rests on ordinary days…', () => {
  // last reflection 2026-07-01 → 14 days silence by the 15th (a Wednesday).
  const d = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-01')] })
  assert.deepEqual([d.send, d.reason], [false, 'resting'])
})

test('decide: the RESTING boundary — 10 days still sends (gently), 11 days rests', () => {
  // The keystone of the grace curve: exactly where a gentle send tips into rest.
  const at10 = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-05')] })
  assert.deepEqual([at10.send, at10.tone], [true, 'return'], '10 days: still a gentle send')
  const at11 = decideCadence({ kind: 'morning', now: WED, cadence: DEFAULT, reflections: [refl('2026-07-04')] })
  assert.deepEqual([at11.send, at11.reason], [false, 'resting'], '11 days: rests')
})

test('decide: …but keeps a gentle weekly touch on the anchor (Sunday) day', () => {
  // 14 days silence, now a Sunday → the weekly return, not resting.
  const d = decideCadence({ kind: 'morning', now: SUN, cadence: DEFAULT, reflections: [refl('2026-06-28')] })
  assert.deepEqual([d.send, d.tone, d.reason], [true, 'return', 'weekly-return'])
})

test('decide: the church day is never suppressed — even in deep silence, even off the weekday schedule', () => {
  const cadence = parseCadence('Rhythm: weekdays\nChurch: Sunday') // Sunday NOT in weekdays
  const d = decideCadence({ kind: 'morning', now: SUN, cadence, reflections: [refl('2026-06-01')] })
  assert.deepEqual([d.send, d.reason], [true, 'church-day'])
})
