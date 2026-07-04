import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'
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
export function makeGoogleDiary(
  opts: {
    calendar?: calendar_v3.Calendar
    /** The user's real event calendar — read + annotated in place. */
    readCalendarId?: string
    /** joshua421's own store calendar — where CREATED artifacts (summaries) live. */
    storeCalendarId?: string
  } = {},
): Diary {
  const BLOCK_BEGIN = '— joshua421 —'
  // A closing fence, so reversal removes EXACTLY our block — never the user's own
  // words, which may sit before OR after it.
  const BLOCK_END = '—·—'
  const cal = () => opts.calendar ?? getClients().calendar
  const readCalendarId = opts.readCalendarId ?? process.env.JOSHUA421_READ_CALENDAR_ID ?? 'primary'
  const storeCalendarId = opts.storeCalendarId ?? process.env.JOSHUA421_CALENDAR_ID ?? 'primary'

  return {
    async day(date: string): Promise<DayEvent[]> {
      const calendar = cal()
      const dayStart = new Date(`${date}T00:00:00`)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      const res = await calendar.events.list({
        calendarId: readCalendarId,
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
      const calendar = cal()
      const existing = await calendar.events.get({ calendarId: readCalendarId, eventId })
      // Privacy backstop: never write in place where the description is visible to
      // others. Attendees receive a synced copy; a public event is world-readable.
      // (read_day marks attended events `shared` so the conversation avoids them.)
      if ((existing.data.attendees?.length ?? 0) > 0) {
        throw new Error(
          'refusing to annotate a shared event in place — its description would sync to every attendee. Use a private side-entry instead.',
        )
      }
      if (existing.data.visibility === 'public') {
        throw new Error(
          'refusing to annotate a public event in place — its description is world-readable. Use a private side-entry instead.',
        )
      }
      const current = existing.data.description ?? ''
      // Our block is fenced BLOCK_BEGIN … BLOCK_END. Only treat an existing block
      // as ours when there is EXACTLY one begin fence with a matching end fence;
      // then insert the new note inside the fence, preserving any user text after
      // it. Otherwise append a fresh fenced block — never mutating the user's words.
      const beginIdx = current.indexOf(BLOCK_BEGIN)
      const endIdx = beginIdx === -1 ? -1 : current.indexOf(BLOCK_END, beginIdx + BLOCK_BEGIN.length)
      const secondBegin = beginIdx === -1 ? -1 : current.indexOf(BLOCK_BEGIN, beginIdx + BLOCK_BEGIN.length)
      const ours = beginIdx !== -1 && endIdx !== -1 && secondBegin === -1
      const appended = ours
        ? `${current.slice(0, endIdx).replace(/\n+$/, '')}\n${note}\n${BLOCK_END}${current.slice(endIdx + BLOCK_END.length)}`
        : `${current}${current ? '\n\n' : ''}${BLOCK_BEGIN}\n${note}\n${BLOCK_END}`
      await calendar.events.patch({
        calendarId: readCalendarId,
        eventId,
        requestBody: { description: appended },
      })
    },

    async stripAnnotation(eventId: string): Promise<void> {
      const calendar = cal()
      const existing = await calendar.events.get({ calendarId: readCalendarId, eventId })
      const current = existing.data.description ?? ''
      // Remove ONLY our fenced block, and only when it is unambiguously ours:
      // exactly one begin fence, at a line boundary, with a matching end fence.
      // Anything else (marker the user typed, missing fence, more than one) is a
      // no-op — we never risk the user's own words to undo our own note.
      const beginIdx = current.indexOf(BLOCK_BEGIN)
      if (beginIdx === -1) return
      if (current.indexOf(BLOCK_BEGIN, beginIdx + BLOCK_BEGIN.length) !== -1) return
      if (beginIdx !== 0 && current[beginIdx - 1] !== '\n') return
      const endIdx = current.indexOf(BLOCK_END, beginIdx + BLOCK_BEGIN.length)
      if (endIdx === -1) return
      const before = current.slice(0, beginIdx).replace(/\n+$/, '')
      const after = current.slice(endIdx + BLOCK_END.length).replace(/^\n+/, '')
      const restored = before + (before && after ? '\n\n' : '') + after
      await calendar.events.patch({
        calendarId: readCalendarId,
        eventId,
        requestBody: { description: restored },
      })
    },

    async writeSummary(date: string, summary: string): Promise<void> {
      const calendar = cal()
      // The day's diary entry: an all-day event holding the summary, on our store.
      const next = new Date(`${date}T00:00:00`)
      next.setDate(next.getDate() + 1)
      const endDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
      await calendar.events.insert({
        calendarId: storeCalendarId,
        requestBody: {
          summary: `Reflection · ${date}`,
          description: summary,
          start: { date },
          end: { date: endDate },
          // Tag our own creation so it's findable (privateExtendedProperty) and
          // reversible — never confused with one of the user's real events.
          extendedProperties: {
            private: { joshua421: 'true', joshua421Kind: 'day-summary', joshua421Date: date },
          },
        },
      })
    },

    async unwriteSummary(date: string): Promise<void> {
      const calendar = cal()
      // Find OUR tagged summaries for this date on the store calendar and remove
      // them — double-guarded by the tag, so a real event can never be deleted.
      const res = await calendar.events.list({
        calendarId: storeCalendarId,
        privateExtendedProperty: [
          'joshua421=true',
          'joshua421Kind=day-summary',
          `joshua421Date=${date}`,
        ],
        singleEvents: true,
      })
      for (const ev of res.data.items ?? []) {
        if (!ev.id) continue
        const priv = ev.extendedProperties?.private ?? {}
        // Independent guard (not merely the server filter): our tag, this kind,
        // this exact date — so a broader/again-quirky list can never over-delete.
        if (priv.joshua421 !== 'true' || priv.joshua421Kind !== 'day-summary' || priv.joshua421Date !== date) {
          continue
        }
        await calendar.events.delete({ calendarId: storeCalendarId, eventId: ev.id })
      }
    },
  }
}

async function sendSelfEmail(subject: string, body: string, html?: string): Promise<void> {
  const { gmail } = getClients()
  const address = process.env.GOOGLE_USER_EMAIL
  if (!address) throw new Error('google mailer: set GOOGLE_USER_EMAIL in .env')
  const baseHeaders = [
    `From: ${address}`,
    `To: ${address}`,
    `Subject: ${encodeMailHeader(subject)}`,
    'MIME-Version: 1.0',
  ]
  let message: string
  if (html) {
    // multipart/alternative: the plain-text part is the fallback (and what
    // clients that don't render HTML show); the HTML part carries anchor links.
    // A fixed boundary is fine — headers are ASCII and it never collides with
    // the text bodies below.
    const boundary = 'joshua421bnd'
    message = [
      ...baseHeaders,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      html,
      `--${boundary}--`,
    ].join('\r\n')
  } else {
    message = `${[...baseHeaders, 'Content-Type: text/plain; charset="UTF-8"'].join('\r\n')}\r\n\r\n${body}`
  }
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

/** Sends an email to the user (subject + text, optional HTML part). Send-only scope. */
export function makeGoogleMailer(): Mailer {
  return (subject, body, html) => sendSelfEmail(subject, body, html)
}
