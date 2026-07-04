/**
 * The behavioural record the engine keeps:
 *
 *  - a Reflection: the record that you reflected on a given day — date, kind,
 *    status, never content. The growing record is what you look back over to see
 *    how faithful God has been.
 */
export type ReflectionKind = 'before' | 'after' | 'look-back' | 'morning' | 'evening'

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
