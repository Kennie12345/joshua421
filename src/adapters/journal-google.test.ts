import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { calendar_v3 } from 'googleapis'
import { makeGoogleJournal } from './journal-google'

function event(id: string, date = '2026-07-01', period = date): calendar_v3.Schema$Event {
  return {
    id, summary: id, description: `body ${id}`, start: { date },
    extendedProperties: { private: { joshua421: 'true', joshua421Kind: 'day-summary', joshua421Date: date, joshua421Period: period } },
  }
}

function journalCalendar(pages: calendar_v3.Schema$Event[][] = [[]]) {
  const inserts: unknown[] = []
  const patches: { eventId?: string; requestBody?: calendar_v3.Schema$Event }[] = []
  const deleted: string[] = []
  const byId = new Map(pages.flat().map((item) => [item.id!, item]))
  const cal = {
    events: {
      list: async (params: { pageToken?: string }) => {
        const index = Number(params.pageToken ?? '0')
        return { data: { items: pages[index], nextPageToken: index + 1 < pages.length ? String(index + 1) : undefined } }
      },
      get: async ({ eventId }: { eventId: string }) => ({ data: byId.get(eventId) ?? event(eventId) }),
      insert: async (p: { requestBody?: calendar_v3.Schema$Event }) => {
        inserts.push(p)
        const created = { ...p.requestBody, id: 'inserted' } as calendar_v3.Schema$Event
        byId.set('inserted', created)
        return { data: created }
      },
      patch: async (p: { eventId?: string; requestBody?: calendar_v3.Schema$Event }) => {
        patches.push(p)
        byId.set(p.eventId!, { ...byId.get(p.eventId!), ...p.requestBody })
        return { data: byId.get(p.eventId!) }
      },
      delete: async ({ eventId }: { eventId: string }) => {
        deleted.push(eventId)
        return { data: {} }
      },
    },
  } as unknown as calendar_v3.Calendar
  return { cal, inserts, patches, deleted }
}

test('upsert inserts when no Journal identity exists', async () => {
  const { cal, inserts } = journalCalendar()
  const entry = await makeGoogleJournal('primary', cal).upsert('day-summary', '2026-07-01', {
    date: '2026-07-01', title: 'Reflection', body: 'body',
  })
  assert.equal(inserts.length, 1)
  assert.equal(entry.id, 'inserted')
})

test('upsert patches rather than inserts when its identity exists', async () => {
  const { cal, inserts, patches } = journalCalendar([[event('present')]])
  await makeGoogleJournal('primary', cal).upsert('day-summary', '2026-07-01', {
    date: '2026-07-01', title: 'replacement', body: 'body',
  })
  assert.equal(inserts.length, 0)
  assert.equal(patches[0].eventId, 'present')
})

test('upsert adopts a legacy kind-and-date Journal entry', async () => {
  const legacy = event('legacy')
  delete legacy.extendedProperties!.private!.joshua421Period
  const { cal, inserts, patches } = journalCalendar([[], [legacy]])
  await makeGoogleJournal('primary', cal).upsert('day-summary', '2026-07-01', {
    date: '2026-07-01', title: 'replacement', body: 'body',
  })
  assert.equal(inserts.length, 0)
  assert.equal(patches[0].requestBody?.extendedProperties?.private?.joshua421Period, '2026-07-01')
})

test('upsert heals duplicate Journal identities through guarded deletes', async () => {
  const { cal, patches, deleted } = journalCalendar([[event('old', '2026-07-01'), event('new', '2026-07-02')]])
  await makeGoogleJournal('primary', cal).upsert('day-summary', '2026-07-01', {
    date: '2026-07-01', title: 'replacement', body: 'body',
  })
  assert.equal(patches[0].eventId, 'new')
  assert.deepEqual(deleted, ['old'])
})

test('query follows every page before returning newest first', async () => {
  const { cal } = journalCalendar([[event('old', '2026-07-01')], [event('new', '2026-07-02')]])
  const entries = await makeGoogleJournal('primary', cal).query()
  assert.deepEqual(entries.map((entry) => entry.id), ['new', 'old'])
})

/**
 * DO NO HARM: the Journal must only ever delete entries it created. A calendar
 * event carries attacker-influenced text (meeting invites), and the reflecting
 * LLM is handed delete() — so an injected or hallucinated id must not be able to
 * wipe a real meeting. delete() must verify the joshua421 tag first.
 */
function fakeCalendar(getResult: unknown) {
  const deleted: string[] = []
  const cal = {
    events: {
      get: async () => ({ data: getResult }),
      delete: async ({ eventId }: { eventId: string }) => {
        deleted.push(eventId)
        return { data: {} }
      },
    },
  } as unknown as calendar_v3.Calendar
  return { cal, deleted }
}

test('delete() refuses an event that is not joshua421-tagged (never touches a real meeting)', async () => {
  const { cal, deleted } = fakeCalendar({ extendedProperties: { private: {} } })
  const journal = makeGoogleJournal('primary', cal)

  await assert.rejects(() => journal.delete('evt-real-meeting'))
  assert.deepEqual(deleted, [], 'events.delete must not be called on an untagged event')
})

test('delete() removes an event that is joshua421-tagged', async () => {
  const { cal, deleted } = fakeCalendar({ extendedProperties: { private: { joshua421: 'true' } } })
  const journal = makeGoogleJournal('primary', cal)

  await journal.delete('evt-joshua421')
  assert.deepEqual(deleted, ['evt-joshua421'])
})
