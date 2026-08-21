import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeJournalLog } from './log-journal'
import { makeMemoryJournal } from '../testing/fakes'

/**
 * The Log on the Journal — the cutover's load-bearing adapter. The promise it
 * must keep is the anchor test's: a reflection becomes an EMPTY-BODY Marker;
 * no path through this adapter can put content in the store.
 */

const reflected = (date: string, kind: 'after' | 'look-back' = 'after') =>
  ({ id: `${date}-${kind}`, date, kind, status: 'shown-up' as const })

test('a reflected day becomes ONE empty-body Marker — content structurally impossible', async () => {
  const journal = makeMemoryJournal()
  const log = makeJournalLog(journal)

  await log.add(reflected('2026-07-15'))
  await log.add(reflected('2026-07-15', 'look-back')) // a second reflection, same day

  assert.equal(journal.entries.length, 1, 'one Marker per day (ADR 0005), however often they reflect')
  const [markerEntry] = journal.entries
  assert.equal(markerEntry.kind, 'reflection')
  assert.equal(markerEntry.title, 'Reflected')
  assert.equal(markerEntry.body, '', 'the Marker cannot carry words')
})

test('a skipped reflection writes nothing — no absence recorded on their calendar', async () => {
  const journal = makeMemoryJournal()
  const log = makeJournalLog(journal)
  await log.add({ id: 'x', date: '2026-07-15', kind: 'after', status: 'skipped' })
  assert.equal(journal.entries.length, 0)
})

test('reflections() maps Markers back newest-first and honours since', async () => {
  const journal = makeMemoryJournal()
  const log = makeJournalLog(journal)
  for (const date of ['2026-07-12', '2026-07-14', '2026-07-16']) await log.add(reflected(date))

  const all = await log.reflections()
  assert.deepEqual(all.map((r) => r.date), ['2026-07-16', '2026-07-14', '2026-07-12'])
  assert.ok(all.every((r) => r.kind === 'after' && r.status === 'shown-up'))

  const recent = await log.reflections('2026-07-14')
  assert.deepEqual(recent.map((r) => r.date), ['2026-07-16', '2026-07-14'])
})

