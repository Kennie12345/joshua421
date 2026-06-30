import { google } from 'googleapis'
import type { DayEvent, Diary, Mailer } from './core/deps'

/**
 * Google Workspace adapter — reads Calendar / Gmail / Drive and delivers via
 * email + calendar, using your own OAuth tokens (.env). Concrete and flat: the
 * only place the googleapis SDK appears. Promote to a port if a second source
 * (a different calendar/diary app) ever arrives.
 *
 * Invariant: nothing read here (titles, notes, the day's mail, reflection text)
 * is ever persisted or logged. It is read live, used in the moment, discarded.
 */

/** One OAuth2 client, built lazily and shared by the calendar + mailer adapters. */
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

/**
 * Email headers must be 7-bit ASCII (RFC 5322); a Content-Type charset only
 * governs the body. Any non-ASCII subject (e.g. the "·" separator) must ride as
 * an RFC 2047 encoded-word or clients fall back to Latin-1 and mojibake it.
 */
function encodeMailHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/** The shared Calendar client (reuses the single OAuth2 client). */
export function googleCalendar() {
  return getClients().calendar
}

/**
 * The calendar AS a diary — read the day's entries, weave APPROVED notes into
 * them, and write the day's summary as an all-day entry. Additive only: notes
 * are appended below a marker; the user's own words are never touched.
 */
export function makeGoogleDiary(): Diary {
  const MARKER = '— joshua421 —'

  return {
    async day(date: string): Promise<DayEvent[]> {
      const { calendar } = getClients()
      const dayStart = new Date(`${date}T00:00:00`)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      })
      const events: DayEvent[] = []
      for (const ev of res.data.items ?? []) {
        if (!ev.id) continue
        const start = ev.start?.dateTime
          ? new Date(ev.start.dateTime)
          : ev.start?.date
            ? new Date(`${ev.start.date}T00:00:00`)
            : undefined
        if (!start) continue
        events.push({
          id: ev.id,
          title: ev.summary ?? '(untitled)',
          start,
          shared: (ev.attendees?.length ?? 0) > 0,
          ...(ev.description ? { description: ev.description } : {}),
        })
      }
      return events
    },

    async annotate(eventId: string, note: string): Promise<void> {
      const { calendar } = getClients()
      const existing = await calendar.events.get({ calendarId: 'primary', eventId })
      // Privacy backstop: an event with attendees is shared — patching its
      // description syncs to every attendee's copy. Refuse; the note belongs in a
      // private side-entry instead. (read_day marks these as `shared` so the
      // conversation never proposes an in-place note for them.)
      if ((existing.data.attendees?.length ?? 0) > 0) {
        throw new Error(
          'refusing to annotate a shared event in place — its description would sync to every attendee. Use a private side-entry instead.',
        )
      }
      const current = existing.data.description ?? ''
      // Additive: keep the user's words; append under a single marker block.
      const appended = current.includes(MARKER)
        ? `${current}\n${note}`
        : `${current}${current ? '\n\n' : ''}${MARKER}\n${note}`
      await calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: { description: appended },
      })
    },

    async writeSummary(date: string, summary: string): Promise<void> {
      const { calendar } = getClients()
      // The day's diary entry: an all-day event holding the summary.
      const next = new Date(`${date}T00:00:00`)
      next.setDate(next.getDate() + 1)
      const endDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: `Reflection · ${date}`,
          description: summary,
          start: { date },
          end: { date: endDate },
        },
      })
    },
  }
}

async function sendSelfEmail(subject: string, body: string): Promise<void> {
  const { gmail } = getClients()
  const address = process.env.GOOGLE_USER_EMAIL
  if (!address) throw new Error('google mailer: set GOOGLE_USER_EMAIL in .env')
  const headers = [
    `From: ${address}`,
    `To: ${address}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ]
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`
  const raw = Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  // Content-free error: the body would otherwise ride along on a GaxiosError.
  try {
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  } catch {
    throw new Error('google mailer: email send failed')
  }
}

/** Sends a plain email to the user (custom subject + body). Send-only scope. */
export function makeGoogleMailer(): Mailer {
  return (subject, body) => sendSelfEmail(subject, body)
}
