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
 * A stateful fake client models get/patch so annotate→edit→strip round-trips.
 */

function fakeCalendar(
  init: {
    description?: string
    visibility?: string
    attendees?: unknown[]
    summary?: string
    start?: calendar_v3.Schema$Event['start']
    end?: calendar_v3.Schema$Event['end']
    listItems?: calendar_v3.Schema$Event[]
  } = {},
) {
  const state = { description: init.description, visibility: init.visibility, attendees: init.attendees }
  const calls = {
    listed: [] as { calendarId?: string; privateExtendedProperty?: string[] }[],
    inserted: [] as { calendarId?: string; requestBody?: calendar_v3.Schema$Event }[],
    patched: [] as { calendarId?: string; eventId?: string; requestBody?: calendar_v3.Schema$Event }[],
    deleted: [] as { calendarId?: string; eventId?: string }[],
  }
  const cal = {
    events: {
      get: async () => ({
        data: {
          description: state.description,
          visibility: state.visibility,
          attendees: state.attendees,
          summary: init.summary,
          start: init.start,
          end: init.end,
        },
      }),
      list: async (p: { calendarId?: string; privateExtendedProperty?: string[] }) => {
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

// ── the side entry: the write mode for what must not touch the event ─────────

test('sideEntry keeps a private, transparent, tagged sibling in the STORE calendar — same slot, source untouched', async () => {
  const { cal, calls } = fakeCalendar({
    summary: 'Team offsite',
    attendees: [{ email: 'boss@work.example' }], // shared — exactly why the side entry exists
    start: { dateTime: '2026-07-16T14:00:00+10:00', timeZone: 'Australia/Sydney' },
    end: { dateTime: '2026-07-16T15:00:00+10:00', timeZone: 'Australia/Sydney' },
  })
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ', storeCalendarId: 'STORE' })

  await diary.sideEntry('e1', 'You walked in braced for a fight and it never came.')

  assert.equal(calls.patched.length, 0, 'the shared source event is never written to')
  assert.equal(calls.inserted.length, 1)
  const { calendarId, requestBody } = calls.inserted[0]
  assert.equal(calendarId, 'STORE', 'created artifacts live on the store calendar')
  assert.equal(requestBody?.summary, 'Reflection · Team offsite')
  assert.deepEqual(requestBody?.start, { dateTime: '2026-07-16T14:00:00+10:00', timeZone: 'Australia/Sydney' })
  assert.equal(requestBody?.visibility, 'private', 'the reflection must never leak')
  assert.equal(requestBody?.transparency, 'transparent', 'a reflection must not block their time')
  const tags = requestBody?.extendedProperties?.private ?? {}
  assert.equal(tags.joshua421, 'true', 'tagged ours — so the guarded delete can reverse it')
  assert.equal(tags.joshua421SideOf, 'e1', 'tied to its source event')
  assert.equal(tags.joshua421Date, '2026-07-16')
})

test('a second sideEntry for the same event appends to the sibling — never a second sibling', async () => {
  const existing: calendar_v3.Schema$Event = {
    id: 'side-1',
    description: 'first reflection',
    extendedProperties: { private: { joshua421: 'true', joshua421SideOf: 'e1' } },
  }
  const { cal, calls } = fakeCalendar({
    summary: 'Team offsite',
    start: { dateTime: '2026-07-16T14:00:00+10:00' },
    listItems: [existing],
  })
  const diary = makeGoogleDiary({ calendar: cal, readCalendarId: 'READ', storeCalendarId: 'STORE' })

  await diary.sideEntry('e1', 'second reflection')

  assert.equal(calls.inserted.length, 0)
  assert.deepEqual(
    [calls.patched[0].calendarId, calls.patched[0].eventId],
    ['STORE', 'side-1'],
  )
  assert.equal(calls.patched[0].requestBody?.description, 'first reflection\n\nsecond reflection')
})

test('an all-day source keeps an all-day sibling — no fabricated midnight', async () => {
  const { cal, calls } = fakeCalendar({ summary: 'Sabbath', start: { date: '2026-07-19' } })
  const diary = makeGoogleDiary({ calendar: cal, storeCalendarId: 'STORE' })

  await diary.sideEntry('e2', 'rest, actually rested')

  const body = calls.inserted[0].requestBody
  assert.deepEqual(body?.start, { date: '2026-07-19' })
  assert.deepEqual(body?.end, { date: '2026-07-19' }, 'a missing end falls back to the start')
  assert.equal(body?.extendedProperties?.private?.joshua421Date, '2026-07-19')
})

test('annotate refuses a public event (world-readable description)', async () => {
  const { cal } = fakeCalendar({ description: 'x', visibility: 'public' })
  const diary = makeGoogleDiary({ calendar: cal })
  await assert.rejects(() => diary.annotate('e1', 'private confession'))
})
