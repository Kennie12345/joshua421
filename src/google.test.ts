import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { calendar_v3 } from 'googleapis'
import { makeGoogleDiary } from './google'

/**
 * DO NO HARM at the Diary adapter. Regression tests for the safety review:
 *  - the read and store calendars are distinct surfaces;
 *  - annotate refuses any event whose description others can see;
 *  - the note lives in a fenced block, so reversal removes EXACTLY our block and
 *    NEVER the user's own words — including words they add after our block;
 *  - reversal is a no-op whenever our block is ambiguous (marker the user typed,
 *    missing fence, more than one) rather than risking their text;
 *  - unwriteSummary deletes only our own tagged summaries for that exact date.
 * A stateful fake client models get/patch so annotate→edit→strip round-trips.
 */

function fakeCalendar(
  init: {
    description?: string
    visibility?: string
    attendees?: unknown[]
    listItems?: calendar_v3.Schema$Event[]
  } = {},
) {
  const state = { description: init.description, visibility: init.visibility, attendees: init.attendees }
  const calls = {
    listed: [] as { calendarId?: string }[],
    inserted: [] as { calendarId?: string; requestBody?: calendar_v3.Schema$Event }[],
    patched: [] as { calendarId?: string; eventId?: string; requestBody?: calendar_v3.Schema$Event }[],
    deleted: [] as { calendarId?: string; eventId?: string }[],
  }
  const cal = {
    events: {
      get: async () => ({
        data: { description: state.description, visibility: state.visibility, attendees: state.attendees },
      }),
      list: async (p: { calendarId?: string }) => {
        calls.listed.push(p)
        return { data: { items: init.listItems ?? [] } }
      },
      insert: async (p: { calendarId?: string; requestBody?: calendar_v3.Schema$Event }) => {
        calls.inserted.push(p)
        return { data: { id: 'new-id' } }
      },
      patch: async (p: { calendarId?: string; eventId?: string; requestBody?: calendar_v3.Schema$Event }) => {
        calls.patched.push(p)
        state.description = p.requestBody?.description ?? undefined
        return { data: {} }
      },
      delete: async (p: { calendarId?: string; eventId?: string }) => {
        calls.deleted.push(p)
        return { data: {} }
      },
    },
  } as unknown as calendar_v3.Calendar
  return { cal, calls, state }
}

test("day() carries the calendar's own wall-clock and zone — never just a bare UTC instant", async () => {
  const listItems: calendar_v3.Schema$Event[] = [
    {
      id: 'e1',
      summary: 'GCB mens group',
      start: { dateTime: '2026-07-02T23:00:00+10:00', timeZone: 'Australia/Sydney' },
    },
    { id: 'e2', summary: 'Sabbath', start: { date: '2026-07-02' } },
  ]
  const { cal } = fakeCalendar({ listItems })
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ' })

  const events = await diary.day('2026-07-02')

  // A Sydney 23:00 must survive as the calendar's own wall-clock — as a Date
  // alone it is 13:00Z, and every reader outside AEST would misreport the
  // user's evening. Sydney in July renders 13:00Z as 23:00, so the zone agrees
  // with the rendering and is passed through.
  assert.equal(events[0].startLocal, '2026-07-02T23:00:00+10:00')
  assert.equal(events[0].timeZone, 'Australia/Sydney')
  // An all-day entry stays a bare date, verbatim — never fabricated into a
  // midnight that would masquerade as a timed event. No zone claimed.
  assert.equal(events[1].startLocal, '2026-07-02')
  assert.equal(events[1].timeZone, undefined)
})

test('day() drops an event-definition zone that contradicts the calendar rendering', async () => {
  // Google renders dateTime in the CALENDAR's zone but start.timeZone is the
  // zone the event was DEFINED in. Found live on the dogfood calendar: an
  // Adelaide-defined event rendered at +10:00 (Adelaide is +9:30 in July — the
  // labeled zone would misread the digits by 30 minutes), and the same for a
  // meeting created in New York. A contradictory label is worse than none.
  const listItems: calendar_v3.Schema$Event[] = [
    {
      id: 'adelaide',
      summary: 'Adelaide call',
      start: { dateTime: '2026-07-02T14:00:00+10:00', timeZone: 'Australia/Adelaide' },
    },
    {
      id: 'ny',
      summary: 'NY sync',
      start: { dateTime: '2026-07-03T11:00:00+10:00', timeZone: 'America/New_York' },
    },
  ]
  const { cal } = fakeCalendar({ listItems })
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ' })

  const events = await diary.day('2026-07-02')

  // The wall-clock (what the user's calendar grid shows) survives verbatim…
  assert.equal(events[0].startLocal, '2026-07-02T14:00:00+10:00')
  assert.equal(events[1].startLocal, '2026-07-03T11:00:00+10:00')
  // …but the disagreeing zones are dropped, not served as contradictions.
  assert.equal(events[0].timeZone, undefined)
  assert.equal(events[1].timeZone, undefined)
})

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
})

test('annotate → user edits BELOW our block → strip restores the user’s words, losing nothing', async () => {
  const { cal, state } = fakeCalendar({ description: 'Standup with the team' })
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ' })

  await diary.annotate('e1', 'You wanted to lead without needing to win the room.')
  // the user opens the event and adds their own line at the bottom, below our block
  state.description = `${state.description}\nRemember to call Dad`

  await diary.stripAnnotation('e1')

  assert.equal(state.description, 'Standup with the team\n\nRemember to call Dad')
})

test('annotate on an empty event then strip returns it to empty', async () => {
  const { cal, state } = fakeCalendar({ description: '' })
  const diary = makeGoogleDiary({ calendar: cal })

  await diary.annotate('e1', 'a gentle note')
  await diary.stripAnnotation('e1')

  assert.equal(state.description, '')
})

test('multiple annotations then strip removes all of them and keeps the user text', async () => {
  const { cal, state } = fakeCalendar({ description: 'Lunch' })
  const diary = makeGoogleDiary({ calendar: cal })

  await diary.annotate('e1', 'note one')
  await diary.annotate('e1', 'note two')
  assert.ok(state.description?.includes('note one') && state.description?.includes('note two'))

  await diary.stripAnnotation('e1')
  assert.equal(state.description, 'Lunch')
})

test('strip is a no-op when the user typed the marker themselves (no closing fence)', async () => {
  const { cal, calls, state } = fakeCalendar({ description: '— joshua421 — my own header\nmy notes' })
  const diary = makeGoogleDiary({ calendar: cal })

  await diary.stripAnnotation('e1')

  assert.equal(calls.patched.length, 0)
  assert.equal(state.description, '— joshua421 — my own header\nmy notes')
})

test('strip is a no-op when the marker appears more than once (ambiguous)', async () => {
  const { cal, calls } = fakeCalendar({
    description: '— joshua421 —\nmine\n\n— joshua421 —\nreflection\n—·—',
  })
  const diary = makeGoogleDiary({ calendar: cal })

  await diary.stripAnnotation('e1')

  assert.equal(calls.patched.length, 0)
})

test('annotate refuses an event with attendees (would sync to them)', async () => {
  const { cal } = fakeCalendar({ description: 'x', attendees: [{ email: 'a@b.c' }] })
  const diary = makeGoogleDiary({ calendar: cal })
  await assert.rejects(() => diary.annotate('e1', 'private note'))
})

test('annotate refuses a public event (world-readable description)', async () => {
  const { cal } = fakeCalendar({ description: 'x', visibility: 'public' })
  const diary = makeGoogleDiary({ calendar: cal })
  await assert.rejects(() => diary.annotate('e1', 'private confession'))
})

test('unwriteSummary deletes only our tagged day-summaries for that exact date', async () => {
  const listItems: calendar_v3.Schema$Event[] = [
    { id: 'right', extendedProperties: { private: { joshua421: 'true', joshua421Kind: 'day-summary', joshua421Date: '2026-07-01' } } },
    { id: 'wrong-kind', extendedProperties: { private: { joshua421: 'true', joshua421Kind: 'rollup', joshua421Date: '2026-07-01' } } },
    { id: 'wrong-date', extendedProperties: { private: { joshua421: 'true', joshua421Kind: 'day-summary', joshua421Date: '2026-07-02' } } },
    { id: 'not-ours', extendedProperties: { private: {} } },
  ]
  const { cal, calls } = fakeCalendar({ listItems })
  const diary = makeGoogleDiary({ calendar: cal, storeCalendarId: 'STORE' })

  await diary.unwriteSummary('2026-07-01')

  assert.deepEqual(calls.deleted.map((d) => d.eventId), ['right'])
  assert.equal(calls.deleted[0].calendarId, 'STORE')
})
