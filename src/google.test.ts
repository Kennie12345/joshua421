import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { calendar_v3 } from 'googleapis'
import { makeGoogleDiary } from './google'

/**
 * DO NO HARM at the Diary adapter:
 *  - the user's REAL event calendar (read + annotate) and joshua421's STORE
 *    calendar (created summaries) are distinct surfaces, never conflated;
 *  - every write is reversible: stripAnnotation removes ONLY our block and
 *    restores the user's words; unwriteSummary deletes ONLY our tagged summaries.
 * All tests use an injected fake client — no network, secrets, or disk.
 */

function fakeCalendar(opts: { getDescription?: string; listItems?: calendar_v3.Schema$Event[] } = {}) {
  const calls = {
    listed: [] as { calendarId?: string }[],
    inserted: [] as { calendarId?: string; requestBody?: calendar_v3.Schema$Event }[],
    patched: [] as { calendarId?: string; eventId?: string; requestBody?: calendar_v3.Schema$Event }[],
    deleted: [] as { calendarId?: string; eventId?: string }[],
  }
  const cal = {
    events: {
      list: async (p: { calendarId?: string }) => {
        calls.listed.push(p)
        return { data: { items: opts.listItems ?? [] } }
      },
      get: async () => ({ data: { description: opts.getDescription } }),
      insert: async (p: { calendarId?: string; requestBody?: calendar_v3.Schema$Event }) => {
        calls.inserted.push(p)
        return { data: { id: 'new-id' } }
      },
      patch: async (p: { calendarId?: string; eventId?: string; requestBody?: calendar_v3.Schema$Event }) => {
        calls.patched.push(p)
        return { data: {} }
      },
      delete: async (p: { calendarId?: string; eventId?: string }) => {
        calls.deleted.push(p)
        return { data: {} }
      },
    },
  } as unknown as calendar_v3.Calendar
  return { cal, calls }
}

test('day() reads the READ calendar; writeSummary writes the STORE calendar, tagged', async () => {
  const { cal, calls } = fakeCalendar()
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ', storeCalendarId: 'STORE' })

  await diary.day('2026-07-01')
  await diary.writeSummary('2026-07-01', 'a gentle summary')

  assert.equal(calls.listed[0].calendarId, 'READ')
  assert.equal(calls.inserted[0].calendarId, 'STORE')
  const priv = calls.inserted[0].requestBody?.extendedProperties?.private ?? {}
  assert.equal(priv.joshua421, 'true')
  assert.equal(priv.joshua421Kind, 'day-summary')
  assert.equal(priv.joshua421Date, '2026-07-01')
})

test('stripAnnotation restores the user’s words, removing only our block', async () => {
  const { cal, calls } = fakeCalendar({ getDescription: 'my own notes\n\n— joshua421 —\ngentle note' })
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ' })

  await diary.stripAnnotation('e1')

  assert.equal(calls.patched.length, 1)
  assert.equal(calls.patched[0].calendarId, 'READ')
  assert.equal(calls.patched[0].requestBody?.description, 'my own notes')
})

test('stripAnnotation clears a description that is wholly ours', async () => {
  const { cal, calls } = fakeCalendar({ getDescription: '— joshua421 —\ngentle note' })
  const diary = makeGoogleDiary({ calendar: cal })

  await diary.stripAnnotation('e1')

  assert.equal(calls.patched[0].requestBody?.description, '')
})

test('stripAnnotation never touches an event that carries nothing of ours', async () => {
  const { cal, calls } = fakeCalendar({ getDescription: "just the user's own meeting notes" })
  const diary = makeGoogleDiary({ calendar: cal })

  await diary.stripAnnotation('e1')

  assert.equal(calls.patched.length, 0, 'must not patch an event with no joshua421 block')
})

test('unwriteSummary deletes only our tagged summaries, never a real event', async () => {
  const listItems: calendar_v3.Schema$Event[] = [
    { id: 'ours', extendedProperties: { private: { joshua421: 'true' } } },
    { id: 'not-ours', extendedProperties: { private: {} } },
  ]
  const { cal, calls } = fakeCalendar({ listItems })
  const diary = makeGoogleDiary({ calendar: cal, storeCalendarId: 'STORE' })

  await diary.unwriteSummary('2026-07-01')

  assert.deepEqual(calls.deleted.map((d) => d.eventId), ['ours'])
  assert.equal(calls.deleted[0].calendarId, 'STORE')
})
