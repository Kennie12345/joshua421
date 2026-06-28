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

/**
 * Reads the person's world, live. A plain injected interface for now — promote
 * to a formal port only when a test or a second implementation demands it.
 */
export interface ReadSource {
  upcomingEvents(withinHours: number): Promise<SourceEvent[]>
  contextForDay(date: string): Promise<SourceContext>
}

/** Turns live context into a note (the words offered). Implemented by the LLM. */
export type Reflect = (kind: ReflectionKind, context: SourceContext) => Promise<Note>

/** Delivers a note to where the person already is (email / calendar). */
export type Notify = (note: Note, opts?: { eventRef?: string }) => Promise<void>

/** Injectable clock, so the flows are testable. */
export type Clock = () => Date

/** Everything a flow needs, injected — the seam the two entrypoints wire up. */
export interface Deps {
  source: ReadSource
  reflect: Reflect
  notify: Notify
  log: Log
  clock: Clock
}
