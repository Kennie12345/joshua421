import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { calendar_v3 } from 'googleapis'
import { makeGoogleJournal } from './journal-google'

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
  const { cal, deleted } = fakeCalendar({
    extendedProperties: { private: { joshua421: 'true' } },
  })
  const journal = makeGoogleJournal('primary', cal)

  await journal.delete('evt-joshua421')
  assert.deepEqual(deleted, ['evt-joshua421'])
})
