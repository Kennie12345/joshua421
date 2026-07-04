import type { Grounding } from './grounding'
import type { Log } from './log'

/**
 * Sends an email to the user — custom subject and body. `body` is the plain-text
 * part (always sent, and the universal fallback); an optional `html` part rides
 * alongside as multipart/alternative so clients that render it show links behind
 * anchor text instead of raw URLs.
 */
export type Mailer = (subject: string, body: string, html?: string) => Promise<void>

/** A calendar entry seen as a diary entry — title, time, and its current notes. */
export interface DayEvent {
  id: string
  title: string
  start: Date
  /**
   * The start as the user's CALENDAR renders it, verbatim from the source —
   * RFC3339 with the calendar's UTC offset ("2026-07-02T23:00:00+10:00"), or a
   * bare date ("2026-07-02") for an all-day entry. `start` alone is a bare
   * instant — anything that formats it localizes to the HOST's zone, which is
   * wrong the moment the reader (an LLM given the ISO string, or a worker on a
   * cloud box) isn't in the user's zone. Prefer this for anything user-facing.
   */
  startLocal?: string
  /**
   * IANA zone ("Australia/Sydney") — included ONLY when it renders the same
   * wall-clock as startLocal. Google returns the event-DEFINITION zone, which
   * can differ from the calendar's rendering zone (a meeting created in New
   * York; an Adelaide event on a Sydney calendar) — pairing those verbatim
   * would label the wall-clock with the wrong zone, so a disagreeing zone is
   * dropped rather than served as a contradiction.
   */
  timeZone?: string
  description?: string
  /** True if the event has other attendees — writing into it in place would
   *  leak the note to everyone, so it must be shaped via a private side-entry. */
  shared: boolean
}

/**
 * The calendar AS a diary: read the day's entries, and — with the user's
 * approval — weave gentle notes into them and write a day summary. Additive
 * only: it never rewrites the user's own words, and every write is reversible.
 */
export interface Diary {
  day(date: string): Promise<DayEvent[]>
  annotate(eventId: string, note: string): Promise<void>
  writeSummary(date: string, summary: string): Promise<void>
  /**
   * Reverse an annotation: remove only joshua421's appended block from the user's
   * own event and restore their original words. Never deletes the event, and a
   * no-op if the event carries nothing of ours.
   */
  stripAnnotation(eventId: string): Promise<void>
  /**
   * Reverse a day summary: delete only the joshua421-created, tagged summary
   * entry for that date. Never touches the user's own events.
   */
  unwriteSummary(date: string): Promise<void>
}

/** Injectable clock, so the flows are testable. */
export type Clock = () => Date

/** Everything a flow needs, injected — the seam the two entrypoints wire up. */
export interface Deps {
  mailer: Mailer
  diary: Diary
  grounding: Grounding
  log: Log
  clock: Clock
}
