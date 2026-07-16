import { test } from 'node:test'
import assert from 'node:assert/strict'
import { migrateToJournal } from './migrate'
import { makeJournalGrounding } from '../adapters/grounding-journal'
import { makeMemoryJournal, makeMemoryLog } from '../testing/fakes'

const groundingOf = (doc: string | null) => ({
  async get() {
    return doc
  },
  async set() {},
})

test('migration turns shown-up days into Markers (deduped) and moves the grounding across', async () => {
  const log = makeMemoryLog()
  await log.add({ id: '1', date: '2026-07-14', kind: 'after', status: 'shown-up' })
  await log.add({ id: '2', date: '2026-07-14', kind: 'look-back', status: 'shown-up' }) // same day twice
  await log.add({ id: '3', date: '2026-07-15', kind: 'after', status: 'shown-up' })
  await log.add({ id: '4', date: '2026-07-16', kind: 'after', status: 'skipped' }) // never memorialised
  const journal = makeMemoryJournal()

  const result = await migrateToJournal({ log, grounding: groundingOf('Rhythm: weekdays') }, journal)

  assert.equal(result.markerDays, 2)
  const markers = await journal.query({ kind: 'reflection' })
  assert.deepEqual(markers.map((m) => m.date).sort(), ['2026-07-14', '2026-07-15'])
  assert.ok(markers.every((m) => m.body === ''), 'Markers stay empty-body through migration')
  assert.equal(result.grounding, 'migrated')
  assert.equal(await makeJournalGrounding(journal).get(), 'Rhythm: weekdays')
})

test('a stale file NEVER clobbers preferences already living in the calendar', async () => {
  const journal = makeMemoryJournal()
  const living = makeJournalGrounding(journal)
  await living.set('Rhythm: mornings only') // saved through the conversation, after the file went stale

  const result = await migrateToJournal({ grounding: groundingOf('Rhythm: daily (stale)') }, journal)

  assert.equal(result.grounding, 'kept-journal')
  assert.equal(await living.get(), 'Rhythm: mornings only', 'the calendar copy is the living one')
})

test('re-running the migration is a no-op in effect — same Markers, no duplicates', async () => {
  const log = makeMemoryLog()
  await log.add({ id: '1', date: '2026-07-14', kind: 'after', status: 'shown-up' })
  const journal = makeMemoryJournal()

  await migrateToJournal({ log, grounding: groundingOf('Rhythm: daily') }, journal)
  await migrateToJournal({ log, grounding: groundingOf('Rhythm: daily') }, journal)

  assert.equal((await journal.query({ kind: 'reflection' })).length, 1)
  assert.equal((await journal.query({ kind: 'preferences' })).length, 1)
})

test('nothing legacy means nothing done', async () => {
  const journal = makeMemoryJournal()
  const result = await migrateToJournal({}, journal)
  assert.deepEqual(result, { markerDays: 0, grounding: 'none' })
  assert.equal(journal.entries.length, 0)
})
