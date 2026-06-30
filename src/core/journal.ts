/**
 * The Journal is joshua421's store — the user's own calendar used as a database.
 *
 * Entries are typed and tagged; nothing lives on our side. The behavioural log,
 * the day summaries, the long-horizon rollups, and the preferences are all just
 * typed entries here — so `Log`, `Preferences`, rollups, and significant-moments
 * become *uses of* this one seam rather than separate stores.
 *
 * Backed by the calendar today; the engine never learns that. A SQLite/in-memory
 * Journal stays a valid adapter for tests.
 */
export type JournalKind =
  | 'reflection' // behavioural record: the user reflected on a day
  | 'day-summary' // the evening summary — the diary entry for a day
  | 'rollup' // a weekly / monthly / seasonal / yearly distillation
  | 'preferences' // the user's goals / orientation

export interface JournalEntry {
  id: string
  kind: JournalKind
  /** The day (or anchor day) this entry belongs to — YYYY-MM-DD. */
  date: string
  title: string
  body: string
  /** Queryable metadata, e.g. { level: 'weekly', significant: 'true' }. */
  tags?: Record<string, string>
}

export type NewEntry = Omit<JournalEntry, 'id'>

export interface JournalQuery {
  kind?: JournalKind
  /** Inclusive YYYY-MM-DD bounds. */
  since?: string
  until?: string
  /** All must match (ANDed). */
  tags?: Record<string, string>
}

export interface Journal {
  /** Create an entry; returns it with its id. */
  add(entry: NewEntry): Promise<JournalEntry>
  /** Read entries by kind / date range / tags. Newest first. */
  query(q?: JournalQuery): Promise<JournalEntry[]>
  /** Update an entry's fields. */
  update(id: string, patch: Partial<NewEntry>): Promise<void>
  /** Delete an entry (the Journal only ever holds its own entries). */
  delete(id: string): Promise<void>
}
