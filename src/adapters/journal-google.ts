import type { calendar_v3 } from 'googleapis'
import type { Journal, JournalEntry, JournalKind, JournalQuery } from '../core/journal'
import { googleCalendar } from './google'

/** Next local day as YYYY-MM-DD (all-day events use an exclusive end date). */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** A coarse window only: Journal day identity is always its explicit tag. */
function paddedDay(date: string, offset: -1 | 1): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString()
}

function toEntry(ev: calendar_v3.Schema$Event): JournalEntry {
  const priv: Record<string, string> = ev.extendedProperties?.private ?? {}
  const { joshua421: _present, joshua421Kind, joshua421Date, joshua421Period, ...tags } = priv
  return {
    id: ev.id ?? '',
    kind: (joshua421Kind ?? 'reflection') as JournalKind,
    period: joshua421Period ?? joshua421Date ?? ev.start?.date ?? '',
    date: joshua421Date ?? ev.start?.date ?? '',
    title: ev.summary ?? '',
    body: ev.description ?? '',
    ...(Object.keys(tags).length ? { tags } : {}),
  }
}

/** Google Calendar–backed Journal; its one-per-period invariant lives here. */
export function makeGoogleJournal(
  calendarId = process.env.JOSHUA421_CALENDAR_ID ?? 'primary',
  calendarClient?: calendar_v3.Calendar,
): Journal {
  const cal = () => calendarClient ?? googleCalendar()

  async function listAll(params: calendar_v3.Params$Resource$Events$List) {
    const events: calendar_v3.Schema$Event[] = []
    let pageToken: string | undefined
    do {
      const res = await cal().events.list({ ...params, ...(pageToken ? { pageToken } : {}) })
      events.push(...(res.data.items ?? []))
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)
    return events
  }

  async function read(id: string): Promise<JournalEntry> {
    const result = await cal().events.get({ calendarId, eventId: id })
    return toEntry(result.data)
  }

  async function deleteEntry(id: string): Promise<void> {
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
  }

  return {
    async upsert(kind, periodKey, entry): Promise<JournalEntry> {
      const identity = ['joshua421=true', `joshua421Kind=${kind}`, `joshua421Period=${periodKey}`]
      let matches = await listAll({ calendarId, privateExtendedProperty: identity, singleEvents: true })
      if (matches.length === 0) {
        // Memorials written before the period tag are this same Journal identity.
        matches = await listAll({
          calendarId,
          privateExtendedProperty: ['joshua421=true', `joshua421Kind=${kind}`, `joshua421Date=${periodKey}`],
          singleEvents: true,
        })
      }
      matches = matches.filter((event) => event.id)
      if (matches.length === 0) {
        const inserted = await cal().events.insert({
          calendarId,
          requestBody: {
            summary: entry.title,
            description: entry.body,
            start: { date: entry.date },
            end: { date: nextDay(entry.date) },
            extendedProperties: {
              private: {
                joshua421: 'true', joshua421Kind: kind, joshua421Date: entry.date,
                joshua421Period: periodKey, ...(entry.tags ?? {}),
              },
            },
          },
        })
        return read(inserted.data.id ?? '')
      }

      const sorted = [...matches].sort((a, b) => toEntry(b).date.localeCompare(toEntry(a).date))
      const [kept, ...duplicates] = sorted
      const existing = kept.extendedProperties?.private ?? {}
      await cal().events.patch({
        calendarId,
        eventId: kept.id!,
        requestBody: {
          summary: entry.title,
          description: entry.body,
          start: { date: entry.date },
          end: { date: nextDay(entry.date) },
          // Preserve the ownership tag: a Journal write must never make an entry
          // unfindable, and duplicate healing below relies on that ownership.
          extendedProperties: {
            private: {
              ...existing, ...(entry.tags ?? {}), joshua421: 'true', joshua421Kind: kind,
              joshua421Date: entry.date, joshua421Period: periodKey,
            },
          },
        },
      })
      for (const duplicate of duplicates) await deleteEntry(duplicate.id!)
      return read(kept.id!)
    },

    async query(q: JournalQuery = {}): Promise<JournalEntry[]> {
      const events = await listAll({
        calendarId,
        privateExtendedProperty: [
          'joshua421=true',
          ...(q.kind ? [`joshua421Kind=${q.kind}`] : []),
          ...Object.entries(q.tags ?? {}).map(([key, value]) => `${key}=${value}`),
        ],
        singleEvents: true,
        orderBy: 'startTime',
        ...(q.since ? { timeMin: paddedDay(q.since, -1) } : {}),
        ...(q.until ? { timeMax: paddedDay(q.until, 1) } : {}),
      })
      return events
        .map(toEntry)
        .filter((entry) =>
          (!q.period || entry.period === q.period) &&
          (!q.since || entry.date >= q.since) &&
          (!q.until || entry.date <= q.until) &&
          Object.entries(q.tags ?? {}).every(([key, value]) => entry.tags?.[key] === value),
        )
        .sort((a, b) => b.date.localeCompare(a.date))
    },

    async delete(id: string): Promise<void> {
      await deleteEntry(id)
    },
  }
}
