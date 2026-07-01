import type { Grounding } from './grounding'
import type { Log } from './log'
import type { Note, ReflectionKind } from './reflection'

/** A calendar event, source-agnostic and content-light by design. */
export interface SourceEvent {
  id: string
  title: string
  start: Date
  end?: Date
}

/**
 * Material read LIVE from a source (calendar / diary / email) and used in the
 * moment, then discarded. Never persisted to the log.
 */
export interface SourceContext {
  event?: SourceEvent
  /** Free text gathered live for reflection (diary, notes, the day's emails). */
  notes?: string
}

/** Turns live context into a note (the words offered). Implemented by the LLM. */
export type Reflect = (kind: ReflectionKind, context: SourceContext) => Promise<Note>

/** Sends a plain email to the user — custom subject and body. */
export type Mailer = (subject: string, body: string) => Promise<void>

/** A calendar entry seen as a diary entry — title, time, and its current notes. */
export interface DayEvent {
  id: string
  title: string
  start: Date
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
  reflect: Reflect
  mailer: Mailer
  diary: Diary
  grounding: Grounding
  log: Log
  clock: Clock
}
