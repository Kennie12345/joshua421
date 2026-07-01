import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDayNotes } from './flows'
import { makeMemoryLog, makeMemoryDiary, makeDeps } from '../testing/fakes'

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
