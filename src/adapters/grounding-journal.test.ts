import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeJournalGrounding, PREFERENCES_PERIOD } from './grounding-journal'
import { makeMemoryJournal } from '../testing/fakes'

test('unset grounding reads null; a save round-trips; a re-save replaces the ONE entry', async () => {
  const journal = makeMemoryJournal()
  const grounding = makeJournalGrounding(journal, () => new Date('2026-07-16T09:00:00'))

  assert.equal(await grounding.get(), null)

  await grounding.set('Goals: trust God with my work\nRhythm: weekdays\nChurch: Sunday\n')
  assert.equal(await grounding.get(), 'Goals: trust God with my work\nRhythm: weekdays\nChurch: Sunday')

  await grounding.set('Rhythm: mornings only')
  const entries = await journal.query({ kind: 'preferences' })
  assert.equal(entries.length, 1, 'one preferences entry, ever (kind + period identity)')
  assert.equal(entries[0].period, PREFERENCES_PERIOD)
  assert.equal(entries[0].date, '2026-07-16', 'the entry dates to the day it was last saved')
  assert.equal(await grounding.get(), 'Rhythm: mornings only')
})

test('a hand-edit of the calendar entry reads back exactly like a save', async () => {
  // "Editable by hand" survives the cutover: the entry's description IS the
  // document, so an edit made in Google Calendar itself must round-trip.
  const journal = makeMemoryJournal()
  const grounding = makeJournalGrounding(journal)
  await grounding.set('Rhythm: daily')

  const [entry] = journal.entries
  entry.body = 'Rhythm: weekly\nChurch: Saturday' // edited in the calendar UI

  assert.equal(await grounding.get(), 'Rhythm: weekly\nChurch: Saturday')
})

test('an emptied-out entry reads as unset, not as an empty rhythm', async () => {
  const journal = makeMemoryJournal()
  const grounding = makeJournalGrounding(journal)
  await grounding.set('Rhythm: daily')
  journal.entries[0].body = '   \n ' // cleared by hand
  assert.equal(await grounding.get(), null, 'whitespace is "not set yet", so defaults apply')
})
