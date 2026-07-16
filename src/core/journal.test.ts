import { test } from 'node:test'
import assert from 'node:assert/strict'
import { marker } from './journal'
import { makeMemoryJournal } from '../testing/fakes'

test('memory Journal upserts one entry per kind and period', async () => {
  const journal = makeMemoryJournal()
  await journal.upsert('day-summary', '2026-07-01', { date: '2026-07-01', title: 'first', body: 'one' })
  await journal.upsert('day-summary', '2026-07-01', { date: '2026-07-01', title: 'replaced', body: 'two' })
  await journal.upsert('day-summary', '2026-07-02', { date: '2026-07-02', title: 'other', body: 'three' })

  assert.equal(journal.entries.length, 2)
  assert.deepEqual((await journal.query()).map((entry) => entry.body), ['three', 'two'])
})

test('memory Journal filters inclusively, ANDs tags, and deletes only its entry', async () => {
  const journal = makeMemoryJournal()
  const daily = await journal.upsert('day-summary', '2026-07-01', {
    date: '2026-07-01', title: 'daily', body: 'a', tags: { level: 'daily', season: 'ordinary' },
  })
  await journal.upsert('rollup', '2026-W27', {
    date: '2026-07-03', title: 'weekly', body: 'b', tags: { level: 'weekly', season: 'ordinary' },
  })
  await journal.upsert('day-summary', '2026-07-04', {
    date: '2026-07-04', title: 'late', body: 'c', tags: { level: 'daily', season: 'special' },
  })

  assert.deepEqual((await journal.query({ kind: 'day-summary', period: '2026-07-01' })).map((e) => e.title), ['daily'])
  assert.deepEqual((await journal.query({ since: '2026-07-01', until: '2026-07-03' })).map((e) => e.title), ['weekly', 'daily'])
  assert.deepEqual((await journal.query({ tags: { level: 'daily', season: 'ordinary' } })).map((e) => e.title), ['daily'])

  await journal.delete(daily.id)
  assert.deepEqual((await journal.query()).map((e) => e.title), ['late', 'weekly'])
})

test('a Marker can only be made from a day, so it cannot carry content', () => {
  assert.equal(marker('2026-07-15').body, '')
})
