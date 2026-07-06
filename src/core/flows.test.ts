import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDayNotes, composeDayEmail, sendDailyNudge } from './flows'
import { dayQuestions } from './persona'
import type { Reflection } from './reflection'
import { makeMemoryLog, makeMemoryDiary, makeDeps } from '../testing/fakes'

const reflectedOn = (date: string): Reflection => ({ id: date, date, kind: 'after', status: 'shown-up' })
const groundingOf = (doc: string | null) => ({ async get() { return doc }, async set() {} })

/**
 * The ANCHOR test — makes the promise executable.
 *
 * "Behaviour, not content": recording that a reflection happened must yield a
 * behaviour-only record; the note and summary text must reach ONLY the user's
 * own calendar (the Diary), never joshua421's store (the Log). This is the
 * guarantee the seam re-cut must not silently break.
 */

const NOTE_SENTINEL = 'SENTINEL_NOTE_a1b2c3'
const SUMMARY_SENTINEL = 'SENTINEL_SUMMARY_d4e5f6'

test('applyDayNotes records behaviour only; content flows to the diary, never the log', async () => {
  const log = makeMemoryLog()
  const diary = makeMemoryDiary()
  const deps = makeDeps({ log, diary })

  const reflection = await applyDayNotes(
    {
      date: '2026-07-01',
      notes: [{ eventId: 'e1', note: NOTE_SENTINEL }],
      summary: SUMMARY_SENTINEL,
    },
    deps,
  )

  // The stored record carries exactly the behaviour fields — nothing that could hold content.
  assert.equal(log.rows.length, 1)
  assert.deepEqual(Object.keys(log.rows[0]).sort(), ['date', 'id', 'kind', 'status'])
  assert.equal(log.rows[0].kind, 'after')
  assert.equal(log.rows[0].status, 'shown-up')
  assert.equal(log.rows[0].date, '2026-07-01')
  assert.equal(reflection.eventRef, undefined)

  // No content ever appears in the store's serialization.
  const serialized = JSON.stringify(log.rows)
  assert.ok(!serialized.includes(NOTE_SENTINEL), 'note text must never reach the log')
  assert.ok(!serialized.includes(SUMMARY_SENTINEL), 'summary text must never reach the log')

  // The content went to the user's own calendar (the Diary).
  assert.deepEqual(diary.annotations, [{ eventId: 'e1', note: NOTE_SENTINEL }])
  assert.deepEqual(diary.summaries, [{ date: '2026-07-01', summary: SUMMARY_SENTINEL }])
})

test('applyDayNotes with no notes and no summary records exactly one reflection, touches the diary zero times', async () => {
  const log = makeMemoryLog()
  const diary = makeMemoryDiary()
  const deps = makeDeps({ log, diary })

  await applyDayNotes({ date: '2026-07-02', notes: [] }, deps)

  assert.equal(log.rows.length, 1)
  assert.equal(diary.annotations.length, 0)
  assert.equal(diary.summaries.length, 0)
})

test("composeDayEmail prints the calendar's wall-clock label, never a host-localized time", async () => {
  // NB: the label is host-independent; day SELECTION (isoDay + day()'s window)
  // is still host-zone — see the boundary note in composeDayEmail. The suite
  // runs under TZ=UTC (package.json) so this would fail on the old
  // toLocaleTimeString path, which rendered this event as 13:00.
  const sent: string[] = []
  // A Sydney 23:00 event: as a bare Date it is 13:00Z, so a host anywhere but
  // AEST would print the wrong evening. The wall-clock must come from startLocal.
  const diary = makeMemoryDiary([
    {
      id: 'e1',
      title: 'GCB mens group',
      start: new Date('2026-07-02T13:00:00.000Z'),
      startLocal: '2026-07-02T23:00:00+10:00',
      timeZone: 'Australia/Sydney',
      shared: false,
    },
    {
      id: 'e2',
      title: 'Sabbath',
      start: new Date('2026-07-02T00:00:00'),
      startLocal: '2026-07-02',
      shared: false,
    },
  ])
  const deps = makeDeps({
    diary,
    mailer: async (_subject, body) => {
      sent.push(body)
    },
  })

  await composeDayEmail('evening', deps)

  assert.ok(sent[0].includes('23:00 — GCB mens group'), 'must print the calendar’s own wall-clock')
  assert.ok(!sent[0].includes('13:00'), 'must never leak the bare UTC instant')
  assert.ok(sent[0].includes('all day — Sabbath'), 'an all-day entry gets no fabricated midnight')
})

test('the deep-link prompt is context plus a one-sentence ask; the paste path is questions to answer', async () => {
  const sent: string[] = []
  const diary = makeMemoryDiary([
    {
      id: 'e1',
      title: 'Team standup',
      start: new Date('2026-07-06T23:00:00.000Z'),
      startLocal: '2026-07-07T09:00:00+10:00',
      shared: false,
    },
  ])
  const htmlSent: string[] = []
  const deps = makeDeps({
    diary,
    mailer: async (_subject, body, html) => {
      sent.push(body)
      htmlSent.push(html ?? '')
    },
    clock: () => new Date('2026-07-07T20:00:00'),
  })

  await composeDayEmail('evening', deps)
  const body = sent[0]

  // The link prompt stays lean: the day (context) + one sentence — no persona essay.
  const q = decodeURIComponent(body.match(/https:\/\/chatgpt\.com\/\?q=(\S+)/)![1])
  assert.ok(q.includes('My day (2026-07-07):'), 'the prompt carries the day as context')
  assert.ok(q.includes('one brief question at a time'), 'the prompt asks for questions, briefly')
  assert.ok(q.length < 350, `the prompt must stay simple — got ${q.length} chars`)

  // The paste path carries answerable questions, verbatim — in BOTH the plain body
  // and the HTML twin (the surface most email clients actually render).
  const [q1, q2] = dayQuestions('evening', '2026-07-07')
  assert.ok(body.includes(q1) && body.includes(q2), 'both paste questions ride in the plain body')
  assert.ok(htmlSent[0].includes(q1) && htmlSent[0].includes(q2), 'both paste questions ride in the HTML twin')
})

test('paste questions rotate with the date and never pair a question with itself', () => {
  for (const kind of ['morning', 'evening'] as const) {
    const pairs = new Set<string>()
    for (let day = 1; day <= 31; day++) {
      const date = `2026-07-${String(day).padStart(2, '0')}`
      const [a, b] = dayQuestions(kind, date)
      assert.notEqual(a, b, `${kind} ${date}: the two questions must differ`)
      // Track the unordered PAIR, not just the first — an even-length bank with a
      // len/2 offset would vary the first yet ship only two distinct pairs (a form).
      pairs.add([a, b].sort().join(' | '))
    }
    assert.ok(pairs.size > 2, `${kind}: the pairing must genuinely vary, not clump — got ${pairs.size} distinct pairs`)
  }
})

test('the nudge never wields a scorecard — grace-not-guilt is asserted, not hoped', async () => {
  const sent: string[] = []
  const deps = makeDeps({
    // An empty day — exactly the case where a habit app would reach for guilt.
    mailer: async (subject, body, html) => {
      sent.push(`${subject}\n${body}\n${html ?? ''}`)
    },
  })

  await composeDayEmail('morning', deps)
  await composeDayEmail('evening', deps)

  const all = sent.join('\n').toLowerCase()
  for (const scorecard of ['streak', 'missed', 'back on track', "don't break", 'behind', 'catch up']) {
    assert.ok(!all.includes(scorecard), `the nudge must never say "${scorecard}"`)
  }
})

// ── cadence that breathes: the gate before composing ─────────────────────────

test('sendDailyNudge honours the rhythm — a rest day sends nothing (no throw)', async () => {
  const sent: string[] = []
  const deps = makeDeps({
    grounding: groundingOf('Rhythm: weekdays'),
    mailer: async (_s, body) => void sent.push(body),
    clock: () => new Date('2026-07-04T09:00:00'), // a Saturday
  })
  const r = await sendDailyNudge('morning', deps)
  assert.deepEqual([r.sent, r.reason], [false, 'off-day'])
  assert.equal(sent.length, 0, 'a rest day sends no email')
})

test('sendDailyNudge opens with a gentle welcome-back after a gap — grace, not guilt', async () => {
  const sent: string[] = []
  const log = makeMemoryLog()
  await log.add(reflectedOn('2026-07-10'))
  const deps = makeDeps({
    log,
    mailer: async (_s, body) => void sent.push(body),
    clock: () => new Date('2026-07-15T09:00:00'), // 5 days of silence
  })
  const r = await sendDailyNudge('morning', deps)
  assert.equal(r.sent, true)
  assert.ok(sent[0].includes("It's been a little while"), 'the welcome-back opener rides the email')
  assert.ok(!sent[0].toLowerCase().includes('missed'), 'the gap is met with grace, never guilt')
})

test('sendDailyNudge softens the evening when they already reflected today — never nags the faithful', async () => {
  const sent: string[] = []
  const log = makeMemoryLog()
  await log.add(reflectedOn('2026-07-15'))
  const deps = makeDeps({
    log,
    mailer: async (_s, body) => void sent.push(body),
    clock: () => new Date('2026-07-15T20:00:00'),
  })
  const r = await sendDailyNudge('evening', deps)
  assert.deepEqual([r.sent, r.reason], [true, 'already-reflected'])
  assert.ok(sent[0].includes('already sat with today'), 'the light opener acknowledges they showed up')
})

test('sendDailyNudge on a fresh start sends normally, with no guilt opener but the honest less-often line', async () => {
  const sent: string[] = []
  const deps = makeDeps({
    mailer: async (_s, body) => void sent.push(body),
    clock: () => new Date('2026-07-15T09:00:00'),
  })
  const r = await sendDailyNudge('morning', deps)
  assert.equal(r.sent, true)
  assert.ok(
    !sent[0].includes("It's been a little while") && !sent[0].includes('already sat'),
    'a present new user gets no welcome-back / light line',
  )
  assert.ok(sent[0].includes('Fewer of these?'), 'the honest less-often line is always offered')
})
