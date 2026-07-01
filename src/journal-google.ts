import type { calendar_v3 } from 'googleapis'
import type { Journal, JournalEntry, JournalKind, JournalQuery, NewEntry } from './core/journal'
import { googleCalendar } from './google'

/** Next local day as YYYY-MM-DD (all-day events use an exclusive end date). */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toEntry(ev: calendar_v3.Schema$Event): JournalEntry {
  const priv: Record<string, string> = ev.extendedProperties?.private ?? {}
  const { joshua421: _present, joshua421Kind, joshua421Date, ...tags } = priv
  return {
    id: ev.id ?? '',
    kind: (joshua421Kind ?? 'reflection') as JournalKind,
    date: joshua421Date ?? ev.start?.date ?? '',
    title: ev.summary ?? '',
    body: ev.description ?? '',
    ...(Object.keys(tags).length ? { tags } : {}),
  }
}

/**
 * Google Calendar–backed Journal. Entries are all-day events tagged with private
 * `extendedProperties`, so our entries are always findable (via
 * `privateExtendedProperty`) and never confused with the user's real events.
 *
 * Target calendar is `JOSHUA421_CALENDAR_ID` — a dedicated "joshua421" calendar is
 * cleanest (create it once in Google Calendar and set the id); defaults to
 * `primary`. Either way it's the user's own calendar; we store nothing.
 *
 * Note: `query` reads a single page (≤2500). The rollup design keeps real queries
 * bounded to a level, so this is sufficient; add pagination if a raw query ever
 * needs to span more.
 */
export function makeGoogleJournal(
  calendarId = process.env.JOSHUA421_CALENDAR_ID ?? 'primary',
  calendarClient?: calendar_v3.Calendar,
): Journal {
  // Resolved lazily inside each method, so constructing the adapter in a test
  // (with an injected client) never builds a real OAuth client from env.
  const cal = () => calendarClient ?? googleCalendar()
  return {
    async add(entry: NewEntry): Promise<JournalEntry> {
      const res = await cal().events.insert({
        calendarId,
        requestBody: {
          summary: entry.title,
          description: entry.body,
          start: { date: entry.date },
          end: { date: nextDay(entry.date) },
          extendedProperties: {
            private: {
              joshua421: 'true',
              joshua421Kind: entry.kind,
              joshua421Date: entry.date,
              ...(entry.tags ?? {}),
            },
          },
        },
      })
      return { ...entry, id: res.data.id ?? '' }
    },

    async query(q: JournalQuery = {}): Promise<JournalEntry[]> {
      const privateExtendedProperty = [
        'joshua421=true',
        ...(q.kind ? [`joshua421Kind=${q.kind}`] : []),
        ...Object.entries(q.tags ?? {}).map(([k, v]) => `${k}=${v}`),
      ]
      const res = await cal().events.list({
        calendarId,
        privateExtendedProperty,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        ...(q.since ? { timeMin: new Date(`${q.since}T00:00:00`).toISOString() } : {}),
        ...(q.until ? { timeMax: new Date(`${nextDay(q.until)}T00:00:00`).toISOString() } : {}),
      })
      // startTime is ascending; newest first.
      return (res.data.items ?? []).map(toEntry).reverse()
    },

    async update(id: string, patch: Partial<NewEntry>): Promise<void> {
      const client = cal()
      // Only ever modify our OWN entries — never stamp/mutate a real event.
      const existing = await client.events.get({ calendarId, eventId: id })
      if (existing.data.extendedProperties?.private?.joshua421 !== 'true') {
        throw new Error(
          `refusing to update ${id}: not a joshua421-created entry — the Journal only modifies its own entries.`,
        )
      }
      const requestBody: calendar_v3.Schema$Event = {}
      if (patch.title !== undefined) requestBody.summary = patch.title
      if (patch.body !== undefined) requestBody.description = patch.body
      if (patch.date !== undefined) {
        requestBody.start = { date: patch.date }
        requestBody.end = { date: nextDay(patch.date) }
      }
      if (patch.kind !== undefined || patch.date !== undefined || patch.tags !== undefined) {
        // Keep the joshua421='true' tag no matter what a patch carries, so an entry
        // can never be silently un-tagged (and thus made unfindable/undeletable).
        const priv: Record<string, string> = { joshua421: 'true', ...(patch.tags ?? {}) }
        if (patch.kind !== undefined) priv.joshua421Kind = patch.kind
        if (patch.date !== undefined) priv.joshua421Date = patch.date
        requestBody.extendedProperties = { private: priv }
      }
      await client.events.patch({ calendarId, eventId: id, requestBody })
    },

    async delete(id: string): Promise<void> {
      const client = cal()
      // Only ever delete our OWN entries: verify the joshua421 tag first, so an
      // injected or hallucinated id can never wipe one of the user's real events.
      const existing = await client.events.get({ calendarId, eventId: id })
      if (existing.data.extendedProperties?.private?.joshua421 !== 'true') {
        throw new Error(
          `refusing to delete ${id}: not a joshua421-created entry — the Journal only removes its own entries.`,
        )
      }
      await client.events.delete({ calendarId, eventId: id })
    },
  }
}
