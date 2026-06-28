/**
 * The two things the engine produces:
 *
 *  - a Note: the words offered in the moment — a reflection's text, or a gentle
 *    annotation written into your own calendar. Transient: shown to you or
 *    written to your own surface, never stored on our side.
 *  - a Reflection: the behavioural record that you reflected on a given day —
 *    date, kind, status, never content. The growing record is what you look
 *    back over to see how faithful God has been.
 */
export type ReflectionKind = 'before' | 'after' | 'look-back'

export type ReflectionStatus = 'shown-up' | 'skipped'

export interface Reflection {
  id: string
  /** ISO date (YYYY-MM-DD, local day) the reflection belongs to. */
  date: string
  kind: ReflectionKind
  status: ReflectionStatus
  /** Optional opaque reference to the source event — an id only, never content. */
  eventRef?: string
}

export interface Note {
  kind: ReflectionKind
  text: string
}
