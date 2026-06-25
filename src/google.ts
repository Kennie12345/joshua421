import { google } from 'googleapis'
import type { Notify, ReadSource, SourceContext, SourceEvent } from './core/deps'

/**
 * Google Workspace adapter — reads Calendar / Gmail / Drive and delivers via
 * email + calendar, using your own OAuth tokens (.env). Concrete and flat: the
 * only place the googleapis SDK appears. Promote to a port if a second source
 * (a different calendar/diary app) ever arrives.
 *
 * Invariant: nothing read here (titles, notes, the day's mail, reflection text)
 * is ever persisted or logged. It is read live, used in the moment, discarded.
 */

/** One OAuth2 client, built lazily and shared by source + notifier. */
let clients: ReturnType<typeof buildClients> | undefined

function buildClients() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  const calendar = google.calendar({ version: 'v3', auth })
  const gmail = google.gmail({ version: 'v1', auth })
  return { calendar, gmail }
}

function getClients() {
  if (!clients) clients = buildClients()
  return clients
}

export function makeGoogleSource(): ReadSource {
  return {
    async upcomingEvents(withinHours: number): Promise<SourceEvent[]> {
      const { calendar } = getClients()
      const now = new Date()
      const max = new Date(now.getTime() + withinHours * 60 * 60 * 1000)
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: max.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      })
      const items = res.data.items ?? []
      const events: SourceEvent[] = []
      for (const ev of items) {
        if (!ev.id) continue
        // Timed events carry dateTime; all-day events carry a date-only string.
        // new Date('YYYY-MM-DD') parses as UTC midnight, so anchor all-day
        // entries to local midnight instead — mirroring contextForDay.
        const start = ev.start?.dateTime
          ? new Date(ev.start.dateTime)
          : ev.start?.date
            ? new Date(`${ev.start.date}T00:00:00`)
            : undefined
        if (!start) continue
        const end = ev.end?.dateTime
          ? new Date(ev.end.dateTime)
          : ev.end?.date
            ? new Date(`${ev.end.date}T00:00:00`)
            : undefined
        events.push({
          id: ev.id,
          title: ev.summary ?? '(untitled)',
          start,
          ...(end ? { end } : {}),
        })
      }
      return events
    },

    async contextForDay(date: string): Promise<SourceContext> {
      const { calendar } = getClients()
      // Local day window [00:00, next 00:00) for the given YYYY-MM-DD.
      const dayStart = new Date(`${date}T00:00:00`)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      })
      const items = res.data.items ?? []
      const lines: string[] = []
      for (const ev of items) {
        const startStr = ev.start?.dateTime ?? ev.start?.date
        const title = ev.summary ?? '(untitled)'
        if (startStr && ev.start?.dateTime) {
          const t = new Date(startStr).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
          lines.push(`${t} — ${title}`)
        } else {
          // All-day (date only) or undated entry.
          lines.push(`all day — ${title}`)
        }
      }
      // TODO(v1): diary + email reading is out of scope. If added later, gather
      // the day's Gmail subjects live here and fold into `notes` — but never
      // store or log any of it; SourceContext is transient by contract.
      const notes =
        lines.length > 0
          ? `Calendar for ${date}:\n${lines.join('\n')}`
          : `No calendar entries for ${date}.`
      return { notes }
    },
  }
}

export function makeGoogleNotifier(): Notify {
  return async (reflection, opts) => {
    const { gmail, calendar } = getClients()

    const profile = await gmail.users.getProfile({ userId: 'me' })
    const address = profile.data.emailAddress
    if (!address) throw new Error('google notifier: could not resolve own address')

    const headers = [
      `From: ${address}`,
      `To: ${address}`,
      'Subject: joshua421 · a reflection',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
    ]
    const message = `${headers.join('\r\n')}\r\n\r\n${reflection.text}`
    const raw = Buffer.from(message, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    // The send carries the reflection content in `raw`; a thrown GaxiosError
    // would attach that payload to its config/response and leak it to any
    // generic logger. Rethrow a content-free error so it never reaches a log.
    try {
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    } catch {
      throw new Error('google notifier: email send failed')
    }

    // Optional secondary surface: a short calendar marker tied to the event.
    // Email is the primary channel; keep this simple and non-fatal.
    if (opts?.eventRef) {
      const start = new Date()
      const end = new Date(start.getTime() + 15 * 60 * 1000)
      try {
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: 'joshua421 · a reflection',
            start: { dateTime: start.toISOString() },
            end: { dateTime: end.toISOString() },
          },
        })
      } catch (err) {
        // Log the failure, never the content.
        console.error('google notifier: calendar reminder failed', err)
      }
    }
  }
}
