import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { calendar_v3 } from 'googleapis'
import { makeGoogleDiary } from './google'

/**
 * DO NO HARM: the only calendar object joshua421 CREATES via the Diary is the day
 * summary. It must be tagged so it is findable (via privateExtendedProperty) and
 * reversible — never left indistinguishable from the user's own events.
 */

test('writeSummary tags the created event as a joshua421 day-summary', async () => {
  let inserted: calendar_v3.Schema$Event | undefined
  const cal = {
    events: {
      insert: async ({ requestBody }: { requestBody: calendar_v3.Schema$Event }) => {
        inserted = requestBody
        return { data: { id: 'new-id' } }
      },
    },
  } as unknown as calendar_v3.Calendar

  await makeGoogleDiary(cal).writeSummary('2026-07-01', 'a gentle summary')

  const priv = inserted?.extendedProperties?.private ?? {}
  assert.equal(priv.joshua421, 'true')
  assert.equal(priv.joshua421Kind, 'day-summary')
  assert.equal(priv.joshua421Date, '2026-07-01')
})
