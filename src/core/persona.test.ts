import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMPANION_INSTRUCTIONS, INDUCTION, dayQuestions } from './persona'
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

test('the canonical line beats the prose above it — the doc the induction actually produces', () => {
  // REGRESSION. The induction asks for BOTH a plain preferences note AND a canonical
  // machine-readable line, so an assistant obediently writes both — prose first,
  // canonical block appended. Reading the prose instead of the line is what shipped
  // 20:00 mail to a user whose rhythm said mornings only: "A daily nudge, landing in
  // the morning" parses to days=daily with evening left at its default true.
  // The tests above only ever fed the parser a canonical line in ISOLATION, which is
  // the one shape a real grounding.md never has.
  const doc = [
    'Goals',
    'To read the word and meditate with the Lord.',
    '',
    'Rhythm',
    'A daily nudge, landing in the morning — to start the day in the word.',
    '',
    'Church',
    'Sunday, 10am, finishing around midday. The whole morning matters.',
    '',
    'Quiet time',
    'None kept yet.',
    '',
    'Rhythm: mornings only',
    'Church: Sunday',
  ].join('\n')
  const c = parseCadence(doc)
  assert.equal(c.evening, false, '"Rhythm: mornings only" must beat the prose section above it')
  assert.equal(c.morning, true, 'a mornings-only rhythm still sends in the morning')
  assert.equal(c.churchDay, 0, 'the church day must survive the same document (Sunday = 0)')
})

test('a plain-word heading ends the section above it — prose below cannot leak in', () => {
  // REGRESSION. Grounding headings carry no markdown and no colon ("Rhythm",
  // "Quiet time"), so without them as boundaries a section runs to the end of the
  // file and swallows every answer below. Here that would mute the evening nudge
  // using a phrase the user wrote about their QUIET TIME, never about their rhythm.
  const doc = ['Rhythm', 'Every day please.', '', 'Quiet time', 'Mornings only, with coffee.'].join('\n')
  assert.equal(parseCadence(doc).evening, true, 'a quiet-time slot must not mute the evening nudge')
})

test('the persona knows the longer horizons and the exit off the screen', () => {
  // The week/seasons rhythm and the send-off are load-bearing persona features
  // (roadmap #4 and #6): the memorial is woven in conversation via look_back /
  // save_rollup, and every reflection ends by handing the person OFF the screen.
  for (const tool of ['look_back', 'save_rollup']) {
    assert.ok(COMPANION_INSTRUCTIONS.includes(tool), `the persona must name ${tool} — an unnamed tool goes uncalled`)
  }
  assert.ok(/church evening/i.test(COMPANION_INSTRUCTIONS), "the week's look-back hangs off the church evening")
  assert.ok(/sending them off|send them off|sending them/i.test(COMPANION_INSTRUCTIONS), 'the loop ends in a send-off')
  assert.ok(/prayer or stillness/i.test(COMPANION_INSTRUCTIONS), 'the send-off names prayer and stillness')
  assert.ok(
    /toward a person|a named human|someone to sit with/i.test(COMPANION_INSTRUCTIONS),
    'the send-off can hand them to a person, not only inward',
  )
  assert.ok(!/\bstreak\b/i.test(COMPANION_INSTRUCTIONS.replace(/don't break your streak|"streak"/gi, '')),
    'streaks appear only inside the negative exemplars, never as guidance')
})

test('a welcome-back never opens with self-examination', () => {
  // The paste questions print three lines under "It's been a little while — there's
  // no clock on this", so the rotation must be tone-aware: on a 'return' the bank
  // narrows to the questions that welcome. Swept across a month because the rotation
  // is date-driven, and a date-blind spot check passes while a single day ships an
  // accusation. (2026-07-19 — a Sunday, his church day — served "What went wrong
  // today, and where do you need grace?" under the welcome-back opener.)
  for (let d = 1; d <= 31; d++) {
    const date = `2026-07-${String(d).padStart(2, '0')}`
    for (const kind of ['morning', 'evening'] as const) {
      const [q1, q2] = dayQuestions(kind, date, 'return')
      for (const q of [q1, q2]) {
        assert.ok(
          !/went wrong|need grace/i.test(q),
          `${kind} ${date}: a welcome-back must not ask "${q}"`,
        )
      }
      assert.notEqual(q1, q2, `${kind} ${date}: the pair must stay distinct on a return`)
    }
  }
})

test('the church bank turns the evening toward the week — and always welcomes', () => {
  // Church is the week's anchor: its questions must reach beyond the single day,
  // and a return that lands on the church day is doubly welcome — the whole bank
  // must survive the 'return' filter, so the rotation stays distinct even then.
  const asked = new Set<string>()
  for (let d = 1; d <= 31; d++) {
    const date = `2026-07-${String(d).padStart(2, '0')}`
    for (const tone of ['normal', 'return'] as const) {
      const [q1, q2] = dayQuestions('evening', date, tone, true)
      assert.notEqual(q1, q2, `${date} (${tone}): the church pair must stay distinct`)
      asked.add(q1)
      asked.add(q2)
      for (const q of [q1, q2]) {
        assert.ok(!/went wrong/i.test(q), `church evening must not open with self-examination: "${q}"`)
      }
    }
  }
  assert.ok([...asked].some((q) => /church/i.test(q)), 'the bank asks about church itself')
  assert.ok([...asked].some((q) => /week/i.test(q)), 'the bank turns toward the week')
})

test('church touches only the evening — a church-day morning keeps the morning bank', () => {
  const [q1, q2] = dayQuestions('morning', '2026-07-19', 'normal', true)
  const morningBank = new Set(
    Array.from({ length: 31 }, (_, i) => dayQuestions('morning', `2026-07-${String(i + 1).padStart(2, '0')}`)).flat(),
  )
  assert.ok(morningBank.has(q1) && morningBank.has(q2), 'the morning of a church day still offers the day to God')
})

test('an ordinary day still gets the full bank, self-examination included', () => {
  // The return filter must narrow the welcome-back WITHOUT quietly retiring a good
  // question from ordinary evenings — "honest before liked" needs it.
  const asked = new Set<string>()
  for (let d = 1; d <= 31; d++) {
    const date = `2026-07-${String(d).padStart(2, '0')}`
    const [q1, q2] = dayQuestions('evening', date)
    asked.add(q1)
    asked.add(q2)
    assert.notEqual(q1, q2, `${date}: the pair must stay distinct`)
  }
  assert.ok(
    [...asked].some((q) => /went wrong/i.test(q)),
    'an ordinary evening should still ask what went wrong',
  )
})
