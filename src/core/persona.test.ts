import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INDUCTION } from './persona'
import { parseCadence } from './cadence'

/**
 * The induction is the "initial prompt" that sets up the user's joshua421 memory
 * (their preferences). Two things must hold: it covers what the grounding needs,
 * and — critically — it captures rhythm/church in the SAME vocabulary the cadence
 * engine parses, or it silently promises a rhythm the nudge ignores.
 */

test('the induction covers each preference area it sets up', () => {
  const t = INDUCTION.toLowerCase()
  for (const area of ['grow in me', 'tone', 'rhythm', 'church', 'quiet-time', 'reading plan']) {
    assert.ok(t.includes(area), `induction should touch "${area}"`)
  }
})

test('the induction persists to memory and stays a conversation, not a form', () => {
  assert.ok(INDUCTION.includes('set_grounding'), 'induction must direct saving via set_grounding')
  assert.ok(/not a form/i.test(INDUCTION), 'induction is a conversation, not a form')
})

test('a grounding note shaped by the induction reaches the cadence engine', () => {
  // A doc that follows the induction's guidance: labelled rhythm + church lines.
  const doc = [
    'Goals: to trust God with my work',
    'Tone & language: gentle, plain',
    'Rhythm: weekdays',
    'Church: Sunday',
    'Quiet time: 6:30am',
  ].join('\n')
  const cadence = parseCadence(doc)
  assert.deepEqual(cadence.days, new Set([1, 2, 3, 4, 5]), 'a weekdays rhythm must reach the engine')
  assert.equal(cadence.churchDay, 0, 'the church day must reach the engine (Sunday = 0)')
})

test('every rhythm word the induction names is one the cadence engine honours', () => {
  // Guards the induction↔cadence contract: the induction must not offer the user a
  // rhythm the parser silently drops to default. `daily` is the default, so it is
  // omitted here (a default parse is indistinguishable from "unrecognised").
  const checks: [string, (c: ReturnType<typeof parseCadence>) => boolean][] = [
    ['weekdays', (c) => c.days instanceof Set && c.days.has(1) && !c.days.has(0)],
    ['weekends', (c) => c.days instanceof Set && c.days.has(0) && !c.days.has(1)],
    ['weekly', (c) => c.days instanceof Set && c.days.size === 1],
    ['mornings only', (c) => c.morning && !c.evening],
    ['evenings only', (c) => c.evening && !c.morning],
  ]
  for (const [word, honoured] of checks) {
    assert.ok(INDUCTION.includes(word), `induction should name the rhythm "${word}"`)
    assert.ok(honoured(parseCadence(`Rhythm: ${word}`)), `cadence must honour the rhythm "${word}"`)
  }
})
